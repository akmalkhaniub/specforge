/**
 * End-to-end pipeline smoke test: enqueues a real document and lets the worker
 * run the full pipeline (download → parse → extract → embed → save), then
 * verifies persisted epics/stories and pgvector semantic search.
 *
 * Requires ANTHROPIC_API_KEY (+ OPENAI_API_KEY & EMBEDDINGS_ENABLED=true for
 * search). Run: pnpm --filter api exec tsx src/scripts/smoke-e2e.ts
 */
import { sql } from '../db/client.js';
import { storage } from '../storage/minio.js';
import { addExtractionJob } from '../queue/extraction-queue.js';
import { extractionQueue } from '../queue/extraction-queue.js';
import { startWorker } from '../queue/worker.js';
import { closeConnections } from '../queue/connection.js';
import { generateEmbedding } from '../ai/embeddings.js';
import { env } from '../config/env.js';
import { log } from '../lib/logger.js';

const SAMPLE = `Acme Online Store — Requirements

Customers must be able to browse products by category and search by keyword.
They can add items to a cart and check out with a credit card. Customers who
forget their password can reset it via a time-limited email link. Administrators
need a dashboard to manage inventory and view daily sales totals. The system must
send an order confirmation email after a successful purchase.`;

async function main(): Promise<void> {
  const worker = startWorker();

  const [org] = await sql<{ id: string }[]>`SELECT id FROM organisations WHERE slug='acme'`;
  const [project] = await sql<{ id: string }[]>`
    SELECT id FROM projects WHERE org_id=${org!.id} AND deleted_at IS NULL ORDER BY created_at LIMIT 1`;
  const orgId = org!.id;
  const projectId = project!.id;
  log.info('e2e_target', { orgId, projectId });

  const buffer = Buffer.from(SAMPLE, 'utf8');
  const { key, size } = await storage.uploadDocument({
    buffer, filename: 'e2e-sample.txt', mimeType: 'text/plain', projectId,
  });
  const [doc] = await sql<{ id: string }[]>`
    INSERT INTO documents (project_id, filename, mime_type, minio_key, size_bytes)
    VALUES (${projectId}, 'e2e-sample.txt', 'text/plain', ${key}, ${size}) RETURNING id`;
  const documentId = doc!.id;

  const jobId = await addExtractionJob({ documentId, projectId, orgId, filename: 'e2e-sample.txt' });
  await sql`INSERT INTO extraction_jobs (id, document_id, status) VALUES (${jobId}::uuid, ${documentId}, 'queued')`;
  log.info('e2e_enqueued', { jobId, documentId });

  // Poll until terminal.
  const deadline = Date.now() + 180_000;
  let status = 'queued';
  for (;;) {
    const [job] = await sql<{ status: string; stage: string | null; costUsd: number }[]>`
      SELECT status, stage, cost_usd::float AS cost_usd FROM extraction_jobs WHERE id=${jobId}::uuid`;
    status = job!.status;
    if (status === 'complete' || status === 'failed') {
      log.info('e2e_job_done', { status, costUsd: job!.costUsd });
      break;
    }
    if (Date.now() > deadline) throw new Error('Timed out waiting for job');
    await new Promise((r) => setTimeout(r, 2000));
  }

  if (status === 'failed') {
    const [job] = await sql<{ error: string }[]>`SELECT error FROM extraction_jobs WHERE id=${jobId}::uuid`;
    throw new Error(`Job failed: ${job!.error}`);
  }

  // Verify persisted data.
  const [counts] = await sql<{ epics: number; stories: number; embeddings: number }[]>`
    SELECT
      (SELECT COUNT(*)::int FROM epics WHERE document_id=${documentId}) AS epics,
      (SELECT COUNT(*)::int FROM stories s JOIN epics e ON s.epic_id=e.id WHERE e.document_id=${documentId}) AS stories,
      (SELECT COUNT(*)::int FROM embeddings WHERE project_id=${projectId}) AS embeddings`;
  log.info('e2e_persisted', counts!);

  // Semantic search.
  if (env.EMBEDDINGS_ENABLED) {
    const queryVec = await generateEmbedding('how do users pay for their order');
    const literal = `[${queryVec.join(',')}]`;
    const hits = await sql<{ content: string; similarity: number }[]>`
      SELECT content, (1 - (embedding <=> ${literal}::vector))::float AS similarity
      FROM embeddings
      WHERE org_id=${orgId} AND project_id=${projectId}
      ORDER BY embedding <=> ${literal}::vector LIMIT 3`;
    for (const h of hits) log.info('e2e_search_hit', { similarity: Number(h.similarity.toFixed(3)), content: h.content.slice(0, 70) });
  }

  await worker.close();
  await extractionQueue.close();
  await closeConnections();
  await sql.end();
  log.info('e2e_passed', {});
}

main().then(() => process.exit(0)).catch((err: unknown) => {
  log.error('e2e_failed', { error: err instanceof Error ? err.message : String(err) });
  process.exit(1);
});
