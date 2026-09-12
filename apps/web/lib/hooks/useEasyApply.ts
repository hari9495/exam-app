import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { apiFetch } from '../api-client';
import { useAuth } from '../auth-context';

export interface EasyApplyProviderStatus {
  id: string;
  label: string;
  configured: boolean;
  ingestUrl: string;
}
export interface EasyApplyConfig {
  providers: EasyApplyProviderStatus[];
}

export function useEasyApplyConfig() {
  const { accessToken } = useAuth();
  return useQuery<EasyApplyConfig>({
    queryKey: ['easy-apply-config'],
    queryFn: () => apiFetch('/organizations/easy-apply-config', {}, accessToken ?? undefined),
    enabled: Boolean(accessToken),
  });
}

export function usePutEasyApplyConfig() {
  const { accessToken } = useAuth();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: { provider: string; secret?: string; enabled?: boolean }): Promise<EasyApplyConfig> =>
      apiFetch('/organizations/easy-apply-config', { method: 'PUT', body: JSON.stringify(input) }, accessToken ?? undefined),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['easy-apply-config'] }),
  });
}
