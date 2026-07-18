import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { apiFetch } from '../api-client';
import { SuperAdminSummary } from '../types';
import { useAuth } from '../auth-context';

export function useSuperAdmins() {
  const { accessToken } = useAuth();
  return useQuery<SuperAdminSummary[]>({
    queryKey: ['superAdmins'],
    queryFn: () => apiFetch('/users/super-admins', {}, accessToken ?? undefined),
    enabled: Boolean(accessToken),
  });
}

export function useInviteSuperAdmin() {
  const { accessToken } = useAuth();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: { email: string }): Promise<SuperAdminSummary> =>
      apiFetch('/users/super-admins/invite', { method: 'POST', body: JSON.stringify(input) }, accessToken ?? undefined),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['superAdmins'] }),
  });
}

export function usePromoteSuperAdmin() {
  const { accessToken } = useAuth();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: { email: string }): Promise<SuperAdminSummary> =>
      apiFetch('/users/super-admins/promote', { method: 'POST', body: JSON.stringify(input) }, accessToken ?? undefined),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['superAdmins'] }),
  });
}
