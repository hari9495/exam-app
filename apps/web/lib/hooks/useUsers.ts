import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { apiFetch } from '../api-client';
import { StaffUser, PaginatedResponse } from '../types';
import { useAuth } from '../auth-context';

interface UseUsersParams {
  page?: number;
  pageSize?: number;
  search?: string;
}

function buildUsersQuery(params: UseUsersParams): string {
  const query = new URLSearchParams();
  if (params.page) query.set('page', String(params.page));
  if (params.pageSize) query.set('pageSize', String(params.pageSize));
  if (params.search) query.set('search', params.search);
  const queryString = query.toString();
  return queryString ? `?${queryString}` : '';
}

export function useUsers(params: UseUsersParams = {}) {
  const { accessToken } = useAuth();
  return useQuery<PaginatedResponse<StaffUser>>({
    queryKey: ['users', params],
    queryFn: () => apiFetch(`/users${buildUsersQuery(params)}`, {}, accessToken ?? undefined),
    enabled: Boolean(accessToken),
  });
}

interface CreateUserInput {
  email: string;
  password: string;
  role: string;
}

export function useCreateUser() {
  const { accessToken } = useAuth();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: CreateUserInput) =>
      apiFetch('/users', { method: 'POST', body: JSON.stringify(input) }, accessToken ?? undefined),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['users'] }),
  });
}
