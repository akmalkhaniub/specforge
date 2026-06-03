/**
 * Chat route: streams a requirements-gathering conversation over SSE. When
 * Claude signals completion via the requirements_complete tool, a project is
 * created (if needed), the PRD summary is stored as a document, and an
 * extraction job is enqueued — then a final requirements_complete event is sent.
 */
import { zValidator } from '@hono/zod-validator';
import type { PRDSummary } from '@specforge/shared';
import { Hono } from 'hono';
import { streamSSE } from 'hono/streaming';
import { z } from 'zod';
import { streamChat } from '../ai/chat.js';
import { sql } from '../db/client.js';
import { addExtractionJob } from '../queue/extraction-queue.js';
import { storage } from '../storage/minio.js';
import { log } from '../lib/logger.js';

export const chat = new Hono();

const ChatBody = z.object({
  messages: z.array(z.object({ role: z.enum(['user', 'assistant']), content: z.string() })).min(1),
  projectId: z.string().uuid().optional(),
  orgId: z.string().uuid().optional(),
});

/** Resolves the org id to attach a chat-created project to. */
async function resolveOrgId(orgId: string | undefined): Promise<string> {
  if (orgId) return orgId;
  const [org] = await sql<{ id: string }[]>`SELECT id FROM organisations WHERE slug = 'acme'`;
  if (!org) throw new Error('No default organisation found; provide orgId');
  return org.id;
}

/** Renders a PRD summary to plain text for storage + downstream extraction. */
function prdToText(prd: PRDSummary): string {
  const epics = prd.epicsOutline.map((e) => `- ${e.title}: ${e.description}`).join('\n');
  return [
    `# ${prd.title}`,
    '',
    '## Overview',
    prd.overview,
    '',
    '## Stakeholders',
    prd.stakeholders.map((s) => `- ${s}`).join('\n'),
    '',
    '## Epics',
    epics,
  ].join('\n');
}

// POST /api/chat/stream
chat.post('/stream', zValidator('json', ChatBody), (c) => {
  const { messages, projectId, orgId } = c.req.valid('json');

  return streamSSE(c, async (stream) => {
    let prd: PRDSummary | undefined;

    await streamChat({
      messages,
      onChunk: (text) => {
        void stream.writeSSE({ data: JSON.stringify({ type: 'chunk', text }), event: 'chunk' });
      },
      onComplete: (_message, requirementsComplete) => {
        prd = requirementsComplete;
      },
    });

    if (!prd) {
      await stream.writeSSE({ data: JSON.stringify({ type: 'done' }), event: 'done' });
      await stream.close();
      return;
    }

    // Requirements gathered — materialise a project + document + extraction job.
    const resolvedOrg = await resolveOrgId(orgId);
    let targetProjectId = projectId;
    if (!targetProjectId) {
      const [project] = await sql<{ id: string }[]>`
        INSERT INTO projects (org_id, name, description)
        VALUES (${resolvedOrg}, ${prd.title}, ${prd.overview})
        RETURNING id
      `;
      targetProjectId = project?.id;
    }
    if (!targetProjectId) throw new Error('Failed to resolve project for chat requirements');

    const text = prdToText(prd);
    const buffer = Buffer.from(text, 'utf8');
    const { key, size } = await storage.uploadDocument({
      buffer,
      filename: `${prd.title}.txt`,
      mimeType: 'text/plain',
      projectId: targetProjectId,
    });

    const [doc] = await sql<{ id: string }[]>`
      INSERT INTO documents (project_id, filename, mime_type, minio_key, size_bytes)
      VALUES (${targetProjectId}, ${`${prd.title}.txt`}, 'text/plain', ${key}, ${size})
      RETURNING id
    `;
    if (!doc) throw new Error('Failed to insert chat document');

    const jobId = await addExtractionJob({
      documentId: doc.id,
      projectId: targetProjectId,
      orgId: resolvedOrg,
      filename: `${prd.title}.txt`,
    });
    await sql`
      INSERT INTO extraction_jobs (id, document_id, status)
      VALUES (${jobId}::uuid, ${doc.id}, 'queued')
    `;

    log.info('chat_requirements_complete', { projectId: targetProjectId, jobId });
    await stream.writeSSE({
      data: JSON.stringify({ type: 'requirements_complete', projectId: targetProjectId, jobId }),
      event: 'requirements_complete',
    });
    await stream.close();
  });
});
