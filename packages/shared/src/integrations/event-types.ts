export const INTEGRATION_EVENT_TYPES = [
  'invitation.created',
  'attempt.submitted',
  'attempt.settled',
  'integrity.flagged',
  'interview.confirmed',
  'offer.accepted',
  'candidate.applied',
  'candidate.fit_scored',
] as const;

export type IntegrationEventType = (typeof INTEGRATION_EVENT_TYPES)[number];

export const INTEGRATION_EVENT_LABELS: Record<IntegrationEventType, string> = {
  'invitation.created': 'Candidate invited',
  'attempt.submitted': 'Candidate finished exam',
  'attempt.settled': 'Results ready',
  'integrity.flagged': 'Integrity flag raised',
  'interview.confirmed': 'Interview confirmed',
  'offer.accepted': 'Offer accepted',
  'candidate.applied': 'New applicant',
  'candidate.fit_scored': 'AI fit score ready',
};
