import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { apiFetch } from '../api-client';
import { Organization, PaginatedResponse } from '../types';
import { useAuth } from '../auth-context';

interface UseOrganizationsParams {
  page?: number;
  pageSize?: number;
  search?: string;
}

function buildOrganizationsQuery(params: UseOrganizationsParams): string {
  const query = new URLSearchParams();
  if (params.page) query.set('page', String(params.page));
  if (params.pageSize) query.set('pageSize', String(params.pageSize));
  if (params.search) query.set('search', params.search);
  const queryString = query.toString();
  return queryString ? `?${queryString}` : '';
}

export function useOrganizations(params: UseOrganizationsParams = {}) {
  const { accessToken } = useAuth();
  return useQuery<PaginatedResponse<Organization>>({
    queryKey: ['organizations', params],
    queryFn: () => apiFetch(`/organizations${buildOrganizationsQuery(params)}`, {}, accessToken ?? undefined),
    enabled: Boolean(accessToken),
  });
}

interface CreateOrganizationInput {
  name: string;
  slug: string;
  region: string;
  adminEmail: string;
}

export function useCreateOrganization() {
  const { accessToken } = useAuth();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: CreateOrganizationInput): Promise<Organization> =>
      apiFetch('/organizations', { method: 'POST', body: JSON.stringify(input) }, accessToken ?? undefined),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['organizations'] }),
  });
}
