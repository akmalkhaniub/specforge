/**
 * Shared domain types for SpecForge.
 *
 * Source of truth for IDs, timestamps, and domain models that cross the
 * API <-> web boundary. This package has ZERO runtime dependencies — types
 * only. All IDs are UUID strings; all timestamps are ISO 8601 strings (UTC).
 */

/** A priority level applied to epics and stories. */
export type Priority = 'high' | 'medium' | 'low';

/** Lifecycle status of a project. */
export type ProjectStatus = 'active' | 'archived';

/** Lifecycle status of an uploaded document. */
export type DocumentStatus = 'pending' | 'processing' | 'extracted' | 'failed';

/** Lifecycle status of an extraction job. */
export type ExtractionJobStatus = 'queued' | 'processing' | 'complete' | 'failed';

/** Source type for a row in the embeddings table. */
export type EmbeddingSourceType = 'epic' | 'story' | 'document';

/**
 * Ordered stages an extraction job passes through. Emitted on the Redis
 * pub/sub progress channel and persisted on the extraction_jobs row.
 */
export type ProgressStage =
  | 'queued'
  | 'downloading'
  | 'parsing'
  | 'extracting_epics'
  | 'extracting_stories'
  | 'embedding'
  | 'saving'
  | 'complete'
  | 'failed';

/** A tenant. Top of the ownership hierarchy; everything is scoped to an org. */
export interface Organisation {
  id: string;
  name: string;
  slug: string;
  createdAt: string;
}

/** A project groups documents, epics, and stories within an organisation. */
export interface Project {
  id: string;
  orgId: string;
  name: string;
  description: string | null;
  status: ProjectStatus;
  documentCount: number;
  epicCount: number;
  createdAt: string;
  updatedAt: string;
}

/** An uploaded source document (PDF/DOCX) stored in object storage. */
export interface Document {
  id: string;
  projectId: string;
  filename: string;
  mimeType: string;
  minioKey: string;
  sizeBytes: number;
  status: DocumentStatus;
  createdAt: string;
}

/** A unit of acceptance criteria, expressed in Given/When/Then form. */
export interface AcceptanceCriteria {
  given: string;
  when: string;
  then: string;
}

/** A high-level capability extracted from a document. */
export interface Epic {
  id: string;
  projectId: string;
  documentId: string;
  title: string;
  description: string;
  priority: Priority;
  confidence: number | null;
  metadata: Record<string, unknown>;
  createdAt: string;
  /** Hydrated on detail reads; omitted on list reads. */
  stories?: Story[];
}

/** A user story belonging to an epic. */
export interface Story {
  id: string;
  epicId: string;
  title: string;
  description: string;
  persona: string | null;
  acceptanceCriteria: string[];
  priority: Priority;
  storyPoints: number | null;
  confidence: number | null;
  createdAt: string;
}

/** Token + cost accounting and lifecycle for one extraction run. */
export interface ExtractionJob {
  id: string;
  documentId: string;
  status: ExtractionJobStatus;
  progress: number;
  stage: ProgressStage | null;
  model: string | null;
  promptTokens: number;
  completionTokens: number;
  cacheReadTokens: number;
  cacheWriteTokens: number;
  costUsd: number;
  latencyMs: number | null;
  error: string | null;
  startedAt: string | null;
  completedAt: string | null;
  createdAt: string;
}

/** A single progress update streamed to the frontend over SSE. */
export interface ExtractionProgress {
  jobId: string;
  stage: ProgressStage;
  percent: number;
  message: string;
  tokensUsed?: number;
  costUsd?: number;
}

/** A message in a requirements-gathering chat. */
export interface ChatMessage {
  role: 'user' | 'assistant';
  content: string;
}

/** Structured summary emitted when conversational requirements are complete. */
export interface PRDSummary {
  title: string;
  overview: string;
  stakeholders: string[];
  epicsOutline: Array<{ title: string; description: string }>;
}

/** A semantic-search hit from the embeddings table. */
export interface SearchResult {
  sourceType: EmbeddingSourceType;
  sourceId: string;
  content: string;
  metadata: Record<string, unknown>;
  similarity: number;
}

/** Headline analytics for the token-economics dashboard. */
export interface AnalyticsOverview {
  totalDocuments: number;
  totalCostUsd: number;
  avgCostPerDocument: number;
  totalEpics: number;
  totalStories: number;
  avgExtractionTimeSeconds: number;
  cacheHitRate: number;
}

/** One day's worth of usage for the timeline chart. */
export interface TokenUsageByDay {
  date: string;
  documentsProcessed: number;
  costUsd: number;
  avgTokens: number;
}

/** Aggregated usage for a single model. */
export interface ModelUsage {
  model: string;
  totalCalls: number;
  totalTokens: number;
  totalCostUsd: number;
  avgLatencyMs: number;
}

/** Model pricing tier used by the cost estimator. */
export type CostTierName = 'haiku' | 'sonnet' | 'opus';

/** Estimated monthly cost for one model tier. */
export interface CostTier {
  tier: CostTierName;
  inputCostUsd: number;
  outputCostUsd: number;
  monthlyCostUsd: number;
}

/** Result of the cost estimator. */
export interface CostEstimate {
  docsPerMonth: number;
  avgPagesPerDoc: number;
  estimatedInputTokens: number;
  estimatedOutputTokens: number;
  tiers: CostTier[];
  recommended: CostTierName;
}

/** A row from the extraction_analytics view (recent jobs table). */
export interface ExtractionAnalyticsRow {
  id: string;
  documentId: string;
  status: ExtractionJobStatus;
  model: string | null;
  promptTokens: number;
  completionTokens: number;
  cacheReadTokens: number;
  cacheWriteTokens: number;
  costUsd: number;
  latencyMs: number | null;
  error: string | null;
  createdAt: string;
  completedAt: string | null;
  filename: string;
  mimeType: string;
  sizeBytes: number;
  projectId: string;
  projectName: string;
  orgId: string;
  epicCount: number;
  storyCount: number;
}

/** Standard error envelope returned by every API route on failure. */
export interface ApiError {
  error: string;
  code: string;
  details?: unknown;
}
