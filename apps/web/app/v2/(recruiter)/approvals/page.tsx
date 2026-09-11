'use client';

// v2 Approvals inbox -- completes the approvals UI loop (Task 7). An approver sees requests
// currently awaiting their decision (scope=inbox); anyone can track what they've submitted
// (scope=submitted). Visible to every recruiter-console user (no gating): the list is simply
// empty when nothing is assigned to you. Row -> detail Dialog (ApprovalTimeline) -> for inbox
// rows, a second step opens ApprovalDecisionDialog wired to useDecideApproval.
import { useState } from 'react';
import type { ColumnDef } from '@tanstack/react-table';
import { useApprovalRequests, useApprovalRequest, useDecideApproval } from '../../../../lib/hooks/useApprovals';
import { useTeammates } from '../../../../lib/hooks/useUserDirectory';
import { formatRelativeTime } from '../../../../lib/audit-display';
import { deriveStepStates } from '../../../../lib/approvals-display';
import type { ApprovalGate, ApprovalRequestSummary, DirectoryUser } from '../../../../lib/types';
import { DataTable, DT_FEATURES, dt, Pill, Tabs, Dialog, Button, ApprovalTimeline, ApprovalDecisionDialog } from '../../../../components/ui-v2';
import { VIZ, STATUS } from '../../../../components/ui-v2/viz';

const GATE_LABEL: Record<ApprovalGate, string> = { requisition: 'Requisition', offer: 'Offer' };
const GATE_COLOR: Record<ApprovalGate, string> = { requisition: VIZ.azure, offer: VIZ.violet };
const STATUS_PILL: Record<string, { c: string; label: string }> = {
  pending_approval: { c: STATUS.warn, label: 'Pending' },
  approved: { c: STATUS.ok, label: 'Approved' },
  rejected: { c: STATUS.bad, label: 'Rejected' },
  cancelled: { c: 'var(--muted)', label: 'Cancelled' },
};
const linkBtn: React.CSSProperties = { background: 'none', border: 'none', padding: 0, font: 'inherit', fontWeight: 600, color: 'var(--org-primary)', cursor: 'pointer', textAlign: 'left' };

const card: React.CSSProperties = { background: 'var(--paper)', border: '1px solid var(--hair)', borderRadius: 14, boxShadow: '0 1px 2px rgba(11,18,32,.04), 0 12px 32px -18px rgba(11,18,32,.22)' };

