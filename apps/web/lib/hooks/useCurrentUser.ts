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

export function useUploadAvatar() {
  const { accessToken } = useAuth();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (file: File): Promise<StaffUser> => {
      const formData = new FormData();
      formData.append('file', file);
      return apiFetch('/users/me/avatar', { method: 'POST', body: formData }, accessToken ?? undefined);
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['currentUser'] }),
  });
}

export function useRemoveAvatar() {
  const { accessToken } = useAuth();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (): Promise<StaffUser> =>
      apiFetch('/users/me/avatar', { method: 'DELETE' }, accessToken ?? undefined),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['currentUser'] }),
  });
}

interface ChangePasswordInput {
  currentPassword: string;
  newPassword: string;
}

export function useChangePassword() {
  const { accessToken } = useAuth();
  return useMutation({
    mutationFn: (input: ChangePasswordInput) =>
      apiFetch(
        '/users/me/change-password',
        { method: 'POST', body: JSON.stringify(input) },
        accessToken ?? undefined,
      ),
  });
}
