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

// Under ~50 organizations, fetching everything lets the browser sort and filter
// the whole list. Sorting a paginated slice would sort only the visible page,
// which reads as a broken sort rather than as a pagination limit.
//
// 100 is not arbitrary: resolvePaginationParams caps pageSize at MAX_PAGE_SIZE =
// 100 server-side, so anything larger is silently clamped. Asking for more would
// make this constant a lie. Past 100 organizations the list view reports
// "showing 100 of N" rather than quietly truncating -- see ListView's totalCount.
export const ORGANIZATION_PAGE_SIZE = 100;

export function useOrganizations(params: UseOrganizationsParams = {}) {
  const { accessToken } = useAuth();
  const resolved = { pageSize: ORGANIZATION_PAGE_SIZE, ...params };
  return useQuery<PaginatedResponse<Organization>>({
    queryKey: ['organizations', resolved],
    queryFn: () => apiFetch(`/organizations${buildOrganizationsQuery(resolved)}`, {}, accessToken ?? undefined),
    enabled: Boolean(accessToken),
  });
}

interface CreateOrganizationInput {
  name: string;
  slug: string;
  region: string;
  adminEmail: string;
  adminName: string;
}

interface UpdateOrganizationInput {
  id: string;
  name?: string;
  region?: string;
}

export function useUpdateOrganization() {
  const { accessToken } = useAuth();
  const queryClient = useQueryClient();
  return useMutation({
    // No slug: it is baked into invitation URLs and SAML entity IDs, and the API
    // will not write it either.
    mutationFn: ({ id, ...body }: UpdateOrganizationInput): Promise<Organization> =>
      apiFetch(`/organizations/${id}`, { method: 'PATCH', body: JSON.stringify(body) }, accessToken ?? undefined),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['organizations'] }),
  });
}

export function useSetOrganizationStatus() {
  const { accessToken } = useAuth();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, status }: { id: string; status: 'active' | 'suspended' }): Promise<Organization> =>
      apiFetch(`/organizations/${id}/status`, { method: 'PATCH', body: JSON.stringify({ status }) }, accessToken ?? undefined),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['organizations'] }),
  });
}

export function useDeleteOrganization() {
  const { accessToken } = useAuth();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string): Promise<{ id: string; status: string }> =>
      apiFetch(`/organizations/${id}`, { method: 'DELETE' }, accessToken ?? undefined),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['organizations'] }),
  });
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
