import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { apiFetch } from '../api-client';
import { useAuth } from '../auth-context';
import { WalkInGroup, EligibleWalkInExam } from '../types';

export function useWalkInGroups() {
  const { accessToken } = useAuth();
  return useQuery<WalkInGroup[]>({
    queryKey: ['walk-in-groups'],
    queryFn: () => apiFetch('/walk-in-groups', {}, accessToken ?? undefined),
    enabled: Boolean(accessToken),
  });
}

export function useEligibleWalkInExams() {
  const { accessToken } = useAuth();
  return useQuery<EligibleWalkInExam[]>({
    queryKey: ['walk-in-groups', 'eligible-exams'],
    queryFn: () => apiFetch('/walk-in-groups/eligible-exams', {}, accessToken ?? undefined),
    enabled: Boolean(accessToken),
  });
}

export function useCreateWalkInGroup() {
  const { accessToken } = useAuth();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (name: string) => apiFetch('/walk-in-groups', { method: 'POST', body: JSON.stringify({ name }) }, accessToken ?? undefined),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['walk-in-groups'] }),
  });
}

export function useRenameWalkInGroup(id: string) {
  const { accessToken } = useAuth();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (name: string) =>
      apiFetch(`/walk-in-groups/${id}`, { method: 'PATCH', body: JSON.stringify({ name }) }, accessToken ?? undefined),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['walk-in-groups'] }),
  });
}

export function useDeleteWalkInGroup() {
  const { accessToken } = useAuth();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => apiFetch(`/walk-in-groups/${id}`, { method: 'DELETE' }, accessToken ?? undefined),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['walk-in-groups'] });
      queryClient.invalidateQueries({ queryKey: ['walk-in-groups', 'eligible-exams'] });
    },
  });
}

export function useSetGroupJob(id: string) {
  const { accessToken } = useAuth();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (jobId: string | null) =>
      apiFetch(`/walk-in-groups/${id}/job`, { method: 'PATCH', body: JSON.stringify({ jobId }) }, accessToken ?? undefined),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['walk-in-groups'] }),
  });
}

export function useSetWalkInGroupExams(id: string) {
  const { accessToken } = useAuth();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (examIds: string[]) =>
      apiFetch(`/walk-in-groups/${id}/exams`, { method: 'PUT', body: JSON.stringify({ examIds }) }, accessToken ?? undefined),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['walk-in-groups'] });
      queryClient.invalidateQueries({ queryKey: ['walk-in-groups', 'eligible-exams'] });
    },
  });
}
