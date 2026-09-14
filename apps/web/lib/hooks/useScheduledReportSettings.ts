import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { apiFetch } from '../api-client';
import { useAuth } from '../auth-context';

export interface ScheduledReportSettings {
  enabled: boolean;
  recipientUserIds: string[];
}

export function useScheduledReportSettings() {
  const { accessToken } = useAuth();
  return useQuery<ScheduledReportSettings>({
    queryKey: ['scheduled-report-settings'],
    queryFn: () => apiFetch('/organizations/scheduled-report-settings', {}, accessToken ?? undefined),
    enabled: Boolean(accessToken),
  });
}

export function useUpdateScheduledReportSettings() {
  const { accessToken } = useAuth();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: ScheduledReportSettings) =>
      apiFetch('/organizations/scheduled-report-settings', { method: 'PATCH', body: JSON.stringify(input) }, accessToken ?? undefined) as Promise<ScheduledReportSettings>,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['scheduled-report-settings'] }),
  });
}
