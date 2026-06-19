/**
 * Project routes: list, create, detail (with epics + stories), and semantic
 * search. All reads exclude soft-deleted rows. Search is tenant-scoped: the
 * pgvector query filters by org_id and project_id BEFORE ranking by distance.
 */
import { zValidator } from '@hono/zod-validator';
import type { Epic, Project, SearchResult, Story } from '@specforge/shared';
import { Hono } from 'hono';
import { streamSSE } from 'hono/streaming';
import { z } from 'zod';
import { env } from '../config/env.js';
import { sql } from '../db/client.js';
import { generateEmbedding } from '../ai/embeddings.js';
import { streamAnswer, type RagContext } from '../ai/rag.js';
import { exportProject, type ExportFormat } from '../lib/exporters.js';
import { NotFoundError } from '../lib/errors.js';
import { getAuth } from '../middleware/auth.js';
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

// GET /api/projects  — projects in the caller's org
projects.get('/', async (c) => {
  const { orgId } = getAuth(c);
  const rows = await sql<Project[]>`
    SELECT id, org_id, name, description, status, document_count, epic_count,
           created_at, updated_at
    FROM projects
    WHERE org_id = ${orgId} AND deleted_at IS NULL
    ORDER BY created_at DESC
  `;
  return c.json(rows);
});

// POST /api/projects  — create in the caller's org
projects.post(
  '/',
  zValidator('json', z.object({ name: z.string().min(1), description: z.string().optional() })),
  async (c) => {
    const { orgId } = getAuth(c);
    const { name, description } = c.req.valid('json');
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

/** Loads a project (scoped to org) with its epics (hydrated with stories), or null. */
async function loadProjectWithEpics(
  id: string,
  orgId: string,
): Promise<{ project: Project; epics: Epic[] } | null> {
  const [project] = await sql<Project[]>`
    SELECT id, org_id, name, description, status, document_count, epic_count,
           created_at, updated_at
    FROM projects
    WHERE id = ${id} AND org_id = ${orgId} AND deleted_at IS NULL
  `;
  if (!project) return null;

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
  return { project, epics };
}

// GET /api/projects/:id  — project with epics (each with stories)
projects.get('/:id', async (c) => {
  const id = c.req.param('id');
  const data = await loadProjectWithEpics(id, getAuth(c).orgId);
  if (!data) throw new NotFoundError('Project not found', { projectId: id });
  return c.json({ ...data.project, epics: data.epics });
});

// GET /api/projects/:id/export?format=md|csv|jira  — download requirements
projects.get(
  '/:id/export',
  zValidator('query', z.object({ format: z.enum(['md', 'csv', 'jira']).default('md') })),
  async (c) => {
    const id = c.req.param('id');
    const { format } = c.req.valid('query');
    const data = await loadProjectWithEpics(id, getAuth(c).orgId);
    if (!data) throw new NotFoundError('Project not found', { projectId: id });

    const { body, contentType, filename } = exportProject(data.project, data.epics, format as ExportFormat);
    c.header('Content-Type', contentType);
    c.header('Content-Disposition', `attachment; filename="${filename}"`);
    return c.body(body);
  },
);

// GET /api/projects/:id/search?q=
projects.get(
  '/:id/search',
  zValidator('query', z.object({ q: z.string().min(1) })),
  async (c) => {
    const projectId = c.req.param('id');
    const { q } = c.req.valid('query');
    const { orgId } = getAuth(c);

    const [project] = await sql<{ id: string }[]>`
      SELECT id FROM projects WHERE id = ${projectId} AND org_id = ${orgId} AND deleted_at IS NULL
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
      WHERE org_id = ${orgId}
        AND project_id = ${projectId}
        AND (1 - (embedding <=> ${vectorLiteral}::vector)) > ${SIMILARITY_THRESHOLD}
      ORDER BY embedding <=> ${vectorLiteral}::vector
      LIMIT ${SEARCH_LIMIT}
    `;
    return c.json(rows);
  },
);

const RAG_TOP_K = 8;

// POST /api/projects/:id/ask  — RAG: retrieve over embeddings, stream a cited answer
projects.post(
  '/:id/ask',
  zValidator('json', z.object({ question: z.string().min(1) })),
  async (c) => {
    const projectId = c.req.param('id');
    const { question } = c.req.valid('json');
    const { orgId } = getAuth(c);

    const [project] = await sql<{ id: string }[]>`
      SELECT id FROM projects WHERE id = ${projectId} AND org_id = ${orgId} AND deleted_at IS NULL
    `;
    if (!project) throw new NotFoundError('Project not found', { projectId });

    return streamSSE(c, async (stream) => {
      if (!env.EMBEDDINGS_ENABLED) {
        await stream.writeSSE({
          data: JSON.stringify({ type: 'error', message: 'Semantic answering requires embeddings to be enabled.' }),
          event: 'error',
        });
        await stream.close();
        return;
      }

      const queryEmbedding = await generateEmbedding(question);
      const vectorLiteral = `[${queryEmbedding.join(',')}]`;
      const context = await sql<RagContext[]>`
        SELECT source_type, source_id, content
        FROM embeddings
        WHERE org_id = ${orgId} AND project_id = ${projectId}
        ORDER BY embedding <=> ${vectorLiteral}::vector
        LIMIT ${RAG_TOP_K}
      `;

      // Send the retrieved sources first so the UI can show citations.
      await stream.writeSSE({ data: JSON.stringify({ type: 'sources', sources: context }), event: 'sources' });

      await streamAnswer({
        question,
        context,
        onChunk: (text) => {
          void stream.writeSSE({ data: JSON.stringify({ type: 'chunk', text }), event: 'chunk' });
        },
      });

      await stream.writeSSE({ data: JSON.stringify({ type: 'done' }), event: 'done' });
      await stream.close();
    });
  },
);
