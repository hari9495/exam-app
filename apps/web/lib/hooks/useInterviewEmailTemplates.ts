import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { apiFetch } from '../api-client';
import { useAuth } from '../auth-context';

// Web data layer for the interview-email-template endpoints. Mirrors useApprovalEmailTemplates.
// The eight event types + labels + per-event merge variables are inlined here (not imported from the
// api's interview-email-types.ts) because apps/web can't import backend/shared VALUES at runtime.
export type InterviewEmailEventType =
  | 'invite'
  | 'panelist_invite'
  | 'confirmation_candidate'
  | 'confirmation_panelist'
  | 'confirmation_recruiter'
  | 'candidate_declined'
  | 'candidate_reschedule'
  | 'cancellation';

export const INTERVIEW_EMAIL_EVENT_TYPES: InterviewEmailEventType[] = [
  'invite',
  'panelist_invite',
  'confirmation_candidate',
  'confirmation_panelist',
  'confirmation_recruiter',
  'candidate_declined',
  'candidate_reschedule',
  'cancellation',
];

export const INTERVIEW_EMAIL_EVENT_LABELS: Record<InterviewEmailEventType, string> = {
  invite: 'Candidate invitation',
  panelist_invite: 'Panelist assignment',
  confirmation_candidate: 'Confirmation — candidate',
  confirmation_panelist: 'Confirmation — panelist',
  confirmation_recruiter: 'Confirmation — recruiter',
  candidate_declined: 'Candidate declined (recruiter notice)',
  candidate_reschedule: 'Reschedule requested (recruiter notice)',
  cancellation: 'Cancellation (candidate)',
};

// The {{tokens}} each event's copy renders. Shown as inline help under the editor. Mirrors the
// merge fields the api populates per send site (interview-email-types.ts). The calendar join link,
// recruiter note, and reschedule note are appended by the api AFTER rendering, so they are not tokens.
export const INTERVIEW_EMAIL_EVENT_VARIABLES: Record<InterviewEmailEventType, string[]> = {
  invite: ['{{candidateName}}', '{{jobTitle}}', '{{orgName}}', '{{interviewTimes}}', '{{interviewLocation}}', '{{panelNames}}', '{{confirmLink}}', '{{recruiterName}}'],
  panelist_invite: ['{{candidateName}}', '{{jobTitle}}', '{{interviewTimes}}', '{{interviewLocation}}'],
  confirmation_candidate: ['{{jobTitle}}', '{{orgName}}', '{{interviewTime}}', '{{interviewLocation}}'],
  confirmation_panelist: ['{{candidateName}}', '{{interviewTime}}', '{{interviewLocation}}'],
  confirmation_recruiter: ['{{candidateName}}', '{{jobTitle}}', '{{interviewTime}}'],
  candidate_declined: ['{{candidateName}}', '{{jobTitle}}'],
  candidate_reschedule: ['{{candidateName}}', '{{jobTitle}}', '{{candidateNote}}'],
  cancellation: ['{{jobTitle}}', '{{orgName}}', '{{interviewTime}}'],
};

export interface InterviewEmailTemplateSlot {
  eventType: InterviewEmailEventType;
  subject: string | null;
  body: string | null;
  enabled: boolean;
}

export function useInterviewEmailTemplates() {
  const { accessToken } = useAuth();
  return useQuery<InterviewEmailTemplateSlot[]>({
    queryKey: ['interview-email-templates'],
    queryFn: () => apiFetch('/interview-email-templates', {}, accessToken ?? undefined),
    enabled: Boolean(accessToken),
  });
}

export function useUpsertInterviewEmailTemplate() {
  const { accessToken } = useAuth();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ eventType, subject, body, enabled }: { eventType: InterviewEmailEventType; subject: string; body: string; enabled?: boolean }) =>
      apiFetch(
        `/interview-email-templates/${eventType}`,
        { method: 'PUT', body: JSON.stringify({ subject, body, enabled }) },
        accessToken ?? undefined,
      ) as Promise<InterviewEmailTemplateSlot>,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['interview-email-templates'] }),
  });
}
