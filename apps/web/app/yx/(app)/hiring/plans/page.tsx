'use client';

import { useState } from 'react';
import { useToast } from '@yukthix/ui';
import { HeadcountPlanScreen, type LivePlan } from '@yukthix/ui/hiring';
import { RequisitionSheet, type PlanLine } from '@yukthix/ui/frame';
import type { MasterRecord } from '@yukthix/ui/org';
import type { TeamMember } from '@yukthix/ui/workforce';
import { useAuth } from '../../../../../lib/auth-context';
import { loadState, todayIst, useOrg, useYxPermissions } from '../../../../../lib/yx-org';
import { useApiWrite, useHiring, useHiringWrite } from '../../../../../lib/yx-hiring';
import { usePeople } from '../../../../../lib/yx-people';

// Hiring › Headcount plan (HIR-01): the designed board, live. HR (ats.headcount.manage) plans, revises and sends plans;
// whoever holds the approval task decides it here; a hiring manager (ats.requisition.raise) reads their own department's
// approved plan and opens a requisition from a line (founder decision 11). Nothing is changed while acting for someone.
const fyNow = () => {
  const t = todayIst();
  return Number(t.slice(5, 7)) >= 4 ? Number(t.slice(0, 4)) : Number(t.slice(0, 4)) - 1;
};
const ymd = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
type OpenLine = { id: string; designation: string; grade: string | null; location: string | null; department: string; count: number; committed: number; filled: number; budget: number | null; committedBudget: number };

export default function YxHeadcountPlansPage() {
  const { impersonating, actingSuperAdmin } = useAuth();
  const { toast } = useToast();
  const perms = useYxPermissions();
  const hr = perms.has('ats.headcount.manage');
  const [fy, setFy] = useState(fyNow());
  const plans = useHiring<LivePlan[]>(`/plans?fy=${fy}`, perms.isSuccess);
  const write = useHiringWrite();
  const apiWrite = useApiWrite();
  const departments = useOrg<MasterRecord[]>('/masters/departments', hr);
  const designations = useOrg<MasterRecord[]>('/masters/designations', hr);
  const grades = useOrg<MasterRecord[]>('/masters/grades', hr);
  const locations = useOrg<MasterRecord[]>('/locations', hr);
  const choices = (rows: MasterRecord[] | undefined) => (rows ?? []).filter((r) => !r.archivedAt).map((r) => ({ value: r.id, label: r.name }));
  // A hiring manager's request sheet (PPL-08), opened from a line.
  const [requesting, setRequesting] = useState<{ line: string | null } | null>(null);
  const lines = useHiring<OpenLine[]>('/plan-lines', Boolean(requesting));
  const team = usePeople<{ members: TeamMember[] }>(requesting ? '/team' : null);
  const planLines: PlanLine[] = (lines.data ?? []).map((l) => ({ id: l.id, department: l.department, designation: l.designation, grade: l.grade ?? '', location: l.location ?? '', approved: l.count, filled: l.filled, open: l.committed, budget: l.budget ?? Number.MAX_SAFE_INTEGER, committed: l.committedBudget }));
  return (
    <>
      <HeadcountPlanScreen
        live={{
          persona: hr ? 'hr' : 'hm',
          state: perms.isLoading ? 'loading' : loadState(plans),
          onRetry: () => void plans.refetch(),
          fy,
          years: [fyNow() - 1, fyNow(), fyNow() + 1],
          onFy: setFy,
          plans: plans.data ?? [],
          choices: { departments: choices(departments.data), designations: choices(designations.data), grades: choices(grades.data), locations: choices(locations.data) },
          readOnly: impersonating || actingSuperAdmin,
          onSave: (id, input) => write<LivePlan>(id ? 'PUT' : 'POST', id ? `/plans/${encodeURIComponent(id)}` : '/plans', input),
          onSubmit: async (id, version) => void (await write('POST', `/plans/${encodeURIComponent(id)}/submit`, { version })),
          onDecide: async (taskId, decision, reason) => void (await apiWrite('POST', `/workflow/approvals/tasks/${encodeURIComponent(taskId)}/decide`, { decision, ...(reason ? { reason } : {}) })),
          ...(!hr && perms.has('ats.requisition.raise') && !impersonating && !actingSuperAdmin ? { onRequisition: (line: string | null) => setRequesting({ line }) } : {}),
        }}
      />
      {requesting && (
        <RequisitionSheet
          open
          onOpenChange={(o) => !o && setRequesting(null)}
          planLines={planLines}
          defaultLine={requesting.line}
          defaultMax={null}
          live={{
            subtitle: 'Hiring manager request',
            team: (team.data?.members ?? []).filter((m) => m.relation !== 'dotted').map((m) => ({ value: m.id, label: m.name })),
            onSend: async (x) => {
              const out = await apiWrite<{ status: string }>('POST', '/jobs/requisitions', { ...x, targetStart: x.targetStart ? ymd(x.targetStart) : null });
              toast({ tone: 'success', title: out.status === 'approved' ? `Requisition for ${x.title} approved` : `Requisition for ${x.title} sent for approval` });
            },
          }}
        />
      )}
    </>
  );
}
