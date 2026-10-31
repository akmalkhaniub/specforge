/**
 * Story routes: partial update and soft delete.
 */
import { zValidator } from '@hono/zod-validator';
import type { Story } from '@specforge/shared';
import { Hono } from 'hono';
import { z } from 'zod';
import { sql } from '../db/client.js';
import { NotFoundError } from '../lib/errors.js';
import { getAuth } from '../middleware/auth.js';
import { log } from '../lib/logger.js';

export const stories = new Hono();

const SELECT_COLS = sql`
  id, epic_id, title, description, persona, acceptance_criteria,
  priority, story_points, confidence::float AS confidence, created_at
`;

/** Story-ownership guard: the story's epic must belong to a project in the org. */
function ownedByOrg(orgId: string) {
  return sql`epic_id IN (
    SELECT e.id FROM epics e JOIN projects p ON e.project_id = p.id WHERE p.org_id = ${orgId}
  )`;
}

// PATCH /api/stories/:id  — update title/description/persona/priority
stories.patch(
  '/:id',
  zValidator(
    'json',
    z
      .object({
        title: z.string().min(1).optional(),
        description: z.string().min(1).optional(),
        persona: z.string().optional(),
        priority: z.enum(['high', 'medium', 'low']).optional(),
      })
      .refine((v) => Object.keys(v).length > 0, { message: 'No fields to update' }),
  ),
  async (c) => {
    const id = c.req.param('id');
    const patch = c.req.valid('json');
    const { orgId } = getAuth(c);
    const [story] = await sql<Story[]>`
      UPDATE stories SET
        title = ${patch.title ?? sql`title`},
        description = ${patch.description ?? sql`description`},
        persona = ${patch.persona ?? sql`persona`},
        priority = ${patch.priority ?? sql`priority`}
      WHERE id = ${id} AND deleted_at IS NULL AND ${ownedByOrg(orgId)}
      RETURNING ${SELECT_COLS}
    `;
    if (!story) throw new NotFoundError('Story not found', { storyId: id });
    log.info('story_updated', { storyId: id, fields: Object.keys(patch) });
    return c.json(story);
  },
);

// DELETE /api/stories/:id  — soft delete
stories.delete('/:id', async (c) => {
  const id = c.req.param('id');
  const { orgId } = getAuth(c);
  const [story] = await sql<{ id: string }[]>`
    UPDATE stories SET deleted_at = now()
    WHERE id = ${id} AND deleted_at IS NULL AND ${ownedByOrg(orgId)}
    RETURNING id
  `;
  if (!story) throw new NotFoundError('Story not found', { storyId: id });
  log.info('story_deleted', { storyId: id });
  return c.json({ id: story.id, deleted: true });
});
