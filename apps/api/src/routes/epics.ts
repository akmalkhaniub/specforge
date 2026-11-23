/**
 * Epic routes: detail (with stories), partial update, and soft delete.
 */
import { zValidator } from '@hono/zod-validator';
import type { Epic, Story } from '@specforge/shared';
import { Hono } from 'hono';
import { z } from 'zod';
import { sql } from '../db/client.js';
import { NotFoundError } from '../lib/errors.js';
import { epicToTasks } from '../lib/exporters.js';
import { getAuth } from '../middleware/auth.js';
import { log } from '../lib/logger.js';

export const epics = new Hono();

// GET /api/epics/:id  — epic with its stories
epics.get('/:id', async (c) => {
  const id = c.req.param('id');
  const { orgId } = getAuth(c);
  const [epic] = await sql<Epic[]>`
    SELECT id, project_id, document_id, title, description, priority,
           confidence::float AS confidence, metadata, created_at
    FROM epics
    WHERE id = ${id} AND deleted_at IS NULL
      AND project_id IN (SELECT id FROM projects WHERE org_id = ${orgId})
  `;
  if (!epic) throw new NotFoundError('Epic not found', { epicId: id });

  const stories = await sql<Story[]>`
    SELECT id, epic_id, title, description, persona, acceptance_criteria,
           priority, story_points, confidence::float AS confidence, created_at
    FROM stories
    WHERE epic_id = ${id} AND deleted_at IS NULL
    ORDER BY created_at ASC
  `;
  return c.json({ ...epic, stories });
});

// PATCH /api/epics/:id  — update title, description, and/or priority
epics.patch(
  '/:id',
  zValidator(
    'json',
    z
      .object({
        title: z.string().min(1).optional(),
        description: z.string().min(1).optional(),
        priority: z.enum(['high', 'medium', 'low']).optional(),
      })
      .refine((v) => Object.keys(v).length > 0, { message: 'No fields to update' }),
  ),
  async (c) => {
    const id = c.req.param('id');
    const patch = c.req.valid('json');
    const { orgId } = getAuth(c);

    const [epic] = await sql<Epic[]>`
      UPDATE epics SET
        title = ${patch.title ?? sql`title`},
        description = ${patch.description ?? sql`description`},
        priority = ${patch.priority ?? sql`priority`}
      WHERE id = ${id} AND deleted_at IS NULL
        AND project_id IN (SELECT id FROM projects WHERE org_id = ${orgId})
      RETURNING id, project_id, document_id, title, description, priority,
                confidence::float AS confidence, metadata, created_at
    `;
    if (!epic) throw new NotFoundError('Epic not found', { epicId: id });
    log.info('epic_updated', { epicId: id, fields: Object.keys(patch) });
    return c.json(epic);
  },
);

// DELETE /api/epics/:id  — soft delete
epics.delete('/:id', async (c) => {
  const id = c.req.param('id');
  const { orgId } = getAuth(c);
  const [epic] = await sql<{ id: string }[]>`
    UPDATE epics SET deleted_at = now()
    WHERE id = ${id} AND deleted_at IS NULL
      AND project_id IN (SELECT id FROM projects WHERE org_id = ${orgId})
    RETURNING id
  `;
  if (!epic) throw new NotFoundError('Epic not found', { epicId: id });
  log.info('epic_deleted', { epicId: id });
  return c.json({ id: epic.id, deleted: true });
});

const ExportTasksBodySchema = z
  .object({
    prefix: z.string().min(1).max(20).optional(),
  })
  .optional();

// POST /api/epics/:id/export-tasks  — export stories as TASKS.json backlog
epics.post('/:id/export-tasks', async (c) => {
  const id = c.req.param('id');
  const { orgId } = getAuth(c);

  let parsedPrefix: string | undefined;
  const rawText = await c.req.text();
  if (rawText.trim().length > 0) {
    let parsedJson: unknown;
    try {
      parsedJson = JSON.parse(rawText);
    } catch {
      return c.json({ error: 'Invalid JSON request body', code: 'VALIDATION_ERROR' }, 400);
    }
    const bodyResult = ExportTasksBodySchema.safeParse(parsedJson);
    if (!bodyResult.success) {
      return c.json(
        { error: 'Invalid export options', code: 'VALIDATION_ERROR', details: bodyResult.error.flatten() },
        400,
      );
    }
    parsedPrefix = bodyResult.data?.prefix;
  }

  const [epic] = await sql<Epic[]>`
    SELECT id, project_id, document_id, title, description, priority,
           confidence::float AS confidence, metadata, created_at
    FROM epics
    WHERE id = ${id} AND deleted_at IS NULL
      AND project_id IN (SELECT id FROM projects WHERE org_id = ${orgId})
  `;
  if (!epic) throw new NotFoundError('Epic not found', { epicId: id });

  const stories = await sql<Story[]>`
    SELECT id, epic_id, title, description, persona, acceptance_criteria,
           priority, story_points, confidence::float AS confidence, created_at
    FROM stories
    WHERE epic_id = ${id} AND deleted_at IS NULL
    ORDER BY created_at ASC
  `;

  const tasks = epicToTasks(epic, stories, parsedPrefix);
  log.info('epic_tasks_exported', { epicId: id, taskCount: tasks.length });
  return c.json(tasks);
});
