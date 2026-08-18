export interface MergeContext {
  candidateName: string;
  jobTitle: string;
  orgName: string;
  recruiterName: string;
  statusLink: string;
}

const TOKEN = /\{\{(candidateName|jobTitle|orgName|recruiterName|statusLink)\}\}/g;

export function renderTemplate(subject: string, body: string, ctx: MergeContext): { subject: string; body: string } {
  const sub = (s: string) => s.replace(TOKEN, (_m, k: keyof MergeContext) => ctx[k]);
  return { subject: sub(subject), body: sub(body) };
}

export function templateReferencesStatusLink(subject: string, body: string): boolean {
  return /\{\{statusLink\}\}/.test(subject) || /\{\{statusLink\}\}/.test(body);
}

function escapeHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

/** Branded shell generalized from buildAssessmentEmailHtml (invitations.service.ts).
 *  bodyText is the already-rendered plain-text message; newlines become <br />. */
export function buildCandidateEmailHtml(opts: { logoUrl: string | null; orgName: string | null; bodyText: string }): string {
  const logoHtml = opts.logoUrl ? `<p><img src="${opts.logoUrl}" alt="Organization logo" height="40" /></p>` : '';
  const bodyHtml = escapeHtml(opts.bodyText).replace(/\r?\n/g, '<br />');
  return (
    `${logoHtml}<div>${bodyHtml}</div>` +
    `<p>Best regards,<br/>${opts.orgName ?? 'The Hiring Team'}</p>` +
    `<p style="color:#666666;font-size:12px;">This message was sent from an unmonitored address - please do not reply to it.</p>`
  );
}
