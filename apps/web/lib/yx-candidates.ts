import type { EmailTemplateChoice } from '@yukthix/ui/hiring';
import type { CandidateEmailTemplate } from './types';

// M10 AT4: candidate email templates as the YukthiX email dialog's choices. A built-in default template has no id; it
// gets a stable stand-in value and is sent as plain subject and body (templateId null), as the older modal did.
export const templateChoices = (templates: CandidateEmailTemplate[] | undefined): EmailTemplateChoice[] =>
  (templates ?? []).filter((t) => t.enabled !== false).map((t, i) => ({ value: t.id ?? `default-${i}`, label: t.name, subject: t.subject, body: t.body }));
