'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useToast, type ActionItem } from '@yukthix/ui';
import type { ApprovalTask } from '@yukthix/ui/desk';
import { RequisitionSheet, TeamPage, type PlanLine } from '@yukthix/ui/frame';
import { ChangeDrawer, type PersonOption } from '@yukthix/ui/history';
import type { Joiner, MyTasks } from '@yukthix/ui/lifecycle';
import type { Muster, TeamCalendar } from '@yukthix/ui/time';
import type { OrgChartData, TeamMember } from '@yukthix/ui/workforce';
import { apiFetch } from '../../../../../lib/api-client';
import { useAuth } from '../../../../../lib/auth-context';
import { todayIst, useYxPermissions, loadState } from '../../../../../lib/yx-org';
import { chartPeople, useChangeOptions, usePeople, useRaiseChange } from '../../../../../lib/yx-people';
import { useLife } from '../../../../../lib/yx-lifecycle';
import { useTime } from '../../../../../lib/yx-time';
import { clockText, teamRows, teamTasks } from '../../../../../lib/yx-team';

const id = encodeURIComponent;
const plus = (iso: string, days: number) => new Date(Date.parse(`${iso}T00:00:00Z`) + days * 86_400_000).toISOString().slice(0, 10);

// People › My team (PPL-08, design audit step 3; M01 §3.10): the designed team page with the manager's subtree and
// dotted-line reports, who is in today (team muster), what is coming up (leave, probation ends, joiners), the
// onboarding and exit tasks they own and what waits for them. With request.raise_on_behalf they raise promotions,
// transfers, re-designations and manager changes; HR approves (YX-SEC-27). The API checks every call.
export default function YxTeamPage() {
  const router = useRouter();
  const { accessToken } = useAuth();
  const { toast } = useToast();
  const perms = useYxPermissions();
  const today = todayIst();
  const team = usePeople<{ managerId: string | null; members: TeamMember[] }>('/team');
  const hrDesk = perms.has('employee.change.manage');
  const canRaise = hrDesk || perms.has('request.raise_on_behalf');
  const chart = usePeople<OrgChartData>(canRaise ? '/org-chart' : null);
  const members = team.data?.members ?? [];
  const everyone = chartPeople(chart.data);
  // A change is raised for the reporting team, never a dotted-line report.
  const subjects: PersonOption[] = everyone.filter((p) => members.some((m) => m.id === p.id && m.relation !== 'dotted'));
  const options = useChangeOptions(subjects, perms.has('employee.salary.manage'), canRaise);
  const raise = useRaiseChange();
  const types = hrDesk ? undefined : (['promotion', 'transfer', 'redesignation', 'manager_change'] as const);
  const has = members.length > 0;
  const muster = useTime<Muster>(has ? `/muster?month=${today.slice(0, 7)}` : null);
  const calendar = useTime<TeamCalendar>(has ? `/team/calendar?from=${today}&to=${plus(today, 30)}` : null);
  // M01 lifecycle 6a (founder D2): joiners are not team members until day one; they show with their joining day.
  const soon = useLife<Joiner[]>('/lifecycle/joining-soon');
  const tasks = useLife<MyTasks>('/lifecycle/my-tasks');
  const inbox = useQuery<ApprovalTask[]>({ queryKey: ['workflow', '/approvals/inbox'], queryFn: () => apiFetch('/workflow/approvals/inbox', {}, accessToken ?? undefined), enabled: Boolean(accessToken), retry: false });
  const [raising, setRaising] = useState(false);
  // PPL-08 "Request a hire" (ats.requisition.raise): lines of the approved headcount plans with a free position.
  const canRequest = perms.has('ats.requisition.raise');
  const [requesting, setRequesting] = useState(false);
  const lines = useQuery<{ id: string; designation: string; grade: string | null; location: string | null; department: string; count: number; committed: number; filled: number; budget: number | null; committedBudget: number }[]>({
    queryKey: ['hiring', 'plan-lines'],
    queryFn: () => apiFetch('/hiring/plan-lines', {}, accessToken ?? undefined),
    enabled: Boolean(accessToken && canRequest && requesting),
    retry: false,
  });
  const planLines: PlanLine[] = (lines.data ?? []).map((l) => ({ id: l.id, department: l.department, designation: l.designation, grade: l.grade ?? '', location: l.location ?? '', approved: l.count, filled: l.filled, open: l.committed, budget: l.budget ?? Number.MAX_SAFE_INTEGER, committed: l.committedBudget }));

  const qc = useQueryClient();
  // PPL-08: a quick Approve where the request may be decided here; irreversible ones (decideAt) open their own page.
  const approvals: ActionItem[] = (inbox.data ?? []).map((t) => ({ id: t.taskId, type: t.type, title: t.title, who: t.person || t.onBehalfOf || t.requester, ...(t.dueAt ? { due: new Date(t.dueAt) } : {}), kind: t.decideAt ? 'review' : 'approve' }));
  // PPL-08 Nudge: a reminder to check in today (the Home's Team today uses the same call).
  const nudge = async (memberId: string) => {
    const name = rows.find((r) => r.id === memberId)?.name ?? 'Your team member';
    try {
      await apiFetch(`/time/people/${id(memberId)}/nudge`, { method: 'POST' }, accessToken ?? undefined);
      toast({ tone: 'success', title: `${name} was reminded to check in` });
      // The muster carries who was reminded today, so the button turns to "Reminded".
      void muster.refetch();
    } catch (e) {
      toast({ tone: 'error', title: `Could not remind ${name}`, description: (e as Error).message });
      void muster.refetch(); // "already reminded today": show it as Reminded
    }
  };
  const approve = async (item: ActionItem) => {
    const t = (inbox.data ?? []).find((x) => x.taskId === item.id);
    if (!t) return;
    try {
      await apiFetch(`/workflow/approvals/tasks/${id(t.taskId)}/decide`, { method: 'POST', body: JSON.stringify({ decision: 'approve' }) }, accessToken ?? undefined);
      toast({ tone: 'success', title: `Approved: ${t.title}`, ...(t.requester ? { description: `${t.requester} is told by email and in their bell.` } : {}) });
    } catch (e) {
      toast({ tone: 'error', title: `Could not approve ${t.title}`, description: (e as Error).message });
    }
    await qc.invalidateQueries({ queryKey: ['workflow'] });
  };
  const myTasks = teamTasks(tasks.data?.tasks ?? []);
  const rows = teamRows(members, soon.data ?? [], today, muster.data, calendar.data);
  const asOf = muster.data ? `${new Date(`${today}T00:00:00`).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}, ${clockText(new Date().toISOString())}` : null;
  const journeyOf = new Map((soon.data ?? []).map((j) => [`joiner:${j.journeyId ?? j.id}`, j.journeyId]));
  return (
    <>
      <TeamPage
        members={rows}
        approvals={approvals}
        tasks={myTasks}
        today={new Date(`${today}T00:00:00`)}
        live={{
          state: loadState(team),
          onRetry: () => void team.refetch(),
          asOf,
          onOpenMember: (memberId) => {
            const journey = journeyOf.get(memberId);
            if (journey) router.push(`/yx/people/onboarding/${id(journey)}`);
            else if (!memberId.startsWith('joiner:')) router.push(`/yx/people/directory/${id(memberId)}`);
          },
          ...(canRaise && chart.data && subjects.length ? { onStartChange: () => setRaising(true) } : {}),
          approvalsHref: '/yx/approvals',
          onReview: () => router.push('/yx/approvals'),
          onApprove: (item) => void approve(item),
          onNudge: (memberId) => void nudge(memberId),
          ...(canRequest ? { onRequestHire: () => setRequesting(true) } : {}),
          onOpenTask: (taskId) => {
            const journey = myTasks.find((t) => t.id === taskId)?.journeyId;
            router.push(journey ? `/yx/people/onboarding/${id(journey)}` : '/yx/people/my-tasks');
          },
        }}
      />
      {requesting && (
        <RequisitionSheet
          open
          onOpenChange={(o) => !o && setRequesting(false)}
          planLines={planLines}
          defaultLine={null}
          defaultMax={null}
          live={{
            subtitle: 'Hiring manager request',
            team: members.filter((m) => m.relation !== 'dotted').map((m) => ({ value: m.id, label: m.name })),
            onSend: async (x) => {
              const out = (await apiFetch('/jobs/requisitions', { method: 'POST', body: JSON.stringify({ ...x, targetStart: x.targetStart ? `${x.targetStart.getFullYear()}-${String(x.targetStart.getMonth() + 1).padStart(2, '0')}-${String(x.targetStart.getDate()).padStart(2, '0')}` : null }) }, accessToken ?? undefined)) as { status: string };
              toast({ tone: 'success', title: out.status === 'approved' ? `Requisition for ${x.title} approved` : `Requisition for ${x.title} sent for approval` });
            },
          }}
        />
      )}
      {raising && (
        <ChangeDrawer
          options={{ ...options, managers: everyone, ...(types ? { types: [...types] } : {}) }}
          onPreview={raise.onPreview}
          onSubmit={async (input) => {
            await raise.onSubmit(input);
            toast({ tone: 'success', title: `Change for ${subjects.find((s) => s.id === input.employeeId)?.name ?? 'your team member'} sent to HR` });
          }}
          onClose={() => setRaising(false)}
        />
      )}
    </>
  );
}
