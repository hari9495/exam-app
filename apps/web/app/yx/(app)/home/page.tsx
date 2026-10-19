'use client';

import { useRouter } from 'next/navigation';
import { useQuery } from '@tanstack/react-query';
import type { ActionItem } from '@yukthix/ui';
import type { ApprovalTask } from '@yukthix/ui/desk';
import { RoleHomeScreen, type LiveHome, type RoleHomeScreenProps } from '@yukthix/ui/frame';
import { HomeClockCard, type MyAttendance, type MyLeave, type Muster, type PunchResult, type TeamCalendar } from '@yukthix/ui/time';
import type { TeamMember } from '@yukthix/ui/workforce';
import { apiFetch } from '../../../../lib/api-client';
import { useAuth } from '../../../../lib/auth-context';
import { useCurrentUser } from '../../../../lib/hooks/useCurrentUser';
import { useOrgBranding } from '../../../../lib/hooks/useBranding';
import { useYxPermissions } from '../../../../lib/yx-org';
import { usePeople } from '../../../../lib/yx-people';
import { usePerf } from '../../../../lib/yx-performance';
import { useScope } from '../../../../lib/yx-shell';
import { comingUp, employeeStats, hiringHome, homeWidgets, managerHome, myTasks, weekOf, type HomeWidgets } from '../../../../lib/yx-home';
import { useLife } from '../../../../lib/yx-lifecycle';
import { browserLocation, todayIndia, useTime, useTimeWrite } from '../../../../lib/yx-time';

type Probations = { rows: NonNullable<Parameters<typeof managerHome>[0]['probations']> };
type Reviews = NonNullable<Parameters<typeof managerHome>[0]['reviews']>;
type Meetings = { meetings: NonNullable<Parameters<typeof managerHome>[0]['meetings']> };
const monthBefore = (m: string) => new Date(Date.UTC(Number(m.slice(0, 4)), Number(m.slice(5, 7)) - 2, 1)).toISOString().slice(0, 7);

