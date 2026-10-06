import { Badge } from '../../components/display';
import type { ProbationStage, Ref, TeamMember } from './types';

// Pieces shared by the people-core screens.

export const refName = (r: Ref | null | undefined) => r?.name ?? '—';

/**
 * One CSV cell. Cells a spreadsheet would run as a formula get a leading apostrophe (OWASP CSV injection):
 * a formula sign, tab or CR first, also after leading whitespace (importers trim it) and in full-width form
 * (some importers fold it to ASCII). Quotes are doubled.
 */
export function csvCell(value: string | number | null | undefined): string {
  let s = value === null || value === undefined ? '' : String(value);
  if (/^[\t\r]|^\s*[=+\-@\uFF1D\uFF0B\uFF0D\uFF20]/.test(s)) s = `'${s}`;
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

export const csvText = (rows: (string | number | null | undefined)[][]) => rows.map((r) => r.map(csvCell).join(',')).join('\r\n') + '\r\n';

/** Saves text as a file in the browser (no server round trip). */
export function downloadText(fileName: string, text: string, type = 'text/csv;charset=utf-8') {
  const url = URL.createObjectURL(new Blob([text], { type }));
  const a = document.createElement('a');
  a.href = url;
  a.download = fileName;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

export const RELATION_LABEL: Record<TeamMember['relation'], string> = { direct: 'Reports to you', indirect: 'In your team', dotted: 'Dotted line' };

const STAGE: Record<ProbationStage, { label: string; tone: 'warning' | 'danger' | 'info' | 'success' | 'neutral' }> = {
  running: { label: 'On probation', tone: 'neutral' },
  review_due: { label: 'Review due', tone: 'warning' },
  overdue: { label: 'Past the end date', tone: 'danger' },
  extended: { label: 'Extended', tone: 'info' },
  awaiting_approval: { label: 'Confirmation waiting', tone: 'info' },
  confirmed: { label: 'Confirmed', tone: 'success' },
};

export function StageBadge({ stage }: { stage: ProbationStage }) {
  return <Badge tone={STAGE[stage].tone}>{STAGE[stage].label}</Badge>;
}
