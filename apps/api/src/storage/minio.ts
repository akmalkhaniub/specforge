/**
 * MinIO object storage client.
 *
 * Wraps the `minio` SDK behind a small typed surface. All SDK errors are
 * caught and re-thrown as StorageError with the original attached as `cause`
 * and structured context — raw MinIO SDK errors never escape this module.
 */
import { randomUUID } from 'node:crypto';
import { Client as MinioClient } from 'minio';
import { env } from '../config/env.js';
import { StorageError } from '../lib/errors.js';
import { log } from '../lib/logger.js';

/** Parameters for uploading a document to object storage. */
export interface UploadParams {
  buffer: Buffer;
  filename: string;
  mimeType: string;
  projectId: string;
}

/** Result of a successful upload. */
export interface UploadResult {
  key: string;
  size: number;
}

/** Collects a readable stream into a single Buffer. */
async function streamToBuffer(stream: NodeJS.ReadableStream): Promise<Buffer> {
  const chunks: Buffer[] = [];
  for await (const chunk of stream) {
    chunks.push(chunk instanceof Buffer ? chunk : Buffer.from(chunk));
  }
  return Buffer.concat(chunks);
}

export class StorageClient {
  private readonly client: MinioClient;
  private readonly bucket: string;

  constructor() {
    this.client = new MinioClient({
      endPoint: env.MINIO_ENDPOINT,
      port: env.MINIO_PORT,
      useSSL: env.MINIO_USE_SSL,
      accessKey: env.MINIO_ACCESS_KEY,
      secretKey: env.MINIO_SECRET_KEY,
    });
    this.bucket = env.MINIO_BUCKET;
  }

  /**
   * Uploads a document. Key pattern: documents/{projectId}/{uuid}-{filename}.
   * @returns The storage key and stored size in bytes (not a URL).
   * @throws StorageError if the upload fails.
   */
  async uploadDocument(params: UploadParams): Promise<UploadResult> {
    const safeName = params.filename.replace(/[^\w.\-]+/g, '_');
    const key = `documents/${params.projectId}/${randomUUID()}-${safeName}`;
    try {
      await this.client.putObject(this.bucket, key, params.buffer, params.buffer.length, {
        'Content-Type': params.mimeType,
      });
      log.info('storage_upload', { key, size: params.buffer.length });
      return { key, size: params.buffer.length };
    } catch (err) {
      throw new StorageError('Failed to upload document', { key, bucket: this.bucket }, { cause: err });
    }
  }

  /**
   * Downloads an object and buffers it fully in memory.
   * @throws StorageError if the object cannot be read.
   */
  async downloadDocument(key: string): Promise<Buffer> {
    try {
      const stream = await this.client.getObject(this.bucket, key);
      return await streamToBuffer(stream);
    } catch (err) {
      throw new StorageError('Failed to download document', { key, bucket: this.bucket }, { cause: err });
    }
  }

  /**
   * Generates a time-limited presigned GET URL for the frontend.
   * @param expirySeconds URL validity window (default 1 hour).
   * @throws StorageError if URL generation fails.
   */
  async getPresignedUrl(key: string, expirySeconds = 3600): Promise<string> {
    try {
      return await this.client.presignedGetObject(this.bucket, key, expirySeconds);
    } catch (err) {
      throw new StorageError('Failed to presign URL', { key, bucket: this.bucket }, { cause: err });
    }
  }

  /**
   * Deletes an object. Idempotent from the caller's perspective.
   * @throws StorageError if deletion fails.
   */
  async deleteDocument(key: string): Promise<void> {
    try {
      await this.client.removeObject(this.bucket, key);
      log.info('storage_delete', { key });
    } catch (err) {
      throw new StorageError('Failed to delete document', { key, bucket: this.bucket }, { cause: err });
    }
  }

  /**
   * Creates the configured bucket if it does not exist. Called on startup.
   * @throws StorageError if the bucket cannot be created or checked.
   */
  async ensureBucket(): Promise<void> {
    try {
      const exists = await this.client.bucketExists(this.bucket);
      if (!exists) {
        await this.client.makeBucket(this.bucket);
        log.info('storage_bucket_created', { bucket: this.bucket });
      }
    } catch (err) {
      throw new StorageError('Failed to ensure bucket', { bucket: this.bucket }, { cause: err });
    }
  }

  /**
   * Liveness check for /health. Never throws — returns false on any failure.
   */
  async healthCheck(): Promise<boolean> {
    try {
      await this.client.bucketExists(this.bucket);
      return true;
    } catch {
      return false;
    }
  }
}

/** Shared singleton — import this, do not construct StorageClient elsewhere. */
export const storage = new StorageClient();