// Home (PLT-02, home parity 19 Oct 2026): the designed role home with live data only, widget for widget.
// - HR: attendance exceptions, not ready for payroll, open cases, joining this month ("vs last month" once on record),
//   due dates, joiners and leavers this week.
// - Manager: team today, who's off this week, late check-ins, reviews to write, probation reviews due, 1:1s.
// - Employee: earned leave left, days present, late marks, requests pending.
// Everyone with an attendance record gets the designed "Attendance today" card. Hiring (founder decision 19 Oct 2026):
// someone whose only keys are hiring keys gets the recruiter Home; others get the recruiter widgets when they hire.
export default function YxHomePage() {
  const router = useRouter();
  const { accessToken, actingSuperAdmin } = useAuth();
  const me = useCurrentUser();
  const branding = useOrgBranding();
  const perms = useYxPermissions();
  const team = usePeople<{ managerId: string | null; members: TeamMember[] }>('/team');
  const employee = Boolean(team.data?.managerId) && !actingSuperAdmin;
  const isManager = Boolean(team.data?.members.length) && !actingSuperAdmin;
  const inbox = useQuery<ApprovalTask[]>({ queryKey: ['workflow', '/approvals/inbox'], queryFn: () => apiFetch('/workflow/approvals/inbox', {}, accessToken ?? undefined), enabled: Boolean(accessToken) && !actingSuperAdmin, retry: false });
  const today = todayIndia();
  const month = today.slice(0, 7);
  const attendance = useTime<MyAttendance>(employee ? `/me/attendance?month=${month}` : null);
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

  const own: RoleHomeScreenProps['persona'] = perms.has('employee.profile.view') ? 'hr' : perms.has('payroll.run.approve') || perms.has('payroll.run.view') ? 'finance' : isManager ? 'manager' : 'employee';
  const persona = own === 'employee' && !employee && hiring.view ? 'recruiter' : own;

  // Employee cards: this month and last month from the attendance record, leave balances and my requests.
  const asEmployee = persona === 'employee' && employee;
  const attendanceBefore = useTime<MyAttendance>(asEmployee ? `/me/attendance?month=${monthBefore(month)}` : null);
  // Holidays for "Coming up" come with the person's leave, so everyone with an employee record reads it.
  const leave = useTime<MyLeave>(employee ? '/me/leave' : null);
  const checklist = useLife<{ tasks: { id: string; title: string; dueOn: string }[] }>(asEmployee ? '/lifecycle/my-tasks' : null);
  const feedbackTasks = usePerf<NonNullable<Parameters<typeof myTasks>[0]['feedback']>>('/my-feedback-tasks', asEmployee);
  const myReviews = usePerf<NonNullable<Parameters<typeof myTasks>[0]['reviews']>>('/reviews?view=mine', asEmployee);
  const mine = useQuery<{ status: string }[]>({ queryKey: ['workflow', '/approvals/mine'], queryFn: () => apiFetch('/workflow/approvals/mine', {}, accessToken ?? undefined), enabled: Boolean(accessToken) && asEmployee, retry: false });

  // Manager widgets, each from the page it links to (the API scopes every list to the team).
  const asManager = persona === 'manager';
  const week = weekOf(today);
  const muster = useTime<Muster>(asManager ? `/muster?month=${month}` : null);
  const lastWeekStart = new Date(new Date(`${week[0]}T00:00:00Z`).getTime() - 7 * 86_400_000).toISOString().slice(0, 7);
  const musterBefore = useTime<Muster>(asManager && lastWeekStart < month ? `/muster?month=${lastWeekStart}` : null);
  const calendar = useTime<TeamCalendar>(asManager ? `/team/calendar?from=${week[0]}&to=${week[6]}` : null);
  const reviews = usePerf<Reviews>('/reviews?view=team', asManager);
  const meetings = usePerf<Meetings>('/one-on-ones', asManager);
  const probations = usePeople<Probations>(asManager ? '/probations' : null);
  const manager = asManager ? managerHome({ today, muster: muster.data, musterBefore: musterBefore.data, calendar: calendar.data, reviews: reviews.data, probations: probations.data?.rows, meetings: meetings.data?.meetings }) : {};

  const approvals: ActionItem[] = (inbox.data ?? []).map((t) => ({ id: t.taskId, type: t.type, title: t.title, who: t.person || t.onBehalfOf || t.requester, ...(t.dueAt ? { due: new Date(t.dueAt) } : {}), kind: 'review' }));
  // People who are not recruiters get the recruiter widgets only when they hire (jobs, interviews or rows waiting).
  const hiringView = persona === 'recruiter' || hiring.actions.length || hiring.view?.jobs?.length || hiring.view?.interviewsToday.length ? hiring.view : undefined;
  const actions = [...approvals, ...(hiringView ? hiring.actions : [])];
  const stats = persona === 'hr' ? extra.stats : persona === 'employee' ? employeeStats({ leave: leave.data, now: attendance.data, before: attendanceBefore.data, waiting: mine.data?.filter((r) => r.status === 'pending').length }) : persona === 'manager' ? manager.stats : [];
  const live: LiveHome = {
    firstName: (me.data?.name ?? '').split(' ')[0] || 'there',
    company: branding.data?.name || 'your company',
    today: new Date(),
    approvalsHref: approvals.length || !hiringView ? '/yx/approvals' : '/yx/hiring/jobs',
    onReview: () => router.push('/yx/approvals'),
    clock: attendance.data ? (
      <HomeClockCard
        data={attendance.data}
        now={new Date()}
        getLocation={browserLocation}
        onPunch={(kind, pin) => write<PunchResult>('/me/punch', 'POST', { kind, ...(pin ?? {}) })}
        attendanceHref="/yx/time/attendance"
        onRegularise={() => router.push('/yx/time/attendance')}
      />
    ) : undefined,
    stats,
    ...(persona === 'hr' ? { due: extra.due, moves: extra.moves, movesHref: extra.movesHref } : {}),
    ...(persona === 'manager' ? { team: manager.team, off: manager.off, offHref: manager.offHref, goals: manager.goals } : {}),
    hiring: hiringView,
    ...(asEmployee ? { tasks: myTasks({ checklist: checklist.data?.tasks, feedback: feedbackTasks.data, reviews: myReviews.data }) } : {}),
    ...(employee ? { coming: comingUp(widgets.data?.celebrations, leave.data?.holidays.list, today) } : {}),
    quickActions: employee
      ? [
          { label: 'Apply leave', href: '/yx/time/leave', kind: 'leave' },
          { label: 'Request work from home', href: '/yx/time/attendance?request=wfh', kind: 'wfh' },
          { label: 'Download payslip', href: '/yx/me/payslips', kind: 'payslip' },
        ]
      : [],
  };
  return <RoleHomeScreen persona={persona} data={{ actions: actions.slice(0, 5), actionsTotal: actions.length }} loading={inbox.isLoading || widgets.isLoading} live={live} />;
}
