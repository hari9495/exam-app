export interface OfferMergeContext {
  candidateName: string;
  jobTitle: string;
  orgName: string;
  recruiterName: string;
  compensation: string;
  startDate: string;
  offerExpiry: string;
  offerLink: string;
}

const TOKEN =
  /\{\{(candidateName|jobTitle|orgName|recruiterName|compensation|startDate|offerExpiry|offerLink)\}\}/g;

export function renderOfferTemplate(
  subject: string,
  body: string,
  ctx: OfferMergeContext,
): { subject: string; body: string } {
  const sub = (s: string) => s.replace(TOKEN, (_m, k: keyof OfferMergeContext) => ctx[k]);
  return { subject: sub(subject), body: sub(body) };
}
