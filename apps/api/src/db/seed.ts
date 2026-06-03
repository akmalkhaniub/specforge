/**
 * Seed data: one organisation (Acme Corp) and two demo projects.
 *
 * Idempotent — re-running upserts the org by slug and only inserts the demo
 * projects if that org has none. Run: `pnpm --filter api db:seed`.
 */
import { sql } from './client.js';
import { log } from '../lib/logger.js';

const DEMO_PROJECTS = [
  { name: 'E-commerce Platform', description: 'Online retail storefront and checkout.' },
  { name: 'Mobile Banking App', description: 'Cross-platform retail banking application.' },
] as const;

async function seed(): Promise<void> {
  const [org] = await sql<{ id: string }[]>`
    INSERT INTO organisations (name, slug)
    VALUES ('Acme Corp', 'acme')
    ON CONFLICT (slug) DO UPDATE SET name = EXCLUDED.name
    RETURNING id
  `;
  if (!org) throw new Error('Failed to upsert seed organisation');
  log.info('seed_org_ready', { orgId: org.id, slug: 'acme' });

  const [countRow] = await sql<{ count: number }[]>`
    SELECT COUNT(*)::int AS count FROM projects WHERE org_id = ${org.id}
  `;
  const count = countRow?.count ?? 0;

  if (count > 0) {
    log.info('seed_projects_skipped', { orgId: org.id, existing: count });
    return;
  }

  for (const p of DEMO_PROJECTS) {
    const [project] = await sql<{ id: string }[]>`
      INSERT INTO projects (org_id, name, description)
      VALUES (${org.id}, ${p.name}, ${p.description})
      RETURNING id
    `;
    log.info('seed_project_created', { orgId: org.id, projectId: project?.id, name: p.name });
  }
}

seed()
  .then(() => sql.end())
  .then(() => process.exit(0))
  .catch((err: unknown) => {
    log.error('seed_failed', { error: err instanceof Error ? err.message : String(err) });
    process.exit(1);
  });
