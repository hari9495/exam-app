'use client';

// v2 candidates list — direction C (TanStack v9: sortable columns + column visibility + row
// selection) with B's Export + status filter, retoned to Azure and wired to the live hooks.
// Search + status + pagination are server-side; sort/visibility/selection are client-side over the
// current page. Edit + Add-candidate form modals are a follow-up slice.
import { useState } from 'react';
import Link from 'next/link';
import {
  tableFeatures, useTable, createSortedRowModel, rowSortingFeature, rowSelectionFeature,
  columnVisibilityFeature, flexRender, type ColumnDef, type SortingState, type ColumnVisibilityState, type RowSelectionState,
} from '@tanstack/react-table';
import {
  Search, MoreHorizontal, ChevronsUpDown, ArrowUp, ArrowDown, SlidersHorizontal, Download,
  ChevronLeft, ChevronRight, Upload, Power, Trash2, Send,
} from 'lucide-react';
import { useCandidates, useUpdateCandidate, useDeleteCandidate } from '../../../../lib/hooks/useCandidates';
import { useExams } from '../../../../lib/hooks/useExams';
import { useBulkInvite } from '../../../../lib/hooks/useInvitations';
import type { Candidate } from '../../../../lib/types';
import { Combobox, Dropdown, DropdownItem, Dialog } from '../../../../components/ui-v2';
import { VIZ, STATUS } from '../../../../components/ui-v2/viz';

const FEATURES = tableFeatures({ rowSortingFeature, rowSelectionFeature, columnVisibilityFeature, sortedRowModel: createSortedRowModel() });
const STATUS_OPTS = [{ value: 'active', label: 'Active' }, { value: 'inactive', label: 'Inactive' }, { value: 'all', label: 'All' }];
const COLUMN_LABELS: Record<string, string> = { email: 'Email', phone: 'Phone', status: 'Status', createdAt: 'Added' };
const AVA = [VIZ.azure, VIZ.teal, VIZ.violet, VIZ.amber];

const th: React.CSSProperties = { textAlign: 'left', padding: '0 10px 10px', whiteSpace: 'nowrap' };
const td: React.CSSProperties = { padding: '11px 10px', fontSize: 13, color: 'var(--ink)', borderTop: '1px solid var(--hair)', verticalAlign: 'middle' };
const iconBtn: React.CSSProperties = { display: 'inline-grid', placeItems: 'center', width: 32, height: 32, borderRadius: 8, border: '1px solid var(--hair)', background: 'var(--surface)', color: 'var(--muted)', cursor: 'pointer' };
const toolBtn: React.CSSProperties = { display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 12.5, padding: '8px 11px', borderRadius: 8, border: '1px solid var(--hair)', background: 'var(--surface)', color: 'var(--ink)', cursor: 'pointer' };

