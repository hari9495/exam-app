import { useQuery } from '@tanstack/react-query';
import { apiFetch } from '../api-client';
import { useAuth } from '../auth-context';
import { HiringAnalytics } from '../types';

export function useHiringAnalytics(params: { from: string; to: string; jobId?: string }) {
  const { accessToken } = useAuth();
  const qs = new URLSearchParams({
    from: params.from,
    to: params.to,
    ...(params.jobId ? { jobId: params.jobId } : {}),
  }).toString();
  return useQuery<HiringAnalytics>({
    queryKey: ['analytics', 'hiring', params],
    queryFn: () => apiFetch(`/analytics/hiring?${qs}`, {}, accessToken ?? undefined),
    enabled: Boolean(accessToken),
  });
}
