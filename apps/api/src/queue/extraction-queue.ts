/**
 * The extraction job queue.
 *
 * Retry policy: 3 attempts with exponential backoff (1s, 4s, 16s — i.e. delay
 * 1000ms, factor 4). Completed/failed jobs are retained briefly for inspection
 * then trimmed to keep Redis memory bounded.
 */
import { randomUUID } from 'node:crypto';
import { Queue } from 'bullmq';
import { queueConnection } from './connection.js';
import { EXTRACTION_QUEUE_NAME, type ExtractionJobData } from './types.js';
import { log } from '../lib/logger.js';

/** Base backoff delay; exponential factor of 4 gives 1s, 4s, 16s. */
const BACKOFF_BASE_MS = 1000;
const MAX_ATTEMPTS = 3;

export const extractionQueue = new Queue<ExtractionJobData>(EXTRACTION_QUEUE_NAME, {
  connection: queueConnection,
  defaultJobOptions: {
    attempts: MAX_ATTEMPTS,
    backoff: { type: 'exponential', delay: BACKOFF_BASE_MS },
    removeOnComplete: { age: 3600, count: 100 },
    removeOnFail: { age: 86_400 },
  },
});

/**
 * Enqueues an extraction job.
 * A UUID is used as the BullMQ job id so it can double as the
 * extraction_jobs primary key (which is a uuid column).
 * @returns The job id (a UUID string).
 * @throws Error if BullMQ fails to create the job (id should always be set).
 */
export async function addExtractionJob(data: ExtractionJobData): Promise<string> {
  const jobId = randomUUID();
  const job = await extractionQueue.add('extract', data, { jobId });
  if (!job.id) {
    throw new Error('BullMQ did not return a job id');
  }
  log.info('extraction_job_enqueued', { jobId: job.id, documentId: data.documentId });
  return job.id;
}
