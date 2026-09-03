import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { apiFetch } from '../api-client';
import { useAuth } from '../auth-context';
import {
  JobListItem,
  JobDetail,
  JobStatus,
  PipelineBoard,
  PipelineStage,
  FeedbackRow,
  CandidateProfile,
  PatchEntryResult,
  FitAssessment,
  RubricDimension,
} from '../types';

export function useJobs(status?: JobStatus) {
  const { accessToken } = useAuth();
  return useQuery<JobListItem[]>({
    queryKey: ['jobs', { status }],
    queryFn: () => apiFetch(`/jobs${status ? `?status=${status}` : ''}`, {}, accessToken ?? undefined),
    enabled: Boolean(accessToken),
  });
}

export function useJob(jobId: string) {
  const { accessToken } = useAuth();
  return useQuery<JobDetail>({
    queryKey: ['jobs', jobId],
    queryFn: () => apiFetch(`/jobs/${jobId}`, {}, accessToken ?? undefined),
    enabled: Boolean(accessToken && jobId),
  });
}

export function useJobPipeline(jobId: string) {
  const { accessToken } = useAuth();
  return useQuery<PipelineBoard>({
    queryKey: ['jobs', jobId, 'pipeline'],
    queryFn: () => apiFetch(`/jobs/${jobId}/pipeline`, {}, accessToken ?? undefined),
    enabled: Boolean(accessToken && jobId),
  });
}

export interface CreateJobInput {
  title: string;
  description?: string;
  location?: string;
  employmentType?: string;
  department?: string;
  hiringManagerId?: string;
  headcount?: number;
  salaryMin?: number;
  salaryMax?: number;
  salaryCurrency?: string;
}

export function useCreateJob() {
  const { accessToken } = useAuth();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: CreateJobInput) =>
      apiFetch('/jobs', { method: 'POST', body: JSON.stringify(input) }, accessToken ?? undefined),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['jobs'] }),
  });
}

export function useUpdateJob(jobId: string) {
  const { accessToken } = useAuth();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (
      input: Partial<CreateJobInput> & {
        status?: JobStatus;
        publicApplyEnabled?: boolean;
        fitCriteria?: string | null;
        fitRubric?: RubricDimension[] | null;
      },
    ) => apiFetch(`/jobs/${jobId}`, { method: 'PATCH', body: JSON.stringify(input) }, accessToken ?? undefined),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['jobs'] });
      queryClient.invalidateQueries({ queryKey: ['jobs', jobId] });
    },
  });
}

export function useDeleteJob() {
  const { accessToken } = useAuth();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (jobId: string) => apiFetch(`/jobs/${jobId}`, { method: 'DELETE' }, accessToken ?? undefined),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['jobs'] }),
  });
}

export function useAddEntry(jobId: string) {
  const { accessToken } = useAuth();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: { candidateId?: string; newCandidate?: { name: string; email: string; phone?: string } }) =>
      apiFetch(`/jobs/${jobId}/entries`, { method: 'POST', body: JSON.stringify(input) }, accessToken ?? undefined),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['jobs', jobId, 'pipeline'] }),
  });
}

// Response shape changed from a bare PipelineEntry to { entry, pendingMessage? } -- see
// PatchEntryResult in types.ts. Nothing here reads the resolved data today (PipelineBoard just
// fires the mutation), but Task 7 wires pendingMessage into a prompt to send a message, so the
// mutation is typed for that consumer now via result.entry / result.pendingMessage.
export function usePatchEntry(jobId: string) {
  const { accessToken } = useAuth();
  const queryClient = useQueryClient();
  return useMutation<PatchEntryResult, Error, { entryId: string; stage?: PipelineStage; rejected?: boolean; reason?: string }>({
    mutationFn: ({ entryId, ...input }) =>
      apiFetch(`/entries/${entryId}`, { method: 'PATCH', body: JSON.stringify(input) }, accessToken ?? undefined) as Promise<PatchEntryResult>,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['jobs', jobId, 'pipeline'] }),
  });
}

export function useLinkExam(jobId: string) {
  const { accessToken } = useAuth();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (examId: string) =>
      apiFetch(`/jobs/${jobId}/exams`, { method: 'POST', body: JSON.stringify({ examId }) }, accessToken ?? undefined),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['jobs', jobId] });
      queryClient.invalidateQueries({ queryKey: ['jobs', jobId, 'pipeline'] });
    },
  });
}

