import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { apiFetch } from '../api-client';
import { useAuth } from '../auth-context';

export interface AssignablePermission {
  key: string;
  description: string;
}
export interface RolePermissionRow {
  role: string;
  permissions: string[];
  customized: boolean; // an org override exists (differs from the global default)
}
export interface RolePermissionMatrix {
  assignablePermissions: AssignablePermission[];
  roles: RolePermissionRow[];
}

export function useRolePermissionMatrix() {
  const { accessToken } = useAuth();
  return useQuery<RolePermissionMatrix>({
    queryKey: ['role-permissions'],
    queryFn: () => apiFetch('/organizations/role-permissions', {}, accessToken ?? undefined),
    enabled: Boolean(accessToken),
  });
}

export function useSetRolePermissions() {
  const { accessToken } = useAuth();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: { role: string; permissions: string[] }): Promise<RolePermissionMatrix> =>
      apiFetch(`/organizations/role-permissions/${input.role}`, { method: 'PUT', body: JSON.stringify({ permissions: input.permissions }) }, accessToken ?? undefined),
    onSuccess: (data) => queryClient.setQueryData(['role-permissions'], data),
  });
}

export function useResetRolePermissions() {
  const { accessToken } = useAuth();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (role: string): Promise<RolePermissionMatrix> =>
      apiFetch(`/organizations/role-permissions/${role}`, { method: 'DELETE' }, accessToken ?? undefined),
    onSuccess: (data) => queryClient.setQueryData(['role-permissions'], data),
  });
}
