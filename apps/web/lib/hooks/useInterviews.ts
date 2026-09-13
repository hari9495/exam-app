import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { apiFetch } from '../api-client';
import { useAuth } from '../auth-context';
import { Interview } from '../types';

export function useCandidateInterviews(candidateId: string) {
  const { accessToken } = useAuth();
  return useQuery<Interview[]>({
    queryKey: ['candidate-interviews', candidateId],
    queryFn: () => apiFetch(`/candidates/${candidateId}/interviews`, {}, accessToken ?? undefined),
    enabled: Boolean(accessToken && candidateId),
  });
}

export interface CreateInterviewInput {
  // Required in 'proposed' mode (the default); omitted in 'self_book' mode.
  slots?: { startsAt: string; endsAt: string }[];
  panelistUserIds: string[];
  location: string;
  timeZone: string;
  recruiterNote?: string;
  bookingMode?: 'proposed' | 'self_book';
  bookingWindowStart?: string;
  bookingWindowEnd?: string;
  slotDurationMinutes?: number;
}

// candidateId is needed (beyond entryId) purely to invalidate the right ['candidate-interviews', X]
// list -- the create endpoint is keyed by pipeline entry, same split as useCreateOffer.
export function useCreateInterview(entryId: string, candidateId: string) {
  const { accessToken } = useAuth();
  const queryClient = useQueryClient();
  return useMutation<Interview, Error, CreateInterviewInput>({
    mutationFn: (input) =>
      apiFetch(`/pipeline/entries/${entryId}/interviews`, { method: 'POST', body: JSON.stringify(input) }, accessToken ?? undefined) as Promise<Interview>,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['candidate-interviews', candidateId] }),
  });
}

export function useSendInterview(candidateId: string) {
  const { accessToken } = useAuth();
  const queryClient = useQueryClient();
  return useMutation<Interview, Error, string>({
    mutationFn: (interviewId) => apiFetch(`/interviews/${interviewId}/send`, { method: 'POST' }, accessToken ?? undefined) as Promise<Interview>,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['candidate-interviews', candidateId] }),
  });
}

// The caller's own assigned interviews (panel console). listMine only includes slots -- no
// candidate/job -- so the panel page renders time/location/status only.
export function useMyInterviews() {
  const { accessToken } = useAuth();
  return useQuery<Interview[]>({
    queryKey: ['my-interviews'],
    queryFn: () => apiFetch('/interviews/mine', {}, accessToken ?? undefined),
    enabled: Boolean(accessToken),
  });
}

// --- AI interview kit (inert until the org configures an AI key) ---------------------------------

export type InterviewQuestionCategory = 'technical' | 'behavioral' | 'role_specific' | 'culture';
export interface GeneratedInterviewQuestion {
  question: string;
  category: InterviewQuestionCategory;
  rationale: string;
}

// Generate a tailored interview-question kit for a pipeline entry. Not cached -- each click is a
// fresh generation the recruiter can re-run.
export function useGenerateInterviewQuestions(entryId: string) {
  const { accessToken } = useAuth();
  return useMutation<{ questions: GeneratedInterviewQuestion[] }, Error, { count?: number; focus?: string }>({
    mutationFn: (input) =>
      apiFetch(`/pipeline/entries/${entryId}/interview-questions`, { method: 'POST', body: JSON.stringify(input) }, accessToken ?? undefined) as Promise<{ questions: GeneratedInterviewQuestion[] }>,
  });
}

export type ScorecardRecommendation = 'strong_yes' | 'yes' | 'no' | 'strong_no';
export interface InterviewScorecard {
  recommendation: ScorecardRecommendation;
  summary: string;
  competencies: { name: string; rating: number; justification: string }[];
  strengths: string[];
  concerns: string[];
}

// Turn an interviewer's raw notes into a structured scorecard for one interview.
export function useGenerateScorecard(interviewId: string) {
  const { accessToken } = useAuth();
  return useMutation<InterviewScorecard, Error, { notes: string }>({
    mutationFn: (input) =>
      apiFetch(`/interviews/${interviewId}/scorecard`, { method: 'POST', body: JSON.stringify(input) }, accessToken ?? undefined) as Promise<InterviewScorecard>,
  });
}

export function useCancelInterview(candidateId: string) {
  const { accessToken } = useAuth();
  const queryClient = useQueryClient();
  return useMutation<Interview, Error, string>({
    mutationFn: (interviewId) => apiFetch(`/interviews/${interviewId}/cancel`, { method: 'POST' }, accessToken ?? undefined) as Promise<Interview>,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['candidate-interviews', candidateId] }),
  });
}
