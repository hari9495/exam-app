import { useMutation, useQueryClient } from '@tanstack/react-query';
import { apiFetch, apiFetchBlob } from '../api-client';
import { BulkInviteResult } from '../types';
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
  created: { id: string; candidateId: string }[];
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
