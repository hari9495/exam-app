import { useQuery } from '@tanstack/react-query';
import { apiFetch } from '../api-client';
import { useAuth } from '../auth-context';
import { OrgUsage } from '../types';

export function useOrgUsage() {
  const { accessToken } = useAuth();
  return useQuery<OrgUsage>({
    queryKey: ['billing', 'usage'],
    queryFn: () => apiFetch('/organizations/billing/usage', {}, accessToken ?? undefined),
    enabled: Boolean(accessToken),
  });
}
