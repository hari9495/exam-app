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
// which reads as a broken sort rather than as a pagination limit. If `total` ever
// exceeds what came back, the list view says so rather than silently truncating.
export const ORGANIZATION_PAGE_SIZE = 200;

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
