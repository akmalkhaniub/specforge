/**
 * Manual smoke test for the MinIO StorageClient. Not part of the app runtime.
 * Run with MinIO up: `tsx src/scripts/smoke-storage.ts`.
 */
import { storage } from '../storage/minio.js';
import { log } from '../lib/logger.js';

async function main(): Promise<void> {
  const healthy = await storage.healthCheck();
  log.info('smoke_health', { healthy });

  await storage.ensureBucket();

  const buffer = Buffer.from('SpecForge storage smoke test payload', 'utf8');
  const { key, size } = await storage.uploadDocument({
    buffer,
    filename: 'smoke test.txt',
    mimeType: 'text/plain',
    projectId: '00000000-0000-0000-0000-000000000000',
  });
  log.info('smoke_uploaded', { key, size });

  const downloaded = await storage.downloadDocument(key);
  const roundTripOk = downloaded.toString('utf8') === buffer.toString('utf8');
  log.info('smoke_roundtrip', { roundTripOk });

  const url = await storage.getPresignedUrl(key, 60);
  log.info('smoke_presigned', { hasUrl: url.startsWith('http') });

  await storage.deleteDocument(key);
  log.info('smoke_deleted', { key });

  if (!roundTripOk) throw new Error('Round-trip content mismatch');
  log.info('smoke_passed', {});
}

main()
  .then(() => process.exit(0))
  .catch((err: unknown) => {
    log.error('smoke_failed', { error: err instanceof Error ? err.message : String(err) });
    process.exit(1);
  });
