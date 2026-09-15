import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { apiFetch } from '../api-client';
import { useAuth } from '../auth-context';
import { SurveyDefinition, SurveyQuestion, SurveySummary } from '../types';

export interface SurveyInput {
  name: string;
  enabled?: boolean;
  triggerStage?: string;
  questions: SurveyQuestion[];
}

export function useSurveys() {
  const { accessToken } = useAuth();
  return useQuery<SurveyDefinition[]>({
    queryKey: ['surveys'],
    queryFn: () => apiFetch('/surveys', {}, accessToken ?? undefined),
    enabled: Boolean(accessToken),
  });
}

export function useSurveySummary(id: string) {
  const { accessToken } = useAuth();
  return useQuery<SurveySummary>({
    queryKey: ['surveys', id, 'summary'],
    queryFn: () => apiFetch(`/surveys/${id}/summary`, {}, accessToken ?? undefined),
    enabled: Boolean(accessToken) && Boolean(id),
  });
}

export function useCreateSurvey() {
  const { accessToken } = useAuth();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: SurveyInput): Promise<SurveyDefinition> =>
      apiFetch('/surveys', { method: 'POST', body: JSON.stringify(input) }, accessToken ?? undefined),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['surveys'] }),
  });
}

export function useUpdateSurvey() {
  const { accessToken } = useAuth();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, input }: { id: string; input: SurveyInput }): Promise<SurveyDefinition> =>
      apiFetch(`/surveys/${id}`, { method: 'PATCH', body: JSON.stringify(input) }, accessToken ?? undefined),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['surveys'] }),
  });
}

export function useSetSurveyEnabled() {
  const { accessToken } = useAuth();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, enabled }: { id: string; enabled: boolean }): Promise<SurveyDefinition> =>
      apiFetch(`/surveys/${id}/enabled`, { method: 'PATCH', body: JSON.stringify({ enabled }) }, accessToken ?? undefined),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['surveys'] }),
  });
}

export function useDeleteSurvey() {
  const { accessToken } = useAuth();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string): Promise<{ deleted: boolean }> =>
      apiFetch(`/surveys/${id}`, { method: 'DELETE' }, accessToken ?? undefined),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['surveys'] }),
  });
}

// Manual send from the candidate drawer. Returns {sent} or {sent:false, reason}.
export function useSendSurvey() {
  const { accessToken } = useAuth();
  return useMutation({
    mutationFn: ({ id, entryId }: { id: string; entryId: string }): Promise<{ sent: boolean; reason?: string }> =>
      apiFetch(`/surveys/${id}/send`, { method: 'POST', body: JSON.stringify({ entryId }) }, accessToken ?? undefined),
  });
}
