export interface DefaultTemplate {
  key: string;
  name: string;
  triggerEvent: string | null;
  triggerMode: 'manual' | 'prompt' | 'auto';
  subject: string;
  body: string;
}

export const DEFAULT_TEMPLATES: DefaultTemplate[] = [
  { key: 'application_received', name: 'Application received', triggerEvent: 'applied', triggerMode: 'manual',
    subject: 'We received your application for {{jobTitle}}',
    body: 'Hi {{candidateName}},\n\nThanks for applying to {{jobTitle}} at {{orgName}}. We have received your application and will be in touch. You can check your status any time here: {{statusLink}}\n\n{{recruiterName}}' },
  { key: 'moving_to_interview', name: 'Moving to interview', triggerEvent: 'interview', triggerMode: 'prompt',
    subject: 'Next steps for {{jobTitle}} at {{orgName}}',
    body: 'Hi {{candidateName}},\n\nGood news — we would like to move you forward to the interview stage for {{jobTitle}}. We will follow up shortly with details.\n\n{{recruiterName}}' },
  { key: 'offer', name: 'Offer', triggerEvent: 'offer', triggerMode: 'prompt',
    subject: 'An offer for {{jobTitle}} at {{orgName}}',
    body: 'Hi {{candidateName}},\n\nWe are delighted to move forward with an offer for {{jobTitle}}. Details to follow.\n\n{{recruiterName}}' },
  { key: 'not_moving_forward', name: 'Not moving forward', triggerEvent: 'rejected', triggerMode: 'prompt',
    subject: 'Update on your application for {{jobTitle}}',
    body: 'Hi {{candidateName}},\n\nThank you for your interest in {{jobTitle}} at {{orgName}}. After careful consideration we will not be moving forward at this time. We wish you the best.\n\n{{recruiterName}}' },
];
