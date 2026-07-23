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
