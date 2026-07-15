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

export function useCandidateReport(examId: string, candidateId: string | null) {
  const { accessToken } = useAuth();
  return useQuery<CandidateDetail>({
    queryKey: ['results', examId, 'candidates', candidateId],
    queryFn: () => apiFetch(`/exams/${examId}/candidates/${candidateId}/report`, {}, accessToken ?? undefined),
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
    mutationFn: (format: 'csv' | 'xlsx' | 'pdf') =>
      apiFetchBlob(`/exams/${examId}/results/export?format=${format}`, {}, accessToken ?? undefined),
  });
}
