import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { apiFetch } from '../api-client';
import { useAuth } from '../auth-context';
import type { Agency, AgencySubmission, AgencySubmissionStatus } from '../types';

// Web data layer for the agency-portal endpoints (org:manage_settings for CRUD/regenerate,
// pipeline:manage for the submission-review queue). Mirrors useOrgSenderAddresses.ts /
// useUserGroups.ts's fetch-wrapper/invalidation conventions.

export function useAgencies() {
  const { accessToken } = useAuth();
  return useQuery<Agency[]>({
    queryKey: ['agencies'],
    queryFn: () => apiFetch('/agencies', {}, accessToken ?? undefined),
    enabled: Boolean(accessToken),
  });
}

export interface CreateAgencyInput { name: string; contactEmail?: string; active?: boolean; jobIds?: string[]; }

export function useCreateAgency() {
  const { accessToken } = useAuth();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: CreateAgencyInput) =>
      apiFetch('/agencies', { method: 'POST', body: JSON.stringify(input) }, accessToken ?? undefined) as Promise<Agency>,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['agencies'] }),
  });
}

export interface UpdateAgencyInput { id: string; name?: string; contactEmail?: string; active?: boolean; jobIds?: string[]; }

export function useUpdateAgency() {
  const { accessToken } = useAuth();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, ...input }: UpdateAgencyInput) =>
      apiFetch(`/agencies/${id}`, { method: 'PATCH', body: JSON.stringify(input) }, accessToken ?? undefined) as Promise<Agency>,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['agencies'] }),
  });
}

export function useDeleteAgency() {
  const { accessToken } = useAuth();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => apiFetch(`/agencies/${id}`, { method: 'DELETE' }, accessToken ?? undefined),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['agencies'] }),
  });
}

export function useRegenerateAgencyToken() {
  const { accessToken } = useAuth();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) =>
      apiFetch(`/agencies/${id}/regenerate-token`, { method: 'POST' }, accessToken ?? undefined) as Promise<{ portalUrl: string }>,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['agencies'] }),
  });
}

export function useAgencySubmissions(status: AgencySubmissionStatus = 'pending') {
  const { accessToken } = useAuth();
  return useQuery<AgencySubmission[]>({
    queryKey: ['agency-submissions', status],
    queryFn: () => apiFetch(`/agency-submissions?status=${status}`, {}, accessToken ?? undefined),
    enabled: Boolean(accessToken),
  });
}

// Both mutations only ever act on a currently-pending row, so on success it's always safe to
// splice the id straight out of the cached ['agency-submissions','pending'] list -- gives an
// instant "remove on success" without waiting on the invalidated refetch round trip.
function removeFromPendingCache(queryClient: ReturnType<typeof useQueryClient>, id: string) {
  queryClient.setQueryData<AgencySubmission[]>(['agency-submissions', 'pending'], (old) => old?.filter((s) => s.id !== id));
  queryClient.invalidateQueries({ queryKey: ['agency-submissions'] });
}

export function useAcceptAgencySubmission() {
  const { accessToken } = useAuth();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => apiFetch(`/agency-submissions/${id}/accept`, { method: 'POST' }, accessToken ?? undefined),
    onSuccess: (_data, id) => removeFromPendingCache(queryClient, id),
  });
}

export function useRejectAgencySubmission() {
  const { accessToken } = useAuth();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => apiFetch(`/agency-submissions/${id}/reject`, { method: 'POST' }, accessToken ?? undefined),
    onSuccess: (_data, id) => removeFromPendingCache(queryClient, id),
  });
}
