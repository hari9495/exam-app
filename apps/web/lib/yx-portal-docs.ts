import type { LivePortalDoc } from '@yukthix/ui/pay';
import type { PayDocument } from '@yukthix/ui/pay';

/** GET …/portal/me of the pay documents portal: who the session is for and when access ends (YYYY-MM-DD). */
export interface PortalMe {
  company: string;
  name: string;
  /** The nominee's own name when a nominee signed in. */
  nominee: string | null;
  lastDay: string;
  accessUntil: string;
}

/** "2026-04" → "FY 2026-27" (the Indian financial year starts in April). */
export const financialYear = (month: string) => {
  const y = Number(month.slice(0, 4));
  const start = Number(month.slice(5, 7)) >= 4 ? y : y - 1;
  return `FY ${start}-${String((start + 1) % 100).padStart(2, '0')}`;
};

/** Pay documents as the T9-02 tabs show them: payslips, Form 16, and every other pay document with the letters. */
export function payPortalDocs(docs: PayDocument[]): LivePortalDoc[] {
  return docs.map((d) => ({
    id: d.id,
    kind: d.kind === 'payslip' ? 'Payslip' : d.kind === 'form16' ? 'Form 16' : 'Letter',
    title: `${d.title}${d.status === 'superseded' ? ' (replaced by a correction)' : ''}${d.purged ? ' (file deleted after the keeping period)' : ''}`,
    issuedOn: d.issuedAt.slice(0, 10),
    ...(d.month ? { period: financialYear(d.month) } : {}),
  }));
}
