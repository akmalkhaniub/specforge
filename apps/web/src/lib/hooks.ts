/**
 * React Query hooks for server state. No client-side global store — React Query
 * is the single source of truth for server data.
 */
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useState } from 'react';
import * as api from './api';

export function useDefaultOrg() {
  return useQuery({ queryKey: ['org', 'default'], queryFn: api.getDefaultOrg, staleTime: Infinity });
}

export function useProjects(orgId: string | undefined) {
  return useQuery({
    queryKey: ['projects', orgId],
    queryFn: () => api.getProjects(orgId as string),
    enabled: Boolean(orgId),
  });
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
    onSuccess: (project) => {
      void qc.invalidateQueries({ queryKey: ['projects', project.orgId] });
    },
  });
}

export function useAnalyticsOverview(orgId: string | undefined) {
  return useQuery({
    queryKey: ['analytics', 'overview', orgId],
    queryFn: () => api.getAnalyticsOverview(orgId as string),
    enabled: Boolean(orgId),
  });
}

export function useAnalyticsTimeline(orgId: string | undefined, days = 30) {
  return useQuery({
    queryKey: ['analytics', 'timeline', orgId, days],
    queryFn: () => api.getAnalyticsTimeline(orgId as string, days),
    enabled: Boolean(orgId),
  });
}

export function useAnalyticsByModel(orgId: string | undefined) {
  return useQuery({
    queryKey: ['analytics', 'by_model', orgId],
    queryFn: () => api.getAnalyticsByModel(orgId as string),
    enabled: Boolean(orgId),
  });
}

export function useAnalyticsJobs(orgId: string | undefined, limit = 20) {
  return useQuery({
    queryKey: ['analytics', 'jobs', orgId, limit],
    queryFn: () => api.getAnalyticsJobs(orgId as string, limit),
    enabled: Boolean(orgId),
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
