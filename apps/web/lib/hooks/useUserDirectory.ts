import { useQuery } from '@tanstack/react-query';
import { apiFetch } from '../api-client';
import { DirectoryUser, PaginatedResponse } from '../types';
import { useAuth } from '../auth-context';

interface UseUserDirectoryParams {
  page?: number;
  pageSize?: number;
  search?: string;
}

function buildDirectoryQuery(params: UseUserDirectoryParams): string {
  const query = new URLSearchParams();
  if (params.page) query.set('page', String(params.page));
  if (params.pageSize) query.set('pageSize', String(params.pageSize));
  if (params.search) query.set('search', params.search);
  const queryString = query.toString();
  return queryString ? `?${queryString}` : '';
}

export function useUserDirectory(params: UseUserDirectoryParams = {}) {
  const { accessToken } = useAuth();
  return useQuery<PaginatedResponse<DirectoryUser>>({
    queryKey: ['users', 'directory', params],
    queryFn: () => apiFetch(`/users/directory${buildDirectoryQuery(params)}`, {}, accessToken ?? undefined),
    enabled: Boolean(accessToken),
  });
}

// Org-scoped active teammates for the pipeline assign/@mention pickers. Backed by
// GET /users/teammates (results:view) — the recruiter-safe counterpart to the super-admin
// /users/directory. Returns a plain array (no pagination); the org's staff list is small.
export function useTeammates() {
  const { accessToken } = useAuth();
  return useQuery<DirectoryUser[]>({
    queryKey: ['users', 'teammates'],
    queryFn: () => apiFetch('/users/teammates', {}, accessToken ?? undefined),
    enabled: Boolean(accessToken),
  });
}
