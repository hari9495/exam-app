import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { apiFetch } from '../api-client';
import { useAuth } from '../auth-context';
import type { Pipeline, PipelineStageConfig, PipelineStatus, StageCategory } from '../types';

// Web data layer for the Task 5 pipeline-config endpoints (org_admin-only, gated behind
// pipelines:configure). Follows useApprovals.ts's fetch-wrapper/invalidation conventions --
// every mutation invalidates the same ['pipelines'] key usePipelines() queries under.

export function usePipelines() {
  const { accessToken } = useAuth();
  return useQuery<Pipeline[]>({
    queryKey: ['pipelines'],
    queryFn: () => apiFetch('/pipelines', {}, accessToken ?? undefined),
    enabled: Boolean(accessToken),
  });
}

export function useCreatePipeline() {
  const { accessToken } = useAuth();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: { name: string }) =>
      apiFetch('/pipelines', { method: 'POST', body: JSON.stringify(input) }, accessToken ?? undefined) as Promise<Pipeline>,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['pipelines'] }),
  });
}

export function useDeletePipeline() {
  const { accessToken } = useAuth();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (pipelineId: string) => apiFetch(`/pipelines/${pipelineId}`, { method: 'DELETE' }, accessToken ?? undefined),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['pipelines'] }),
  });
}

export interface CreateStageInput {
  pipelineId: string;
  name: string;
  category: StageCategory;
  position: number;
}

export function useCreateStage() {
  const { accessToken } = useAuth();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ pipelineId, ...input }: CreateStageInput) =>
      apiFetch(
        `/pipelines/${pipelineId}/stages`,
        { method: 'POST', body: JSON.stringify(input) },
        accessToken ?? undefined,
      ) as Promise<PipelineStageConfig>,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['pipelines'] }),
  });
}

export interface UpdateStageInput {
  stageId: string;
  name?: string;
  category?: StageCategory;
  position?: number;
}

export function useUpdateStage() {
  const { accessToken } = useAuth();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ stageId, ...input }: UpdateStageInput) =>
      apiFetch(
        `/pipelines/stages/${stageId}`,
        { method: 'PATCH', body: JSON.stringify(input) },
        accessToken ?? undefined,
      ) as Promise<PipelineStageConfig>,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['pipelines'] }),
  });
}

export function useDeleteStage() {
  const { accessToken } = useAuth();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (stageId: string) => apiFetch(`/pipelines/stages/${stageId}`, { method: 'DELETE' }, accessToken ?? undefined),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['pipelines'] }),
  });
}

export interface CreateStatusInput {
  stageId: string;
  name: string;
  position: number;
}

export function useCreateStatus() {
  const { accessToken } = useAuth();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ stageId, ...input }: CreateStatusInput) =>
      apiFetch(
        `/pipelines/stages/${stageId}/statuses`,
        { method: 'POST', body: JSON.stringify(input) },
        accessToken ?? undefined,
      ) as Promise<PipelineStatus>,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['pipelines'] }),
  });
}

export interface UpdateStatusInput {
  statusId: string;
  name?: string;
  position?: number;
}

export function useUpdateStatus() {
  const { accessToken } = useAuth();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ statusId, ...input }: UpdateStatusInput) =>
      apiFetch(
        `/pipelines/statuses/${statusId}`,
        { method: 'PATCH', body: JSON.stringify(input) },
        accessToken ?? undefined,
      ) as Promise<PipelineStatus>,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['pipelines'] }),
  });
}

export function useDeleteStatus() {
  const { accessToken } = useAuth();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (statusId: string) => apiFetch(`/pipelines/statuses/${statusId}`, { method: 'DELETE' }, accessToken ?? undefined),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['pipelines'] }),
  });
}

// Org-wide auto-archive-on-hire toggle (Task 8's GET/PATCH /organizations/pipeline-settings,
// both pipelines:configure-gated). Mirrors useSso.ts's useSsoSettings/useUpdateSsoSettings
// fetch-wrapper/invalidation shape.
export interface PipelineSettingsResponse {
  autoArchiveSiblingsOnHire: boolean;
}

export function useOrgPipelineSettings() {
  const { accessToken } = useAuth();
  return useQuery<PipelineSettingsResponse>({
    queryKey: ['pipeline-settings'],
    queryFn: () => apiFetch('/organizations/pipeline-settings', {}, accessToken ?? undefined),
    enabled: Boolean(accessToken),
  });
}

export function useUpdateOrgPipelineSettings() {
  const { accessToken } = useAuth();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: { autoArchiveSiblingsOnHire: boolean }) =>
      apiFetch(
        '/organizations/pipeline-settings',
        { method: 'PATCH', body: JSON.stringify(input) },
        accessToken ?? undefined,
      ) as Promise<PipelineSettingsResponse>,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['pipeline-settings'] }),
  });
}
