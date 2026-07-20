import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { apiFetch } from '../api-client';
import { SuperAdminSummary, PaginatedResponse } from '../types';
import { useAuth } from '../auth-context';

interface UseSuperAdminsParams {
  page?: number;
  pageSize?: number;
  search?: string;
}

function buildSuperAdminsQuery(params: UseSuperAdminsParams): string {
  const query = new URLSearchParams();
  if (params.page) query.set('page', String(params.page));
  if (params.pageSize) query.set('pageSize', String(params.pageSize));
  if (params.search) query.set('search', params.search);
  const queryString = query.toString();
  return queryString ? `?${queryString}` : '';
}

export function useSuperAdmins(params: UseSuperAdminsParams = {}) {
  const { accessToken } = useAuth();
  return useQuery<PaginatedResponse<SuperAdminSummary>>({
    queryKey: ['superAdmins', params],
    queryFn: () => apiFetch(`/users/super-admins${buildSuperAdminsQuery(params)}`, {}, accessToken ?? undefined),
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
