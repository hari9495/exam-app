'use client';

import { useContext, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import type { ActionItem } from '@yukthix/ui';
import type { ApprovalTask } from '@yukthix/ui/desk';
import { HomeReminderCards, MobileHomeScreen, RoleHomeScreen, dismissForToday, dismissedToday, type HomeLayout, type HomeReminder, type LiveHome, type RoleHomeScreenProps } from '@yukthix/ui/frame';
import { useToast } from '@yukthix/ui';
import { NudgeCard } from '@yukthix/ui/console';
import { TalkToUsLiveDialog } from '@yukthix/ui/desk';
import { Button } from '@yukthix/ui';
import { useYxT } from '@yukthix/ui/i18n';
import { HomeClockCard, TimesheetNudgeCard, type MyAttendance, type MyLeave, type Muster, type PunchResult, type TeamCalendar, type TeamLeaveHome } from '@yukthix/ui/time';
import type { TeamMember } from '@yukthix/ui/workforce';
import { apiFetch } from '../../../../lib/api-client';
import { useAuth } from '../../../../lib/auth-context';
import { useCurrentUser } from '../../../../lib/hooks/useCurrentUser';
import { useOrgBranding } from '../../../../lib/hooks/useBranding';
import { useOrg, useYxPermissions } from '../../../../lib/yx-org';
import type { CompanyModule } from '../../../../lib/yx-modules';
import { usePeople } from '../../../../lib/yx-people';
import { usePerf } from '../../../../lib/yx-performance';
import { YxNavContext, useScope } from '../../../../lib/yx-shell';
import { homeQuickActions, homeTodos, navHref, usePhone } from '../../../../lib/yx-phone';
import { comingUp, employeeStats, financeHome, hiringHome, homePay, homeWidgets, inboxActions, managerHome, myTasks, weekOf, type HomePayResponse, type HomeWidgets, type TeamTodayResponse } from '../../../../lib/yx-home';
import { usePay } from '../../../../lib/yx-pay';
import { useLife } from '../../../../lib/yx-lifecycle';
import { browserLocation, todayIndia, useTime, useTimeWrite } from '../../../../lib/yx-time';

type Probations = { rows: NonNullable<Parameters<typeof managerHome>[0]['probations']> };
type Reviews = NonNullable<Parameters<typeof managerHome>[0]['reviews']>;
type Meetings = { meetings: NonNullable<Parameters<typeof managerHome>[0]['meetings']> };
/** "Hide amounts" is remembered per person on this browser. */
const readHidden = (key: string) => {
  try {
    return window.localStorage.getItem(key) === '1';
  } catch {
    return false;
  }
};
const monthBefore = (m: string) => new Date(Date.UTC(Number(m.slice(0, 4)), Number(m.slice(5, 7)) - 2, 1)).toISOString().slice(0, 7);

// Home (PLT-02, home parity 19 Oct 2026): the designed role home with live data only, widget for widget.
// - HR: attendance exceptions, not ready for payroll, open cases, joining this month ("vs last month" once on record),
//   due dates, joiners and leavers this week.
// - Manager: team today, who's off this week, late check-ins, reviews to write, probation reviews due, 1:1s.
// - Employee: earned leave left, days present, late marks (or their own net pay when HR shows pay), requests pending.
// - Finance (payroll, statutory): money to pay, net payroll, PF and ESI, TDS, money going out in the next 30 days.
// Everyone with an attendance record gets the designed "Attendance today" card. Hiring (founder decision 19 Oct 2026):
// someone whose only keys are hiring keys gets the recruiter Home; others get the recruiter widgets when they hire.
// Needs your action (founder, 5 Nov 2026): one-click Approve only where the server marks the type quickApprove (leave,
// WFH, regularisation, timesheets, shift swap, OT pre-approval); expense claims stay Review only even within limit (161);
// the note uses policy limits, no per-approver money limit until customers ask (162).
export default function YxHomePage() {
  const router = useRouter();
  const phone = usePhone();
  const { nav } = useContext(YxNavContext);
  const qc = useQueryClient();
  const { accessToken, actingSuperAdmin } = useAuth();
  const me = useCurrentUser();
  const branding = useOrgBranding();
  const perms = useYxPermissions();
  const team = usePeople<{ managerId: string | null; members: TeamMember[] }>('/team');
  const employee = Boolean(team.data?.managerId) && !actingSuperAdmin;
  // T2-G 44 (answer 2745): the people the company named per module (on modules that are on), shown as "Who to ask".
  const companyModules = useOrg<{ modules: CompanyModule[] }>('/modules', employee);
  const isManager = Boolean(team.data?.members.length) && !actingSuperAdmin;
  // C-8 (YX-12): the one nudge for this person, if any (the API applies the switches, who can act and the weekly limit).
  const nudge = useQuery<{ nudge: { id: string; featureLabel: string; heading: string; body: string; switchHref: string | null } | null }>({ queryKey: ['yx', 'nudge'], queryFn: () => apiFetch('/help/nudge', {}, accessToken ?? undefined), enabled: Boolean(accessToken) && !actingSuperAdmin, retry: false, staleTime: Infinity });
  const n = nudge.data?.nudge;
  // Batch D A14 (answer 2536): today has no hours yet (the API applies the company time, working day and allocation).
  const tsNudge = useQuery<{ show: boolean }>({ queryKey: ['time', '/me/timesheet/nudge'], queryFn: () => apiFetch('/time/me/timesheet/nudge', {}, accessToken ?? undefined), enabled: Boolean(accessToken) && !actingSuperAdmin, retry: false });
  const [tsHidden, setTsHidden] = useState(false);
  // T2-E 51 (answer 2874): at most 2 cards for a window that is closing; "Not today" hides one for the day (this browser).
  const reminders = useQuery<{ cards: HomeReminder[] }>({ queryKey: ['yx', 'home-reminders'], queryFn: () => apiFetch('/notifications/home-reminders', {}, accessToken ?? undefined), enabled: Boolean(accessToken) && !actingSuperAdmin, retry: false });
  const todayKey = new Date(Date.now() + 330 * 60_000).toISOString().slice(0, 10);
  const [hiddenReminders, setHiddenReminders] = useState<string[]>(() => (typeof window === 'undefined' ? [] : dismissedToday(todayKey)));
  const shownReminders = (reminders.data?.cards ?? []).filter((c) => !hiddenReminders.includes(c.id));
  // Answer 1210: Talk to us on the card asks YukthiX to call (the sales-assist queue).
  const [talking, setTalking] = useState(false);
  const inbox = useQuery<ApprovalTask[]>({ queryKey: ['workflow', '/approvals/inbox'], queryFn: () => apiFetch('/workflow/approvals/inbox', {}, accessToken ?? undefined), enabled: Boolean(accessToken) && !actingSuperAdmin, retry: false });
  // The India date as state: at midnight the page re-renders and the attendance card moves to the new day (founder, 21 Oct).
  const [today, setToday] = useState(todayIndia);
  useEffect(() => {
    const id = setInterval(() => setToday(todayIndia()), 60_000);
    return () => clearInterval(id);
  }, []);
  const month = today.slice(0, 7);
  const attendance = useTime<MyAttendance>(employee ? `/me/attendance?month=${month}` : null);
  // A new day after the page loaded: fetch the attendance again (not on the first render, which already fetched it).
  const [loadedFor, setLoadedFor] = useState(today);
  useEffect(() => {
    if (today === loadedFor) return;
    setLoadedFor(today);
    void attendance.refetch();
  }, [today, loadedFor, attendance]);
  const write = useTimeWrite();
  const { scope } = useScope();
  const widgets = useQuery<HomeWidgets>({
    queryKey: ['yx', 'workspace', 'home', scope.entity, scope.period],
    queryFn: () => apiFetch(`/workspace/home?month=${scope.period}${scope.entity ? `&legalEntityId=${encodeURIComponent(scope.entity)}` : ''}`, {}, accessToken ?? undefined),
    enabled: Boolean(accessToken) && Boolean(scope.period),
    retry: false,
  });
  const extra = homeWidgets(widgets.data, today);
  const hiring = hiringHome(widgets.data?.hiring, new Date());

  // Payroll and statutory people get the finance Home first (a Payroll Admin also holds HR's profile key).
  const payPerson = perms.has('payroll.run.view') || perms.has('payroll.run.prepare') || perms.has('payroll.run.approve') || perms.has('statutory.filing.view');
  const own: RoleHomeScreenProps['persona'] = payPerson ? 'finance' : perms.has('employee.profile.view') ? 'hr' : isManager ? 'manager' : 'employee';
  const persona = own === 'employee' && !employee && hiring.view ? 'recruiter' : own;
  // T2-F 79 (answer 2884): Edit home when the company lets this role personalise; the layout is kept per person.
  const { toast } = useToast();
  // T2-G 84b: the quick actions in the reader's language.
  const tHome = useYxT('home');
  type Saved = Pick<HomeLayout, 'order' | 'hidden' | 'sizes'>;
  const layoutQ = useQuery<{ personaliseRoles: string[]; layout: Saved | null }>({ queryKey: ['yx', 'workspace', 'home-layout'], queryFn: () => apiFetch('/workspace/home/layout', {}, accessToken ?? undefined), enabled: Boolean(accessToken) && !actingSuperAdmin, retry: false });
  const [ownLayout, setOwnLayout] = useState<Saved | null | undefined>(undefined);
  const saved = ownLayout === undefined ? (layoutQ.data?.layout ?? null) : ownLayout;
  const mayEdit = Boolean(layoutQ.data?.personaliseRoles.includes(persona));
  const saveLayout = (next: Saved | null) => {
    setOwnLayout(next);
    const req = next ? apiFetch('/workspace/home/layout', { method: 'PUT', body: JSON.stringify({ persona, order: next.order, hidden: next.hidden, sizes: next.sizes }) }, accessToken ?? undefined) : apiFetch('/workspace/home/layout', { method: 'DELETE' }, accessToken ?? undefined);
    Promise.resolve(req).catch((e: unknown) => toast({ tone: 'error', title: 'Your home layout was not saved', description: e instanceof Error ? e.message : 'Try again in a moment.' }));
  };
  const layout: HomeLayout | null = mayEdit
    ? { order: saved?.order ?? null, hidden: saved?.hidden ?? [], sizes: saved?.sizes ?? {}, onChange: (next) => saveLayout(next), onReset: () => saveLayout(null) }
    : null;

  // Employee cards: this month and last month from the attendance record, leave balances and my requests.
  const asEmployee = persona === 'employee' && employee;
  const attendanceBefore = useTime<MyAttendance>(asEmployee ? `/me/attendance?month=${monthBefore(month)}` : null);
  // Holidays for "Coming up" come with the person's leave, so everyone with an employee record reads it.
  const leave = useTime<MyLeave>(employee ? '/me/leave' : null);
  const checklist = useLife<{ tasks: { id: string; title: string; dueOn: string }[] }>(asEmployee ? '/lifecycle/my-tasks' : null);
  const feedbackTasks = usePerf<NonNullable<Parameters<typeof myTasks>[0]['feedback']>>('/my-feedback-tasks', asEmployee);
  const myReviews = usePerf<NonNullable<Parameters<typeof myTasks>[0]['reviews']>>('/reviews?view=mine', asEmployee);
  // Net pay on Home only when the company shows it (the API says; it is always the person's own).
  const pay = usePay<HomePayResponse>(asEmployee ? '/me/home-pay' : null);
  const mine = useQuery<{ status: string }[]>({ queryKey: ['workflow', '/approvals/mine'], queryFn: () => apiFetch('/workflow/approvals/mine', {}, accessToken ?? undefined), enabled: Boolean(accessToken) && asEmployee, retry: false });

  // Manager widgets, each from the page it links to (the API scopes every list to the team).
  const asManager = persona === 'manager';
  const week = weekOf(today);
  const muster = useTime<Muster>(asManager ? `/muster?month=${month}` : null);
  const teamToday = useTime<TeamTodayResponse>(asManager ? '/team-today' : null);
  const lastWeekStart = new Date(new Date(`${week[0]}T00:00:00Z`).getTime() - 7 * 86_400_000).toISOString().slice(0, 7);
  const musterBefore = useTime<Muster>(asManager && lastWeekStart < month ? `/muster?month=${lastWeekStart}` : null);
  const calendar = useTime<TeamCalendar>(asManager ? `/team/calendar?from=${week[0]}&to=${week[6]}` : null);
  const reviews = usePerf<Reviews>('/reviews?view=team', asManager);
  const meetings = usePerf<Meetings>('/one-on-ones', asManager);
  const probations = usePeople<Probations>(asManager ? '/probations' : null);
  const manager = asManager ? managerHome({ today, teamToday: teamToday.data, muster: muster.data, musterBefore: musterBefore.data, calendar: calendar.data, reviews: reviews.data, probations: probations.data?.rows, meetings: meetings.data?.meetings }) : {};

  // Finance: the money cards, money going out and the payroll and payout rows, each from the page that owns it.
  const fin = persona === 'finance' ? financeHome(widgets.data?.finance, scope.period ?? month, today) : null;
  const hideKey = fin && widgets.data?.finance && me.data?.id ? `yx-hide-amounts:${me.data.id}` : null;
  const [hideChoice, setHideChoice] = useState<Record<string, boolean>>({});
  const hidden = hideKey ? (hideChoice[hideKey] ?? readHidden(hideKey)) : false;

  // "N others off these days" for leave in the approver's own team: one extra call, only when leave waits for them.
  const teamLeave = useTime<TeamLeaveHome>(inbox.data?.some((t) => t.type === 'Leave') ? '/team/leave-home' : null);
  const approvals: ActionItem[] = inboxActions((inbox.data ?? []).filter((t) => !fin?.replaces.includes(t.requestId)), teamLeave.data);
  // People who are not recruiters get the recruiter widgets only when they hire (jobs, interviews or rows waiting).
  const hiringView = persona === 'recruiter' || hiring.actions.length || hiring.view?.jobs?.length || hiring.view?.interviewsToday.length ? hiring.view : undefined;
  const actions = [...(fin?.actions ?? []), ...approvals, ...(hiringView ? hiring.actions : [])];
  const stats = persona === 'hr' ? extra.stats : persona === 'employee' ? employeeStats({ leave: leave.data, now: attendance.data, before: attendanceBefore.data, waiting: mine.data?.filter((r) => r.status === 'pending').length }) : persona === 'manager' ? manager.stats : persona === 'finance' ? fin?.stats : [];
  const live: LiveHome = {
    firstName: (me.data?.name ?? '').split(' ')[0] || 'there',
    company: branding.data?.name || 'your company',
    today: new Date(),
    approvalsHref: approvals.length || !hiringView ? '/yx/approvals' : '/yx/hiring/jobs',
    // The Approvals page's own decide call, with all its checks; refused, the row stays and shows why.
    onApprove: async (item) => {
      await apiFetch(`/workflow/approvals/tasks/${encodeURIComponent(item.id)}/decide`, { method: 'POST', body: JSON.stringify({ decision: 'approve' }) }, accessToken ?? undefined);
      void qc.invalidateQueries({ queryKey: ['workflow'] });
      void qc.invalidateQueries({ queryKey: ['yx', 'workspace', 'counts'] });
    },
    onReview: () => router.push('/yx/approvals'),
    nudge: n || (tsNudge.data?.show && !tsHidden) || shownReminders.length ? (
      <>
      <HomeReminderCards cards={shownReminders} onDismiss={(id) => setHiddenReminders(dismissForToday(todayKey, id))} />
      {tsNudge.data?.show && !tsHidden && <TimesheetNudgeCard href="/yx/time/timesheet" onDismiss={() => setTsHidden(true)} />}
      {n && <NudgeCard
        heading={n.heading}
        body={n.body}
        switchHref={n.switchHref}
        extra={
          <Button size="sm" onClick={() => setTalking(true)}>
            Talk to us
          </Button>
        }
        onDismiss={() => {
          qc.setQueryData(['yx', 'nudge'], { nudge: null });
          void apiFetch(`/help/nudge/${encodeURIComponent(n.id)}/dismiss`, { method: 'POST' }, accessToken ?? undefined).catch(() => undefined);
        }}
      />}
      </>
    ) : undefined,
    clock: attendance.data ? (
      <HomeClockCard
        data={attendance.data}
        now={new Date()}
        getLocation={browserLocation}
        onPunch={(kind, pin, opts) => write<PunchResult>('/me/punch', 'POST', { kind, ...(pin ?? {}), ...(opts?.wfh ? { wfh: true } : {}) })}
        attendanceHref="/yx/time/attendance?view=today"
        onRegularise={() => router.push('/yx/time/attendance?view=today&request=regularise')}
      />
    ) : undefined,
    stats,
    ...(persona === 'hr' ? { due: extra.due, moves: extra.moves, movesHref: extra.movesHref } : {}),
    ...(fin ? { moneyOut: fin.moneyOut, approval: fin.approval, trend: fin.trend } : {}),
    ...(hideKey
      ? {
          amounts: {
            hidden,
            onToggle: () => {
              setHideChoice({ ...hideChoice, [hideKey]: !hidden });
              try {
                window.localStorage.setItem(hideKey, hidden ? '0' : '1');
              } catch {
                /* not remembered in a private window */
              }
            },
          },
        }
      : {}),
    ...(persona === 'manager' ? { team: manager.team, off: manager.off, offHref: manager.offHref, goals: manager.goals, onNudge: async (r: { id: string }) => void (await write(`/people/${encodeURIComponent(r.id)}/nudge`, 'POST', undefined, false)) } : {}),
    hiring: hiringView,
    layout,
    ...(asEmployee ? { pay: homePay(pay.data) } : {}),
    ...(asEmployee ? { tasks: myTasks({ checklist: checklist.data?.tasks, feedback: feedbackTasks.data, reviews: myReviews.data }) } : {}),
    ...(employee ? { coming: comingUp(widgets.data?.celebrations, leave.data?.holidays.list, today) } : {}),
    ...(employee && companyModules.data?.modules ? { owners: companyModules.data.modules.filter((m) => m.on && m.owner).map((m) => ({ module: m.label, name: m.owner!.name })) } : {}),
    quickActions: employee
      ? [
          { label: tHome('applyLeave'), href: '/yx/time/leave?apply=1', kind: 'leave' },
          { label: tHome('wfh'), href: '/yx/time/attendance?request=wfh', kind: 'wfh' },
          { label: tHome('payslip'), href: '/yx/me/payslips', kind: 'payslip' },
        ]
      : [],
  };
  // T2-H (answer 2741): on a phone, the designed phone Home with the same data and calls.
  if (phone)
    return (
      <MobileHomeScreen
        state={inbox.isLoading || widgets.isLoading ? 'loading' : 'ready'}
        live={{
          firstName: live.firstName,
          clock: live.clock,
          todos: homeTodos(actions, live.tasks, new Date()),
          celebrations: (live.coming ?? []).filter((c) => c.kind === 'person').map((c) => ({ id: c.id, name: c.name, text: c.text })),
          kudosHref: navHref(nav, 'engage-recognition'),
          quickActions: employee ? homeQuickActions(nav) : [],
          team: live.team,
          onNudge: live.onNudge,
          onNavigate: (href) => router.push(href),
        }}
      />
    );
  return (
    <>
      <RoleHomeScreen persona={persona} data={{ actions: actions.slice(0, 5), actionsTotal: actions.length }} loading={inbox.isLoading || widgets.isLoading} live={live} />
      {talking && n && (
        <TalkToUsLiveDialog
          about={n.featureLabel}
          onClose={() => setTalking(false)}
          onSend={(input) => apiFetch('/help/talk-to-us', { method: 'POST', body: JSON.stringify({ nudgeId: n.id, ...input }) }, accessToken ?? undefined) as Promise<{ dueAt: string }>}
        />
      )}
    </>
  );
}
