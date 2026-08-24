import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { apiFetch } from '../api-client';
import { useAuth } from '../auth-context';
import { NotificationView } from '../types';

// Light polling keeps the bell fresh without a websocket; the inbox is small (own notifications only).
const POLL_MS = 60_000;

export function useNotifications() {
  const { accessToken } = useAuth();
  return useQuery<NotificationView[]>({
    queryKey: ['notifications'],
    queryFn: () => apiFetch('/notifications', {}, accessToken ?? undefined),
    enabled: Boolean(accessToken),
    refetchInterval: POLL_MS,
  });
}

export function useUnreadCount() {
  const { accessToken } = useAuth();
  return useQuery<{ count: number }>({
    queryKey: ['notifications', 'unread-count'],
    queryFn: () => apiFetch('/notifications/unread-count', {}, accessToken ?? undefined),
    enabled: Boolean(accessToken),
    refetchInterval: POLL_MS,
  });
}

export function useMarkNotificationRead() {
  const { accessToken } = useAuth();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => apiFetch(`/notifications/${id}/read`, { method: 'POST' }, accessToken ?? undefined),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['notifications'] }),
  });
}

export function useMarkAllNotificationsRead() {
  const { accessToken } = useAuth();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: () => apiFetch('/notifications/read-all', { method: 'POST' }, accessToken ?? undefined),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['notifications'] }),
  });
}
