import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { apiFetch } from '../api-client';
import { StaffUser } from '../types';
import { useAuth } from '../auth-context';

export function useCurrentUser() {
  const { accessToken } = useAuth();
  return useQuery<StaffUser>({
    queryKey: ['currentUser'],
    queryFn: () => apiFetch('/users/me', {}, accessToken ?? undefined),
    enabled: Boolean(accessToken),
  });
}

interface UpdateProfileInput {
  name: string;
}

export function useUpdateProfile() {
  const { accessToken } = useAuth();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: UpdateProfileInput): Promise<StaffUser> =>
      apiFetch('/users/me', { method: 'PATCH', body: JSON.stringify(input) }, accessToken ?? undefined),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['currentUser'] }),
  });
}
