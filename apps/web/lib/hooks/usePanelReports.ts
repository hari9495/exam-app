import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { apiFetch, apiFetchBlob } from '../api-client';
import { useAuth } from '../auth-context';
import {
  ExamResultsSummary,
  QuestionAccuracyRow,
  ExamResultRow,
  CandidateDetail,
  CandidateComparisonRow,
  AttemptInsight,
} from '../types';

export function useResultsSummary(examId: string) {
  const { accessToken } = useAuth();
  return useQuery<ExamResultsSummary>({
    queryKey: ['results', examId, 'summary'],
    queryFn: () => apiFetch(`/exams/${examId}/results/summary`, {}, accessToken ?? undefined),
    enabled: Boolean(accessToken) && Boolean(examId),
  });
}

export function useQuestionAccuracy(examId: string) {
  const { accessToken } = useAuth();
  return useQuery<QuestionAccuracyRow[]>({
    queryKey: ['results', examId, 'question-accuracy'],
    queryFn: () => apiFetch(`/exams/${examId}/results/question-accuracy`, {}, accessToken ?? undefined),
    enabled: Boolean(accessToken) && Boolean(examId),
  });
}

export function useResultsList(examId: string) {
  const { accessToken } = useAuth();
  return useQuery<ExamResultRow[]>({
    queryKey: ['results', examId, 'list'],
    queryFn: () => apiFetch(`/exams/${examId}/results`, {}, accessToken ?? undefined),
    enabled: Boolean(accessToken) && Boolean(examId),
  });
}

// attemptId disambiguates a candidate re-invited to the same exam (multiple invitation
// rows share one candidateId) -- without it the backend falls back to "most recently
// invited," which can silently return a different, unsettled attempt's (blank) data
// instead of the specific one the caller is looking at.
export function useCandidateReport(examId: string, candidateId: string | null, attemptId?: string | null) {
  const { accessToken } = useAuth();
  return useQuery<CandidateDetail>({
    queryKey: ['results', examId, 'candidates', candidateId, attemptId ?? null],
    queryFn: () =>
      apiFetch(
        `/exams/${examId}/candidates/${candidateId}/report${attemptId ? `?attemptId=${attemptId}` : ''}`,
        {},
        accessToken ?? undefined,
      ),
    enabled: Boolean(accessToken) && Boolean(examId) && Boolean(candidateId),
  });
}

export function useCandidateComparison(examId: string, candidateIds: string[]) {
  const { accessToken } = useAuth();
  return useQuery<CandidateComparisonRow[]>({
    queryKey: ['results', examId, 'compare', candidateIds.join(',')],
    queryFn: () =>
      apiFetch(`/exams/${examId}/candidates/compare?candidateIds=${candidateIds.join(',')}`, {}, accessToken ?? undefined),
    enabled: Boolean(accessToken) && Boolean(examId) && candidateIds.length >= 2,
  });
}

export function useAttemptInsight(attemptId: string | null) {
  const { accessToken } = useAuth();
  return useQuery<AttemptInsight | null>({
    queryKey: ['attempt-insight', attemptId],
    queryFn: async () => {
      try {
        return await apiFetch(`/attempts/${attemptId}/ai-insight`, {}, accessToken ?? undefined);
      } catch (error) {
        if (error instanceof Error && (error as Error & { status?: number }).status === 404) {
          return null;
        }
        throw error;
      }
    },
    enabled: Boolean(accessToken) && Boolean(attemptId),
  });
}

export function useRegenerateAttemptInsight() {
  const { accessToken } = useAuth();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (attemptId: string) =>
      apiFetch(
        `/attempts/${attemptId}/ai-insight/regenerate`,
        { method: 'POST', body: JSON.stringify({}) },
        accessToken ?? undefined,
      ),
    onSuccess: (_data, attemptId) => queryClient.invalidateQueries({ queryKey: ['attempt-insight', attemptId] }),
  });
}

export function useResultsExport(examId: string) {
  const { accessToken } = useAuth();
  return useMutation({
    mutationFn: ({ format, candidateIds }: { format: 'csv' | 'xlsx' | 'pdf'; candidateIds?: string[] }) => {
      const query = new URLSearchParams({ format });
      // Omitted (not just empty) when nothing is selected, so the backend's own
      // "no ids -> export everything" default is what actually runs.
      if (candidateIds && candidateIds.length > 0) query.set('candidateIds', candidateIds.join(','));
      return apiFetchBlob(`/exams/${examId}/results/export?${query.toString()}`, {}, accessToken ?? undefined);
    },
  });
}
