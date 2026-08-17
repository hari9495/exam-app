import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { apiFetch } from '../api-client';
import { useAuth } from '../auth-context';
import { DriveListItem, DriveRoster } from '../types';

// The single drive with its derived status -- lets the drive page choose the live board vs
// the results table without the caller having to pass ?groupId= and refetch the whole list.
export function useDrive(driveId: string) {
  const { accessToken } = useAuth();
  return useQuery<DriveListItem>({
    queryKey: ['drives', driveId],
    queryFn: () => apiFetch(`/drives/${driveId}`, {}, accessToken ?? undefined),
    enabled: Boolean(accessToken && driveId),
  });
}

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

// Polling, not websockets, is the whole "live" mechanism here (see the design spec) --
// 5s keeps the board current without the server needing to push anything.
export function useDriveLive(driveId: string) {
  const { accessToken } = useAuth();
  return useQuery<DriveRoster>({
    queryKey: ['drives', driveId, 'live'],
    queryFn: () => apiFetch(`/drives/${driveId}/live`, {}, accessToken ?? undefined),
    enabled: Boolean(accessToken) && Boolean(driveId),
    refetchInterval: 5000,
  });
}

export function useDriveResults(driveId: string) {
  const { accessToken } = useAuth();
  return useQuery<DriveRoster>({
    queryKey: ['drives', driveId, 'results'],
    queryFn: () => apiFetch(`/drives/${driveId}/results`, {}, accessToken ?? undefined),
    enabled: Boolean(accessToken) && Boolean(driveId),
  });
}
