/**
 * Manual smoke test for the BullMQ queue + Redis pub/sub wiring.
 * Run with Redis up: `tsx src/scripts/smoke-queue.ts`.
 */
import { addExtractionJob } from '../queue/extraction-queue.js';
import { subscribeToProgress } from '../queue/progress.js';
import { startWorker } from '../queue/worker.js';
import { closeConnections } from '../queue/connection.js';
import { extractionQueue } from '../queue/extraction-queue.js';
import { log } from '../lib/logger.js';
import type { ProgressEvent } from '../queue/types.js';

async function main(): Promise<void> {
  const worker = startWorker();

  const jobId = await addExtractionJob({
    documentId: '00000000-0000-0000-0000-0000000000aa',
    projectId: '00000000-0000-0000-0000-0000000000bb',
    orgId: '00000000-0000-0000-0000-0000000000cc',
    filename: 'smoke.pdf',
  });

  const received: ProgressEvent[] = [];
  const completed = new Promise<void>((resolve) => {
    const unsub = subscribeToProgress(jobId, (event) => {
      received.push(event);
      log.info('smoke_progress', { stage: event.stage, percent: event.percent });
      if (event.stage === 'complete' || event.stage === 'failed') {
        unsub();
        resolve();
      }
    });
  });

  // Safety timeout so the script never hangs forever.
  const timeout = new Promise<never>((_, reject) =>
    setTimeout(() => reject(new Error('Timed out waiting for completion')), 10_000),
  );

  await Promise.race([completed, timeout]);

  log.info('smoke_summary', { stagesReceived: received.length });
  if (received.length < 6) throw new Error(`Expected >=6 progress events, got ${received.length}`);

  await worker.close();
  await extractionQueue.close();
  await closeConnections();
  log.info('smoke_passed', {});
}

main()
  .then(() => process.exit(0))
  .catch((err: unknown) => {
    log.error('smoke_failed', { error: err instanceof Error ? err.message : String(err) });
    process.exit(1);
  });
