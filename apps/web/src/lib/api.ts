/**
 * Typed API client. All server calls go through here — components never call
 * axios/fetch directly. Types are imported from @specforge/shared.
 */
import type {
  AnalyticsOverview,
  CostEstimate,
  Document,
  Epic,
  ExtractionAnalyticsRow,
  ExtractionJob,
  ModelUsage,
  Priority,
  Project,
  SearchResult,
  Story,
  TokenUsageByDay,
} from '@specforge/shared';
import axios from 'axios';

const baseURL = import.meta.env.VITE_API_URL ?? 'http://localhost:3000';

export const http = axios.create({ baseURL });

/** Base URL for raw fetch streaming (chat SSE, RAG ask). */
export const API_BASE = baseURL;

const TOKEN_KEY = 'specforge-token';

/** Returns the stored bearer token, if any. */
export function getToken(): string | null {
  return localStorage.getItem(TOKEN_KEY);
}

/** Sets (or clears) the bearer token for axios + fetch and persists it. */
export function setAuthToken(token: string | null): void {
  if (token) {
    localStorage.setItem(TOKEN_KEY, token);
    http.defaults.headers.common['Authorization'] = `Bearer ${token}`;
  } else {
    localStorage.removeItem(TOKEN_KEY);
    delete http.defaults.headers.common['Authorization'];
  }
}

/** Authorization header for raw fetch() calls (SSE endpoints). */
export function authHeaders(): Record<string, string> {
  const token = getToken();
  return token ? { Authorization: `Bearer ${token}` } : {};
}

// Restore token on module load so refreshes stay logged in.
const existingToken = getToken();
if (existingToken) http.defaults.headers.common['Authorization'] = `Bearer ${existingToken}`;

let onUnauthorized: (() => void) | null = null;
/** Registers a callback fired when the API returns 401 (token invalid/expired). */
export function setUnauthorizedHandler(fn: () => void): void {
  onUnauthorized = fn;
}
http.interceptors.response.use(
  (r) => r,
  (error: unknown) => {
    if (axios.isAxiosError(error) && error.response?.status === 401) onUnauthorized?.();
    return Promise.reject(error);
  },
);

export interface AuthUser {
  id: string;
  orgId: string;
  email: string;
  name: string;
}

export async function login(email: string, password: string): Promise<{ token: string; user: AuthUser }> {
  const { data } = await http.post<{ token: string; user: AuthUser }>('/api/auth/login', { email, password });
  return data;
}

export async function getMe(): Promise<AuthUser> {
  const { data } = await http.get<AuthUser>('/api/auth/me');
  return data;
}

/** A project with its epics (and each epic's stories) hydrated. */
export type ProjectDetail = Project & { epics: Epic[] };

/** Response from the upload endpoint. */
export interface UploadResponse {
  documentId: string;
  jobId: string;
  message: string;
}

export async function getProjects(): Promise<Project[]> {
  const { data } = await http.get<Project[]>('/api/projects');
  return data;
}

export async function createProject(input: { name: string; description?: string }): Promise<Project> {
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

export async function updateStory(
  id: string,
  patch: { title?: string; description?: string; persona?: string; priority?: Priority },
): Promise<Story> {
  const { data } = await http.patch<Story>(`/api/stories/${id}`, patch);
  return data;
}

export async function getProjectDocuments(projectId: string): Promise<Document[]> {
  const { data } = await http.get<Document[]>('/api/documents', { params: { projectId } });
  return data;
}

export async function reprocessDocument(id: string): Promise<{ jobId: string }> {
  const { data } = await http.post<{ jobId: string }>(`/api/documents/${id}/reprocess`);
  return data;
}

/** Appends the bearer token as a query param for browser GETs (SSE, downloads). */
export function withTokenParam(url: string): string {
  const token = getToken();
  if (!token) return url;
  return url + (url.includes('?') ? '&' : '?') + `access_token=${encodeURIComponent(token)}`;
}

/** Direct download URL for a document (server redirects to a presigned URL). */
export function documentDownloadUrl(id: string): string {
  return withTokenParam(`${API_BASE}/api/documents/${id}/download`);
}

/** Export download URL for a project in the given format. */
export function projectExportUrl(id: string, format: string): string {
  return withTokenParam(`${API_BASE}/api/projects/${id}/export?format=${format}`);
}

export async function getJob(jobId: string): Promise<ExtractionJob> {
  const { data } = await http.get<ExtractionJob>(`/api/jobs/${jobId}`);
  return data;
}

export async function getAnalyticsOverview(): Promise<AnalyticsOverview> {
  const { data } = await http.get<AnalyticsOverview>('/api/analytics/overview');
  return data;
}

export async function getAnalyticsTimeline(days = 30): Promise<TokenUsageByDay[]> {
  const { data } = await http.get<TokenUsageByDay[]>('/api/analytics/timeline', { params: { days } });
  return data;
}

export async function getAnalyticsByModel(): Promise<ModelUsage[]> {
  const { data } = await http.get<ModelUsage[]>('/api/analytics/by_model');
  return data;
}

export async function getAnalyticsJobs(limit = 20): Promise<ExtractionAnalyticsRow[]> {
  const { data } = await http.get<ExtractionAnalyticsRow[]>('/api/analytics/jobs', { params: { limit } });
  return data;
}

export async function getCostEstimate(input: {
  docsPerMonth: number;
  avgPagesPerDoc: number;
}): Promise<CostEstimate> {
  const { data } = await http.post<CostEstimate>('/api/analytics/cost-estimate', input);
  return data;
}
