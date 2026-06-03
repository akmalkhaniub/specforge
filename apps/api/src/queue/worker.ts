/**
 * BullMQ extraction worker — the full pipeline.
 *
 * download (MinIO) → parse (mammoth/pdf-parse/plain) → clean/truncate →
 * two-pass Claude extraction → embeddings (if enabled) → persist epics, stories,
 * embeddings → update job accounting + document/project counts.
 *
 * Concurrency is capped at 2: Claude API rate limits produce 429s above this on
 * large documents. Do not raise without testing (see project docs / ADR).
 *
 * What can go wrong in production & how we'd know:
 *  - Claude/API outage → job fails, extraction_jobs.error set, job_failed log.
 *  - Malformed document → parse throws, caught, job marked failed.
 *  - Embeddings provider down → only the embedding step fails; gated by flag.
 *  - Stuck job → no 'complete' progress + stale extraction_jobs.stage.
 */
import mammoth from 'mammoth';
import pdfParse from 'pdf-parse/lib/pdf-parse.js';
import { Worker, type Job } from 'bullmq';
import { env } from '../config/env.js';
import { sql } from '../db/client.js';
import { extractRequirements } from '../ai/extractor.js';
import { generateBatchEmbeddings } from '../ai/embeddings.js';
import { storage } from '../storage/minio.js';
import { log } from '../lib/logger.js';
import { queueConnection } from './connection.js';
import { publishProgress } from './progress.js';
import {
  EXTRACTION_QUEUE_NAME,
  type ExtractionJobData,
  type ProgressEvent,
  type ProgressStage,
} from './types.js';

/** Max concurrent extraction jobs. Bounded by the Claude API rate limit. */
export const WORKER_CONCURRENCY = 2;

/** Documents longer than this are truncated before extraction. */
const MAX_DOCUMENT_CHARS = 150_000;

const DOCX_MIME = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';

interface DocumentRow {
  id: string;
  projectId: string;
  minioKey: string;
  mimeType: string;
}

/** Renders an embedding vector as a pgvector literal. */
function toVectorLiteral(vector: number[]): string {
  return `[${vector.join(',')}]`;
}

/** Publishes a progress event and persists stage/percent on the job row. */
async function reportStage(
  jobId: string,
  event: Omit<ProgressEvent, 'jobId'>,
): Promise<void> {
  await sql`
    UPDATE extraction_jobs SET stage = ${event.stage}, progress = ${event.percent}
    WHERE id = ${jobId}::uuid
  `;
  await publishProgress(jobId, { jobId, ...event });
}

/** Extracts raw text from a document buffer based on its MIME type. */
async function parseDocument(buffer: Buffer, mimeType: string): Promise<string> {
  if (mimeType === DOCX_MIME || mimeType.includes('wordprocessingml')) {
    const result = await mammoth.extractRawText({ buffer });
    return result.value;
  }
  if (mimeType === 'application/pdf') {
    const result = await pdfParse(buffer);
    return result.text;
  }
  // text/plain (e.g. chat-generated PRDs) and other text formats.
  return buffer.toString('utf8');
}

/** Strips blank lines and standalone page numbers; truncates very long docs. */
function cleanText(raw: string): string {
  let text = raw
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line.length > 0 && !/^\d+$/.test(line))
    .join('\n');
  if (text.length > MAX_DOCUMENT_CHARS) {
    log.warn('document_truncated', { originalLength: text.length, limit: MAX_DOCUMENT_CHARS });
    text = text.slice(0, MAX_DOCUMENT_CHARS);
  }
  return text;
}

