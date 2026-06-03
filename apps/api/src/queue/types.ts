/**
 * Queue job and progress event contracts.
 *
 * ProgressStage is the shared domain type so the frontend and backend agree on
 * the exact stage strings.
 */
import type { ProgressStage } from '@specforge/shared';

export type { ProgressStage };

/** Name of the BullMQ queue used for document extraction. */
export const EXTRACTION_QUEUE_NAME = 'extraction';

/** Payload enqueued for each extraction job. */
export interface ExtractionJobData {
  documentId: string;
  projectId: string;
  orgId: string;
  filename: string;
}

/** A progress update published to `progress:{jobId}` and streamed over SSE. */
export interface ProgressEvent {
  jobId: string;
  stage: ProgressStage;
  percent: number;
  message: string;
  tokensUsed?: number;
  costUsd?: number;
}
