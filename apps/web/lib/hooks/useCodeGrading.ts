import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { apiFetch } from '../api-client';
import { useAuth } from '../auth-context';
import { PendingGradingRow, CodeAnswerReview } from '../types';

export function usePendingGrading(examId: string) {
  const { accessToken } = useAuth();
  return useQuery<PendingGradingRow[]>({
    queryKey: ['pending-grading', examId],
    queryFn: () => apiFetch(`/exams/${examId}/pending-grading`, {}, accessToken ?? undefined),
    enabled: Boolean(accessToken) && Boolean(examId),
  });
}

export function useGradeCodeAnswer(attemptId: string) {
  const { accessToken } = useAuth();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ questionId, marksAwarded, feedback }: { questionId: string; marksAwarded: number; feedback?: string }) =>
      apiFetch(
        `/attempts/${attemptId}/answers/${questionId}/grade`,
        { method: 'POST', body: JSON.stringify({ marksAwarded, feedback }) },
        accessToken ?? undefined,
      ),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['pending-grading'] }),
  });
}

export function useFinalizeManualGrade() {
  const { accessToken } = useAuth();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (attemptId: string) =>
      apiFetch(`/attempts/${attemptId}/finalize-manual-grade`, { method: 'POST', body: JSON.stringify({}) }, accessToken ?? undefined),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['pending-grading'] }),
  });
}

export function useCodeReview(attemptId: string, questionId: string) {
  const { accessToken } = useAuth();
  return useQuery<CodeAnswerReview | null>({
    queryKey: ['code-review', attemptId, questionId],
    queryFn: async () => {
      try {
        return await apiFetch(`/attempts/${attemptId}/answers/${questionId}/code-review`, {}, accessToken ?? undefined);
      } catch (error) {
        if (error instanceof Error && (error as Error & { status?: number }).status === 404) {
          return null;
        }
        throw error;
      }
    },
    enabled: Boolean(accessToken) && Boolean(attemptId) && Boolean(questionId),
    // Generation is detached server-side (the AI call far outruns the 5s internal timeout that
    // used to 503 it), so the row lands as 'processing' first and flips to completed/failed
    // whenever the model returns. Poll until it settles -- same shape as the invite-email
    // status in useInvitations. Stops as soon as it is no longer processing.
    refetchInterval: (query) => (query.state.data?.status === 'processing' ? 2_000 : false),
  });
}

export function useRegenerateCodeReview() {
  const { accessToken } = useAuth();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ attemptId, questionId }: { attemptId: string; questionId: string }) =>
      apiFetch(
        `/attempts/${attemptId}/answers/${questionId}/code-review/regenerate`,
        { method: 'POST', body: JSON.stringify({}) },
        accessToken ?? undefined,
      ),
    onSuccess: (_data, { attemptId, questionId }) => queryClient.invalidateQueries({ queryKey: ['code-review', attemptId, questionId] }),
  });
}
