import type { ActionItem } from '@yukthix/ui';
import type { LiveHome } from '@yukthix/ui/frame';
import type { MyAttendance, MyLeave, Muster, TeamCalendar } from '@yukthix/ui/time';

// GET /workspace/home (design audit step 2, home parity 19 Oct 2026): the Home widgets, each present only when the
// person may see it.
export interface HomeWidgets {
  month: string;
  attendanceExceptions?: number;
  notReadyForPayroll?: { notReady: number; people: number; runId: string | null; noRun?: boolean };
  openCases?: number;
  joining?: number;
  dueLocks?: { month: string; entityId: string; entityName: string; lockableFrom: string; exceptions: number; waiting: number }[];
  probationsDue?: { count: number; firstDue: string | null };
  contractsEnding?: { count: number; lastOn: string };
  joiners?: { id: string; name: string; on: string; department: string | null; location: string; openTasks: number; pendingTasks?: string[] }[];
  leavers?: { id: string; name: string; on: string; clearanceOpen: number; pendingClearance?: string[] }[];
  /** Birthdays and work anniversaries this week in the person's circle. */
  celebrations?: { id: string; name: string; kind: 'birthday' | 'anniversary'; on: string; years?: number }[];
  /** Last month's numbers, only where one is on record. */
  previous?: { month: string; attendanceExceptions?: number; notReadyForPayroll?: number; openCases?: number; joining?: number };
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
const CLEARANCE: Record<string, string> = { it: 'IT', admin: 'Admin', asset: 'Assets', finance: 'Finance', hr: 'HR', manager_handover: 'Handover' };

/** GET /payroll/me/home-pay: shown only when the company turned "Show net pay on the employee home" on. */
export type HomePayResponse = { shown: false } | { shown: true; latest: { id: string; month: string; net: string } | null; previous: { month: string; net: string } | null };

/** The employee's own net pay card (PLT-02 "HR shows pay"), or nothing when the company keeps pay off Home. */
export function homePay(r: HomePayResponse | undefined): LiveHome['pay'] {
  if (!r?.shown) return undefined;
  if (!r.latest) return { label: 'Net pay', value: null, href: '/yx/me/payslips' };
  return {
    label: `Net pay, ${monthName(r.latest.month)}`,
    value: Number(r.latest.net),
    ...(r.previous ? { previous: Number(r.previous.net), previousLabel: monthName(r.previous.month) } : {}),
    href: '/yx/me/payslips',
  };
}

/** The live HR widgets in the designed Home's words (PLT-02 HR): the four count cards, due dates, joiners and leavers. */
export function homeWidgets(w: HomeWidgets | undefined, today: string): Pick<LiveHome, 'stats' | 'due' | 'moves' | 'movesHref'> {
  if (!w) return {};
  const stats: NonNullable<LiveHome['stats']> = [];
  const p = w.previous;
  const vs = (n: number | undefined) => (n === undefined || !p ? {} : { previous: n, previousLabel: monthName(p.month) });
  if (w.attendanceExceptions !== undefined) stats.push({ id: 'exceptions', title: 'Attendance exceptions', label: 'Attendance exceptions', value: w.attendanceExceptions, ...vs(p?.attendanceExceptions), drill: { label: 'Resolve before lock', href: '/yx/time/muster' } });
  if (w.notReadyForPayroll) {
    const r = w.notReadyForPayroll;
    stats.push(
      r.noRun
        ? { id: 'notReady', title: 'Not ready for payroll', label: 'Not ready for payroll', value: 0, empty: `No payroll run for ${monthName(w.month)} yet`, drill: { label: 'Open payroll runs', href: `/yx/payroll/runs?month=${w.month}` } }
        : { id: 'notReady', title: 'Not ready for payroll', label: 'Not ready for payroll', value: r.notReady, ...vs(p?.notReadyForPayroll), drill: { label: `See the ${r.notReady} of ${r.people}`, href: r.runId ? `/yx/payroll/runs/${encodeURIComponent(r.runId)}` : `/yx/payroll/runs?month=${w.month}` } },
    );
  }
  if (w.openCases !== undefined) stats.push({ id: 'cases', title: 'Open cases', label: 'Open cases', value: w.openCases, ...vs(p?.openCases), drill: { label: 'View helpdesk', href: '/yx/desk/tickets' } });
  if (w.joining !== undefined) stats.push({ id: 'joins', title: `Joining in ${monthName(w.month)}`, label: `Joining in ${monthName(w.month)}`, value: w.joining, ...vs(p?.joining), drill: { label: 'View onboarding', href: '/yx/people/onboarding' } });

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
    const pd = w.probationsDue;
    due.push({ id: 'probation', text: `Probation confirmations · ${pd.count} due${pd.firstDue ? ` from ${short(pd.firstDue)}` : ''}`, href: '/yx/people/probation' });
  }
  if (w.contractsEnding) due.push({ id: 'contracts', text: `Fixed-term contracts ending by ${short(w.contractsEnding.lastOn)} · ${plural(w.contractsEnding.count, 'person', 'people')}`, href: '/yx/people/upcoming-exits' });

