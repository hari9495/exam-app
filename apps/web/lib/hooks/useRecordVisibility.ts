import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { apiFetch } from '../api-client';
import { useAuth } from '../auth-context';

// Web data layer for the Task 4 org record-visibility config endpoint. Mirrors
// useFieldPermissions/useUpdateFieldPermissions in useFieldPermissions.ts. The shape is a plain
// { enabled: boolean } on both GET and PUT -- no shared type import needed (apps/web can't import
// @exam-platform/shared VALUES at runtime, and this shape is too small to warrant a types.ts entry).
export interface RecordVisibilityConfig {
  enabled: boolean;
}

export function useRecordVisibility() {
  const { accessToken } = useAuth();
  return useQuery<RecordVisibilityConfig>({
    queryKey: ['record-visibility'],
    queryFn: () => apiFetch('/organizations/record-visibility', {}, accessToken ?? undefined),
    enabled: Boolean(accessToken),
  });
}

export function useUpdateRecordVisibility() {
  const { accessToken } = useAuth();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (enabled: boolean) =>
      apiFetch(
        '/organizations/record-visibility',
        { method: 'PUT', body: JSON.stringify({ enabled }) },
        accessToken ?? undefined,
      ) as Promise<RecordVisibilityConfig>,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['record-visibility'] }),
  });
}
