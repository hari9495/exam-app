import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { apiFetch } from '../api-client';
import { useAuth } from '../auth-context';
import { Candidate, CandidateSms, PaginatedResponse } from '../types';

// SMS counterpart of useCandidateMessages' send/list/resend (Zoho #16).
export function useCandidateSmsMessages(candidateId: string) {
  const { accessToken } = useAuth();
  return useQuery<CandidateSms[]>({
    queryKey: ['candidate-sms', candidateId],
    queryFn: () => apiFetch(`/candidate-sms/${candidateId}`, {}, accessToken ?? undefined),
    enabled: Boolean(accessToken && candidateId),
  });
}

export interface SendSmsInput {
  templateId?: string | null;
  body: string;
}

// candidateId is needed (beyond entryId) purely to invalidate the right ['candidate-sms', X]
// list -- the send endpoint is keyed by pipeline entry, mirroring useSendMessage.
export function useSendSms(entryId: string, candidateId: string) {
  const { accessToken } = useAuth();
  const queryClient = useQueryClient();
  return useMutation<CandidateSms, Error, SendSmsInput>({
    mutationFn: (input) =>
      apiFetch(`/candidate-sms/${entryId}`, { method: 'POST', body: JSON.stringify(input) }, accessToken ?? undefined) as Promise<CandidateSms>,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['candidate-sms', candidateId] }),
  });
}

export function useResendSms(candidateId: string) {
  const { accessToken } = useAuth();
  const queryClient = useQueryClient();
  return useMutation<CandidateSms, Error, string>({
    mutationFn: (smsId) =>
      apiFetch(`/candidate-sms/${smsId}/resend`, { method: 'POST' }, accessToken ?? undefined) as Promise<CandidateSms>,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['candidate-sms', candidateId] }),
  });
}

// SMS consent is legally separate from email -- a dedicated toggle, not folded into the general
// candidate-update path. Mirrors apps/api/src/candidates/candidates.controller.ts setSmsOptOut.
export function useSetSmsOptOut(candidateId: string) {
  const { accessToken } = useAuth();
  const queryClient = useQueryClient();
  return useMutation<{ id: string; smsOptedOutAt: string | null }, Error, boolean>({
    mutationFn: (optedOut) =>
      apiFetch(
        `/candidates/${candidateId}/sms-opt-out`,
        { method: 'PATCH', body: JSON.stringify({ optedOut }) },
        accessToken ?? undefined,
      ) as Promise<{ id: string; smsOptedOutAt: string | null }>,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['candidate-contact-info', candidateId] }),
  });
}

// Best-effort phone/opt-out lookup for gating the Send-SMS control -- there's no per-candidate
// GET endpoint, so this reuses the existing /candidates list search (same tolerance pattern as
// useIntegrations/useOrgSenderAddresses in SendMessageModal: a role without candidate:manage,
// e.g. panel, gets a 403, isSuccess stays false, and the caller just treats it as unknown rather
// than gating). email is required to search; a candidate with no email on file returns unknown.
export function useCandidateContactInfo(candidateId: string, email: string | null) {
  const { accessToken } = useAuth();
  return useQuery<{ phone: string | null; smsOptedOutAt: string | null } | null>({
    queryKey: ['candidate-contact-info', candidateId],
    queryFn: async () => {
      const page: PaginatedResponse<Candidate> = await apiFetch(
        `/candidates?search=${encodeURIComponent(email ?? '')}`,
        {},
        accessToken ?? undefined,
      );
      const match = page.data.find((c) => c.id === candidateId);
      return match ? { phone: match.phone, smsOptedOutAt: match.smsOptedOutAt ?? null } : null;
    },
    enabled: Boolean(accessToken && candidateId && email),
  });
}
