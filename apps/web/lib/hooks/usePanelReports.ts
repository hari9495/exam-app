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

// invitationId, not candidateId -- a re-invited candidate has more than one row for
// the same exam, and a candidateId-keyed comparison could silently compare the wrong
// attempt's data.
export function useCandidateComparison(examId: string, invitationIds: string[]) {
  const { accessToken } = useAuth();
  return useQuery<CandidateComparisonRow[]>({
    queryKey: ['results', examId, 'compare', invitationIds.join(',')],
    queryFn: () =>
      apiFetch(`/exams/${examId}/candidates/compare?invitationIds=${invitationIds.join(',')}`, {}, accessToken ?? undefined),
    enabled: Boolean(accessToken) && Boolean(examId) && invitationIds.length >= 2,
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

// Result release. All three invalidate the exam's results queries so the summary/list/report reflect
// the new release state. notify asks the API to email candidates their outcome (recruiter's choice).
export function useReleaseExamResults(examId: string) {
  const { accessToken } = useAuth();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (notify: boolean) =>
      apiFetch(`/exams/${examId}/results/release`, { method: 'POST', body: JSON.stringify({ notify }) }, accessToken ?? undefined) as Promise<{ released: number }>,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['results', examId] }),
  });
}

export function useSetAttemptResultRelease(examId: string) {
  const { accessToken } = useAuth();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ attemptId, action, notify }: { attemptId: string; action: 'release' | 'hold'; notify?: boolean }) =>
      apiFetch(
        `/attempts/${attemptId}/results/${action}`,
        { method: 'POST', body: JSON.stringify(action === 'release' ? { notify: notify ?? false } : {}) },
        accessToken ?? undefined,
      ) as Promise<{ status: 'released' | 'held' }>,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['results', examId] }),
  });
}

// Recruiter certificate download: get-or-generate the passing candidate's certificate, returns a
// signed URL to open. Allowed before release (preview); the API still enforces enabled + passed.
export function useCandidateCertificate() {
  const { accessToken } = useAuth();
  return useMutation({
    mutationFn: (attemptId: string) =>
      apiFetch(`/attempts/${attemptId}/certificate`, {}, accessToken ?? undefined) as Promise<{ url: string }>,
  });
}

export function useResultsExport(examId: string) {
  const { accessToken } = useAuth();
  return useMutation({
    mutationFn: ({ format, invitationIds }: { format: 'csv' | 'xlsx' | 'pdf'; invitationIds?: string[] }) => {
      const query = new URLSearchParams({ format });
      // Omitted (not just empty) when nothing is selected, so the backend's own
      // "no ids -> export everything" default is what actually runs.
      if (invitationIds && invitationIds.length > 0) query.set('invitationIds', invitationIds.join(','));
      return apiFetchBlob(`/exams/${examId}/results/export?${query.toString()}`, {}, accessToken ?? undefined);
    },
  });
}
