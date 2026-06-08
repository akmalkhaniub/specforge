/**
 * Project routes: list, create, detail (with epics + stories), and semantic
 * search. All reads exclude soft-deleted rows. Search is tenant-scoped: the
 * pgvector query filters by org_id and project_id BEFORE ranking by distance.
 */
import { zValidator } from '@hono/zod-validator';
import type { Epic, Project, SearchResult, Story } from '@specforge/shared';
import { Hono } from 'hono';
import { z } from 'zod';
import { env } from '../config/env.js';
import { sql } from '../db/client.js';
import { generateEmbedding } from '../ai/embeddings.js';
import { NotFoundError } from '../lib/errors.js';
import { log } from '../lib/logger.js';

export const projects = new Hono();

// Empirically tuned for text-embedding-3-small: cosine similarity between a
// short query and short epic text rarely exceeds ~0.5, so the spec's original
// 0.7 cutoff returned nothing in practice. 0.3 keeps relevant hits while still
// filtering noise. (Verified via smoke-e2e: checkout=0.46, confirmation=0.41.)
const SIMILARITY_THRESHOLD = 0.3;
const SEARCH_LIMIT = 10;

/** Orders priorities high → medium → low in SQL. */
const PRIORITY_ORDER = sql`CASE priority WHEN 'high' THEN 0 WHEN 'medium' THEN 1 ELSE 2 END`;

// GET /api/projects?orgId=
projects.get(
  '/',
  zValidator('query', z.object({ orgId: z.string().uuid() })),
  async (c) => {
    const { orgId } = c.req.valid('query');
    const rows = await sql<Project[]>`
      SELECT id, org_id, name, description, status, document_count, epic_count,
             created_at, updated_at
      FROM projects
      WHERE org_id = ${orgId} AND deleted_at IS NULL
      ORDER BY created_at DESC
    `;
    return c.json(rows);
  },
);

// POST /api/projects
projects.post(
  '/',
  zValidator(
    'json',
    z.object({
      orgId: z.string().uuid(),
      name: z.string().min(1),
      description: z.string().optional(),
    }),
  ),
  async (c) => {
    const { orgId, name, description } = c.req.valid('json');
    const [project] = await sql<Project[]>`
      INSERT INTO projects (org_id, name, description)
      VALUES (${orgId}, ${name}, ${description ?? null})
      RETURNING id, org_id, name, description, status, document_count, epic_count,
                created_at, updated_at
    `;
    log.info('project_created', { projectId: project?.id, orgId });
    return c.json(project, 201);
  },
);

// GET /api/projects/:id  — project with epics (each with stories)
projects.get('/:id', async (c) => {
  const id = c.req.param('id');
  const [project] = await sql<Project[]>`
    SELECT id, org_id, name, description, status, document_count, epic_count,
           created_at, updated_at
    FROM projects
    WHERE id = ${id} AND deleted_at IS NULL
  `;
  if (!project) throw new NotFoundError('Project not found', { projectId: id });

  const epicRows = await sql<Epic[]>`
    SELECT id, project_id, document_id, title, description, priority,
           confidence::float AS confidence, metadata, created_at
    FROM epics
    WHERE project_id = ${id} AND deleted_at IS NULL
    ORDER BY ${PRIORITY_ORDER}, created_at ASC
  `;

  const epicIds = epicRows.map((e) => e.id);
  const storyRows = epicIds.length
    ? await sql<Story[]>`
        SELECT id, epic_id, title, description, persona, acceptance_criteria,
               priority, story_points, confidence::float AS confidence, created_at
        FROM stories
        WHERE epic_id IN ${sql(epicIds)} AND deleted_at IS NULL
        ORDER BY ${PRIORITY_ORDER}, created_at ASC
      `
    : [];

  const storiesByEpic = new Map<string, Story[]>();
  for (const story of storyRows) {
    const list = storiesByEpic.get(story.epicId) ?? [];
    list.push(story);
    storiesByEpic.set(story.epicId, list);
  }

  const epics: Epic[] = epicRows.map((e) => ({ ...e, stories: storiesByEpic.get(e.id) ?? [] }));
  return c.json({ ...project, epics });
});

// GET /api/projects/:id/search?q=
projects.get(
  '/:id/search',
  zValidator('query', z.object({ q: z.string().min(1) })),
  async (c) => {
    const projectId = c.req.param('id');
    const { q } = c.req.valid('query');

    const [project] = await sql<{ orgId: string }[]>`
      SELECT org_id FROM projects WHERE id = ${projectId} AND deleted_at IS NULL
    `;
    if (!project) throw new NotFoundError('Project not found', { projectId });

    // Semantic search requires embeddings; degrade gracefully when disabled.
    if (!env.EMBEDDINGS_ENABLED) {
      log.info('search_skipped_embeddings_disabled', { projectId });
      return c.json([] satisfies SearchResult[]);
    }

    const queryEmbedding = await generateEmbedding(q);
    const vectorLiteral = `[${queryEmbedding.join(',')}]`;

    const rows = await sql<SearchResult[]>`
      SELECT source_type, source_id, content, metadata,
             (1 - (embedding <=> ${vectorLiteral}::vector))::float AS similarity
      FROM embeddings
      WHERE org_id = ${project.orgId}
        AND project_id = ${projectId}
        AND (1 - (embedding <=> ${vectorLiteral}::vector)) > ${SIMILARITY_THRESHOLD}
      ORDER BY embedding <=> ${vectorLiteral}::vector
      LIMIT ${SEARCH_LIMIT}
    `;
    return c.json(rows);
  },
);
