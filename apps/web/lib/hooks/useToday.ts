import { useQuery } from '@tanstack/react-query';
import { apiFetch } from '../api-client';
import { TodayResponse } from '../types';
import { useAuth } from '../auth-context';

export function useToday() {
  const { accessToken } = useAuth();
  return useQuery<TodayResponse>({
    queryKey: ['today'],
    queryFn: () => apiFetch('/dashboard/today', {}, accessToken ?? undefined),
    enabled: Boolean(accessToken),
  });
}
