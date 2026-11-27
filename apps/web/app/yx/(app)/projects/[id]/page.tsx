'use client';

import { useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { ProjectWorkspaceScreen, type LiveProjectDetail, type LiveProjectWorkspace, type LiveTimesheetRow, type ProjectChoices } from '@yukthix/ui/hiring';
import { loadState, useYxPermissions } from '../../../../../lib/yx-org';
import { useProjects, useProjectsWrite } from '../../../../../lib/yx-projects';

// Projects P-1 (answers 1401 to 1405, 1412, 1420): the designed PRJ-01 workspace, live (overview, team, tasks and
// milestones). The API checks every change: projects.manage, the project's manager, or projects.resource for the team.
export default function YxProjectPage() {
  const { id } = useParams<{ id: string }>();
  const p = `/${encodeURIComponent(id)}`;
  // Batch D B3 (answer 2537): the Team tab's hours range (this week by default).
  const [range, setRange] = useState<'week' | 'month' | 'all'>('week');
  const detail = useProjects<LiveProjectDetail>(range === 'week' ? p : `${p}?range=${range}`);
  const can = detail.data?.can;
  const choices = useProjects<ProjectChoices>(can && (can.edit || can.team) ? '/choices' : null);
  const settings = useProjects<{ values: Record<string, string> }>(can?.edit ? '/settings' : null);
  const write = useProjectsWrite();
  const state = loadState(detail);
  const v = settings.data?.values;
  // Answer 1541: the Timesheets tab, a week at a time (this week first).
  const [week, setWeek] = useState(() => {
    const t = new Date();
    t.setDate(t.getDate() - ((t.getDay() + 6) % 7));
    return `${t.getFullYear()}-${String(t.getMonth() + 1).padStart(2, '0')}-${String(t.getDate()).padStart(2, '0')}`;
  });
  // Answers 1412, 1419: cost (finance, or the manager; the API refuses others) and the project's expenses.
  const cost = useProjects<NonNullable<LiveProjectWorkspace['cost']>>(detail.data && (can?.finance || can?.run) ? `${p}/cost` : null);
  const expenses = useProjects<NonNullable<LiveProjectWorkspace['expenses']>>(detail.data ? `${p}/expenses` : null);
  const ts = useProjects<{ week: string; rows: LiveTimesheetRow[] }>(detail.data ? `${p}/timesheets?week=${week}` : null);
  // P-6: the Billing tab for Projects finance and account managers (the API checks it again).
  const router = useRouter();
  const perms = useYxPermissions();
  const mayBill = Boolean(detail.data && (can?.finance || perms.has('ats.staffing.manage')));
  const billing = useProjects<NonNullable<LiveProjectWorkspace['billing']>>(mayBill ? `/billing/project/${encodeURIComponent(id)}` : null);
  return (
    <ProjectWorkspaceScreen
      live={{
        // Walk 12 Nov: Projects switched off is its own plain state; no access gets the kit's Request access page.
        state: (detail.error as { code?: string } | null)?.code === 'PROJECTS_OFF' ? 'off' : state === 'no-access' ? 'no-access' : state === 'error' ? 'error' : state === 'loading' ? 'loading' : 'ready',
        onRetry: () => void detail.refetch(),
        detail: detail.data ?? null,
        choices: choices.data ?? null,
        burn: { warn: Number(v?.['projects.burn.warn_pct'] ?? 80), over: Number(v?.['projects.burn.over_pct'] ?? 100) },
        onUpdate: async (input) => void (await write('PUT', p, input)),
        onStatus: async (status, version) => void (await write('POST', `${p}/status`, { status, version })),
        onAllocate: async (input) => void (await write('POST', `${p}/allocations`, input)),
        // The person on an allocation never changes.
        onChangeAllocation: async (aid, { employeeId: _person, ...input }) => void (await write('PUT', `${p}/allocations/${encodeURIComponent(aid)}`, input)),
        onHoursRange: setRange,
        onEndAllocation: async (aid, version) => void (await write('POST', `${p}/allocations/${encodeURIComponent(aid)}/end`, { version })),
        onAddTask: async (input) => void (await write('POST', `${p}/tasks`, input)),
        onChangeTask: async (tid, input) => void (await write('PUT', `${p}/tasks/${encodeURIComponent(tid)}`, input)),
        // T2-D 56 (answers 2865, 2866): the tasks board and who a task is assigned to.
        onMoveTask: async (tid, stage, version) => void (await write('POST', `${p}/tasks/${encodeURIComponent(tid)}/stage`, { stage, version })),
        onAssignTask: async (tid, employeeIds, version) => void (await write('PUT', `${p}/tasks/${encodeURIComponent(tid)}/assignees`, { employeeIds, version })),
        onAddMilestone: async (input) => void (await write('POST', `${p}/milestones`, input)),
        cost: cost.isError || !(can?.finance || can?.run) ? undefined : (cost.data ?? null),
        expenses: expenses.isError ? undefined : (expenses.data ?? null),
        timesheets: ts.data ?? null,
        billing: !mayBill || billing.isError ? undefined : (billing.data ?? null),
        onOpenInvoice: (iid) => router.push(`/yx/staffing/invoices/${encodeURIComponent(iid)}`),
        onTimesheetWeek: setWeek,
        onCompleteMilestone: async (mid, version) => void (await write('POST', `${p}/milestones/${encodeURIComponent(mid)}/complete`, { version })),
      }}
    />
  );
}
