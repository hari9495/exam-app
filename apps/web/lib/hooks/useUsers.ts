import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { apiFetch } from '../api-client';
import { StaffUser } from '../types';
import { useAuth } from '../auth-context';

export function useUsers() {
  const { accessToken } = useAuth();
  return useQuery<StaffUser[]>({
    queryKey: ['users'],
    queryFn: () => apiFetch('/users', {}, accessToken ?? undefined),
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
