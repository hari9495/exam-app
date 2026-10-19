'use client';

import { useRouter } from 'next/navigation';
import { useQuery } from '@tanstack/react-query';
import type { ActionItem } from '@yukthix/ui';
import type { ApprovalTask } from '@yukthix/ui/desk';
import { RoleHomeScreen, type LiveHome, type RoleHomeScreenProps } from '@yukthix/ui/frame';
import { TodayCard, type MyAttendance, type PunchResult } from '@yukthix/ui/time';
import type { TeamMember } from '@yukthix/ui/workforce';
import { apiFetch } from '../../../../lib/api-client';
import { useAuth } from '../../../../lib/auth-context';
import { useCurrentUser } from '../../../../lib/hooks/useCurrentUser';
import { useOrgBranding } from '../../../../lib/hooks/useBranding';
import { useYxPermissions } from '../../../../lib/yx-org';
import { usePeople } from '../../../../lib/yx-people';
import { useScope, useWorkspaceCounts } from '../../../../lib/yx-shell';
import { hiringHome, homeWidgets, type HomeWidgets } from '../../../../lib/yx-home';
import { browserLocation, useTime, useTimeWrite } from '../../../../lib/yx-time';

// Home (PLT-02, design audit steps 1 and 2): the designed role home with live data. Approvals waiting, today's check-in,
// the HR widgets (attendance exceptions, not ready for payroll, open cases, due dates, joiners and leavers this week)
// and the counts behind the person's own queues; widgets with no live data yet are left out, not faked.
// Hiring (founder decision 19 Oct 2026): someone whose only keys are hiring keys gets the recruiter Home; someone who
// is also HR, finance, a manager or an employee keeps their Home and gets the recruiter widgets added after their own.
export default function YxHomePage() {
  const router = useRouter();
  const { accessToken, actingSuperAdmin } = useAuth();
  const me = useCurrentUser();
  const branding = useOrgBranding();
  const perms = useYxPermissions();
  const team = usePeople<{ managerId: string | null; members: TeamMember[] }>('/team');
  const employee = Boolean(team.data?.managerId) && !actingSuperAdmin;
  const counts = useWorkspaceCounts();
  const inbox = useQuery<ApprovalTask[]>({ queryKey: ['workflow', '/approvals/inbox'], queryFn: () => apiFetch('/workflow/approvals/inbox', {}, accessToken ?? undefined), enabled: Boolean(accessToken) && !actingSuperAdmin, retry: false });
  const attendance = useTime<MyAttendance>(employee ? `/me/attendance?month=${new Date().toISOString().slice(0, 7)}` : null);
  const write = useTimeWrite();
  // The designed HR widgets (design audit step 2), for the company and period chosen in the top bar.
  const { scope } = useScope();
  const widgets = useQuery<HomeWidgets>({
    queryKey: ['yx', 'workspace', 'home', scope.entity, scope.period],
    queryFn: () => apiFetch(`/workspace/home?month=${scope.period}${scope.entity ? `&legalEntityId=${encodeURIComponent(scope.entity)}` : ''}`, {}, accessToken ?? undefined),
    enabled: Boolean(accessToken) && Boolean(scope.period),
    retry: false,
  });
  const extra = homeWidgets(widgets.data, new Date().toISOString().slice(0, 10));
  const hiring = hiringHome(widgets.data?.hiring, new Date());

  const own: RoleHomeScreenProps['persona'] = perms.has('employee.profile.view') ? 'hr' : perms.has('payroll.run.approve') || perms.has('payroll.run.view') ? 'finance' : team.data?.members.length ? 'manager' : 'employee';
  const persona = own === 'employee' && !employee && hiring.view ? 'recruiter' : own;
  const approvals: ActionItem[] = (inbox.data ?? []).map((t) => ({ id: t.taskId, type: t.type, title: t.title, who: t.onBehalfOf ?? t.requester, ...(t.dueAt ? { due: new Date(t.dueAt) } : {}), kind: 'review' }));
  const actions = [...approvals, ...hiring.actions];
  const c = counts.data ?? {};
  const stat = (id: keyof typeof c, title: string, label: string, href: string, drill: string): NonNullable<LiveHome['stats']>[number][] =>
    c[id] === undefined ? [] : [{ id, title, label, value: c[id]!, drill: { label: drill, href } }];
  const live: LiveHome = {
    firstName: (me.data?.name ?? '').split(' ')[0] || 'there',
    company: branding.data?.name || 'your company',
    today: new Date(),
    approvalsHref: approvals.length || !hiring.view ? '/yx/approvals' : '/yx/hiring/jobs',
    onReview: () => router.push('/yx/approvals'),
    clock: attendance.data ? <TodayCard data={attendance.data} getLocation={browserLocation} onPunch={(kind, pin) => write<PunchResult>('/me/punch', 'POST', { kind, ...(pin ?? {}) })} /> : undefined,
    stats: [
      ...(extra.stats ?? []),
      ...stat('documentsToVerify', 'Documents', 'Documents to verify', '/yx/people/documents', 'Open the queue'),
      ...stat('exitCases', 'Exits', 'Open exit cases', '/yx/people/exits', 'View exits'),
      ...stat('payslipQueries', 'Payslip queries', 'Payslip queries open', '/yx/payroll/payslip-queries', 'Answer queries'),
      ...stat('myTickets', 'My tickets', 'Tickets assigned to you', '/yx/desk/tickets', 'Open tickets'),
      // With the recruiter widgets the scorecards owed are listed under Needs your action instead.
      ...(c.scorecardsToDo && !hiring.view ? stat('scorecardsToDo', 'Scorecards', 'Scorecards you owe', '/yx/hiring/interviews', 'Write them') : []),
    ],
    due: extra.due,
    moves: extra.moves,
    movesHref: extra.movesHref,
    hiring: hiring.view,
    quickActions: employee
      ? [
          { label: 'Apply leave', href: '/yx/time/leave', kind: 'leave' },
          { label: 'Download payslip', href: '/yx/me/payslips', kind: 'payslip' },
        ]
      : [],
  };
  return <RoleHomeScreen persona={persona} data={{ actions: actions.slice(0, 5), actionsTotal: actions.length }} loading={inbox.isLoading || widgets.isLoading} live={live} />;
}
