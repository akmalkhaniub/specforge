/**
 * Seed data: one organisation (Acme Corp) and two demo projects.
 *
 * Idempotent — re-running upserts the org by slug and only inserts the demo
 * projects if that org has none. Run: `pnpm --filter api db:seed`.
 */
import { sql } from './client.js';
import { hashPassword } from '../lib/auth.js';
import { log } from '../lib/logger.js';

const DEMO_USER = { email: 'demo@acme.test', name: 'Demo User', password: 'demo1234' };

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

  // Demo user for login (idempotent by email).
  await sql`
    INSERT INTO users (org_id, email, name, password_hash)
    VALUES (${org.id}, ${DEMO_USER.email}, ${DEMO_USER.name}, ${hashPassword(DEMO_USER.password)})
    ON CONFLICT (email) DO NOTHING
  `;
  log.info('seed_user_ready', { email: DEMO_USER.email });

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
