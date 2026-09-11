export interface DefaultWhatsappTemplate {
  key: string;
  name: string;
  // A default-pipeline stage NAME (not a real per-org PipelineStage id -- these are code
  // constants shared across every org). CandidateWhatsappTemplatesService resolves this against
  // each org's default pipeline to line it up with saved rows, which key on triggerStageId.
  triggerEvent: string | null;
  triggerMode: 'manual' | 'prompt' | 'auto';
  body: string;
}

export const DEFAULT_WHATSAPP_TEMPLATES: DefaultWhatsappTemplate[] = [
  { key: 'application_received', name: 'Application received', triggerEvent: 'applied', triggerMode: 'manual',
    body: 'Hi {{candidateName}}, thanks for applying to {{jobTitle}} at {{orgName}}. We will be in touch. - {{recruiterName}}' },
  { key: 'moving_to_interview', name: 'Moving to interview', triggerEvent: 'interview', triggerMode: 'prompt',
    body: 'Hi {{candidateName}}, good news - we would like to move you forward to the interview stage for {{jobTitle}}. - {{recruiterName}}' },
  { key: 'offer', name: 'Offer', triggerEvent: 'offer', triggerMode: 'prompt',
    body: 'Hi {{candidateName}}, we are delighted to move forward with an offer for {{jobTitle}}. Details to follow. - {{recruiterName}}' },
  { key: 'not_moving_forward', name: 'Not moving forward', triggerEvent: 'rejected', triggerMode: 'prompt',
    body: 'Hi {{candidateName}}, thank you for your interest in {{jobTitle}} at {{orgName}}. We will not be moving forward at this time. - {{recruiterName}}' },
];
