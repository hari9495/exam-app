'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { formatDate, type ActionItem, type BadgeTone } from '@yukthix/ui';
import type { ApprovalTask } from '@yukthix/ui/desk';
import type { LiveHome, LiveMobileHome, LiveRequestTypePicker, LiveMobileMe, LiveMobileMore, LiveMobilePay, LiveMobileRequests, LiveMobileTime } from '@yukthix/ui/frame';
import type { MyAttendance, MyLeave } from '@yukthix/ui/time';
import type { MineRow } from './yx-me-pages';
import type { NavArea } from './yx-nav';
import { newRequestTypes } from './yx-palette';

// T2-H (answer 2741): at phone width the live pages render their designed phone screens, with the same data and calls.

/** The kit's phone width (shell.css): below it the frame shows the bottom tabs instead of the rail and panel. */
export const PHONE_QUERY = '(max-width: 767px)';

/** True below the phone width, false above it, null until the browser has said (the first render); follows resizing. */
export function usePhone(): boolean | null {
  const [phone, setPhone] = useState<boolean | null>(null);
  useEffect(() => {
    const m = window.matchMedia?.(PHONE_QUERY);
    if (!m) return setPhone(false);
    setPhone(m.matches);
    const on = (e: MediaQueryListEvent) => setPhone(e.matches);
    m.addEventListener('change', on);
    return () => m.removeEventListener('change', on);
  }, []);
  return phone;
}

export type PhoneTab = 'home' | 'time' | 'requests' | 'pay' | 'me';

/** The phone tab landings (T2-H): on a desk they move on to the page the desk menu has. */
export const PHONE_TABS = { home: '/yx/home', time: '/yx/time', requests: '/yx/requests', pay: '/yx/me/pay', me: '/yx/me' } as const;

/** A tab landing opened on a desk moves on to the desk page (replacing it, so Back skips it). Returns usePhone(). */
export function usePhoneLanding(deskHref: string): boolean | null {
  const phone = usePhone();
  const router = useRouter();
  useEffect(() => {
    if (phone === false) router.replace(deskHref);
  }, [phone, deskHref, router]);
  return phone;
}

const under = (pathname: string, ...prefixes: string[]) => prefixes.some((p) => pathname === p || pathname.startsWith(`${p}/`));

/** The bottom tab a page belongs to (lit on the tab bar); undefined for the areas that live under Me › More. */
export function phoneTab(pathname: string): PhoneTab | undefined {
  if (under(pathname, '/yx/home', '/yx/search', '/yx/notifications')) return 'home';
  if (under(pathname, '/yx/requests', '/yx/approvals', '/yx/me/requests', '/yx/me/delegation')) return 'requests';
  if (under(pathname, '/yx/time')) return 'time';
  if (under(pathname, '/yx/me/pay', '/yx/me/payslips', '/yx/me/tax', '/yx/me/tax-declarations', '/yx/me/loans', '/yx/me/earned-pay', '/yx/expenses')) return 'pay';
  if (under(pathname, '/yx/me', '/yx/people/profile')) return 'me';
  return undefined;
}

const links = (nav: NavArea[]) => nav.flatMap((a) => a.sections.flatMap((s) => s.items));
/** Where a menu entry goes, when the person's menu has it. */
export const navHref = (nav: NavArea[], id: string): string | undefined => links(nav).find((l) => l.id === id)?.href;

type Row<T extends string> = { id: T; title: string; sub?: string; href: string };
/** Rows whose page is in the person's menu, in order; the others are left out. */
function rows<T extends string>(nav: NavArea[], spec: [T, string, string, string?][]): Row<T>[] {
  return spec.flatMap(([id, navId, title, sub]) => {
    const href = navHref(nav, navId);
    return href ? [{ id, title, href, ...(sub ? { sub } : {}) }] : [];
  });
}

