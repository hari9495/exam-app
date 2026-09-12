import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { apiFetch } from '../api-client';
import { useAuth } from '../auth-context';

export interface CalendarConnectionStatus {
  provider: 'google' | 'microsoft';
  label: string;
  configured: boolean; // this deployment has the provider's OAuth app
  connected: boolean; // this user has linked an account
  connectedEmail: string | null;
}

export function useCalendarConnections() {
  const { accessToken } = useAuth();
  return useQuery<CalendarConnectionStatus[]>({
    queryKey: ['calendar-connections'],
    queryFn: () => apiFetch('/calendar/connections', {}, accessToken ?? undefined),
    enabled: Boolean(accessToken),
  });
}

export function useDisconnectCalendar() {
  const { accessToken } = useAuth();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (provider: string): Promise<{ ok: true }> =>
      apiFetch(`/calendar/${provider}`, { method: 'DELETE' }, accessToken ?? undefined),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['calendar-connections'] }),
  });
}
