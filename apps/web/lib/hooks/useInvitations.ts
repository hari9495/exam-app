import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { apiFetch, apiFetchBlob } from '../api-client';
import { BulkInviteResult, Invitation } from '../types';
import { useAuth } from '../auth-context';

/**
 * @param advancedFromExamId set by "Advance to Next Round" only -- the exam candidates are
 * being advanced FROM. Stamped on the new invitation so that exam's results table can report
 * whether the invite it triggered actually went out.
 */
export function useBulkInvite(examId: string, advancedFromExamId?: string) {
  const { accessToken } = useAuth();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (candidateIds: string[]): Promise<BulkInviteResult> =>
      apiFetch(
        `/exams/${examId}/invitations`,
        { method: 'POST', body: JSON.stringify({ candidateIds, ...(advancedFromExamId ? { advancedFromExamId } : {}) }) },
        accessToken ?? undefined,
      ),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['candidates'] });
      queryClient.invalidateQueries({ queryKey: ['invitations', examId] });
      // The source exam's results table gains a "Next round" value for everyone just advanced.
      if (advancedFromExamId) {
        queryClient.invalidateQueries({ queryKey: ['exam-results', advancedFromExamId] });
      }
    },
  });
}

export interface BulkUploadInviteRowError {
  row: number;
  message: string;
}

export interface BulkUploadInviteResult {
  created: (Invitation & { token: string })[];
  skipped: { email: string; reason: string }[];
  errors: BulkUploadInviteRowError[];
}

export function useBulkUploadInvite() {
  const { accessToken } = useAuth();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ file, examId }: { file: File; examId: string }): Promise<BulkUploadInviteResult> => {
      const formData = new FormData();
      formData.append('file', file);
      formData.append('examId', examId);
      return apiFetch('/candidates/bulk-upload-invite', { method: 'POST', body: formData }, accessToken ?? undefined);
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['candidates'] }),
  });
}

export function useDownloadBulkUploadInviteTemplate() {
  const { accessToken } = useAuth();
  return useMutation({
    mutationFn: () => apiFetchBlob('/candidates/bulk-upload-invite/template', {}, accessToken ?? undefined),
  });
}

export function useExamInvitations(examId: string) {
  const { accessToken } = useAuth();
  return useQuery<Invitation[]>({
    queryKey: ['invitations', examId],
    queryFn: () => apiFetch(`/exams/${examId}/invitations`, {}, accessToken ?? undefined),
    enabled: Boolean(examId),
    // The invite email send is fire-and-forget on the backend, so a row can sit at
    // emailStatus 'pending' for a moment after invite/resend -- poll until it settles
    // to 'sent'/'failed' so the "In queue" badge clears on its own, not just on your next
    // manual refresh.
    refetchInterval: (query) => (query.state.data?.some((row) => row.emailStatus === 'pending') ? 2_000 : false),
  });
}

export function useResendInvitation(examId: string) {
  const { accessToken } = useAuth();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (invitationId: string): Promise<Invitation> =>
      apiFetch(`/invitations/${invitationId}/resend`, { method: 'POST' }, accessToken ?? undefined),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['invitations', examId] }),
  });
}

export function useUpdateAccommodation(examId: string) {
  const { accessToken } = useAuth();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ invitationId, extraTimePercent }: { invitationId: string; extraTimePercent: number }): Promise<Invitation> =>
      apiFetch(`/invitations/${invitationId}/accommodation`, { method: 'POST', body: JSON.stringify({ extraTimePercent }) }, accessToken ?? undefined),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['invitations', examId] }),
  });
}
