import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { apiFetch } from '../api-client';
import { useAuth } from '../auth-context';

// Web data layer for the Task 4 notification-preferences endpoints. Mirrors
// useOrgPipelineSettings/useUpdateOrgPipelineSettings in usePipelines.ts.
export interface NotificationPreference {
  type: string;
  group: 'mentions' | 'assignments' | 'approvals';
  label: string;
  emailEnabled: boolean;
}

export function useNotificationPreferences() {
  const { accessToken } = useAuth();
  return useQuery<NotificationPreference[]>({
    queryKey: ['notification-preferences'],
    queryFn: () => apiFetch('/notifications/preferences', {}, accessToken ?? undefined),
    enabled: Boolean(accessToken),
  });
}

export function useUpdateNotificationPreference() {
  const { accessToken } = useAuth();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: { type: string; emailEnabled: boolean }) =>
      apiFetch(
        '/notifications/preferences',
        { method: 'PATCH', body: JSON.stringify(input) },
        accessToken ?? undefined,
      ),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['notification-preferences'] }),
  });
}
