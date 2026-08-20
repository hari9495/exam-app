import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { apiFetch } from '../api-client';
import { ConnectedAppRow, ConnectedAppDeliveryRow } from '../types';
import { useAuth } from '../auth-context';

export function useConnectedApps() {
  const { accessToken } = useAuth();
  return useQuery<ConnectedAppRow[]>({
    queryKey: ['connected-apps'],
    queryFn: () => apiFetch('/organizations/integrations/connected-apps', {}, accessToken ?? undefined),
    enabled: Boolean(accessToken),
  });
}

interface CreateConnectedAppInput {
  type: 'slack' | 'msteams';
  label: string;
  targetUrl: string;
  events: string[];
}

export function useCreateConnectedApp() {
  const { accessToken } = useAuth();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: CreateConnectedAppInput): Promise<ConnectedAppRow> =>
      apiFetch('/organizations/integrations/connected-apps', { method: 'POST', body: JSON.stringify(input) }, accessToken ?? undefined),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['connected-apps'] }),
  });
}

interface UpdateConnectedAppInput {
  id: string;
  label?: string;
  targetUrl?: string;
  events?: string[];
  status?: 'active' | 'disabled';
}

export function useUpdateConnectedApp() {
  const { accessToken } = useAuth();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, ...input }: UpdateConnectedAppInput): Promise<ConnectedAppRow> =>
      apiFetch(`/organizations/integrations/connected-apps/${id}`, { method: 'PATCH', body: JSON.stringify(input) }, accessToken ?? undefined),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['connected-apps'] }),
  });
}

export function useDeleteConnectedApp() {
  const { accessToken } = useAuth();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string): Promise<{ ok: true }> =>
      apiFetch(`/organizations/integrations/connected-apps/${id}`, { method: 'DELETE' }, accessToken ?? undefined),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['connected-apps'] }),
  });
}

export function useTestConnectedApp() {
  const { accessToken } = useAuth();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string): Promise<{ queued: true }> =>
      apiFetch(`/organizations/integrations/connected-apps/${id}/test`, { method: 'POST' }, accessToken ?? undefined),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['connected-apps'] }),
  });
}

export function useConnectedAppDeliveries(id: string | null) {
  const { accessToken } = useAuth();
  return useQuery<ConnectedAppDeliveryRow[]>({
    queryKey: ['connected-app-deliveries', id],
    queryFn: () => apiFetch(`/organizations/integrations/connected-apps/${id}/deliveries`, {}, accessToken ?? undefined),
    enabled: Boolean(accessToken) && Boolean(id),
  });
}
