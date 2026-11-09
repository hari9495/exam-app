'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useToast } from '@yukthix/ui';
import { RequisitionsScreen, type LiveRequisitionRow, type RediscoveryMatch } from '@yukthix/ui/hiring';
import { RequisitionSheet, type PlanLine } from '@yukthix/ui/frame';
import type { TeamMember } from '@yukthix/ui/workforce';
import { useAuth } from '../../../../../lib/auth-context';
import { loadState, useYxPermissions } from '../../../../../lib/yx-org';
import { useApiWrite, useHiring } from '../../../../../lib/yx-hiring';
import { usePeople } from '../../../../../lib/yx-people';

// Hiring › Requisitions (HIR-02) with the rediscovery panel (HIR-26): the designed screens, live. Recruiting and HR see
// every requisition; a hiring manager their own, read-only (founder decision 11). Past candidates are advisory: plain
// text search, with the company's AI notes only when the company switched them on (founder decision 2). Nothing is
// changed while acting for someone else; the API checks every call.
type Step = { name: string; state: string; approvers: string[]; at: string | null };
type ApiRow = {
  id: string; jobNumber: number | null; title: string; department: string; location: string; grade: string; hiringManager: string; recruiter: string;
  replacementFor: string | null; outsidePlan: boolean; outsidePlanReason: string | null; budgetAmount: number | null; positions: number; status: LiveRequisitionRow['status']; raised: string;
  line: { id: string; designation: string; grade: string; location: string; approved: number; open: number; filled: number; budget: number | null; committedBudget: number } | null;
  approval: { status: string; reason: string | null; submittedAt: string | null; submittedBy: string | null; steps: Step[]; waitingOn: string | null } | null;
};
type ApiMatch = Omit<RediscoveryMatch, 'retentionUntil' | 'pool'> & { retentionUntil: string; pool: string | null };
type OpenLine = { id: string; designation: string; grade: string | null; location: string | null; department: string; count: number; committed: number; filled: number; budget: number | null; committedBudget: number };
const STEP: Record<string, 'done' | 'rejected' | 'skipped' | 'current'> = { approved: 'done', rejected: 'rejected', skipped: 'skipped', waiting: 'current' };
const ymd = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

function requisitionRow(r: ApiRow): LiveRequisitionRow {
  const a = r.approval;
  return {
    id: r.id,
    code: r.jobNumber ? `REQ-${String(r.jobNumber).padStart(4, '0')}` : '',
    title: r.title,
    department: r.department,
    location: r.location,
    grade: r.grade,
    hiringManager: r.hiringManager,
    recruiter: r.recruiter,
    replacementFor: r.replacementFor,
    proposedMax: r.budgetAmount,
    positions: r.positions,
    status: r.status,
    raised: new Date(r.raised),
    ...(a?.waitingOn ? { waitingOn: a.waitingOn } : {}),
    line: r.line ? { id: r.line.id, department: r.department, designation: r.line.designation, grade: r.line.grade, location: r.line.location, approved: r.line.approved, filled: r.line.filled, open: r.line.open, budget: r.line.budget ?? 0, committed: r.line.committedBudget } : null,
    outsidePlan: r.outsidePlan,
    outsidePlanReason: r.outsidePlanReason,
    sentBackReason: r.status === 'Sent back' ? (a?.reason ?? null) : null,
    steps: a
      ? [
          { id: 's0', label: 'Submitted', status: 'done' as const, ...(a.submittedBy ? { approver: a.submittedBy } : {}), ...(a.submittedAt ? { at: new Date(a.submittedAt) } : {}) },
          ...a.steps.map((s, i) => ({ id: `s${i + 1}`, label: s.name, status: STEP[s.state] ?? ('pending' as const), ...(s.approvers.length ? { approver: s.approvers.join(', ') } : {}), ...(s.at && s.state !== 'waiting' ? { at: new Date(s.at) } : {}) })),
        ]
      : [],
  };
}