/** The Me tab's groups: About me, Growth, Help and Settings, from the person's own menu. */
export function meGroups(nav: NavArea[]): LiveMobileMe['groups'] {
  // Delegation is an avatar-menu page outside a support session; Approvals is in the menu exactly then.
  const own = Boolean(navHref(nav, 'approvals'));
  return [
    { label: 'About me', rows: rows(nav, [['profile', 'profile', 'Profile'], ['documents', 'my-documents', 'Documents and letters'], ['policies', 'desk-policies', 'Policies']]) },
    { label: 'Growth', rows: rows(nav, [['goals', 'goals', 'Goals, feedback and 1:1s'], ['learning', 'my-learning', 'Learning and my tests'], ['jobs', 'hiring-internal-jobs', 'Internal jobs and referrals']]) },
    { label: 'Help', rows: rows(nav, [['help', 'desk-help', 'Help centre and my tickets'], ['speakup', 'desk-speakup', 'Speak up', 'Grievance, POSH or ethics concern'], ['accident', 'desk-accident', 'Report an accident', "An injury at work, yours or someone else's"]]) },
    {
      label: 'Settings',
      rows: [
        ...rows(nav, [['visitors', 'visitors-invites', 'My visitors']]),
        ...(own ? [{ id: 'delegation', title: 'Delegation', href: '/yx/me/delegation' }] : []),
        ...rows(nav, [['privacy', 'my-data', 'Privacy', 'My data, who accessed my data']]),
        { id: 'settings', title: 'Settings and security', href: '/yx/me/settings' },
        { id: 'more', title: 'More', sub: 'Other areas of your menu', href: '/yx/me/more' },
      ],
    },
  ];
}

/** Me › More: every area of the person's menu that has no tab of its own, opening its first page. */
export function moreAreas(nav: NavArea[]): LiveMobileMore['areas'] {
  const TABBED = ['home', 'time', 'pay', 'settings'];
  return nav
    .filter((a) => !TABBED.includes(a.id))
    .flatMap((a) => {
      const first = a.sections.flatMap((s) => s.items)[0];
      return first ? [{ id: a.id, title: a.title, href: first.href }] : [];
    });
}

const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

/** The Time tab from my attendance and my leave (the same calls as My attendance and My leave). */
export function timeTab(nav: NavArea[], attendance: MyAttendance | undefined, leave: MyLeave | undefined): Pick<LiveMobileTime, 'attendance' | 'balances' | 'applyLeaveHref' | 'leave'> {
  const today = attendance?.today ?? '';
  const past = (attendance?.days ?? []).filter((d) => d.on < today);
  const late = past.filter((d) => (d.lateMinutes ?? 0) > 0).length;
  const missing = past.filter((d) => (d.status === 'missing_in' || d.status === 'missing_out') && !d.regularised).length;
  const att = navHref(nav, 'my-attendance');
  const attendanceRows: LiveMobileTime['attendance'] = [
    ...(att ? [{ id: 'attendance' as const, title: 'My attendance', href: att, ...(attendance ? { sub: `${plural(late, 'late mark')} · ${plural(missing, 'missing punch', 'missing punches')} this month` } : {}), ...(missing ? { fix: missing } : {}) }] : []),
    ...(att ? [{ id: 'requests' as const, title: 'Regularise, WFH, on-duty, OT', href: `${att}?request=regularise` }] : []),
    ...rows(nav, [['shifts', 'my-shifts', 'My shifts and swaps'], ['timesheet', 'my-timesheet', 'Timesheets'], ['open-shifts', 'open-shifts', 'Open shifts']]),
  ];
  const myLeave = navHref(nav, 'my-leave');
  return {
    attendance: attendanceRows,
    balances: (leave?.balances ?? []).filter((b) => b.hasBalance).slice(0, 4).map((b) => ({ name: b.name, value: b.available })),
    ...(myLeave ? { applyLeaveHref: `${myLeave}?apply=1` } : {}),
    leave: myLeave && leave?.holidays.calendar?.optionalLimit ? [{ id: 'holidays', title: 'Optional holidays', sub: `Choose ${leave.holidays.calendar.optionalLimit}`, href: myLeave }] : [],
  };
}

/** The Pay tab rows: the person's own pay pages in their menu. */
export function payRows(nav: NavArea[]): LiveMobilePay['rows'] {
  return rows(nav, [
    ['payslips', 'my-payslips', 'Payslips and YTD', 'Raise a query from any payslip'],
    ['tax', 'my-tax', 'Tax'],
    ['loans', 'my-loans', 'Loans and salary advances'],
    ['expenses', 'expenses', 'Expenses, trips and advances'],
    ['ewa', 'my-ewa', 'Earned wage access'],
  ]);
}

const REQ_TONE: Record<string, BadgeTone> = { pending: 'info', approved: 'success', rejected: 'danger', withdrawn: 'neutral', cancelled: 'neutral' };
const REQ_LABEL: Record<string, string> = { pending: 'Pending', approved: 'Approved', rejected: 'Rejected', withdrawn: 'Withdrawn', cancelled: 'Withdrawn' };
const onDay = (iso: string) => new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'Asia/Kolkata' });

const istDay = (d: Date) => new Date(d.getTime() + 330 * 60_000).toISOString().slice(0, 10);

