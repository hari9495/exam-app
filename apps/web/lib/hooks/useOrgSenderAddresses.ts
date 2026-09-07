import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { apiFetch } from '../api-client';
import { useAuth } from '../auth-context';
import type { OrgSenderAddress } from '../types';

// Web data layer for the org-sender-addresses endpoints. List is gated pipeline:manage (so the
// compose picker works for recruiters, not just org admins); create/update/delete stay
// org:manage_settings (admin-only). Mirrors useUserGroups.ts's fetch-wrapper/invalidation
// conventions.

export function useOrgSenderAddresses() {
  const { accessToken } = useAuth();
  return useQuery<OrgSenderAddress[]>({
    queryKey: ['org-sender-addresses'],
    queryFn: () => apiFetch('/org-sender-addresses', {}, accessToken ?? undefined),
    enabled: Boolean(accessToken),
  });
}

export interface CreateSenderAddressInput { label: string; address: string; isDefault?: boolean; }

export function useCreateSenderAddress() {
  const { accessToken } = useAuth();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: CreateSenderAddressInput) =>
      apiFetch('/org-sender-addresses', { method: 'POST', body: JSON.stringify(input) }, accessToken ?? undefined) as Promise<OrgSenderAddress>,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['org-sender-addresses'] }),
  });
}

export interface UpdateSenderAddressInput { id: string; label?: string; address?: string; isDefault?: boolean; }

export function useUpdateSenderAddress() {
  const { accessToken } = useAuth();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, ...input }: UpdateSenderAddressInput) =>
      apiFetch(`/org-sender-addresses/${id}`, { method: 'PATCH', body: JSON.stringify(input) }, accessToken ?? undefined) as Promise<OrgSenderAddress>,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['org-sender-addresses'] }),
  });
}

export function useDeleteSenderAddress() {
  const { accessToken } = useAuth();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => apiFetch(`/org-sender-addresses/${id}`, { method: 'DELETE' }, accessToken ?? undefined),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['org-sender-addresses'] }),
  });
}
