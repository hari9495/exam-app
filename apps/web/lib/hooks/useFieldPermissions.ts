import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { FieldPermissionConfig } from '../types';
import { apiFetch } from '../api-client';
import { useAuth } from '../auth-context';

// Web data layer for the Task 3 org field-permissions config endpoints. Mirrors
// useBusinessHours/useUpdateBusinessHours in useBusinessHours.ts.
export function useFieldPermissions() {
  const { accessToken } = useAuth();
  return useQuery<FieldPermissionConfig>({
    queryKey: ['field-permissions'],
    queryFn: () => apiFetch('/organizations/field-permissions', {}, accessToken ?? undefined),
    enabled: Boolean(accessToken),
  });
}

export function useUpdateFieldPermissions() {
  const { accessToken } = useAuth();
  const queryClient = useQueryClient();
  return useMutation({
    // The DTO is wrapped server-side ({ config }) -- the global ValidationPipe (whitelist) rejects
    // a raw top-level config object.
    mutationFn: (config: FieldPermissionConfig) =>
      apiFetch(
        '/organizations/field-permissions',
        { method: 'PUT', body: JSON.stringify({ config }) },
        accessToken ?? undefined,
      ) as Promise<FieldPermissionConfig>,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['field-permissions'] }),
  });
}