function initials(n: string) { return n.split(' ').map((p) => p[0]).slice(0, 2).join('').toUpperCase(); }
function Avatar({ name, i }: { name: string; i: number }) {
  const c = AVA[i % AVA.length];
  return <span style={{ width: 30, height: 30, borderRadius: '50%', flexShrink: 0, display: 'grid', placeItems: 'center', fontSize: 11, fontWeight: 600, background: `color-mix(in srgb, ${c} 15%, var(--surface))`, color: c }}>{initials(name)}</span>;
}
function Cb({ checked, onChange, indeterminate = false }: { checked: boolean; onChange: (v: boolean) => void; indeterminate?: boolean }) {
  const on = checked || indeterminate;
  return (
    <span onClick={() => onChange(!checked)} style={{ width: 16, height: 16, borderRadius: 4, border: `1.5px solid ${on ? 'var(--org-primary)' : '#cbd5e1'}`, background: on ? 'var(--org-primary)' : 'transparent', display: 'inline-grid', placeItems: 'center', cursor: 'pointer', flexShrink: 0 }}>
      {checked && <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="3.5"><path d="M4 12.6 9 17.5 20 6.5" /></svg>}
      {!checked && indeterminate && <span style={{ width: 8, height: 2, background: '#fff', borderRadius: 1 }} />}
    </span>
  );
}
function StatusPill({ s }: { s: Candidate['status'] }) {
  const ok = s === 'active';
  return <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 12, fontWeight: 600, padding: '2px 9px', borderRadius: 99, color: ok ? STATUS.ok : 'var(--muted)', background: ok ? 'color-mix(in srgb, #15803d 12%, transparent)' : 'color-mix(in srgb, var(--ink) 6%, transparent)' }}><i style={{ width: 6, height: 6, borderRadius: '50%', background: ok ? STATUS.ok : 'var(--muted)' }} />{ok ? 'Active' : 'Inactive'}</span>;
}
function SortHead({ label, sorted, onClick, alignRight = false }: { label: string; sorted: false | 'asc' | 'desc'; onClick: () => void; alignRight?: boolean }) {
  return (
    <button type="button" onClick={onClick} style={{ display: 'inline-flex', alignItems: 'center', gap: 5, background: 'none', border: 'none', cursor: 'pointer', padding: 0, fontSize: 11, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.06em', color: 'var(--muted)', marginLeft: alignRight ? 'auto' : undefined }}>
      {label}{sorted === 'asc' ? <ArrowUp size={12} /> : sorted === 'desc' ? <ArrowDown size={12} /> : <ChevronsUpDown size={12} style={{ opacity: 0.55 }} />}
    </button>
  );
}
function csvCell(v: string) { return /[",\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v; }

export default function V2CandidatesPage() {
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('active');
  const [sorting, setSorting] = useState<SortingState>([]);
  const [columnVisibility, setColumnVisibility] = useState<ColumnVisibilityState>({});
  const [rowSelection, setRowSelection] = useState<RowSelectionState>({});
  const [examId, setExamId] = useState('');
  const [pendingDelete, setPendingDelete] = useState<Candidate | null>(null);
  const [notice, setNotice] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const notify = (type: 'success' | 'error', text: string) => { setNotice({ type, text }); setTimeout(() => setNotice(null), 4000); };

  const { data: resp, isLoading, isError } = useCandidates({ page, pageSize: 20, search: search || undefined, status: statusFilter === 'all' ? undefined : statusFilter });
  const rows = resp?.data ?? [];
  const { data: pubExams } = useExams('published', { pageSize: 100 });
  const examOptions = (pubExams?.data ?? []).map((e) => ({ value: e.id, label: e.title }));
  const updateCandidate = useUpdateCandidate();
  const deleteCandidate = useDeleteCandidate();
  const bulkInvite = useBulkInvite(examId);

  const columns: ColumnDef<typeof FEATURES, Candidate>[] = [
    {
      id: 'select', enableSorting: false, enableHiding: false,
      header: ({ table }) => <Cb checked={table.getIsAllRowsSelected()} indeterminate={table.getIsSomeRowsSelected() && !table.getIsAllRowsSelected()} onChange={(v) => table.toggleAllRowsSelected(v)} />,
      cell: ({ row }) => <Cb checked={row.getIsSelected()} onChange={(v) => row.toggleSelected(v)} />,
    },
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
    { accessorKey: 'email', header: ({ column }) => <SortHead label="Email" sorted={column.getIsSorted()} onClick={() => column.toggleSorting(column.getIsSorted() === 'asc')} />, cell: ({ row }) => <span style={{ color: 'var(--muted)' }}>{row.original.email}</span> },
    { accessorKey: 'phone', header: () => <span style={{ fontSize: 11, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.06em', color: 'var(--muted)' }}>Phone</span>, enableSorting: false, cell: ({ row }) => <span style={{ color: 'var(--muted)' }}>{row.original.phone ?? '—'}</span> },
    { accessorKey: 'status', header: ({ column }) => <SortHead label="Status" sorted={column.getIsSorted()} onClick={() => column.toggleSorting(column.getIsSorted() === 'asc')} />, cell: ({ row }) => <StatusPill s={row.original.status} /> },
    { accessorKey: 'createdAt', header: ({ column }) => <SortHead label="Added" sorted={column.getIsSorted()} onClick={() => column.toggleSorting(column.getIsSorted() === 'asc')} />, cell: ({ row }) => <span style={{ color: 'var(--muted)' }}>{new Date(row.original.createdAt).toLocaleDateString()}</span> },
    {
      id: 'actions', enableSorting: false, enableHiding: false,
      header: () => null,
      cell: ({ row }) => {
        const c = row.original;
        const isInactive = c.status === 'inactive';
        const neverInvited = (c.invitationCount ?? 0) === 0;
        return (
          <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
            <Dropdown align="end" menuWidth={172} trigger={<span style={{ ...iconBtn, width: 30, height: 30, border: 'none', background: 'transparent' }}><MoreHorizontal size={17} /></span>}>
              {(close) => (
                <>
                  <DropdownItem onClick={() => { close(); handleToggleStatus(c); }}><Power size={15} /> {isInactive ? 'Reactivate' : 'Deactivate'}</DropdownItem>
                  {neverInvited && <DropdownItem danger onClick={() => { close(); setPendingDelete(c); }}><Trash2 size={15} /> Delete</DropdownItem>}
                </>
              )}
            </Dropdown>
          </div>
        );
      },
    },
  ];

  const table = useTable({
    features: FEATURES,
    data: rows,
    columns,
    getRowId: (row) => row.id,
    state: { sorting, columnVisibility, rowSelection },
    onSortingChange: setSorting,
    onColumnVisibilityChange: setColumnVisibility,
    onRowSelectionChange: setRowSelection,
  });

  const selectedIds = table.getSelectedRowModel().rows.map((r) => r.original.id);

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
  function handleInvite() {
    bulkInvite.mutate(selectedIds, {
      onSuccess: (result) => { notify('success', `Invited ${result.created.length} candidate(s).${result.skipped.length ? ` ${result.skipped.length} skipped.` : ''}`); table.resetRowSelection(); },
      onError: (e) => notify('error', e instanceof Error ? e.message : 'Failed to send invitations.'),
    });
  }
  function exportCsv() {
    const header = ['Name', 'Email', 'Phone', 'Status', 'Added'];
    const lines = rows.map((c) => [c.name, c.email, c.phone ?? '', c.status, new Date(c.createdAt).toLocaleDateString()].map(csvCell).join(','));
    const csv = [header.join(','), ...lines].join('\n');
    const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }));
    const a = document.createElement('a'); a.href = url; a.download = 'candidates.csv'; a.click(); URL.revokeObjectURL(url);
  }

  const hideable = table.getAllColumns().filter((c) => c.getCanHide());

  return (
    <>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap', marginBottom: 16 }}>
        <h1 className="v2-title" style={{ fontSize: 22, margin: 0 }}>Candidates</h1>
        <Link href="/candidates/bulk-upload-invite" style={toolBtn}><Upload size={14} /> Upload &amp; invite</Link>
      </div>

      {notice && (
        <div role="status" style={{ marginBottom: 12, fontSize: 13, padding: '9px 13px', borderRadius: 9, border: `1px solid ${notice.type === 'success' ? 'color-mix(in srgb, #15803d 30%, transparent)' : 'color-mix(in srgb, var(--danger) 30%, transparent)'}`, background: notice.type === 'success' ? 'color-mix(in srgb, #15803d 8%, transparent)' : 'color-mix(in srgb, var(--danger) 8%, transparent)', color: notice.type === 'success' ? STATUS.ok : 'var(--danger)' }}>{notice.text}</div>
      )}

      {/* Toolbar */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12, flexWrap: 'wrap' }}>
        <div style={{ position: 'relative', width: 260 }}>
          <Search size={14} style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', color: 'var(--muted)' }} />
          <input value={search} onChange={(e) => { setSearch(e.target.value); setPage(1); }} placeholder="Search candidates…" aria-label="Search candidates" style={{ width: '100%', boxSizing: 'border-box', padding: '8px 10px 8px 30px', fontSize: 13, borderRadius: 8, border: '1px solid var(--hair)', background: 'var(--surface)', color: 'var(--ink)', outline: 'none' }} />
        </div>
        <Combobox options={STATUS_OPTS} value={statusFilter} onChange={(v) => { setStatusFilter(v); setPage(1); }} width={150} active={statusFilter !== 'active'} />
        <span style={{ marginLeft: 'auto', display: 'inline-flex', gap: 8 }}>
          <button type="button" style={toolBtn} onClick={exportCsv}><Download size={14} /> Export</button>
          <Dropdown align="end" menuWidth={190} trigger={<span style={toolBtn}><SlidersHorizontal size={14} /> Columns</span>}>
            {() => (
              <>
                <div style={{ fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.06em', color: 'var(--muted)', padding: '4px 9px 6px' }}>Toggle columns</div>
                {hideable.map((col) => (
                  <label key={col.id} className="wf-opt" style={{ display: 'flex', alignItems: 'center', gap: 9, padding: '8px 9px', borderRadius: 7, fontSize: 13, cursor: 'pointer', color: 'var(--ink)' }}>
                    <Cb checked={col.getIsVisible()} onChange={(v) => col.toggleVisibility(v)} />
                    {COLUMN_LABELS[col.id] ?? col.id}
                  </label>
                ))}
              </>
            )}
          </Dropdown>
        </span>
      </div>

      {/* Bulk-invite bar */}
      {selectedIds.length > 0 && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 12, padding: '10px 14px', borderRadius: 10, background: 'var(--ink)', color: 'var(--paper)', flexWrap: 'wrap' }}>
          <span style={{ fontSize: 13, fontWeight: 600 }}>{selectedIds.length} selected</span>
          <span style={{ marginLeft: 'auto', display: 'inline-flex', alignItems: 'center', gap: 8 }}>
            <Combobox options={examOptions} value={examId} onChange={setExamId} placeholder="Choose exam…" width={220} active={!!examId} />
            <button type="button" onClick={handleInvite} disabled={!examId || bulkInvite.isPending} style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 12.5, padding: '8px 13px', borderRadius: 8, border: 'none', background: !examId ? 'color-mix(in srgb, var(--org-primary) 45%, var(--ink))' : 'var(--org-primary)', color: '#fff', cursor: !examId ? 'not-allowed' : 'pointer' }}><Send size={14} /> Send invitations</button>
            <button type="button" onClick={() => table.resetRowSelection()} style={{ fontSize: 12.5, padding: '8px 12px', borderRadius: 8, border: '1px solid rgba(255,255,255,.25)', background: 'transparent', color: 'var(--paper)', cursor: 'pointer' }}>Clear</button>
          </span>
        </div>
      )}

      {/* Table */}
      <div style={{ background: 'var(--paper)', border: '1px solid var(--hair)', borderRadius: 14, overflow: 'hidden' }}>
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              {table.getHeaderGroups().map((hg) => (
                <tr key={hg.id}>
                  {hg.headers.map((header) => (
                    <th key={header.id} style={{ ...th, paddingTop: 14, width: header.column.id === 'select' ? 44 : header.column.id === 'actions' ? 48 : undefined }}>
                      {header.isPlaceholder ? null : flexRender(header.column.columnDef.header, header.getContext())}
                    </th>
                  ))}
                </tr>
              ))}
            </thead>
            <tbody>
              {isLoading ? (
                <tr><td colSpan={columns.length} style={{ ...td, textAlign: 'center', color: 'var(--muted)', padding: '32px 0' }}>Loading…</td></tr>
              ) : isError ? (
                <tr><td colSpan={columns.length} style={{ ...td, textAlign: 'center', color: 'var(--danger)', padding: '32px 0' }}>Failed to load candidates.</td></tr>
              ) : table.getRowModel().rows.length === 0 ? (
                <tr><td colSpan={columns.length} style={{ ...td, textAlign: 'center', color: 'var(--muted)', padding: '32px 0' }}>No candidates found.</td></tr>
              ) : table.getRowModel().rows.map((row) => (
                <tr key={row.id} className="wf-trow">
                  {row.getVisibleCells().map((cell) => (
                    <td key={cell.id} style={{ ...td, width: cell.column.id === 'select' ? 44 : cell.column.id === 'actions' ? 48 : undefined }}>
                      {flexRender(cell.column.columnDef.cell, cell.getContext())}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {/* Pagination */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, padding: '10px 14px', borderTop: '1px solid var(--hair)', fontSize: 12.5, color: 'var(--muted)' }}>
          <span>Page {resp?.page ?? 1} of {resp?.totalPages ?? 1}</span>
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
            <button type="button" style={{ ...iconBtn, opacity: (resp?.page ?? 1) <= 1 ? 0.4 : 1, cursor: (resp?.page ?? 1) <= 1 ? 'not-allowed' : 'pointer' }} disabled={(resp?.page ?? 1) <= 1} onClick={() => setPage((p) => Math.max(1, p - 1))}><ChevronLeft size={15} /></button>
            <button type="button" style={{ ...iconBtn, opacity: (resp?.page ?? 1) >= (resp?.totalPages ?? 1) ? 0.4 : 1, cursor: (resp?.page ?? 1) >= (resp?.totalPages ?? 1) ? 'not-allowed' : 'pointer' }} disabled={(resp?.page ?? 1) >= (resp?.totalPages ?? 1)} onClick={() => setPage((p) => p + 1)}><ChevronRight size={15} /></button>
          </span>
        </div>
      </div>

      <Dialog open={!!pendingDelete} onClose={() => setPendingDelete(null)} title="Delete candidate">
        <p style={{ fontSize: 13.5, color: 'var(--muted)', lineHeight: 1.5, margin: '0 0 18px' }}>
          Permanently delete <strong style={{ color: 'var(--ink)' }}>{pendingDelete?.name}</strong>? They&apos;ve never been invited to an exam, so nothing else is affected. This can&apos;t be undone.
        </p>
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10 }}>
          <button type="button" onClick={() => setPendingDelete(null)} style={toolBtn}>Cancel</button>
          <button type="button" onClick={handleConfirmDelete} disabled={deleteCandidate.isPending} style={{ fontSize: 13, fontWeight: 500, padding: '8px 14px', borderRadius: 9, border: 'none', background: 'var(--danger)', color: '#fff', cursor: 'pointer' }}>Delete</button>
        </div>
      </Dialog>
    </>
  );
}
