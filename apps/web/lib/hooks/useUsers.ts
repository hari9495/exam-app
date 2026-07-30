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

export function useUpdateUser() {
  const { accessToken } = useAuth();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: { id: string; role?: string; name?: string }) =>
      apiFetch(
        `/users/${input.id}`,
        { method: 'PATCH', body: JSON.stringify({ role: input.role, name: input.name }) },
        accessToken ?? undefined,
      ),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['users'] }),
  });
}

function usersAction(path: (id: string) => string, method: 'POST') {
  return function useAction() {
    const { accessToken } = useAuth();
    const queryClient = useQueryClient();
    return useMutation({
      mutationFn: (id: string) => apiFetch(path(id), { method, body: JSON.stringify({}) }, accessToken ?? undefined),
      onSuccess: () => queryClient.invalidateQueries({ queryKey: ['users'] }),
    });
  };
}

export const useDeactivateUser = usersAction((id) => `/users/${id}/deactivate`, 'POST');
export const useReactivateUser = usersAction((id) => `/users/${id}/reactivate`, 'POST');
export const useResetUserPassword = usersAction((id) => `/users/${id}/reset-password`, 'POST');

export function useBulkCreateUsers() {
  const { accessToken } = useAuth();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: { emails: string[]; role: string }) =>
      apiFetch('/users/bulk', { method: 'POST', body: JSON.stringify(input) }, accessToken ?? undefined),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['users'] }),
  });
}
