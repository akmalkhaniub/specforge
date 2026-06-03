/**
 * Job routes: SSE progress stream and a polling fallback endpoint.
 *
 * The SSE stream forwards Redis pub/sub progress events to the browser, sends a
 * keepalive comment every 15s, and also polls the extraction_jobs row every 3s
 * so a terminal state is delivered even if a pub/sub message was missed.
 */
import type { ExtractionJob, ExtractionProgress } from '@specforge/shared';
import { Hono } from 'hono';
import { streamSSE } from 'hono/streaming';
import { sql } from '../db/client.js';
import { subscribeToProgress } from '../queue/progress.js';
import { NotFoundError } from '../lib/errors.js';

export const jobs = new Hono();

const KEEPALIVE_MS = 15_000;
const POLL_MS = 3_000;

/** Selects a job row with numeric columns coerced to JS numbers. */
async function fetchJob(jobId: string): Promise<ExtractionJob | undefined> {
  const [job] = await sql<ExtractionJob[]>`
    SELECT id, document_id, status, progress, stage, model,
           prompt_tokens, completion_tokens, cache_read_tokens, cache_write_tokens,
           cost_usd::float AS cost_usd, latency_ms, error,
           started_at, completed_at, created_at
    FROM extraction_jobs
    WHERE id = ${jobId}::uuid
  `;
  return job;
}

// GET /api/jobs/:jobId  — polling fallback
jobs.get('/:jobId', async (c) => {
  const job = await fetchJob(c.req.param('jobId'));
  if (!job) throw new NotFoundError('Job not found', { jobId: c.req.param('jobId') });
  return c.json(job);
});

// GET /api/jobs/:jobId/progress  — SSE stream
jobs.get('/:jobId/progress', (c) => {
  const jobId = c.req.param('jobId');

  return streamSSE(c, async (stream) => {
    let closed = false;
    const finish = async (): Promise<void> => {
      if (closed) return;
      closed = true;
      clearInterval(keepalive);
      clearInterval(poller);
      unsub();
      await stream.close();
    };

    const send = async (event: ExtractionProgress): Promise<void> => {
      await stream.writeSSE({ data: JSON.stringify(event), event: 'progress' });
      if (event.stage === 'complete' || event.stage === 'failed') {
        await finish();
      }
    };

    // 1) Live pub/sub events.
    const unsub = subscribeToProgress(jobId, (event) => {
      void send(event);
    });

    // 2) Keepalive comments to keep proxies from timing out.
    const keepalive = setInterval(() => {
      void stream.writeSSE({ data: '', event: 'keepalive' });
    }, KEEPALIVE_MS);

    // 3) DB poll fallback for terminal state.
    const poller = setInterval(() => {
      void (async () => {
        const job = await fetchJob(jobId);
        if (!job) return;
        if (job.status === 'complete' || job.status === 'failed') {
          await send({
            jobId,
            stage: job.status === 'complete' ? 'complete' : 'failed',
            percent: job.progress,
            message: job.error ?? (job.status === 'complete' ? 'Extraction complete' : 'Extraction failed'),
            costUsd: job.costUsd,
          });
        }
      })();
    }, POLL_MS);

    // Emit current state immediately so late subscribers aren't left blank.
    const initial = await fetchJob(jobId);
    if (initial && (initial.status === 'complete' || initial.status === 'failed')) {
      await send({
        jobId,
        stage: initial.status === 'complete' ? 'complete' : 'failed',
        percent: initial.progress,
        message: initial.error ?? 'Done',
        costUsd: initial.costUsd,
      });
    }

    // Clean up if the client disconnects.
    c.req.raw.signal.addEventListener('abort', () => {
      void finish();
    });

    // Hold the stream open until finished.
    while (!closed) {
      await new Promise((resolve) => setTimeout(resolve, 500));
    }
  });
});
