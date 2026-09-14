// The fixed set of interview emails an org can customize. Each has a built-in default (below) that
// is used verbatim when the org has no template for it (or has disabled it). All copy is expressed
// with {{token}} merge fields rendered by the shared renderTemplateString, so the default and a
// custom template render through the exact same path.
export const INTERVIEW_EMAIL_EVENT_TYPES = [
  'invite',
  'panelist_invite',
  'confirmation_candidate',
  'confirmation_panelist',
  'confirmation_recruiter',
  'candidate_declined',
  'candidate_reschedule',
  'cancellation',
] as const;

export type InterviewEmailEventType = (typeof INTERVIEW_EMAIL_EVENT_TYPES)[number];

export function isInterviewEmailEventType(type: string): type is InterviewEmailEventType {
  return (INTERVIEW_EMAIL_EVENT_TYPES as readonly string[]).includes(type);
}

export interface InterviewEmailCopy {
  subject: string;
  body: string;
}

// Built-in copy, verbatim from the pre-template hardcoded strings (now tokenized). Recipient-specific
// system additions (calendar join link, recruiter note, candidate reschedule note) are appended by
// the send site AFTER rendering, so they survive a custom template unchanged.
export const INTERVIEW_EMAIL_DEFAULTS: Record<InterviewEmailEventType, InterviewEmailCopy> = {
  invite: {
    subject: 'Interview invitation: {{jobTitle}} at {{orgName}}',
    body:
      'Hi {{candidateName}},\n\n' +
      "You're invited to interview for {{jobTitle}} at {{orgName}}.\n\n" +
      'Proposed times:\n{{interviewTimes}}\n\n' +
      'Location: {{interviewLocation}}\n\n' +
      'Panel: {{panelNames}}\n\n' +
      'Please confirm your preferred time here: {{confirmLink}}\n\n' +
      'Best,\n{{recruiterName}}',
  },
  panelist_invite: {
    subject: 'Interview panel assignment: {{candidateName}} for {{jobTitle}}',
    body:
      'You are assigned to interview {{candidateName}} for {{jobTitle}}.\n' +
      'Proposed times:\n{{interviewTimes}}\n' +
      'Location: {{interviewLocation}}\n' +
      "(Pending the candidate's confirmation.)",
  },
  confirmation_candidate: {
    subject: 'Interview confirmed: {{jobTitle}}',
    body: 'Your interview for {{jobTitle}} at {{orgName}} is confirmed for {{interviewTime}}.\n\nLocation: {{interviewLocation}}',
  },
  confirmation_panelist: {
    subject: 'Interview confirmed: {{candidateName}} for {{jobTitle}}',
    body: '{{candidateName}} confirmed for {{interviewTime}}.\n\nLocation: {{interviewLocation}}',
  },
  confirmation_recruiter: {
    subject: 'Interview confirmed: {{candidateName}}',
    body: '{{candidateName}} confirmed the interview for {{jobTitle}} ({{interviewTime}}).',
  },
  candidate_declined: {
    subject: 'Interview declined: {{candidateName}}',
    body: '{{candidateName}} declined the interview for {{jobTitle}}.',
  },
  candidate_reschedule: {
    subject: 'Interview reschedule requested: {{candidateName}}',
    body: '{{candidateName}} requested a reschedule for the interview for {{jobTitle}}.{{candidateNote}}',
  },
  cancellation: {
    subject: 'Interview cancelled: {{jobTitle}}',
    body: 'The interview for {{jobTitle}} at {{orgName}} scheduled for {{interviewTime}} has been cancelled.',
  },
};
