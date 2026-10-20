import type { ExitListRow } from '@yukthix/ui/frame';
import type { ExitRow } from '@yukthix/ui/lifecycle';

// People › Exit cases (PPL-19) from the live API: pure mapping, unit-tested. Only open cases are listed (as designed);
// a case's stage follows where it stands: approval and notice, clearance, exit interview, F&F, documents.

const OPEN = new Set(['submitted', 'accepted', 'cleared']);

/** Where a case stands, in the design's five stages. */
export function exitStage(r: ExitRow): string {
  if (r.status === 'submitted') return 'Approval and notice';
  if (r.status === 'accepted' && r.clearance.open > 0) return 'Clearance';
  if (r.status === 'accepted' && r.interview === 'sent') return 'Exit interview';
  if (r.status === 'accepted' || r.status === 'cleared') return 'F&F';
  return 'Documents';
}

export function exitRows(rows: ExitRow[]): ExitListRow[] {
  return rows
    .filter((r) => OPEN.has(r.status))
    .map((r) => ({
      id: r.id,
      name: r.name,
      code: r.employeeCode ?? '',
      type: r.typeLabel,
      lwd: new Date(`${r.lastDay}T00:00:00`),
      stage: exitStage(r),
      manager: r.manager ?? '',
      flags: r.lettersHeld ? 'Letters held' : r.pendingChange ? 'Notice change waiting' : '',
      ...(r.lettersHeld || r.pendingChange ? { flagTone: 'warning' as const } : {}),
    }));
}
