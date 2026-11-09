'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useToast } from '@yukthix/ui';
import { EmailDialog, RequisitionsScreen, type LiveRequisitionRow, type RediscoveryMatch } from '@yukthix/ui/hiring';
import { RequisitionSheet, type LiveRequisitionSheet, type PlanLine } from '@yukthix/ui/frame';
import type { TeamMember } from '@yukthix/ui/workforce';
import { useAuth } from '../../../../../lib/auth-context';
import { loadState, useYxPermissions } from '../../../../../lib/yx-org';
import { useApiWrite, useHiring } from '../../../../../lib/yx-hiring';
import { usePeople } from '../../../../../lib/yx-people';
import { useTeammates } from '../../../../../lib/hooks/useUserDirectory';
import { useMessageTemplates } from '../../../../../lib/hooks/useCandidateMessages';
import { useOrgSenderAddresses } from '../../../../../lib/hooks/useOrgSenderAddresses';
import { templateChoices } from '../../../../../lib/yx-candidates';

// Hiring › Requisitions (HIR-02) with the rediscovery panel (HIR-26): the designed screens, live. Recruiting and HR see
// every requisition; a hiring manager their own (founder decision 11), and changes one only when it was sent back
// (answer 252). The approval task holder approves or sends back in the drawer (257); recruiting assigns a recruiter,
// cancels with a reason (253) and contacts past candidates who opted in (254); a hiring manager suggests one to the
// recruiter (255). Past candidates are advisory (decision 2). Nothing is changed while acting for someone else; the API
// checks every call.
type Step = { name: string; state: string; approvers: string[]; at: string | null };
type ApiRow = {
  id: string; jobNumber: number | null; title: string; department: string; location: string; grade: string; hiringManager: string; recruiter: string;
  replacementFor: string | null; outsidePlan: boolean; outsidePlanReason: string | null; budgetAmount: number | null; positions: number; status: LiveRequisitionRow['status']; raised: string;
  mine: boolean; cancelReason: string | null;
  request: { requisitionReason: 'new' | 'replacement' | null; headcountPlanLineId: string | null; replacementOfEmployeeId: string | null; targetStart: string | null };
  line: { id: string; designation: string; grade: string; location: string; approved: number; open: number; filled: number; budget: number | null; committedBudget: number } | null;
  approval: { status: string; reason: string | null; submittedAt: string | null; submittedBy: string | null; steps: Step[]; waitingOn: string | null; myTaskId: string | null } | null;
};
type ApiMatch = Omit<RediscoveryMatch, 'retentionUntil' | 'pool'> & { retentionUntil: string; pool: string | null };
type OpenLine = { id: string; designation: string; grade: string | null; location: string | null; department: string; count: number; committed: number; filled: number; budget: number | null; committedBudget: number };
type Input = Parameters<LiveRequisitionSheet['onSend']>[0];
const STEP: Record<string, 'done' | 'rejected' | 'skipped' | 'current'> = { approved: 'done', rejected: 'rejected', skipped: 'skipped', waiting: 'current' };
const ymd = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

function requisitionRow(r: ApiRow, acting: boolean): LiveRequisitionRow {
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
    canDecide: Boolean(a?.myTaskId) && a?.status === 'pending' && !acting,
    mine: r.mine,
    cancelReason: r.cancelReason,
    steps: a
      ? [
          { id: 's0', label: 'Submitted', status: 'done' as const, ...(a.submittedBy ? { approver: a.submittedBy } : {}), ...(a.submittedAt ? { at: new Date(a.submittedAt) } : {}) },
          ...a.steps.map((s, i) => ({ id: `s${i + 1}`, label: s.name, status: STEP[s.state] ?? ('pending' as const), ...(s.approvers.length ? { approver: s.approvers.join(', ') } : {}), ...(s.at && s.state !== 'waiting' ? { at: new Date(s.at) } : {}) })),
        ]
      : [],
  };
}

