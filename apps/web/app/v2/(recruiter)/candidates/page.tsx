'use client';

// v2 candidates list — zebra-polished shared DataTable (same format as exams). Adds row selection +
// a bulk-invite bar via renderBulkBar; status filter in the Status header; kebab Edit/Deactivate/
// Delete; Add/Edit form modals. Search + status + pagination server-side.
import { useState } from 'react';
import type { ColumnDef } from '@tanstack/react-table';
import { MoreHorizontal, Upload, Power, Trash2, Send, Plus, Pencil, ListFilter, Check, UserPlus, Users } from 'lucide-react';
import { useCandidates, useCreateCandidate, useUpdateCandidate, useDeleteCandidate } from '../../../../lib/hooks/useCandidates';
import { useExams } from '../../../../lib/hooks/useExams';
import { useBulkInvite } from '../../../../lib/hooks/useInvitations';
import { GLOBAL_STAGES, type Candidate, type GlobalStage } from '../../../../lib/types';
import { DataTable, DT_FEATURES, dt, SortHead, Pill, Combobox, Dropdown, DropdownItem, Dialog } from '../../../../components/ui-v2';
import { VIZ, STATUS } from '../../../../components/ui-v2/viz';
import { CandidateFormDialog, type CandidateFormValues } from './CandidateFormDialog';
import { BulkUploadInviteDialog } from './BulkUploadInviteDialog';
import { ReEngageModal } from './ReEngageModal';

const STATUS_OPTS = [{ value: 'active', label: 'Active' }, { value: 'inactive', label: 'Inactive' }, { value: 'all', label: 'All' }];
const COLUMN_LABELS: Record<string, string> = { email: 'Email', phone: 'Phone', createdAt: 'Added', globalStage: 'Stage' };

