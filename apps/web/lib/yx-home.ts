import type { LiveHome } from '@yukthix/ui/frame';

// GET /workspace/home (design audit step 2): the Home widgets, each present only when the person may see it.
export interface HomeWidgets {
  month: string;
  attendanceExceptions?: number;
  notReadyForPayroll?: { notReady: number; people: number; runId: string | null };
  openCases?: number;
  dueLocks?: { month: string; entityId: string; entityName: string; lockableFrom: string; exceptions: number; waiting: number }[];
  probationsDue?: { count: number; firstDue: string | null };
  joiners?: { id: string; name: string; on: string; department: string | null; location: string; openTasks: number }[];
  leavers?: { id: string; name: string; on: string; clearanceOpen: number }[];
}

const day = (iso: string, opts: Intl.DateTimeFormatOptions) => new Date(`${iso}T00:00:00Z`).toLocaleDateString('en-GB', { timeZone: 'UTC', ...opts });
const short = (iso: string) => day(iso, { day: 'numeric', month: 'short' });
const weekday = (iso: string) => day(iso, { weekday: 'short', day: 'numeric', month: 'short' });
const monthName = (m: string) => day(`${m}-01`, { month: 'long' });
const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

/** The live widgets in the designed Home's words (PLT-02 HR). Counts only: no trends until there is history. */
export function homeWidgets(w: HomeWidgets | undefined, today: string): Pick<LiveHome, 'stats' | 'due' | 'moves' | 'movesHref'> {
  if (!w) return {};
  const stats: NonNullable<LiveHome['stats']> = [];
  if (w.attendanceExceptions !== undefined) stats.push({ id: 'exceptions', title: 'Attendance exceptions', label: 'Attendance exceptions', value: w.attendanceExceptions, drill: { label: 'Resolve before lock', href: '/yx/time/muster' } });
  if (w.notReadyForPayroll) {
    const r = w.notReadyForPayroll;
    stats.push({ id: 'notReady', title: 'Not ready for payroll', label: 'Not ready for payroll', value: r.notReady, drill: { label: `See the ${r.notReady} of ${r.people}`, href: r.runId ? `/yx/payroll/runs/${encodeURIComponent(r.runId)}` : `/yx/payroll/runs?month=${w.month}` } });
  }
  if (w.openCases !== undefined) stats.push({ id: 'cases', title: 'Open cases', label: 'Open cases', value: w.openCases, drill: { label: 'View helpdesk', href: '/yx/desk/tickets' } });

  const due: NonNullable<LiveHome['due']> = (w.dueLocks ?? []).map((l) => {
    const open = l.lockableFrom <= today;
    const blockers = [l.exceptions ? `${plural(l.exceptions, 'exception')} still open` : '', l.waiting ? `${plural(l.waiting, 'request')} waiting` : ''].filter(Boolean).join(' · ');
    return {
      id: `lock-${l.entityId}`,
      text: `Lock ${monthName(l.month)} attendance, ${l.entityName}`,
      href: '/yx/time/periods',
      badge: open ? { label: 'Due now', tone: 'warning' } : { label: `From ${short(l.lockableFrom)}`, tone: 'neutral' },
      ...(blockers ? { note: blockers } : {}),
      action: 'Lock attendance',
    };
  });
  if (w.probationsDue) {
    const p = w.probationsDue;
    due.push({ id: 'probation', text: `Probation confirmations · ${p.count} due${p.firstDue ? ` from ${short(p.firstDue)}` : ''}`, href: '/yx/people/probation' });
  }

  const showMoves = w.joiners !== undefined || w.leavers !== undefined;
  const moves: NonNullable<LiveHome['moves']> = [
    ...(w.joiners ?? []).map((j) => ({
      id: `j-${j.id}`,
      name: j.name,
      secondary: `Joins ${weekday(j.on)} · ${j.department ?? j.location}`,
      badges: [j.openTasks ? { label: `${plural(j.openTasks, 'task')} open`, tone: 'warning' as const } : { label: 'All ready', tone: 'success' as const }],
    })),
    ...(w.leavers ?? []).map((l) => ({
      id: `l-${l.id}`,
      name: l.name,
      secondary: `Last day ${weekday(l.on)}`,
      badges: [l.clearanceOpen ? { label: `${plural(l.clearanceOpen, 'clearance item')} open`, tone: 'warning' as const } : { label: 'Clearance done', tone: 'success' as const }],
    })),
  ];
  return { stats, due, ...(showMoves ? { moves, movesHref: w.joiners !== undefined ? '/yx/people/onboarding' : undefined } : {}) };
}
