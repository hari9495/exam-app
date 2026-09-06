import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { apiFetch } from '../api-client';
import { useAuth } from '../auth-context';

// Web data layer for the Task 5 recycle-bin endpoints (org:manage_settings gated). Mirrors
// useUserGroups.ts's fetch-wrapper/invalidation conventions.
export type RecycleBinEntityType = 'candidate' | 'job' | 'pipeline' | 'walk-in-group';

export interface RecycleBinEntry {
  entityType: RecycleBinEntityType;
  id: string;
  label: string;
  deletedAt: string;
  deletedByUserId: string | null;
}

export function useRecycleBin() {
  const { accessToken } = useAuth();
  return useQuery<RecycleBinEntry[]>({
    queryKey: ['recycle-bin'],
    queryFn: () => apiFetch('/recycle-bin', {}, accessToken ?? undefined),
    enabled: Boolean(accessToken),
  });
}

export interface RecycleBinTarget { entityType: RecycleBinEntityType; id: string; }

export function useRestoreRecycleBinEntry() {
  const { accessToken } = useAuth();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ entityType, id }: RecycleBinTarget) =>
      apiFetch(`/recycle-bin/${entityType}/${id}/restore`, { method: 'POST' }, accessToken ?? undefined) as Promise<RecycleBinEntry>,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['recycle-bin'] }),
  });
}

export function usePurgeRecycleBinEntry() {
  const { accessToken } = useAuth();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ entityType, id }: RecycleBinTarget) =>
      apiFetch(`/recycle-bin/${entityType}/${id}`, { method: 'DELETE' }, accessToken ?? undefined),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['recycle-bin'] }),
  });
}
