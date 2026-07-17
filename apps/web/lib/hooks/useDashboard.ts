import { useQuery } from '@tanstack/react-query';
import { apiFetch } from '../api-client';
import { DashboardSummary } from '../types';
import { useAuth } from '../auth-context';

export function useDashboardSummary() {
  const { accessToken } = useAuth();
  return useQuery<DashboardSummary>({
    queryKey: ['dashboard-summary'],
    queryFn: () => apiFetch('/dashboard/summary', {}, accessToken ?? undefined),
    enabled: Boolean(accessToken),
  });
}