export function useUnlinkExam(jobId: string) {
  const { accessToken } = useAuth();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (examId: string) =>
      apiFetch(`/jobs/${jobId}/exams/${examId}`, { method: 'DELETE' }, accessToken ?? undefined),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['jobs', jobId] });
      queryClient.invalidateQueries({ queryKey: ['jobs', jobId, 'pipeline'] });
    },
  });
}

export function useEntryFeedback(entryId: string) {
  const { accessToken } = useAuth();
  return useQuery<FeedbackRow[]>({
    queryKey: ['entries', entryId, 'feedback'],
    queryFn: () => apiFetch(`/entries/${entryId}/feedback`, {}, accessToken ?? undefined),
    enabled: Boolean(accessToken && entryId),
  });
}

export function useCandidateProfile(candidateId: string) {
  const { accessToken } = useAuth();
  return useQuery<CandidateProfile | null>({
    queryKey: ['candidates', candidateId, 'profile'],
    queryFn: () => apiFetch(`/candidates/${candidateId}/profile`, {}, accessToken ?? undefined),
    enabled: Boolean(accessToken && candidateId),
  });
}

// Résumé URLs are short-lived signed blob links -- fetched on demand at click time via
// mutate(), never prefetched/cached alongside the profile.
export function useCandidateResumeUrl(candidateId: string) {
  const { accessToken } = useAuth();
  return useMutation({
    mutationFn: () => apiFetch(`/candidates/${candidateId}/resume`, {}, accessToken ?? undefined) as Promise<{ url: string }>,
  });
}

export function useAddFeedback(entryId: string, jobId: string) {
  const { accessToken } = useAuth();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: { note?: string; rating?: number; mentionedUserIds?: string[] }) =>
      apiFetch(`/entries/${entryId}/feedback`, { method: 'POST', body: JSON.stringify(input) }, accessToken ?? undefined),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['entries', entryId, 'feedback'] });
      queryClient.invalidateQueries({ queryKey: ['jobs', jobId, 'pipeline'] });
    },
  });
}

export function useAssignEntry(entryId: string, jobId: string) {
  const { accessToken } = useAuth();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (assigneeUserId: string | null) =>
      apiFetch(`/entries/${entryId}/assignment`, { method: 'PATCH', body: JSON.stringify({ assigneeUserId }) }, accessToken ?? undefined),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['jobs', jobId, 'pipeline'] }),
  });
}

export function useFitAssessment(entryId: string, opts: { poll: boolean }) {
  const { accessToken } = useAuth();
  return useQuery<FitAssessment | null>({
    queryKey: ['entries', entryId, 'fit'],
    queryFn: () => apiFetch(`/pipeline/entries/${entryId}/fit-assessment`, {}, accessToken ?? undefined),
    enabled: Boolean(accessToken && entryId),
    // Poll while a scoring run is in flight so the drawer/board update when it finishes.
    refetchInterval: opts.poll ? 2500 : false,
  });
}

export function useScoreEntry(jobId: string) {
  const { accessToken } = useAuth();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (entryId: string) =>
      apiFetch(`/pipeline/entries/${entryId}/fit-assessment/score`, { method: 'POST' }, accessToken ?? undefined),
    onSuccess: (_data, entryId) => {
      queryClient.invalidateQueries({ queryKey: ['entries', entryId, 'fit'] });
      queryClient.invalidateQueries({ queryKey: ['jobs', jobId, 'pipeline'] });
    },
  });
}

export function useSubmitRequisition() {
  const { accessToken } = useAuth();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (jobId: string) => apiFetch(`/jobs/${jobId}/submit`, { method: 'POST' }, accessToken ?? undefined),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['jobs'] });
      queryClient.invalidateQueries({ queryKey: ['approvals'] });
    },
  });
}

export function useCancelRequisition() {
  const { accessToken } = useAuth();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (jobId: string) => apiFetch(`/jobs/${jobId}/approval/cancel`, { method: 'POST' }, accessToken ?? undefined),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['jobs'] });
      queryClient.invalidateQueries({ queryKey: ['approvals'] });
    },
  });
}

export function useScoreJob(jobId: string) {
  const { accessToken } = useAuth();
  const queryClient = useQueryClient();
  return useMutation<{ queued: number; skipped: number }, Error, void>({
    mutationFn: () =>
      apiFetch(`/jobs/${jobId}/fit-assessments/score`, { method: 'POST' }, accessToken ?? undefined) as Promise<{
        queued: number;
        skipped: number;
      }>,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['jobs', jobId, 'pipeline'] }),
  });
}
