/**
 * Redis connections for the queue layer.
 *
 * Three distinct connections are required:
 *  - `queueConnection`  — used by BullMQ (Queue + Worker).
 *  - `publisher`        — publishes progress events to pub/sub channels.
 *  - `subscriber`       — a connection in subscribe mode (a Redis connection in
 *                          subscribe mode cannot run other commands, so it must
 *                          be separate from the publisher).
 *
 * BullMQ requires `maxRetriesPerRequest: null` on its connection.
 */
import { Redis } from 'ioredis';
import { env } from '../config/env.js';

/** Connection dedicated to BullMQ. Do not issue ad-hoc commands on this. */
export const queueConnection = new Redis(env.REDIS_URL, {
  maxRetriesPerRequest: null,
});

/** Connection used to PUBLISH progress events. */
export const publisher = new Redis(env.REDIS_URL, {
  maxRetriesPerRequest: null,
});

/** Connection used to SUBSCRIBE to progress channels (subscribe-mode only). */
export const subscriber = new Redis(env.REDIS_URL, {
  maxRetriesPerRequest: null,
});

/** Closes all Redis connections (used on graceful shutdown / scripts). */
export async function closeConnections(): Promise<void> {
  await Promise.allSettled([queueConnection.quit(), publisher.quit(), subscriber.quit()]);
}
