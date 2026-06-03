/**
 * Redis pub/sub for extraction progress events.
 *
 * Each job publishes to channel `progress:{jobId}`. The SSE route subscribes to
 * the same channel and forwards events to the browser. One shared subscriber
 * connection multiplexes all jobs by pattern; per-job handlers are dispatched
 * in-process.
 */
import { publisher, subscriber } from './connection.js';
import type { ProgressEvent } from './types.js';
import { log } from '../lib/logger.js';

const CHANNEL_PREFIX = 'progress:';

/** Builds the pub/sub channel name for a job. */
function channelFor(jobId: string): string {
  return `${CHANNEL_PREFIX}${jobId}`;
}

/**
 * Publishes a progress event for a job.
 * @throws never directly — publish failures are logged, not thrown, so a
 * progress hiccup cannot fail the extraction job itself.
 */
export async function publishProgress(jobId: string, event: ProgressEvent): Promise<void> {
  try {
    await publisher.publish(channelFor(jobId), JSON.stringify(event));
  } catch (err) {
    log.warn('progress_publish_failed', {
      jobId,
      stage: event.stage,
      error: err instanceof Error ? err.message : String(err),
    });
  }
}

// Per-jobId handler registry, dispatched from a single message listener.
const handlers = new Map<string, Set<(event: ProgressEvent) => void>>();
let listenerAttached = false;

function ensureListener(): void {
  if (listenerAttached) return;
  listenerAttached = true;
  subscriber.on('message', (channel: string, message: string) => {
    if (!channel.startsWith(CHANNEL_PREFIX)) return;
    const jobId = channel.slice(CHANNEL_PREFIX.length);
    const set = handlers.get(jobId);
    if (!set || set.size === 0) return;
    let event: ProgressEvent;
    try {
      event = JSON.parse(message) as ProgressEvent;
    } catch {
      log.warn('progress_parse_failed', { jobId });
      return;
    }
    for (const handler of set) handler(event);
  });
}

/**
 * Subscribes to progress events for a job.
 * @returns An unsubscribe function that removes the handler and, if it was the
 * last handler for the job, unsubscribes the Redis channel.
 */
export function subscribeToProgress(
  jobId: string,
  handler: (event: ProgressEvent) => void,
): () => void {
  ensureListener();

  let set = handlers.get(jobId);
  if (!set) {
    set = new Set();
    handlers.set(jobId, set);
    void subscriber.subscribe(channelFor(jobId));
  }
  set.add(handler);

  return () => {
    const current = handlers.get(jobId);
    if (!current) return;
    current.delete(handler);
    if (current.size === 0) {
      handlers.delete(jobId);
      void subscriber.unsubscribe(channelFor(jobId));
    }
  };
}
