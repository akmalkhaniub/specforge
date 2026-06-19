/**
 * React Query hooks for server state. No client-side global store — React Query
 * is the single source of truth for server data.
 */
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useState } from 'react';
import * as api from './api';

export function useProjects() {
  return useQuery({ queryKey: ['projects'], queryFn: api.getProjects });
}

export function useProject(id: string | undefined) {
  return useQuery({
    queryKey: ['project', id],
    queryFn: () => api.getProject(id as string),
    enabled: Boolean(id),
  });
}

export function useEpic(id: string | undefined) {
  return useQuery({
    queryKey: ['epic', id],
    queryFn: () => api.getEpic(id as string),
    enabled: Boolean(id),
  });
}

export function useCreateProject() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: api.createProject,
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['projects'] });
    },
  });
}

export function useUpdateStory(projectId: string | undefined) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, patch }: { id: string; patch: Parameters<typeof api.updateStory>[1] }) =>
      api.updateStory(id, patch),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['project', projectId] });
    },
  });
}

export function useProjectDocuments(projectId: string | undefined) {
  return useQuery({
    queryKey: ['documents', projectId],
    queryFn: () => api.getProjectDocuments(projectId as string),
    enabled: Boolean(projectId),
  });
}

export function useReprocessDocument(projectId: string | undefined) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (documentId: string) => api.reprocessDocument(documentId),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['documents', projectId] });
    },
  });
}

export function useAnalyticsOverview() {
  return useQuery({ queryKey: ['analytics', 'overview'], queryFn: api.getAnalyticsOverview });
}

export function useAnalyticsTimeline(days = 30) {
  return useQuery({
    queryKey: ['analytics', 'timeline', days],
    queryFn: () => api.getAnalyticsTimeline(days),
  });
}

export function useAnalyticsByModel() {
  return useQuery({ queryKey: ['analytics', 'by_model'], queryFn: api.getAnalyticsByModel });
}

export function useAnalyticsJobs(limit = 20) {
  return useQuery({
    queryKey: ['analytics', 'jobs', limit],
    queryFn: () => api.getAnalyticsJobs(limit),
  });
}

export function useCostEstimate(docsPerMonth: number, avgPagesPerDoc: number) {
  return useQuery({
    queryKey: ['analytics', 'cost-estimate', docsPerMonth, avgPagesPerDoc],
    queryFn: () => api.getCostEstimate({ docsPerMonth, avgPagesPerDoc }),
    enabled: docsPerMonth > 0 && avgPagesPerDoc > 0,
  });
}

/** Debounces a rapidly-changing value (e.g. a search box). */
export function useDebounced<T>(value: T, delayMs: number): T {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const handle = setTimeout(() => setDebounced(value), delayMs);
    return () => clearTimeout(handle);
  }, [value, delayMs]);
  return debounced;
}

/** Debounced semantic search for a project. */
export function useSearch(projectId: string | undefined, query: string) {
  const debouncedQuery = useDebounced(query, 300);
  return useQuery({
    queryKey: ['search', projectId, debouncedQuery],
    queryFn: () => api.searchProject(projectId as string, debouncedQuery),
    enabled: Boolean(projectId) && debouncedQuery.trim().length > 0,
  });
}