// Friendly labels + a colour per GLOBAL_STAGES value, in the new -> rejected funnel order the
// API returns them in (see @exam-platform/shared's global-stage.ts).
const STAGE_LABELS: Record<GlobalStage, string> = {
  new: 'New', in_review: 'In review', engaged: 'Engaged', available: 'Available',
  offered: 'Offered', hired: 'Hired', rejected: 'Rejected',
};
const STAGE_COLORS: Record<GlobalStage, string> = {
  new: 'var(--muted)', in_review: VIZ.azure, engaged: VIZ.violet, available: VIZ.teal,
  offered: VIZ.amber, hired: STATUS.ok, rejected: STATUS.bad,
};
const STAGE_OPTS = [{ value: 'all', label: 'All' }, ...GLOBAL_STAGES.map((s) => ({ value: s, label: STAGE_LABELS[s] }))];
const AVA = [VIZ.azure, VIZ.teal, VIZ.violet, VIZ.amber];
function initials(n: string) { return n.split(' ').map((p) => p[0]).slice(0, 2).join('').toUpperCase(); }
function Avatar({ name, i }: { name: string; i: number }) {
  const c = AVA[i % AVA.length];
  return <span style={{ width: 30, height: 30, borderRadius: '50%', flexShrink: 0, display: 'grid', placeItems: 'center', fontSize: 11, fontWeight: 600, background: `color-mix(in srgb, ${c} 15%, var(--surface))`, color: c }}>{initials(name)}</span>;
}
function csvCell(v: string) { return /[",\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v; }

export default function V2CandidatesPage() {
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('active');
  const [stageFilter, setStageFilter] = useState('all');
  const [examId, setExamId] = useState('');
  const [pendingDelete, setPendingDelete] = useState<Candidate | null>(null);
  const [addOpen, setAddOpen] = useState(false);
  const [bulkOpen, setBulkOpen] = useState(false);
  const [editing, setEditing] = useState<Candidate | null>(null);
  const [reengaging, setReengaging] = useState<Candidate | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const [notice, setNotice] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const notify = (type: 'success' | 'error', text: string) => { setNotice({ type, text }); setTimeout(() => setNotice(null), 4000); };

  const { data: resp, isLoading, isError, refetch } = useCandidates({
    page, pageSize: 20, search: search || undefined,
    status: statusFilter === 'all' ? undefined : statusFilter,
    globalStage: stageFilter === 'all' ? undefined : stageFilter,
  });
  const rows = resp?.data ?? [];
  const { data: pubExams } = useExams('published', { pageSize: 100 });
  const examOptions = (pubExams?.data ?? []).map((e) => ({ value: e.id, label: e.title }));
  const createCandidate = useCreateCandidate();
  const updateCandidate = useUpdateCandidate();
  const deleteCandidate = useDeleteCandidate();
  const bulkInvite = useBulkInvite(examId);

  function handleToggleStatus(c: Candidate) {
    const next = c.status === 'inactive' ? 'active' : 'inactive';
    updateCandidate.mutate({ id: c.id, status: next }, {
      onSuccess: () => notify('success', next === 'inactive' ? 'Candidate deactivated.' : 'Candidate reactivated.'),
      onError: (e) => notify('error', e instanceof Error ? e.message : 'Failed to update candidate.'),
    });
  }
  function handleConfirmDelete() {
    if (!pendingDelete) return;
    deleteCandidate.mutate(pendingDelete.id, {
      onSuccess: () => { notify('success', 'Candidate deleted.'); setPendingDelete(null); },
      onError: (e) => { notify('error', e instanceof Error ? e.message : 'Failed to delete candidate.'); setPendingDelete(null); },
    });
  }
  function handleInvite(ids: string[], clear: () => void) {
    bulkInvite.mutate(ids, {
      onSuccess: (result) => { notify('success', `Invited ${result.created.length} candidate(s).${result.skipped.length ? ` ${result.skipped.length} skipped.` : ''}`); clear(); },
      onError: (e) => notify('error', e instanceof Error ? e.message : 'Failed to send invitations.'),
    });
  }
  function handleAdd(v: CandidateFormValues) {
    setFormError(null);
    createCandidate.mutate(v, { onSuccess: () => { setAddOpen(false); notify('success', 'Candidate added.'); }, onError: (e) => setFormError(e instanceof Error ? e.message : 'Failed to add candidate.') });
  }
  function handleEditSubmit(v: CandidateFormValues) {
    if (!editing) return;
    setFormError(null);
    updateCandidate.mutate({ id: editing.id, name: v.name, email: v.email, phone: v.phone }, { onSuccess: () => { setEditing(null); notify('success', 'Candidate updated.'); }, onError: (e) => setFormError(e instanceof Error ? e.message : 'Failed to update candidate.') });
  }
  function exportCsv() {
    const header = ['Name', 'Email', 'Phone', 'Status', 'Added'];
    const lines = rows.map((c) => [c.name, c.email, c.phone ?? '', c.status, new Date(c.createdAt).toLocaleDateString()].map(csvCell).join(','));
    const url = URL.createObjectURL(new Blob([[header.join(','), ...lines].join('\n')], { type: 'text/csv;charset=utf-8' }));
    const a = document.createElement('a'); a.href = url; a.download = 'candidates.csv'; a.click(); URL.revokeObjectURL(url);
  }

  const columns: ColumnDef<typeof DT_FEATURES, Candidate>[] = [
    {
      accessorKey: 'name', enableHiding: false,
      header: ({ column }) => <SortHead label="Name" sorted={column.getIsSorted()} onClick={() => column.toggleSorting(column.getIsSorted() === 'asc')} />,
      cell: ({ row }) => (
        <div style={{ display: 'flex', alignItems: 'center', gap: 11, minWidth: 0 }}>
          <Avatar name={row.original.name} i={row.index} />
          <div style={{ minWidth: 0 }}>
            <div style={{ fontWeight: 500, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{row.original.name}</div>
            <div style={{ fontSize: 12, color: 'var(--muted)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{row.original.email}</div>
          </div>
        </div>
      ),
    },
    { accessorKey: 'email', header: ({ column }) => <SortHead label="Email" sorted={column.getIsSorted()} onClick={() => column.toggleSorting(column.getIsSorted() === 'asc')} />, cell: ({ row }) => <span style={dt.muted}>{row.original.email}</span> },
    { accessorKey: 'phone', enableSorting: false, header: () => <span style={{ fontSize: 11, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.06em', color: 'var(--muted)' }}>Phone</span>, cell: ({ row }) => <span style={dt.muted}>{row.original.phone ?? '—'}</span> },
    {
      accessorKey: 'status', enableSorting: false, enableHiding: false,
      header: () => (
        <Dropdown align="start" menuWidth={150} trigger={
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5, cursor: 'pointer', fontSize: 11, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.06em', color: statusFilter !== 'active' ? 'var(--org-primary)' : 'var(--muted)' }}>Status <ListFilter size={12} style={{ opacity: 0.75 }} /></span>
        }>
          {(close) => STATUS_OPTS.map((o) => (
            <DropdownItem key={o.value} onClick={() => { close(); setStatusFilter(o.value); setPage(1); }}>
              <span style={{ width: 15, display: 'inline-flex', flexShrink: 0, color: 'var(--org-primary)' }}>{statusFilter === o.value && <Check size={15} />}</span>{o.label}
            </DropdownItem>
          ))}
        </Dropdown>
      ),
      cell: ({ row }) => <Pill c={row.original.status === 'active' ? STATUS.ok : 'var(--muted)'} label={row.original.status === 'active' ? 'Active' : 'Inactive'} />,
    },
    {
      accessorKey: 'globalStage', enableSorting: false, enableHiding: false,
      header: () => (
        <Dropdown align="start" menuWidth={160} trigger={
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5, cursor: 'pointer', fontSize: 11, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.06em', color: stageFilter !== 'all' ? 'var(--org-primary)' : 'var(--muted)' }}>Stage <ListFilter size={12} style={{ opacity: 0.75 }} /></span>
        }>
          {(close) => STAGE_OPTS.map((o) => (
            <DropdownItem key={o.value} onClick={() => { close(); setStageFilter(o.value); setPage(1); }}>
              <span style={{ width: 15, display: 'inline-flex', flexShrink: 0, color: 'var(--org-primary)' }}>{stageFilter === o.value && <Check size={15} />}</span>{o.label}
            </DropdownItem>
          ))}
        </Dropdown>
      ),
      cell: ({ row }) => <Pill c={STAGE_COLORS[row.original.globalStage]} label={STAGE_LABELS[row.original.globalStage]} />,
    },
    { accessorKey: 'createdAt', header: ({ column }) => <SortHead label="Added" sorted={column.getIsSorted()} onClick={() => column.toggleSorting(column.getIsSorted() === 'asc')} />, cell: ({ row }) => <span style={dt.muted}>{new Date(row.original.createdAt).toLocaleDateString()}</span> },
    {
      id: 'actions', enableSorting: false, enableHiding: false, header: () => null,
      cell: ({ row }) => {
        const c = row.original;
        const isInactive = c.status === 'inactive';
        const neverInvited = (c.invitationCount ?? 0) === 0;
        return (
          <Dropdown align="end" menuWidth={172} trigger={<span style={{ display: 'inline-grid', placeItems: 'center', width: 30, height: 30, color: 'var(--muted)', cursor: 'pointer' }}><MoreHorizontal size={17} /></span>}>
            {(close) => (<>
              <DropdownItem onClick={() => { close(); setFormError(null); setEditing(c); }}><Pencil size={15} /> Edit</DropdownItem>
              {c.globalStage === 'available' && <DropdownItem onClick={() => { close(); setReengaging(c); }}><UserPlus size={15} /> Re-engage</DropdownItem>}
              <DropdownItem onClick={() => { close(); handleToggleStatus(c); }}><Power size={15} /> {isInactive ? 'Reactivate' : 'Deactivate'}</DropdownItem>
              {neverInvited && <DropdownItem danger onClick={() => { close(); setPendingDelete(c); }}><Trash2 size={15} /> Delete</DropdownItem>}
            </>)}
          </Dropdown>
        );
      },
    },
  ];

  return (
    <>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap', marginBottom: 16 }}>
        <h1 className="v2-title" style={{ fontSize: 22, margin: 0 }}>Candidates</h1>
        <span style={{ display: 'inline-flex', gap: 8 }}>
          <button
            type="button" className="v2-hoverbtn" style={stageFilter === 'available' ? dt.primaryBtn : dt.toolBtn}
            onClick={() => { setStageFilter(stageFilter === 'available' ? 'all' : 'available'); setPage(1); }}
          >
            <Users size={14} /> Talent pool
          </button>
          <button type="button" className="v2-hoverbtn" style={dt.toolBtn} onClick={() => setBulkOpen(true)}><Upload size={14} /> Upload &amp; invite</button>
          <button type="button" className="v2-hoverbtn" style={dt.primaryBtn} onClick={() => { setFormError(null); setAddOpen(true); }}><Plus size={14} /> Add candidate</button>
        </span>
      </div>

      {notice && (
        <div role="status" style={{ marginBottom: 12, fontSize: 13, padding: '9px 13px', borderRadius: 9, border: `1px solid ${notice.type === 'success' ? 'color-mix(in srgb, #15803d 30%, transparent)' : 'color-mix(in srgb, var(--danger) 30%, transparent)'}`, background: notice.type === 'success' ? 'color-mix(in srgb, #15803d 8%, transparent)' : 'color-mix(in srgb, var(--danger) 8%, transparent)', color: notice.type === 'success' ? STATUS.ok : 'var(--danger)' }}>{notice.text}</div>
      )}

      <DataTable
        columns={columns} data={rows} getRowId={(r) => r.id}
        search={search} onSearchChange={(v) => { setSearch(v); setPage(1); }} searchPlaceholder="Search candidates…"
        page={resp?.page ?? 1} totalPages={resp?.totalPages ?? 1} onPageChange={setPage}
        isLoading={isLoading} isError={isError} errorMessage="Failed to load candidates." emptyMessage="No candidates found."
        columnLabels={COLUMN_LABELS} onExport={exportCsv}
        enableSelection
        renderBulkBar={(ids, clear) => (
          <div style={dt.bulkBar}>
            <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--org-primary)' }}>{ids.length} selected</span>
            <span style={{ marginLeft: 'auto', display: 'inline-flex', alignItems: 'center', gap: 8 }}>
              <Combobox options={examOptions} value={examId} onChange={setExamId} placeholder="Choose exam…" width={220} active={!!examId} />
              <button type="button" onClick={() => handleInvite(ids, clear)} disabled={!examId || bulkInvite.isPending} style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 12.5, padding: '8px 13px', borderRadius: 8, border: 'none', background: !examId ? 'color-mix(in srgb, var(--org-primary) 40%, var(--surface))' : 'var(--org-primary)', color: '#fff', cursor: !examId ? 'not-allowed' : 'pointer' }}><Send size={14} /> Send invitations</button>
              <button type="button" onClick={clear} className="v2-hoverbtn" style={dt.toolBtn}>Clear</button>
            </span>
          </div>
        )}
      />

      <Dialog open={!!pendingDelete} onClose={() => setPendingDelete(null)} title="Delete candidate">
        <p style={{ fontSize: 13.5, color: 'var(--muted)', lineHeight: 1.5, margin: '0 0 18px' }}>
          Permanently delete <strong style={{ color: 'var(--ink)' }}>{pendingDelete?.name}</strong>? They&apos;ve never been invited to an exam, so nothing else is affected. This can&apos;t be undone.
        </p>
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10 }}>
          <button type="button" onClick={() => setPendingDelete(null)} className="v2-hoverbtn" style={dt.toolBtn}>Cancel</button>
          <button type="button" onClick={handleConfirmDelete} disabled={deleteCandidate.isPending} style={{ fontSize: 13, fontWeight: 500, padding: '9px 16px', borderRadius: 9, border: 'none', background: 'var(--danger)', color: '#fff', cursor: 'pointer' }}>Delete</button>
        </div>
      </Dialog>

      <BulkUploadInviteDialog open={bulkOpen} onClose={() => setBulkOpen(false)} />
      <CandidateFormDialog open={addOpen} mode="add" submitting={createCandidate.isPending} error={formError} onClose={() => setAddOpen(false)} onSubmit={handleAdd} />
      <CandidateFormDialog open={!!editing} mode="edit" initial={editing ? { name: editing.name, email: editing.email, phone: editing.phone } : undefined} submitting={updateCandidate.isPending} error={formError} onClose={() => setEditing(null)} onSubmit={handleEditSubmit} />
      <ReEngageModal
        candidate={reengaging} open={!!reengaging} onClose={() => setReengaging(null)}
        onSuccess={() => { refetch(); notify('success', 'Candidate re-engaged.'); }}
      />
    </>
  );
}