  const showMoves = w.joiners !== undefined || w.leavers !== undefined;
  const moves: NonNullable<LiveHome['moves']> = [
    ...(w.joiners ?? []).map((j) => {
      const pending = j.pendingTasks ?? [];
      const more = j.openTasks - pending.length;
      return {
        id: `j-${j.id}`,
        name: j.name,
        secondary: `Joins ${weekday(j.on)} · ${j.department ?? j.location}`,
        badges: j.openTasks
          ? [...pending.map((t) => ({ label: `${t}: pending`, tone: 'warning' as const })), ...(more > 0 ? [{ label: `${more} more pending`, tone: 'warning' as const }] : [])]
          : [{ label: 'All ready', tone: 'success' as const }],
      };
    }),
    ...(w.leavers ?? []).map((l) => {
      const pending = l.pendingClearance ?? [];
      return {
        id: `l-${l.id}`,
        name: l.name,
        secondary: `Last day ${weekday(l.on)}`,
        badges: l.clearanceOpen
          ? pending.length
            ? pending.map((d) => ({ label: `${CLEARANCE[d] ?? d} clearance pending`, tone: 'warning' as const }))
            : [{ label: `${plural(l.clearanceOpen, 'clearance item')} open`, tone: 'warning' as const }]
          : [{ label: 'Clearance done', tone: 'success' as const }],
      };
    }),
  ];
  return { stats, due, ...(showMoves ? { moves, movesHref: w.joiners !== undefined ? '/yx/people/onboarding' : undefined } : {}) };
}

const PRESENT = new Set(['present', 'half_day']);
const prevMonthOf = (m: string) => new Date(Date.UTC(Number(m.slice(0, 4)), Number(m.slice(5, 7)) - 2, 1)).toISOString().slice(0, 7);

/**
 * The employee Home's count cards (PLT-02 employee): earned leave left, days present and late marks this month (with
 * last month from the attendance record), and the person's requests still waiting.
 */
export function employeeStats(input: { leave?: MyLeave; now?: MyAttendance; before?: MyAttendance; waiting?: number }): NonNullable<LiveHome['stats']> {
  const out: NonNullable<LiveHome['stats']> = [];
  const earned = input.leave?.balances.find((b) => b.kind === 'earned' && b.hasBalance);
  if (earned)
    out.push({
      id: 'leave', title: 'Leave balance', label: `${earned.name} left`, value: earned.available, unit: 'days',
      ...(earned.atYearStart !== undefined && input.leave ? { previous: earned.atYearStart, previousLabel: day(input.leave.year.start, { day: 'numeric', month: 'short' }) } : {}),
      drill: { label: 'View balances', href: '/yx/time/leave' },
    });
  const n = input.now;
  if (n) {
    const month = n.today.slice(0, 7);
    const upTo = (a: MyAttendance) => a.days.filter((d) => d.on <= a.today);
    const present = (a: MyAttendance) => upTo(a).filter((d) => PRESENT.has(d.status)).length;
    const late = (a: MyAttendance) => upTo(a).filter((d) => (d.lateMinutes ?? 0) > 0).length;
    // Last month is on record only when the person's record starts in its first week (not a lone leave day).
    const b = input.before?.days.some((d) => d.on.slice(8) <= '07') ? input.before : undefined;
    const vs = (x: number | undefined) => (x === undefined ? {} : { previous: x, previousLabel: monthName(prevMonthOf(month)) });
    out.push({ id: 'present', title: 'Days present', label: `Days present in ${monthName(month)}`, value: present(n), ...vs(b && present(b)), drill: { label: 'View attendance', href: '/yx/time/attendance' } });
    out.push({ id: 'late', title: 'Late marks', label: 'Late marks this month', value: late(n), ...vs(b && late(b)), drill: { label: 'View late marks', href: '/yx/time/attendance' } });
  }
  if (input.waiting !== undefined) out.push({ id: 'requests', title: 'My requests', label: 'Requests pending', value: input.waiting, drill: { label: input.waiting ? `View ${plural(input.waiting, 'request')}` : 'View my requests', href: '/yx/me/requests' } });
  return out;
}

