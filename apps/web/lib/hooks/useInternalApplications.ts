import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { apiFetch } from '../api-client';
import { useAuth } from '../auth-context';
import { ReferableJob, InternalApplicationRow } from '../types';

// Open roles a staff member can apply to internally (all open jobs).
export function useInternalJobs() {
  const { accessToken } = useAuth();
  return useQuery<ReferableJob[]>({
    queryKey: ['internal-applications', 'jobs'],
    queryFn: () => apiFetch('/internal-applications/jobs', {}, accessToken ?? undefined),
    enabled: Boolean(accessToken),
  });
}

export function useMyApplications() {
  const { accessToken } = useAuth();
  return useQuery<InternalApplicationRow[]>({
    queryKey: ['internal-applications', 'mine'],
    queryFn: () => apiFetch('/internal-applications/mine', {}, accessToken ?? undefined),
    enabled: Boolean(accessToken),
  });
}

export function useApplyInternal() {
  const { accessToken } = useAuth();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (jobId: string): Promise<{ id: string }> =>
      apiFetch('/internal-applications', { method: 'POST', body: JSON.stringify({ jobId }) }, accessToken ?? undefined),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['internal-applications'] }),
  });
}
