import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { apiFetch, apiFetchBlob } from '../api-client';
import { BulkInviteResult, Invitation } from '../types';
import { useAuth } from '../auth-context';

export function useBulkInvite(examId: string) {
  const { accessToken } = useAuth();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (candidateIds: string[]): Promise<BulkInviteResult> =>
      apiFetch(`/exams/${examId}/invitations`, { method: 'POST', body: JSON.stringify({ candidateIds }) }, accessToken ?? undefined),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['candidates'] }),
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
