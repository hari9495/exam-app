import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { apiFetch } from '../api-client';
import { useAuth } from '../auth-context';
import type { UserGroup, UserGroupDirectoryEntry, MyGroups } from '../types';

// Web data layer for the user-groups endpoints (org-admin CRUD gated behind
// users:manage_groups; directory/mine gated behind results:view). Mirrors usePipelines.ts's
// fetch-wrapper/invalidation conventions.

export function useUserGroups() {
  const { accessToken } = useAuth();
  return useQuery<UserGroup[]>({
    queryKey: ['user-groups'],
    queryFn: () => apiFetch('/user-groups', {}, accessToken ?? undefined),
    enabled: Boolean(accessToken),
  });
}

export function useUserGroupDirectory() {
  const { accessToken } = useAuth();
  return useQuery<UserGroupDirectoryEntry[]>({
    queryKey: ['user-groups', 'directory'],
    queryFn: () => apiFetch('/user-groups/directory', {}, accessToken ?? undefined),
    enabled: Boolean(accessToken),
  });
}

export function useMyGroups() {
  const { accessToken } = useAuth();
  return useQuery<MyGroups>({
    queryKey: ['user-groups', 'mine'],
    queryFn: () => apiFetch('/user-groups/mine', {}, accessToken ?? undefined),
    enabled: Boolean(accessToken),
  });
}

export interface CreateUserGroupInput { name: string; description?: string; memberUserIds?: string[]; }

export function useCreateUserGroup() {
  const { accessToken } = useAuth();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: CreateUserGroupInput) =>
      apiFetch('/user-groups', { method: 'POST', body: JSON.stringify(input) }, accessToken ?? undefined) as Promise<UserGroup>,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['user-groups'] });
    },
  });
}

export interface UpdateUserGroupInput { groupId: string; name?: string; description?: string; }

export function useUpdateUserGroup() {
  const { accessToken } = useAuth();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ groupId, ...input }: UpdateUserGroupInput) =>
      apiFetch(`/user-groups/${groupId}`, { method: 'PATCH', body: JSON.stringify(input) }, accessToken ?? undefined) as Promise<UserGroup>,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['user-groups'] });
    },
  });
}

export interface SetGroupMembersInput { groupId: string; userIds: string[]; }

export function useSetGroupMembers() {
  const { accessToken } = useAuth();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ groupId, userIds }: SetGroupMembersInput) =>
      apiFetch(`/user-groups/${groupId}/members`, { method: 'PUT', body: JSON.stringify({ userIds }) }, accessToken ?? undefined) as Promise<UserGroup>,
    // Invalidating the ['user-groups'] prefix also covers the ['user-groups','directory'] and
    // ['user-groups','mine'] query keys (React Query matches by prefix by default).
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['user-groups'] }),
  });
}

export function useDeleteUserGroup() {
  const { accessToken } = useAuth();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (groupId: string) => apiFetch(`/user-groups/${groupId}`, { method: 'DELETE' }, accessToken ?? undefined),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['user-groups'] }),
  });
}
