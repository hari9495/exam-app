import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { apiFetch } from '../api-client';
import { useAuth } from '../auth-context';

// Org-wide daily reminder sweep toggle. GET returns { remindersEnabled }; PATCH takes { enabled }.
export interface ReminderSettings {
  remindersEnabled: boolean;
}

export function useReminderSettings() {
  const { accessToken } = useAuth();
  return useQuery<ReminderSettings>({
    queryKey: ['reminder-settings'],
    queryFn: () => apiFetch('/organizations/reminder-settings', {}, accessToken ?? undefined),
    enabled: Boolean(accessToken),
  });
}

export function useUpdateReminderSettings() {
  const { accessToken } = useAuth();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (enabled: boolean) =>
      apiFetch('/organizations/reminder-settings', { method: 'PATCH', body: JSON.stringify({ enabled }) }, accessToken ?? undefined) as Promise<ReminderSettings>,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['reminder-settings'] }),
  });
}