/** The full extraction job handler. */
async function processExtractionJob(job: Job<ExtractionJobData>): Promise<void> {
  const jobId = job.id;
  if (!jobId) throw new Error('Job has no id');
  const { documentId, projectId, orgId } = job.data;
  const startTime = Date.now();

  await sql`UPDATE extraction_jobs SET status = 'processing', started_at = now() WHERE id = ${jobId}::uuid`;
  await sql`UPDATE documents SET status = 'processing' WHERE id = ${documentId}`;

  const [document] = await sql<DocumentRow[]>`
    SELECT id, project_id, minio_key, mime_type FROM documents WHERE id = ${documentId}
  `;
  if (!document) throw new Error(`Document ${documentId} not found`);

  // STAGE 1: download
  await reportStage(jobId, { stage: 'downloading', percent: 5, message: 'Downloading document...' });
  const buffer = await storage.downloadDocument(document.minioKey);

  // STAGE 2: parse
  await reportStage(jobId, { stage: 'parsing', percent: 15, message: 'Parsing document...' });
  const documentText = cleanText(await parseDocument(buffer, document.mimeType));

  // STAGE 3-4: AI extraction (publishes its own epic/story progress)
  const result = await extractRequirements({
    documentText,
    documentId,
    onProgress: (stage, percent, tokensUsed) => {
      void reportStage(jobId, {
        stage: stage as ProgressStage,
        percent,
        message: `Extracting (${stage})...`,
        tokensUsed,
      });
    },
  });

  // STAGE 5: embeddings (optional, feature-flagged)
  let embeddings: number[][] = [];
  if (env.EMBEDDINGS_ENABLED && result.epics.length > 0) {
    await reportStage(jobId, { stage: 'embedding', percent: 85, message: 'Generating embeddings...' });
    embeddings = await generateBatchEmbeddings(
      result.epics.map((e) => `${e.title}: ${e.description}`),
    );
  }

  // STAGE 6: persist
  await reportStage(jobId, { stage: 'saving', percent: 90, message: 'Saving results...' });
  await sql.begin(async (tx) => {
    for (let i = 0; i < result.epics.length; i++) {
      const epic = result.epics[i];
      if (!epic) continue;
      const embedding = embeddings[i];
      const embeddingValue = embedding ? tx`${toVectorLiteral(embedding)}::vector` : tx`NULL`;

      const [epicRow] = await tx<{ id: string }[]>`
        INSERT INTO epics (project_id, document_id, title, description, priority, confidence, embedding, metadata)
        VALUES (
          ${projectId}, ${documentId}, ${epic.title}, ${epic.description}, ${epic.priority},
          ${epic.confidence}, ${embeddingValue}, ${tx.json({ rationale: epic.rationale, documentType: result.documentType })}
        )
        RETURNING id
      `;
      const epicId = epicRow?.id;
      if (!epicId) throw new Error('Failed to insert epic');

      for (const story of epic.stories) {
        await tx`
          INSERT INTO stories (epic_id, title, description, persona, acceptance_criteria, priority, story_points, confidence)
          VALUES (
            ${epicId}, ${story.title}, ${story.description}, ${story.persona},
            ${tx.json(story.acceptance_criteria)}, ${story.priority}, ${story.story_points}, ${story.confidence}
          )
        `;
      }

      if (embedding) {
        await tx`
          INSERT INTO embeddings (org_id, project_id, source_type, source_id, content, embedding, metadata)
          VALUES (
            ${orgId}, ${projectId}, 'epic', ${epicId}, ${`${epic.title}: ${epic.description}`},
            ${toVectorLiteral(embedding)}::vector, ${tx.json({ priority: epic.priority })}
          )
        `;
      }
    }
  });

  // Job accounting
  await sql`
    UPDATE extraction_jobs SET
      status = 'complete', progress = 100, stage = 'complete', model = ${result.model},
      prompt_tokens = ${result.totalInputTokens}, completion_tokens = ${result.totalOutputTokens},
      cache_read_tokens = ${result.totalCacheReadTokens}, cache_write_tokens = ${result.totalCacheWriteTokens},
      cost_usd = ${result.costUsd}, latency_ms = ${Date.now() - startTime}, completed_at = now()
    WHERE id = ${jobId}::uuid
  `;
  await sql`UPDATE documents SET status = 'extracted' WHERE id = ${documentId}`;
  await sql`
    UPDATE projects SET
      epic_count = (SELECT COUNT(*) FROM epics WHERE project_id = ${projectId} AND deleted_at IS NULL),
      document_count = (SELECT COUNT(*) FROM documents WHERE project_id = ${projectId} AND deleted_at IS NULL),
      updated_at = now()
    WHERE id = ${projectId}
  `;

  await publishProgress(jobId, {
    jobId,
    stage: 'complete',
    percent: 100,
    message: `Extracted ${result.epics.length} epics`,
    costUsd: result.costUsd,
  });
  log.info('extraction_job_done', {
    jobId,
    documentId,
    epics: result.epics.length,
    costUsd: result.costUsd,
    durationMs: Date.now() - startTime,
  });
}

/** Marks a job + its document failed and notifies subscribers. */
async function handleFailure(job: Job<ExtractionJobData> | undefined, err: Error): Promise<void> {
  const jobId = job?.id;
  if (!jobId) return;
  try {
    await sql`UPDATE extraction_jobs SET status = 'failed', stage = 'failed', error = ${err.message}, completed_at = now() WHERE id = ${jobId}::uuid`;
    await sql`UPDATE documents SET status = 'failed' WHERE id = ${job?.data.documentId}`;
    await publishProgress(jobId, {
      jobId,
      stage: 'failed',
      percent: 0,
      message: err.message,
    });
  } catch (persistErr) {
    log.error('failure_persist_error', {
      jobId,
      error: persistErr instanceof Error ? persistErr.message : String(persistErr),
    });
  }
}

let worker: Worker<ExtractionJobData> | undefined;

/**
 * Starts the extraction worker and wires lifecycle logging.
 * @returns The started Worker instance.
 */
export function startWorker(): Worker<ExtractionJobData> {
  if (worker) return worker;

  worker = new Worker<ExtractionJobData>(EXTRACTION_QUEUE_NAME, processExtractionJob, {
    connection: queueConnection,
    concurrency: WORKER_CONCURRENCY,
  });

  worker.on('completed', (job) => {
    log.info('job_completed', { jobId: job.id, durationMs: Date.now() - job.timestamp });
  });
  worker.on('failed', (job, err) => {
    log.error('job_failed', { jobId: job?.id, error: err.message, attempts: job?.attemptsMade });
    // Only persist failure once retries are exhausted.
    if (job && job.attemptsMade >= (job.opts.attempts ?? 1)) {
      void handleFailure(job, err);
    }
  });
  worker.on('error', (err) => {
    log.error('worker_error', { error: err.message });
  });

  log.info('worker_started', { queue: EXTRACTION_QUEUE_NAME, concurrency: WORKER_CONCURRENCY });
  return worker;
}
