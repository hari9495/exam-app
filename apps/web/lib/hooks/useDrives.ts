import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { apiFetch } from '../api-client';
import { useAuth } from '../auth-context';
import { DriveListItem } from '../types';

export function useGroupDrives(groupId: string) {
  const { accessToken } = useAuth();
  return useQuery<DriveListItem[]>({
    queryKey: ['walk-in-groups', groupId, 'drives'],
    queryFn: () => apiFetch(`/walk-in-groups/${groupId}/drives`, {}, accessToken ?? undefined),
    enabled: Boolean(accessToken),
  });
}

export interface CreateDriveInput {
  name: string;
  startsAt: string;
  endsAt: string;
}

export function useCreateDrive(groupId: string) {
  const { accessToken } = useAuth();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: CreateDriveInput) =>
      apiFetch(`/walk-in-groups/${groupId}/drives`, { method: 'POST', body: JSON.stringify(input) }, accessToken ?? undefined),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['walk-in-groups', groupId, 'drives'] }),
  });
}
