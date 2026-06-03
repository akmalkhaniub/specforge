/**
 * Typed API client. All server calls go through here — components never call
 * axios/fetch directly. Types are imported from @specforge/shared.
 */
import type {
  AnalyticsOverview,
  CostEstimate,
  Epic,
  ExtractionAnalyticsRow,
  ExtractionJob,
  ModelUsage,
  Organisation,
  Priority,
  Project,
  SearchResult,
  Story,
  TokenUsageByDay,
} from '@specforge/shared';
import axios from 'axios';

const baseURL = import.meta.env.VITE_API_URL ?? 'http://localhost:3000';

export const http = axios.create({ baseURL });

/** Base URL for raw fetch streaming (chat SSE). */
export const API_BASE = baseURL;

/** A project with its epics (and each epic's stories) hydrated. */
export type ProjectDetail = Project & { epics: Epic[] };

/** Response from the upload endpoint. */
export interface UploadResponse {
  documentId: string;
  jobId: string;
  message: string;
}

export async function getDefaultOrg(): Promise<Organisation> {
  const { data } = await http.get<Organisation>('/api/org/default');
  return data;
}

export async function getProjects(orgId: string): Promise<Project[]> {
  const { data } = await http.get<Project[]>('/api/projects', { params: { orgId } });
  return data;
}

export async function createProject(input: {
  orgId: string;
  name: string;
  description?: string;
}): Promise<Project> {
  const { data } = await http.post<Project>('/api/projects', input);
  return data;
}

export async function getProject(id: string): Promise<ProjectDetail> {
  const { data } = await http.get<ProjectDetail>(`/api/projects/${id}`);
  return data;
}

export async function searchProject(id: string, q: string): Promise<SearchResult[]> {
  const { data } = await http.get<SearchResult[]>(`/api/projects/${id}/search`, { params: { q } });
  return data;
}

export async function getEpic(id: string): Promise<Epic & { stories: Story[] }> {
  const { data } = await http.get<Epic & { stories: Story[] }>(`/api/epics/${id}`);
  return data;
}

export async function updateEpic(
  id: string,
  patch: { title?: string; description?: string; priority?: Priority },
): Promise<Epic> {
  const { data } = await http.patch<Epic>(`/api/epics/${id}`, patch);
  return data;
}

export async function deleteEpic(id: string): Promise<void> {
  await http.delete(`/api/epics/${id}`);
}

export async function uploadDocument(file: File, projectId: string): Promise<UploadResponse> {
  const form = new FormData();
  form.append('file', file);
  form.append('projectId', projectId);
  const { data } = await http.post<UploadResponse>('/api/documents/upload', form);
  return data;
}

export async function getJob(jobId: string): Promise<ExtractionJob> {
  const { data } = await http.get<ExtractionJob>(`/api/jobs/${jobId}`);
  return data;
}

export async function getAnalyticsOverview(orgId: string): Promise<AnalyticsOverview> {
  const { data } = await http.get<AnalyticsOverview>('/api/analytics/overview', { params: { orgId } });
  return data;
}

export async function getAnalyticsTimeline(orgId: string, days = 30): Promise<TokenUsageByDay[]> {
  const { data } = await http.get<TokenUsageByDay[]>('/api/analytics/timeline', {
    params: { orgId, days },
  });
  return data;
}

export async function getAnalyticsByModel(orgId: string): Promise<ModelUsage[]> {
  const { data } = await http.get<ModelUsage[]>('/api/analytics/by_model', { params: { orgId } });
  return data;
}

export async function getAnalyticsJobs(orgId: string, limit = 20): Promise<ExtractionAnalyticsRow[]> {
  const { data } = await http.get<ExtractionAnalyticsRow[]>('/api/analytics/jobs', {
    params: { orgId, limit },
  });
  return data;
}

export async function getCostEstimate(input: {
  docsPerMonth: number;
  avgPagesPerDoc: number;
}): Promise<CostEstimate> {
  const { data } = await http.post<CostEstimate>('/api/analytics/cost-estimate', input);
  return data;
}
