/**
 * Organisation helper route. The demo frontend has no auth, so it fetches the
 * default ("acme") org id at startup rather than hardcoding a UUID.
 */
import type { Organisation } from '@specforge/shared';
import { Hono } from 'hono';
import { sql } from '../db/client.js';
import { NotFoundError } from '../lib/errors.js';

export const org = new Hono();

// GET /api/org/default  — the seeded Acme org
org.get('/default', async (c) => {
  const [organisation] = await sql<Organisation[]>`
    SELECT id, name, slug, created_at FROM organisations WHERE slug = 'acme'
  `;
  if (!organisation) throw new NotFoundError('Default organisation not seeded', {});
  return c.json(organisation);
});