/** Requests › Mine: the newest first, each opening My requests. */
export function mineRows(rows: MineRow[]): LiveMobileRequests['mine'] {
  return [...rows]
    .sort((a, b) => b.submittedAt.localeCompare(a.submittedAt))
    .map((r) => ({
      id: r.requestId,
      title: r.title,
      sub: r.status === 'pending' ? (r.waitingOn.length ? `With ${r.waitingOn.join(', ')} since ${onDay(r.submittedAt)}` : `Sent ${onDay(r.submittedAt)}`) : r.decidedAt ? `${REQ_LABEL[r.status] ?? 'Decided'} ${onDay(r.decidedAt)}` : `Sent ${onDay(r.submittedAt)}`,
      status: REQ_LABEL[r.status] ?? 'Pending',
      tone: REQ_TONE[r.status] ?? 'info',
      href: '/yx/me/requests',
    }));
}

/** Requests › Team: what waits for the person's decision, the soonest due first, each opening Approvals. */
export function teamRows(tasks: ApprovalTask[], now: Date): NonNullable<LiveMobileRequests['team']> {
  const day = 86_400_000;
  return [...tasks]
    .sort((a, b) => (a.dueAt ?? '9999').localeCompare(b.dueAt ?? '9999'))
    .map((t) => {
      // Calendar days in India time; past its time is overdue even on the day itself.
      const due = t.dueAt ? new Date(t.dueAt) : null;
      const left = due ? (due < now ? -1 : Math.round((Date.parse(istDay(due)) - Date.parse(istDay(now))) / day)) : null;
      return {
        id: t.taskId,
        title: `${t.type} · ${t.person ?? t.requester}`,
        sub: t.title,
        ...(left === null ? {} : { due: left < 0 ? 'Overdue' : left === 0 ? 'Due today' : `Due in ${plural(left, 'day')}`, dueSoon: left <= 1 }),
        href: '/yx/approvals',
      };
    });
}


/** Home's To do: what waits for the person (Needs your action), then their own tasks, each opening its page. */
export function homeTodos(actions: ActionItem[], tasks: LiveHome['tasks'], now: Date): LiveMobileHome['todos'] {
  return [
    ...actions.map((a) => {
      const today = a.due ? istDay(a.due) <= istDay(now) : false;
      return { id: a.id, title: `${a.type} · ${a.who}`, sub: a.title, href: a.href ?? '/yx/approvals', ...(a.due ? { due: today ? 'Due today' : `Due ${formatDate(a.due)}`, dueToday: today } : {}) };
    }),
    ...(tasks ?? []).map((t, i) => ({ id: `task-${i}`, title: t.text, href: t.href })),
  ];
}

/** Home's quick actions: the design's four, each only when its page is in the person's menu. */
export function homeQuickActions(nav: NavArea[]): LiveMobileHome['quickActions'] {
  const has = (id: string) => Boolean(navHref(nav, id));
  return [
    ...(has('my-leave') ? [{ label: 'Apply leave', href: '/yx/time/leave?apply=1', kind: 'leave' as const }] : []),
    ...(has('expenses') ? [{ label: 'Add expense', href: navHref(nav, 'expenses')!, kind: 'expense' as const }] : []),
    ...(has('my-payslips') ? [{ label: 'Latest payslip', href: '/yx/me/payslips', kind: 'payslip' as const }] : []),
    ...(has('my-attendance') ? [{ label: 'Fix attendance', href: '/yx/time/attendance?view=today&request=regularise', kind: 'fix' as const }] : []),
  ];
}

/** Requests › New request: the types "+ New" offers the person, plus loans and resignation where their menu has them. */
export function pickerRows(nav: NavArea[]): LiveRequestTypePicker['rows'] {
  const types = newRequestTypes(nav, { self: true, help: true, job: false });
  const t = (id: string) => types.find((x) => x.id === id)?.href;
  const rows: LiveRequestTypePicker['rows'] = [];
  const add = (section: LiveRequestTypePicker['rows'][number]['section'], id: LiveRequestTypePicker['rows'][number]['id'], title: string, href: string | undefined) => href && rows.push({ section, id, title, href });
  add('Common', 'leave', 'Leave', t('leave'));
  add('Common', 'regularise', 'Attendance fix, WFH, on-duty', t('regularise'));
  add('Common', 'letter', 'Letter or certificate', t('letter'));
  add('Money and help', 'expense', 'Expense or trip', t('expense'));
  add('Money and help', 'loan', 'Loan or salary advance', navHref(nav, 'my-loans'));
  add('Money and help', 'ticket', 'Ask HR (helpdesk)', t('ticket'));
  add('Money and help', 'resign', 'Resignation', navHref(nav, 'resign'));
  return rows;
}
