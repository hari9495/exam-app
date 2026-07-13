import { useMutation, useQueryClient } from '@tanstack/react-query';
import { apiFetch } from '../api-client';
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
