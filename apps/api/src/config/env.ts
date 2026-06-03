/**
 * Environment configuration, validated at startup with Zod.
 *
 * Fail-fast: if a required variable is missing or malformed the process exits
 * with a clear message rather than failing deep inside a request handler.
 *
 * Some variables are only required by later phases (AI keys, embeddings). They
 * are optional here so the API can boot and serve /health during early phases;
 * the modules that need them assert their presence at point of use.
 */
import { resolve } from 'node:path';
import dotenv from 'dotenv';
import { z } from 'zod';

// The canonical .env lives at the monorepo root. When the API is run via
// `pnpm --filter api dev`, cwd is apps/api, so the root file is two up.
// Fall back to a local .env (e.g. in a container) if the root one is absent.
dotenv.config({ path: resolve(process.cwd(), '../../.env') });
dotenv.config();

const EnvSchema = z.object({
  // Core infra
  DATABASE_URL: z.string().url(),
  REDIS_URL: z.string().default('redis://localhost:6379'),

  // MinIO
  MINIO_ENDPOINT: z.string().default('localhost'),
  MINIO_PORT: z.coerce.number().int().positive().default(9000),
  MINIO_ACCESS_KEY: z.string().default('minioadmin'),
  MINIO_SECRET_KEY: z.string().default('minioadmin'),
  MINIO_BUCKET: z.string().default('specforge-documents'),
  MINIO_USE_SSL: z
    .enum(['true', 'false'])
    .default('false')
    .transform((v) => v === 'true'),

  // AI (required from Phase 4 onward)
  ANTHROPIC_API_KEY: z.string().optional(),
  OPENAI_API_KEY: z.string().optional(),
  EMBEDDINGS_ENABLED: z
    .enum(['true', 'false'])
    .default('false')
    .transform((v) => v === 'true'),

  // App
  PORT: z.coerce.number().int().positive().default(3000),
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  CORS_ORIGIN: z.string().default('http://localhost:5173'),
});

const parsed = EnvSchema.safeParse(process.env);

if (!parsed.success) {
  // Cannot use the structured logger here — config is what it configures.
  const issues = parsed.error.issues
    .map((i) => `  - ${i.path.join('.')}: ${i.message}`)
    .join('\n');
  process.stderr.write(`Invalid environment configuration:\n${issues}\n`);
  process.exit(1);
}

export const env = parsed.data;

export type Env = typeof env;
