/**
 * Document routes: multipart upload that stores the file in MinIO, records the
 * document + a queued extraction job, and enqueues the BullMQ job. Returns 202
 * (Accepted) with the job id — extraction runs asynchronously.
 */
import type { Document } from '@specforge/shared';
import { Hono } from 'hono';
import { sql } from '../db/client.js';
import { addExtractionJob } from '../queue/extraction-queue.js';
import { storage } from '../storage/minio.js';
import { NotFoundError, ValidationError } from '../lib/errors.js';
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

  // Resolve the owning org from the project (jobs are tenant-scoped).
  const [project] = await sql<{ orgId: string }[]>`
    SELECT org_id FROM projects WHERE id = ${projectId} AND deleted_at IS NULL
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
    orgId: project.orgId,
    filename: file.name,
  });
  await sql`
    INSERT INTO extraction_jobs (id, document_id, status)
    VALUES (${jobId}::uuid, ${doc.id}, 'queued')
  `;

  log.info('document_uploaded', { documentId: doc.id, jobId, projectId, size });
  return c.json({ documentId: doc.id, jobId, message: 'Extraction queued' }, 202);
});
