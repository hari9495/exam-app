import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { apiFetch } from '../api-client';
import { useAuth } from '../auth-context';

// Web data layer for the Task 3 org apply-consent config endpoints (Zoho #21). Mirrors
// useBusinessHours/useUpdateBusinessHours.
export interface ApplyConsentResponse {
  text: string | null;
  version: number;
}

export function useApplyConsent() {
  const { accessToken } = useAuth();
  return useQuery<ApplyConsentResponse>({
    queryKey: ['apply-consent'],
    queryFn: () => apiFetch('/organizations/apply-consent', {}, accessToken ?? undefined),
    enabled: Boolean(accessToken),
  });
}

export function useUpdateApplyConsent() {
  const { accessToken } = useAuth();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: { text: string | null }) =>
      apiFetch(
        '/organizations/apply-consent',
        { method: 'PUT', body: JSON.stringify(input) },
        accessToken ?? undefined,
      ) as Promise<ApplyConsentResponse>,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['apply-consent'] }),
  });
}
