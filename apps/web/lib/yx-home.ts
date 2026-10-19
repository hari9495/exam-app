import type { ActionItem } from '@yukthix/ui';
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
  /** People with a hiring key (recruiter Home). Each part is absent when the person may not open its page. */
  hiring?: HiringHome;
}

export interface HiringHome {
  scorecardsDue?: { interviewId: string; candidate: string; job: string; endedAt: string }[];
  interviewsToday?: { interviewId: string; candidate: string; job: string; at: string }[];
  offers?: { offerId: string; entryId: string; jobId: string; candidate: string; job: string; status: string; action: 'approve' | 'send' }[];
  waiting?: { entryId: string; jobId: string; candidate: string; job: string; stage: string; since: string }[];
  week?: { applied: number; interview: number; offers: number; hired: number };
  jobs?: { id: string; title: string; stages: { name: string; count: number }[] }[];
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

const enc = encodeURIComponent;
const application = (jobId: string, entryId: string) => `/yx/hiring/jobs/${enc(jobId)}?entry=${enc(entryId)}`;

/** The recruiter Home: its action rows (each opening the hiring page that handles it) and its widgets. */
export function hiringHome(h: HiringHome | undefined, now: Date): { actions: ActionItem[]; view?: NonNullable<LiveHome['hiring']> } {
  if (!h) return { actions: [] };
  const actions: ActionItem[] = [
    ...(h.scorecardsDue ?? []).map((r) => ({
      id: `sc-${r.interviewId}`, type: 'Scorecard', title: `Write your scorecard · ${r.job}`, who: r.candidate, kind: 'review' as const,
      note: `Interview on ${new Date(r.endedAt).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })}`, actionLabel: 'Write scorecard', href: `/yx/hiring/interviews/${enc(r.interviewId)}`,
    })),
    ...(h.offers ?? []).map((o) => ({
      id: `of-${o.offerId}`, type: 'Offer', title: `${o.action === 'approve' ? 'Approve' : 'Send'} the offer · ${o.job}`, who: o.candidate, kind: 'review' as const,
      note: o.action === 'approve' ? 'Waiting for your approval' : o.status === 'approved' ? 'Approved, not sent yet' : 'Not sent yet', actionLabel: 'Open', href: application(o.jobId, o.entryId),
    })),
    ...(h.waiting ?? []).map((w) => ({
      id: `wt-${w.entryId}`, type: 'Waiting', title: `${plural(Math.floor((now.getTime() - Date.parse(w.since)) / 86_400_000), 'day')} in ${w.stage} · ${w.job}`, who: w.candidate, kind: 'review' as const,
      actionLabel: 'Open', href: application(w.jobId, w.entryId),
    })),
  ];
  const view: NonNullable<LiveHome['hiring']> = {
    interviewsToday: (h.interviewsToday ?? []).map((i) => ({ id: i.interviewId, at: new Date(i.at), candidate: i.candidate, job: i.job, href: `/yx/hiring/interviews/${enc(i.interviewId)}` })),
    interviewsHref: '/yx/hiring/interviews',
    ...(h.week ? { week: h.week } : {}),
    ...(h.jobs ? { jobs: h.jobs.map((j) => ({ ...j, href: `/yx/hiring/jobs/${enc(j.id)}` })) } : {}),
    jobsHref: '/yx/hiring/jobs',
  };
  return { actions, view };
}