const NOT_IN = new Set(['missing_in', 'absent']);

/** Monday of the week that holds `iso`, and the seven days. */
export function weekOf(iso: string): string[] {
  const d = new Date(`${iso}T00:00:00Z`);
  const monday = new Date(d.getTime() - ((d.getUTCDay() + 6) % 7) * 86_400_000);
  return Array.from({ length: 7 }, (_, i) => new Date(monday.getTime() + i * 86_400_000).toISOString().slice(0, 10));
}

/**
 * The manager Home (PLT-02 manager): team today and late check-ins from the muster (this week against last week, both on
 * record), who's off this week from the team calendar, reviews to write, probation reviews due and the next 1:1s.
 */
export function managerHome(input: {
  today: string;
  muster?: Muster;
  /** The previous month's muster, when this week starts in it. */
  musterBefore?: Muster;
  calendar?: TeamCalendar;
  reviews?: { id: string; employee: string; next: { stage: string } }[];
  probations?: { employeeId: string; name: string; reviewDueOn: string | null; confirmedFrom: string | null; pendingConfirmationId: string | null }[];
  meetings?: { id: string; with: string; on: string; status: string; role: string }[];
}): Pick<LiveHome, 'team' | 'off' | 'offHref' | 'goals' | 'stats'> {
  const { today } = input;
  const out: Pick<LiveHome, 'team' | 'off' | 'offHref' | 'goals' | 'stats'> = {};
  const stats: NonNullable<LiveHome['stats']> = [];
  const people = (input.muster?.people ?? []).filter((p) => !p.me);
  if (input.muster && people.length) {
    const todayOf = (p: (typeof people)[number]) => p.days.find((d) => d.on === today);
    const onLeave = people.filter((p) => todayOf(p)?.status === 'leave');
    // While the day is still on, the day engine says "not started" for everyone: checked in or not is the first punch.
    const open = (p: (typeof people)[number], checkedIn: boolean) => todayOf(p)?.status === 'not_started' && Boolean(todayOf(p)?.firstIn) === checkedIn;
    const notIn = people.filter((p) => NOT_IN.has(todayOf(p)?.status ?? '') || open(p, false));
    const late = people.filter((p) => (todayOf(p)?.lateMinutes ?? 0) > 0);
    const inToday = people.filter((p) => ['present', 'half_day', 'missing_out'].includes(todayOf(p)?.status ?? '') || open(p, true));
    out.team = {
      summary: `${inToday.length} in · ${onLeave.length} on leave · ${notIn.length} not checked in · ${late.length} late`,
      total: people.length,
      href: '/yx/time/muster',
      // Nudge (PLT-02): someone not checked in yet can be reminded; the API checks scope and the day again.
      rows: [...notIn.map((p) => ({ id: p.id, name: p.name, secondary: 'Not checked in', nudge: true })), ...onLeave.map((p) => ({ id: p.id, name: p.name, secondary: 'On leave today' }))].slice(0, 4),
    };
    const week = weekOf(today);
    const lastWeek = week.map((d) => new Date(new Date(`${d}T00:00:00Z`).getTime() - 7 * 86_400_000).toISOString().slice(0, 10));
    const all = [...people, ...(input.musterBefore?.people ?? []).filter((p) => !p.me)];
    const lates = (days: string[]) => all.reduce((n, p) => n + p.days.filter((d) => days.includes(d.on) && (d.lateMinutes ?? 0) > 0).length, 0);
    // Last week is on record only when the musters cover all of it.
    const from = input.musterBefore?.from ?? input.muster.from;
    const covered = (d: string) => d >= from;
    stats.push({ id: 'late', title: 'Late', label: 'Late check-ins this week', value: lates(week.filter((d) => d <= today)), ...(lastWeek.every(covered) ? { previous: lates(lastWeek), previousLabel: 'last week' } : {}), drill: { label: 'View late marks', href: '/yx/time/muster' } });
  }
  if (input.calendar) {
    const week = weekOf(today);
    out.off = week
      .map((d) => {
        const who = input.calendar!.people.filter((p) => !p.me).flatMap((p) => p.days.filter((x) => x.on === d).map((x) => `${p.name}${x.status === 'pending' ? ' (asked, pending)' : ''}`));
        return { day: `${day(d, { weekday: 'short', day: 'numeric' })}${d === today ? ' · today' : ''}`, who: [...new Set(who)].join(', ') };
      })
      .filter((r) => r.who);
    out.offHref = '/yx/time/team';
  }
  if (input.reviews) {
    const toWrite = input.reviews.filter((r) => r.next.stage === 'manager');
    stats.push({ id: 'reviews', title: 'Reviews', label: 'Reviews to write', value: toWrite.length, drill: { label: 'Open reviews', href: '/yx/performance/reviews' } });
  }
  const month = today.slice(0, 7);
  const dueProbations = (input.probations ?? []).filter((r) => !r.confirmedFrom && !r.pendingConfirmationId && r.reviewDueOn);
  if (input.probations) stats.push({ id: 'probation', title: 'Probation', label: `Probation reviews due in ${monthName(month)}`, value: dueProbations.filter((r) => r.reviewDueOn!.startsWith(month)).length, drill: { label: 'View probations', href: '/yx/people/probation' } });
  if (input.meetings || input.probations) {
    const soon = (input.meetings ?? []).filter((m) => m.status === 'planned' && m.on >= today).sort((a, b) => a.on.localeCompare(b.on));
    out.goals = [
      ...soon.slice(0, 2).map((m) => ({ text: `1:1 with ${m.with} · ${m.on === today ? 'today' : short(m.on)}`, href: `/yx/performance/one-on-ones/${encodeURIComponent(m.id)}` })),
      ...dueProbations.sort((a, b) => a.reviewDueOn!.localeCompare(b.reviewDueOn!)).slice(0, 2).map((r) => ({ text: `Probation review for ${r.name} · due ${short(r.reviewDueOn!)}`, href: '/yx/people/probation' })),
    ];
  }
  if (stats.length) out.stats = stats;
  return out;
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

/** "My tasks" (PLT-02 employee): checklist tasks given to the person, feedback asked of them and their own self-review. */
export function myTasks(input: {
  checklist?: { id: string; title: string; dueOn: string }[];
  feedback?: { id: string; employee: string; dueOn: string | null; open: boolean; done: boolean }[];
  reviews?: { id: string; cycle: string; next: { stage: string; dueOn?: string | null } }[];
}): { text: string; href: string }[] | undefined {
  if (!input.checklist && !input.feedback && !input.reviews) return undefined;
  const by = (d: string | null | undefined) => (d ? ` by ${short(d)}` : '');
  return [
    ...(input.reviews ?? []).filter((r) => r.next.stage === 'self').map((r) => ({ text: `Write your self-review for ${r.cycle}${by(r.next.dueOn)}`, href: `/yx/performance/reviews/${encodeURIComponent(r.id)}` })),
    ...(input.feedback ?? []).filter((f) => f.open && !f.done).map((f) => ({ text: `Give feedback on ${f.employee}${by(f.dueOn)}`, href: '/yx/performance/feedback-tasks' })),
    ...(input.checklist ?? []).map((t) => ({ text: `${t.title}${by(t.dueOn)}`, href: '/yx/people/my-tasks' })),
  ].slice(0, 4);
}

/** "Coming up" (PLT-02): birthdays and work anniversaries this week in the person's circle, then the next two holidays. */
export function comingUp(celebrations: { id: string; name: string; kind: 'birthday' | 'anniversary'; on: string; years?: number }[] | undefined, holidays: { id: string; on: string; name: string; kind: string }[] | undefined, today: string): NonNullable<LiveHome['coming']> | undefined {
  if (!celebrations && !holidays) return undefined;
  const when = (on: string) => (on === today ? 'today' : `on ${weekday(on)}`);
  return [
    ...(celebrations ?? []).map((c) => ({ id: c.id, kind: 'person' as const, name: c.name, text: c.kind === 'birthday' ? `Birthday ${when(c.on)}` : `${plural(c.years ?? 1, 'year')} here ${when(c.on)}` })),
    ...(holidays ?? []).filter((h) => h.on >= today && h.kind !== 'optional').slice(0, 2).map((h) => ({ id: `h-${h.id}`, kind: 'holiday' as const, name: h.name, text: `Holiday · ${day(h.on, { day: 'numeric', month: 'short', year: 'numeric' })}` })),
  ];
}