/** What the request sheet opens with for a change or a Duplicate. */
const inputOf = (r: ApiRow, copy: boolean): Input => ({
  title: r.title,
  requisitionReason: r.request.requisitionReason ?? 'new',
  headcountPlanLineId: r.request.headcountPlanLineId,
  outsidePlan: r.outsidePlan,
  outsidePlanReason: r.outsidePlanReason,
  replacementOfEmployeeId: copy ? null : r.request.replacementOfEmployeeId,
  headcount: r.positions,
  budgetAmount: r.budgetAmount,
  targetStart: !copy && r.request.targetStart ? new Date(`${r.request.targetStart}T00:00:00`) : null,
});

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
  // The request sheet (PPL-08) for whoever may raise a requisition, signed in as themselves: new, change (252), copy (253).
  const canRaise = perms.has('ats.requisition.raise') && !acting;
  const [sheet, setSheet] = useState<{ edit: string | null; initial?: Input } | null>(null);
  const lines = useHiring<OpenLine[]>('/plan-lines', Boolean(sheet));
  const team = usePeople<{ members: TeamMember[] }>(sheet ? '/team' : null);
  const planLines: PlanLine[] = (lines.data ?? []).map((l) => ({ id: l.id, department: l.department, designation: l.designation, grade: l.grade ?? '', location: l.location ?? '', approved: l.count, filled: l.filled, open: l.committed, budget: l.budget ?? Number.MAX_SAFE_INTEGER, committed: l.committedBudget }));
  // Recruiting: the recruiter choices (253) and the candidate email (254).
  const manage = recruiting && !acting;
  const teammates = useTeammates();
  const [emailing, setEmailing] = useState<RediscoveryMatch | null>(null);
  const templates = useMessageTemplates();
  const senders = useOrgSenderAddresses();
  const apiRows = list.data?.rows ?? [];
  const byId = (id: string) => apiRows.find((r) => r.id === id)!;
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
          rows: apiRows.map((r) => requisitionRow(r, acting)),
          state: state === 'no-access' ? 'error' : state,
          onRetry: () => void list.refetch(),
          canManage: manage,
          ...(recruiting ? { onOpenJob: (r: LiveRequisitionRow) => router.push(`/yx/hiring/jobs/${id(r.id)}`) } : {}),
          onSubmit: (r) =>
            write<{ status?: string }>('POST', `/jobs/${id(r.id)}/submit`).then(
              (x) => void toast({ tone: 'success', title: x?.status === 'approved' ? `${r.title} approved` : `${r.title} sent for approval` }),
              failed(`Could not send ${r.title}`),
            ),
          onWithdraw: (r) => write('POST', `/jobs/${id(r.id)}/approval/cancel`).then(() => void toast({ tone: 'success', title: `${r.title} withdrawn from approval` }), failed(`Could not withdraw ${r.title}`)),
          ...(canRaise
            ? {
                onNew: () => setSheet({ edit: null }),
                onEdit: (r: LiveRequisitionRow) => setSheet({ edit: r.id, initial: inputOf(byId(r.id), false) }),
                onDuplicate: (r: LiveRequisitionRow) => setSheet({ edit: null, initial: inputOf(byId(r.id), true) }),
              }
            : {}),
          // 257: only the task holder sees these; the approvals engine checks again (the sender never holds the task).
          onDecide: (r, decision, reason) =>
            write('POST', `/workflow/approvals/tasks/${id(byId(r.id).approval?.myTaskId ?? '')}/decide`, { decision, ...(reason ? { reason } : {}) }).then(
              () => void toast({ tone: 'success', title: decision === 'approve' ? `Approved: ${r.title}` : `Sent back: ${r.title}`, description: 'The hiring manager is told by email and in their bell.' }),
              failed(`Could not decide ${r.title}`),
            ),
          ...(manage
            ? {
                onCancel: (r: LiveRequisitionRow, reason: string) =>
                  write('POST', `/hiring/requisitions/${id(r.id)}/cancel`, { reason }).then(() => void toast({ tone: 'success', title: `${r.title} cancelled` }), failed(`Could not cancel ${r.title}`)),
                assign: {
                  recruiters: (teammates.data ?? []).map((t) => ({ value: t.id, label: t.name ?? t.email })),
                  onAssign: async (rows: LiveRequisitionRow[], userId: string) => {
                    try {
                      for (const r of rows) await write('PATCH', `/jobs/${id(r.id)}`, { recruiterUserId: userId });
                    } catch (e) {
                      failed('Could not assign the recruiter')(e);
                    }
                    const name = (teammates.data ?? []).find((t) => t.id === userId)?.name ?? 'The recruiter';
                    toast({ tone: 'success', title: `${name} is the recruiter of ${rows.length === 1 ? rows[0].title : `${rows.length} requisitions`}` });
                  },
                },
              }
            : {}),
          onOpenRow: setOpen,
          ...(seesCandidates
            ? {
                rediscovery: {
                  state: past.isLoading ? 'loading' : past.isError ? 'error' : 'ready',
                  onRetry: () => void past.refetch(),
                  mode: past.data?.mode ?? 'text',
                  ai: past.data?.ai ?? 'off',
                  matches: (past.data?.matches ?? []).map((m) => ({ ...m, retentionUntil: new Date(m.retentionUntil), pool: m.pool ?? undefined })),
                  ...(manage && open
                    ? {
                        onAdd: (m: RediscoveryMatch) =>
                          write('POST', `/jobs/${id(open)}/entries`, { candidateId: m.id }).then(() => void toast({ tone: 'success', title: `${m.name} added to the pipeline` }), failed(`Could not add ${m.name}`)),
                        onContact: (m: RediscoveryMatch) => setEmailing(m),
                      }
                    : {}),
                  ...(!recruiting && !acting && open
                    ? {
                        onSuggest: (m: RediscoveryMatch) =>
                          write('POST', `/hiring/requisitions/${id(open)}/rediscovery/${id(m.id)}/suggest`).then(() => void toast({ tone: 'success', title: `${m.name} suggested to the recruiter` }), failed(`Could not suggest ${m.name}`)),
                      }
                    : {}),
                },
              }
            : {}),
          now: new Date(),
        }}
      />
      {sheet && (
        <RequisitionSheet
          open
          onOpenChange={(o) => !o && setSheet(null)}
          planLines={planLines}
          defaultLine={null}
          defaultMax={null}
          live={{
            subtitle: 'Hiring manager request',
            ...(sheet.edit ? { title: 'Change and send again' } : {}),
            ...(sheet.initial ? { initial: sheet.initial } : {}),
            team: (team.data?.members ?? []).filter((m) => m.relation !== 'dotted').map((m) => ({ value: m.id, label: m.name })),
            onSend: async (x) => {
              const body = { ...x, targetStart: x.targetStart ? ymd(x.targetStart) : null };
              const out = sheet.edit ? await write<{ status: string }>('PUT', `/jobs/requisitions/${id(sheet.edit)}`, body) : await write<{ status: string }>('POST', '/jobs/requisitions', body);
              toast({ tone: 'success', title: out.status === 'approved' ? `Requisition for ${x.title} approved` : `Requisition for ${x.title} sent for approval` });
            },
          }}
        />
      )}
      {emailing && (
        <EmailDialog
          count={1}
          templates={templateChoices(templates.data)}
          senders={(senders.data ?? []).map((s) => ({ value: s.id, label: `${s.label} <${s.address}>` }))}
          onClose={() => setEmailing(null)}
          onSend={async (c) => {
            await write('POST', '/bulk-candidate-email/by-candidates', { ...c, candidateIds: [emailing.id] });
            toast({ tone: 'success', title: `Email to ${emailing.name} is on its way` });
          }}
        />
      )}
    </>
  );
}
