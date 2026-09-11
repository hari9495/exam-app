import { useQuery } from '@tanstack/react-query';
import { apiFetch } from '../api-client';
import { ApiUsageReport } from '../types';
import { useAuth } from '../auth-context';

export function useApiUsage(window: 30 | 90) {
  const { accessToken } = useAuth();
  return useQuery<ApiUsageReport>({
    queryKey: ['api-usage', window],
    queryFn: () => apiFetch(`/organizations/api-usage?window=${window}`, {}, accessToken ?? undefined),
    enabled: Boolean(accessToken),
  });
}