export default function YxRequisitionsPage() {
  const router = useRouter();
  const { impersonating, actingSuperAdmin } = useAuth();
  const acting = Boolean(impersonating || actingSuperAdmin);
  const { toast } = useToast();
  const perms = useYxPermissions();
  const list = useHiring<{ viewer: 'all' | 'own'; rows: ApiRow[] }>('/requisitions', perms.isSuccess);
  const write = useApiWrite();
  const recruiting = perms.has('pipeline:manage');
  const seesCandidates = recruiting || perms.has('candidate:view');
  const [open, setOpen] = useState<string | null>(null);
  const past = useHiring<{ mode: 'ai' | 'text'; ai: 'on' | 'off' | 'not_set_up' | 'failed'; matches: ApiMatch[] }>(open ? `/requisitions/${encodeURIComponent(open)}/rediscovery` : null, seesCandidates);
  // The request sheet (PPL-08) for whoever may raise a requisition, signed in as themselves.
  const canRaise = perms.has('ats.requisition.raise') && !acting;
  const [requesting, setRequesting] = useState(false);
  const lines = useHiring<OpenLine[]>('/plan-lines', requesting);
  const team = usePeople<{ members: TeamMember[] }>(requesting ? '/team' : null);
  const planLines: PlanLine[] = (lines.data ?? []).map((l) => ({ id: l.id, department: l.department, designation: l.designation, grade: l.grade ?? '', location: l.location ?? '', approved: l.count, filled: l.filled, open: l.committed, budget: l.budget ?? Number.MAX_SAFE_INTEGER, committed: l.committedBudget }));
  const id = encodeURIComponent;
  const failed = (title: string) => (e: unknown) => {
    toast({ tone: 'error', title, description: (e as Error).message });
    throw e;
  };
  const state = perms.isLoading ? 'loading' : loadState(list);
  return (
    <>
      <RequisitionsScreen
        rows={[]}
        planLines={[]}
        persona="recruiter"
        live={{
          persona: list.data?.viewer === 'own' ? 'hm' : 'recruiter',
          rows: (list.data?.rows ?? []).map(requisitionRow),
          state: state === 'no-access' ? 'error' : state,
          onRetry: () => void list.refetch(),
          canManage: recruiting && !acting,
          ...(recruiting ? { onOpenJob: (r: LiveRequisitionRow) => router.push(`/yx/hiring/jobs/${id(r.id)}`) } : {}),
          onSubmit: (r) =>
            write<{ status?: string }>('POST', `/jobs/${id(r.id)}/submit`).then(
              (x) => void toast({ tone: 'success', title: x?.status === 'approved' ? `${r.title} approved` : `${r.title} sent for approval` }),
              failed(`Could not send ${r.title}`),
            ),
          onWithdraw: (r) => write('POST', `/jobs/${id(r.id)}/approval/cancel`).then(() => void toast({ tone: 'success', title: `${r.title} withdrawn from approval` }), failed(`Could not withdraw ${r.title}`)),
          ...(canRaise ? { onNew: () => setRequesting(true) } : {}),
          onOpenRow: setOpen,
          ...(seesCandidates
            ? {
                rediscovery: {
                  state: past.isLoading ? 'loading' : past.isError ? 'error' : 'ready',
                  onRetry: () => void past.refetch(),
                  mode: past.data?.mode ?? 'text',
                  ai: past.data?.ai ?? 'off',
                  matches: (past.data?.matches ?? []).map((m) => ({ ...m, retentionUntil: new Date(m.retentionUntil), pool: m.pool ?? undefined })),
                  ...(recruiting && !acting && open
                    ? {
                        onAdd: (m: RediscoveryMatch) =>
                          write('POST', `/jobs/${id(open)}/entries`, { candidateId: m.id }).then(() => void toast({ tone: 'success', title: `${m.name} added to the pipeline` }), failed(`Could not add ${m.name}`)),
                      }
                    : {}),
                },
              }
            : {}),
          now: new Date(),
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
            team: (team.data?.members ?? []).filter((m) => m.relation !== 'dotted').map((m) => ({ value: m.id, label: m.name })),
            onSend: async (x) => {
              const out = await write<{ status: string }>('POST', '/jobs/requisitions', { ...x, targetStart: x.targetStart ? ymd(x.targetStart) : null });
              toast({ tone: 'success', title: out.status === 'approved' ? `Requisition for ${x.title} approved` : `Requisition for ${x.title} sent for approval` });
            },
          }}
        />
      )}
    </>
  );
}
