export interface InterviewMergeContext {
  candidateName: string;
  jobTitle: string;
  orgName: string;
  recruiterName: string;
  interviewTimes: string;
  interviewLocation: string;
  panelNames: string;
  confirmLink: string;
}

const TOKEN =
  /\{\{(candidateName|jobTitle|orgName|recruiterName|interviewTimes|interviewLocation|panelNames|confirmLink)\}\}/g;

export function renderInterviewTemplate(
  subject: string,
  body: string,
  ctx: InterviewMergeContext,
): { subject: string; body: string } {
  const sub = (s: string) => s.replace(TOKEN, (_m, k: keyof InterviewMergeContext) => ctx[k]);
  return { subject: sub(subject), body: sub(body) };
}

export function formatSlot(startsAt: Date, endsAt: Date, timeZone: string): string {
  const fmt = new Intl.DateTimeFormat('en-US', { dateStyle: 'full', timeStyle: 'short', timeZone });
  return `${fmt.format(startsAt)} – ${fmt.format(endsAt)} (${timeZone})`;
}
