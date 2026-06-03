/**
 * Idempotent migration runner.
 *
 * Reads numbered .sql files from ./migrations in lexical order, applies any not
 * yet recorded in schema_migrations inside a transaction, and records each
 * applied migration. Safe to run repeatedly (e.g. on every startup).
 *
 * Run directly: `pnpm --filter api db:migrate`.
 */
import { readdir, readFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { sql } from './client.js';
import { log } from '../lib/logger.js';

const MIGRATIONS_DIR = join(dirname(fileURLToPath(import.meta.url)), 'migrations');

/** Ensures the bookkeeping table exists before we read/write migration state. */
async function ensureMigrationsTable(): Promise<void> {
  await sql`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      filename   text PRIMARY KEY,
      applied_at timestamptz NOT NULL DEFAULT now()
    )
  `;
}

/**
 * Applies all pending migrations in order.
 * @returns The list of filenames that were applied in this run.
 */
export async function runMigrations(): Promise<string[]> {
  await ensureMigrationsTable();

  const entries = await readdir(MIGRATIONS_DIR);
  const files = entries.filter((f) => f.endsWith('.sql')).sort();

  const appliedRows = await sql<{ filename: string }[]>`
    SELECT filename FROM schema_migrations
  `;
  const applied = new Set(appliedRows.map((r) => r.filename));

  const newlyApplied: string[] = [];
  for (const file of files) {
    if (applied.has(file)) continue;

    const path = join(MIGRATIONS_DIR, file);
    const ddl = await readFile(path, 'utf8');

    // Each migration + its bookkeeping row commit atomically. sql.file isn't
    // used because some migrations contain multiple statements.
    await sql.begin(async (tx) => {
      await tx.unsafe(ddl);
      await tx`INSERT INTO schema_migrations (filename) VALUES (${file})`;
    });

    newlyApplied.push(file);
    log.info('migration_applied', { filename: file });
  }

  if (newlyApplied.length === 0) {
    log.info('migrations_up_to_date', {});
  }
  return newlyApplied;
}

// Allow running as a standalone script.
const isMain = process.argv[1] === fileURLToPath(import.meta.url);
if (isMain) {
  runMigrations()
    .then(() => sql.end())
    .then(() => process.exit(0))
    .catch((err: unknown) => {
      log.error('migration_failed', {
        error: err instanceof Error ? err.message : String(err),
      });
      process.exit(1);
    });
}
