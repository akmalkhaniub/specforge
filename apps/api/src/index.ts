/**
 * SpecForge API entry point.
 *
 * Startup sequence: run migrations, ensure the storage bucket, start the BullMQ
 * worker, then serve. Migrations failing is fatal (the API is useless without a
 * schema); storage/worker failures are logged but non-fatal so the API can
 * still serve /health and report degraded dependencies.
 */
import { serve } from '@hono/node-server';
import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { env } from './config/env.js';
import { sql } from './db/client.js';
import { runMigrations } from './db/migrate.js';
import { AppError } from './lib/errors.js';
import { log } from './lib/logger.js';
import { queueConnection } from './queue/connection.js';
import { startWorker } from './queue/worker.js';
import { storage } from './storage/minio.js';
import { authMiddleware } from './middleware/auth.js';
import { analytics } from './routes/analytics.js';
import { auth } from './routes/auth.js';
import { chat } from './routes/chat.js';
import { documents } from './routes/documents.js';
import { epics } from './routes/epics.js';
import { jobs } from './routes/jobs.js';
import { org } from './routes/org.js';
import { projects } from './routes/projects.js';
import { stories } from './routes/stories.js';

const startedAt = Date.now();
const app = new Hono();

// --- Middleware ---
app.use('*', cors({ origin: env.CORS_ORIGIN, credentials: true }));

// Structured request logging.
app.use('*', async (c, next) => {
  const start = Date.now();
  await next();
  log.info('request', {
    method: c.req.method,
    path: c.req.path,
    status: c.res.status,
    durationMs: Date.now() - start,
  });
});

// Centralised error handling → consistent { error, code } envelope.
app.onError((err, c) => {
  if (err instanceof AppError) {
    log.warn('request_error', { code: err.code, message: err.message, context: err.context });
    return c.json({ error: err.message, code: err.code, details: err.context }, err.httpStatus as 400);
  }
  log.error('unhandled_error', {
    message: err instanceof Error ? err.message : String(err),
    stack: err instanceof Error ? err.stack : undefined,
  });
  return c.json({ error: 'Internal server error', code: 'INTERNAL_ERROR' }, 500);
});

// --- Health ---
app.get('/health', async (c) => {
  const [postgres, redis, minio] = await Promise.all([
    sql`SELECT 1`.then(() => true).catch(() => false),
    queueConnection.ping().then((r) => r === 'PONG').catch(() => false),
    storage.healthCheck(),
  ]);
  const ok = postgres && redis && minio;
  return c.json(
    {
      status: ok ? 'ok' : 'degraded',
      services: { postgres, redis, minio },
      uptime: Math.floor((Date.now() - startedAt) / 1000),
      version: '0.1.0',
    },
    ok ? 200 : 503,
  );
});

app.get('/', (c) => c.json({ name: 'specforge-api', version: '0.1.0' }));

// --- Auth: login is public; everything else under /api requires a token ---
app.use('/api/*', async (c, next) => {
  if (c.req.path === '/api/auth/login') return next();
  return authMiddleware(c, next);
});
app.route('/api/auth', auth);

// --- Routes (all tenant-scoped via the authenticated org) ---
app.route('/api/org', org);
app.route('/api/projects', projects);
app.route('/api/documents', documents);
app.route('/api/jobs', jobs);
app.route('/api/epics', epics);
app.route('/api/stories', stories);
app.route('/api/chat', chat);
app.route('/api/analytics', analytics);

/** Runs startup side-effects. Migrations are fatal on failure; others degrade. */
async function startup(): Promise<void> {
  await runMigrations();

  try {
    await storage.ensureBucket();
  } catch (err) {
    log.warn('startup_ensure_bucket_failed', {
      error: err instanceof Error ? err.message : String(err),
    });
  }

  try {
    startWorker();
  } catch (err) {
    log.warn('startup_worker_failed', { error: err instanceof Error ? err.message : String(err) });
  }
}

await startup();
serve({ fetch: app.fetch, port: env.PORT }, (info) => {
  log.info('server_started', { port: info.port, nodeEnv: env.NODE_ENV });
});

export { app };
