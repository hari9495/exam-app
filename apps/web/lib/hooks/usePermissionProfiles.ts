import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { apiFetch } from '../api-client';
import { useAuth } from '../auth-context';
import type { PermissionProfile, AssignablePermission } from '../types';

// Web data layer for the permission-profiles endpoints (org-admin CRUD gated behind
// org:manage_users). Mirrors useUserGroups.ts's fetch-wrapper/invalidation conventions.

export function usePermissionProfiles() {
  const { accessToken } = useAuth();
  return useQuery<PermissionProfile[]>({
    queryKey: ['permission-profiles'],
    queryFn: () => apiFetch('/organizations/permission-profiles', {}, accessToken ?? undefined),
    enabled: Boolean(accessToken),
  });
}

// The fixed catalog a profile editor may pick from (org:manage_users / billing / platform-org
// management keys excluded server-side) -- not org-specific data, but still an authed call.
export function useAssignablePermissions() {
  const { accessToken } = useAuth();
  return useQuery<AssignablePermission[]>({
    queryKey: ['permission-profiles', 'assignable-permissions'],
    queryFn: () => apiFetch('/organizations/permission-profiles/assignable-permissions', {}, accessToken ?? undefined),
    enabled: Boolean(accessToken),
  });
}

export interface CreatePermissionProfileInput { name: string; permissions: string[]; }

export function useCreatePermissionProfile() {
  const { accessToken } = useAuth();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: CreatePermissionProfileInput) =>
      apiFetch('/organizations/permission-profiles', { method: 'POST', body: JSON.stringify(input) }, accessToken ?? undefined) as Promise<PermissionProfile>,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['permission-profiles'] }),
  });
}

export interface UpdatePermissionProfileInput { id: string; name?: string; permissions?: string[]; }

export function useUpdatePermissionProfile() {
  const { accessToken } = useAuth();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, ...input }: UpdatePermissionProfileInput) =>
      apiFetch(`/organizations/permission-profiles/${id}`, { method: 'PATCH', body: JSON.stringify(input) }, accessToken ?? undefined) as Promise<PermissionProfile>,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['permission-profiles'] }),
  });
}

export function useDeletePermissionProfile() {
  const { accessToken } = useAuth();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => apiFetch(`/organizations/permission-profiles/${id}`, { method: 'DELETE' }, accessToken ?? undefined),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['permission-profiles'] }),
  });
}
