/**
 * Document routes: multipart upload that stores the file in MinIO, records the
 * document + a queued extraction job, and enqueues the BullMQ job. Returns 202
 * (Accepted) with the job id — extraction runs asynchronously.
 */
import type { Document } from '@specforge/shared';
import { Hono } from 'hono';
import { zValidator } from '@hono/zod-validator';
import { z } from 'zod';
import { sql } from '../db/client.js';
import { addExtractionJob } from '../queue/extraction-queue.js';
import { storage } from '../storage/minio.js';
import { NotFoundError, ValidationError } from '../lib/errors.js';
import { getAuth } from '../middleware/auth.js';
import { log } from '../lib/logger.js';

export const documents = new Hono();

const MAX_SIZE_BYTES = 20 * 1024 * 1024; // 20MB
const ALLOWED_MIME = new Set([
  'application/pdf',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
]);

// POST /api/documents/upload  (multipart/form-data: file, projectId)
documents.post('/upload', async (c) => {
  const body = await c.req.parseBody();
  const file = body['file'];
  const projectId = body['projectId'];

  if (!(file instanceof File)) {
    throw new ValidationError('Missing file in multipart body', {});
  }
  if (typeof projectId !== 'string' || projectId.length === 0) {
    throw new ValidationError('Missing projectId', {});
  }
  if (!ALLOWED_MIME.has(file.type)) {
    throw new ValidationError('Unsupported file type — only PDF and DOCX allowed', {
      mimeType: file.type,
    });
  }
  if (file.size > MAX_SIZE_BYTES) {
    // Mapped to 413 by the error middleware via a dedicated check below.
    const err = new ValidationError('File exceeds 20MB limit', { size: file.size });
    return c.json({ error: err.message, code: 'PAYLOAD_TOO_LARGE' }, 413);
  }

  // Verify the project belongs to the caller's org (tenant isolation).
  const { orgId } = getAuth(c);
  const [project] = await sql<{ id: string }[]>`
    SELECT id FROM projects WHERE id = ${projectId} AND org_id = ${orgId} AND deleted_at IS NULL
  `;
  if (!project) throw new NotFoundError('Project not found', { projectId });

  const buffer = Buffer.from(await file.arrayBuffer());
  const { key, size } = await storage.uploadDocument({
    buffer,
    filename: file.name,
    mimeType: file.type,
    projectId,
  });

  const [doc] = await sql<Document[]>`
    INSERT INTO documents (project_id, filename, mime_type, minio_key, size_bytes)
    VALUES (${projectId}, ${file.name}, ${file.type}, ${key}, ${size})
    RETURNING id, project_id, filename, mime_type, minio_key, size_bytes, status, created_at
  `;
  if (!doc) throw new Error('Failed to insert document record');

  // Pre-create the extraction_jobs row using the BullMQ job id as PK so the SSE
  // route can poll it by the same id the client receives.
  const jobId = await addExtractionJob({
    documentId: doc.id,
    projectId,
    orgId,
    filename: file.name,
  });
  await sql`
    INSERT INTO extraction_jobs (id, document_id, status)
    VALUES (${jobId}::uuid, ${doc.id}, 'queued')
  `;

  log.info('document_uploaded', { documentId: doc.id, jobId, projectId, size });
  return c.json({ documentId: doc.id, jobId, message: 'Extraction queued' }, 202);
});

// GET /api/documents?projectId=  — list a project's documents (newest first)
documents.get(
  '/',
  zValidator('query', z.object({ projectId: z.string().uuid() })),
  async (c) => {
    const { projectId } = c.req.valid('query');
    const { orgId } = getAuth(c);
    const rows = await sql<Document[]>`
      SELECT d.id, d.project_id, d.filename, d.mime_type, d.minio_key, d.size_bytes, d.status, d.created_at
      FROM documents d JOIN projects p ON d.project_id = p.id
      WHERE d.project_id = ${projectId} AND p.org_id = ${orgId} AND d.deleted_at IS NULL
      ORDER BY d.created_at DESC
    `;
    return c.json(rows);
  },
);

// GET /api/documents/:id/download  — redirect to a presigned MinIO URL
documents.get('/:id/download', async (c) => {
  const id = c.req.param('id');
  const { orgId } = getAuth(c);
  const [doc] = await sql<{ minioKey: string }[]>`
    SELECT d.minio_key FROM documents d JOIN projects p ON d.project_id = p.id
    WHERE d.id = ${id} AND p.org_id = ${orgId} AND d.deleted_at IS NULL
  `;
  if (!doc) throw new NotFoundError('Document not found', { documentId: id });
  const url = await storage.getPresignedUrl(doc.minioKey, 300);
  return c.redirect(url);
});

// POST /api/documents/:id/reprocess  — re-run extraction for an existing document
documents.post('/:id/reprocess', async (c) => {
  const id = c.req.param('id');
  const { orgId } = getAuth(c);
  const [doc] = await sql<{ id: string; projectId: string; filename: string; orgId: string }[]>`
    SELECT d.id, d.project_id, d.filename, p.org_id
    FROM documents d JOIN projects p ON d.project_id = p.id
    WHERE d.id = ${id} AND p.org_id = ${orgId} AND d.deleted_at IS NULL
  `;
  if (!doc) throw new NotFoundError('Document not found', { documentId: id });

  await sql`UPDATE documents SET status = 'pending' WHERE id = ${id}`;
  const jobId = await addExtractionJob({
    documentId: doc.id,
    projectId: doc.projectId,
    orgId: doc.orgId,
    filename: doc.filename,
  });
  await sql`INSERT INTO extraction_jobs (id, document_id, status) VALUES (${jobId}::uuid, ${doc.id}, 'queued')`;
  log.info('document_reprocess', { documentId: id, jobId });
  return c.json({ documentId: id, jobId, message: 'Re-extraction queued' }, 202);
});