// Demoted metric for the quiet strip (Workfox rule 4/8): label + tabular number. No rainbow icon
// stat tiles -- one card, thin dividers between cells.
function QuietStat({ label, value }: { label: string; value: number }) {
  return (
    <div style={{ padding: '14px 18px', minWidth: 0 }}>
      <div style={{ fontSize: 11, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.08em', color: 'var(--muted)' }}>{label}</div>
      <div className="v2-mono" style={{ fontSize: 24, fontWeight: 600, color: 'var(--ink)', marginTop: 6 }}>{value.toLocaleString()}</div>
    </div>
  );
}

function subjectLabel(row: { subjectType: string; subjectId: string; subjectLabel?: string }): string {
  return row.subjectLabel || `${row.subjectType === 'job' ? 'Job' : 'Offer'} #${row.subjectId.slice(0, 8)}`;
}

function submitterLabel(userId: string, teammates: DirectoryUser[] | undefined): string {
  const u = teammates?.find((t) => t.id === userId);
  return u?.name || u?.email || `User #${userId.slice(0, 6)}`;
}

// Detail dialog for one request, plus (inbox scope only) the decide step. Kept as its own
// component so the two dialogs share `deciding` state without leaking it into the list page.
function RequestDetailDialog({
  id, scope, teammates, onClose,
}: { id: string; scope: 'inbox' | 'submitted'; teammates: DirectoryUser[] | undefined; onClose: () => void }) {
  const { data: detail, isLoading } = useApprovalRequest(id);
  const decide = useDecideApproval();
  const [deciding, setDeciding] = useState(false);

  const canDecide = scope === 'inbox' && detail?.status === 'pending_approval';

  function handleDecide(decision: 'approved' | 'rejected', note: string) {
    decide.mutate(
      { id, decision, note: note.trim() || undefined },
      { onSuccess: () => { setDeciding(false); onClose(); } },
    );
  }

  return (
    <>
      <Dialog open={!deciding} onClose={onClose} title="Approval request" width={520}>
        {isLoading || !detail ? (
          <p style={{ fontSize: 13, color: 'var(--muted)' }}>Loading…</p>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
                <Pill c={GATE_COLOR[detail.gate]} label={GATE_LABEL[detail.gate]} />
                <Pill c={STATUS_PILL[detail.status]?.c ?? 'var(--muted)'} label={STATUS_PILL[detail.status]?.label ?? detail.status} />
              </div>
              <div style={{ fontSize: 15, fontWeight: 600, color: 'var(--ink)' }}>
                {(detail.subjectType === 'job' ? (detail.subject.title as string | undefined) : detail.subject.candidateName ? `Offer for ${detail.subject.candidateName as string}` : undefined) ?? subjectLabel(detail)}
              </div>
              <div style={{ fontSize: 12.5, color: 'var(--muted)', marginTop: 2 }}>
                Submitted by {submitterLabel(detail.submittedByUserId, teammates)} · {formatRelativeTime(detail.submittedAt)}
              </div>
            </div>
            <ApprovalTimeline steps={deriveStepStates(detail.steps, detail.decisions, detail.currentStepPosition)} currentStep={detail.currentStepPosition} />
            {canDecide && <Button onClick={() => setDeciding(true)}>Review &amp; decide</Button>}
          </div>
        )}
      </Dialog>
      {deciding && detail && (
        <ApprovalDecisionDialog
          open
          onClose={() => setDeciding(false)}
          onDecide={handleDecide}
          pending={decide.isPending}
          error={decide.isError ? (decide.error instanceof Error ? decide.error.message : 'Failed to record decision.') : undefined}
        />
      )}
    </>
  );
}

export default function V2ApprovalsPage() {
  const [scope, setScope] = useState<'inbox' | 'submitted'>('inbox');
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const inbox = useApprovalRequests('inbox');
  const submitted = useApprovalRequests('submitted');
  const { data: teammates } = useTeammates();
  const current = scope === 'inbox' ? inbox : submitted;
  const rows = current.data ?? [];

  const approvedRecently = (submitted.data ?? []).filter((r) => r.status === 'approved').length;

  const columns: ColumnDef<typeof DT_FEATURES, ApprovalRequestSummary>[] = [
    {
      id: 'subject', enableSorting: false, enableHiding: false,
      header: () => <span style={{ fontSize: 11, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.06em', color: 'var(--muted)' }}>Subject</span>,
      cell: ({ row }) => <button type="button" onClick={() => setSelectedId(row.original.id)} style={linkBtn}>{subjectLabel(row.original)}</button>,
    },
    {
      accessorKey: 'gate', enableSorting: false,
      header: () => <span style={{ fontSize: 11, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.06em', color: 'var(--muted)' }}>Gate</span>,
      cell: ({ row }) => <Pill c={GATE_COLOR[row.original.gate]} label={GATE_LABEL[row.original.gate]} />,
    },
    {
      id: 'submitter', enableSorting: false,
      header: () => <span style={{ fontSize: 11, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.06em', color: 'var(--muted)' }}>Submitter</span>,
      cell: ({ row }) => <span style={dt.muted}>{submitterLabel(row.original.submittedByUserId, teammates)}</span>,
    },
    {
      id: 'step', enableSorting: false,
      header: () => <span style={{ fontSize: 11, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.06em', color: 'var(--muted)' }}>Step</span>,
      cell: ({ row }) => <span style={dt.muted}>{row.original.currentStepPosition + 1}/{row.original.stepCount}</span>,
    },
    {
      accessorKey: 'status', enableSorting: false,
      header: () => <span style={{ fontSize: 11, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.06em', color: 'var(--muted)' }}>Status</span>,
      cell: ({ row }) => <Pill c={STATUS_PILL[row.original.status]?.c ?? 'var(--muted)'} label={STATUS_PILL[row.original.status]?.label ?? row.original.status} />,
    },
    {
      id: 'waiting', enableSorting: false,
      header: () => <span style={{ fontSize: 11, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.06em', color: 'var(--muted)' }}>Waiting since</span>,
      cell: ({ row }) => <span style={dt.muted}>{formatRelativeTime(row.original.submittedAt)}</span>,
    },
  ];

  return (
    <>
      {/* Content-only entrance; the detail/decision Dialogs stay outside (a .v2-rise transform
          becomes the containing block for their position:fixed overlays). */}
      <div className="v2-rise">
      <div style={{ marginBottom: 16 }}>
        <p style={{ fontSize: 11, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.12em', color: 'var(--muted)', margin: 0 }}>Approvals</p>
        <h1 className="v2-title" style={{ fontSize: 22, margin: '2px 0 0' }}>Approval Inbox</h1>
        <p style={{ fontSize: 13, color: 'var(--muted)', margin: '4px 0 0' }}>Review requisitions and offers waiting on your sign-off, and track what you&apos;ve submitted.</p>
      </div>

      {/* Quiet metric strip — one card, thin dividers, no rainbow icon stat tiles (Workfox rule 4/8). */}
      <div style={{ ...card, display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', marginBottom: 16 }} className="wf-hero-kpis">
        <QuietStat label="Awaiting you" value={inbox.data?.length ?? 0} />
        <div style={{ borderLeft: '1px solid var(--hair)' }}><QuietStat label="Submitted by you" value={submitted.data?.length ?? 0} /></div>
        <div style={{ borderLeft: '1px solid var(--hair)' }}><QuietStat label="Approved recently" value={approvedRecently} /></div>
      </div>

      <Tabs
        divider={false}
        value={scope}
        onChange={(v) => { setScope(v as 'inbox' | 'submitted'); setSelectedId(null); }}
        tabs={[
          { value: 'inbox', label: 'Inbox', badge: inbox.data?.length || undefined },
          { value: 'submitted', label: 'Submitted', badge: submitted.data?.length || undefined },
        ]}
      />

      <DataTable
        columns={columns} data={rows} getRowId={(r) => r.id} hideToolbar
        isLoading={current.isLoading} isError={current.isError}
        errorMessage="Failed to load approval requests."
        emptyMessage={scope === 'inbox' ? "Nothing is waiting on you right now." : "You haven't submitted anything for approval yet."}
      />
      </div>

      {selectedId && <RequestDetailDialog id={selectedId} scope={scope} teammates={teammates} onClose={() => setSelectedId(null)} />}
    </>
  );
}
