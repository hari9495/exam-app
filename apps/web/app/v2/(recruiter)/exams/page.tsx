'use client';

// v2 exams list — direction C (zebra polished): striped compact TanStack v9 table, sortable columns,
// column visibility, status filter in the Status header, CSV export, kebab (Edit/Duplicate/Delete).
// Wired to useExams / useDuplicateExam / useArchiveExam. Edit/Duplicate route to the exam editor.
import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import {
  tableFeatures, useTable, createSortedRowModel, rowSortingFeature, columnVisibilityFeature,
  flexRender, type ColumnDef, type SortingState, type ColumnVisibilityState,
} from '@tanstack/react-table';
import {
  Search, MoreHorizontal, ChevronsUpDown, ArrowUp, ArrowDown, SlidersHorizontal, Download,
  ChevronLeft, ChevronRight, Plus, ListFilter, Check, Pencil, Copy, Trash2,
} from 'lucide-react';
import { useExams, useDuplicateExam, useArchiveExam } from '../../../../lib/hooks/useExams';
import type { ExamListItem, ExamStatus } from '../../../../lib/types';
import { Dropdown, DropdownItem, Dialog } from '../../../../components/ui-v2';
import { VIZ, STATUS } from '../../../../components/ui-v2/viz';

const FEATURES = tableFeatures({ rowSortingFeature, columnVisibilityFeature, sortedRowModel: createSortedRowModel() });
const STATUS_OPTS = [{ value: 'all', label: 'All statuses' }, { value: 'draft', label: 'Draft' }, { value: 'published', label: 'Published' }, { value: 'archived', label: 'Archived' }];
const STATUS_TONE: Record<ExamStatus, { c: string; label: string }> = { published: { c: STATUS.ok, label: 'Published' }, draft: { c: 'var(--muted)', label: 'Draft' }, archived: { c: STATUS.bad, label: 'Archived' } };
const COLUMN_LABELS: Record<string, string> = { durationMinutes: 'Duration', invitationCount: 'Candidates', attemptTotalCount: 'Attempts', createdAt: 'Created' };

const th: React.CSSProperties = { textAlign: 'left', padding: '13px 12px 11px', whiteSpace: 'nowrap' };
const td: React.CSSProperties = { padding: '11px 12px', fontSize: 13, color: 'var(--ink)', verticalAlign: 'middle' };
const iconBtn: React.CSSProperties = { display: 'inline-grid', placeItems: 'center', width: 32, height: 32, borderRadius: 8, border: '1px solid var(--hair)', background: 'var(--surface)', color: 'var(--muted)', cursor: 'pointer' };
const toolBtn: React.CSSProperties = { display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 12.5, padding: '8px 11px', borderRadius: 8, border: '1px solid var(--hair)', background: 'var(--surface)', color: 'var(--ink)', cursor: 'pointer' };
const primaryBtn: React.CSSProperties = { display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 13, fontWeight: 500, padding: '9px 14px', borderRadius: 9, border: 'none', background: 'var(--org-primary)', color: 'var(--org-on-primary)', cursor: 'pointer' };

function Pill({ c, label }: { c: string; label: string }) {
  return <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 11.5, fontWeight: 600, padding: '1px 8px', borderRadius: 99, color: c, background: `color-mix(in srgb, ${c} 12%, transparent)` }}><i style={{ width: 6, height: 6, borderRadius: '50%', background: c }} />{label}</span>;
}
function SortHead({ label, sorted, onClick }: { label: string; sorted: false | 'asc' | 'desc'; onClick: () => void }) {
  return (
    <button type="button" onClick={onClick} style={{ display: 'inline-flex', alignItems: 'center', gap: 5, background: 'none', border: 'none', cursor: 'pointer', padding: 0, fontSize: 11, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.06em', color: 'var(--muted)' }}>
      {label}{sorted === 'asc' ? <ArrowUp size={12} /> : sorted === 'desc' ? <ArrowDown size={12} /> : <ChevronsUpDown size={12} style={{ opacity: 0.55 }} />}
    </button>
  );
}
function csvCell(v: string) { return /[",\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v; }

export default function V2ExamsPage() {
  const router = useRouter();
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [sorting, setSorting] = useState<SortingState>([]);
  const [columnVisibility, setColumnVisibility] = useState<ColumnVisibilityState>({});
  const [pendingDelete, setPendingDelete] = useState<ExamListItem | null>(null);
  const [notice, setNotice] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const notify = (type: 'success' | 'error', text: string) => { setNotice({ type, text }); setTimeout(() => setNotice(null), 4000); };

  const { data: resp, isLoading, isError } = useExams(statusFilter === 'all' ? undefined : statusFilter, { page, pageSize: 20, search: search || undefined });
  const rows = resp?.data ?? [];
  const duplicateExam = useDuplicateExam();
  const archiveExam = useArchiveExam();

  function handleDuplicate(id: string) {
    duplicateExam.mutate(id, {
      onSuccess: (created: { id: string }) => router.push(`/exams/${created.id}/edit`),
      onError: (e) => notify('error', e instanceof Error ? e.message : 'Failed to duplicate exam.'),
    });
  }
  function handleConfirmDelete() {
    if (!pendingDelete) return;
    archiveExam.mutate(pendingDelete.id, {
      onSuccess: () => { notify('success', 'Exam deleted.'); setPendingDelete(null); },
      onError: (e) => { notify('error', e instanceof Error ? e.message : 'Failed to delete exam.'); setPendingDelete(null); },
    });
  }
  function exportCsv() {
    const header = ['Exam', 'Status', 'Duration (min)', 'Candidates', 'Attempts settled', 'Attempts total', 'Created'];
    const lines = rows.map((e) => [e.title, e.status, String(e.durationMinutes), String(e.invitationCount), String(e.attemptSettledCount), String(e.attemptTotalCount), new Date(e.createdAt).toLocaleDateString()].map(csvCell).join(','));
    const url = URL.createObjectURL(new Blob([[header.join(','), ...lines].join('\n')], { type: 'text/csv;charset=utf-8' }));
    const a = document.createElement('a'); a.href = url; a.download = 'exams.csv'; a.click(); URL.revokeObjectURL(url);
  }

  const columns: ColumnDef<typeof FEATURES, ExamListItem>[] = [
    {
      accessorKey: 'title', enableHiding: false,
      header: ({ column }) => <SortHead label="Exam" sorted={column.getIsSorted()} onClick={() => column.toggleSorting(column.getIsSorted() === 'asc')} />,
      cell: ({ row }) => <Link href={`/exams/${row.original.id}/edit`} style={{ fontWeight: 500, color: 'var(--org-primary)', textDecoration: 'none' }}>{row.original.title}</Link>,
    },
    {
      accessorKey: 'status', enableSorting: false, enableHiding: false,
      header: () => (
        <Dropdown align="start" menuWidth={160} trigger={
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5, cursor: 'pointer', fontSize: 11, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.06em', color: statusFilter !== 'all' ? 'var(--org-primary)' : 'var(--muted)' }}>Status <ListFilter size={12} style={{ opacity: 0.75 }} /></span>
        }>
          {(close) => STATUS_OPTS.map((o) => (
            <DropdownItem key={o.value} onClick={() => { close(); setStatusFilter(o.value); setPage(1); }}>
              <span style={{ width: 15, display: 'inline-flex', flexShrink: 0, color: 'var(--org-primary)' }}>{statusFilter === o.value && <Check size={15} />}</span>{o.label}
            </DropdownItem>
          ))}
        </Dropdown>
      ),
      cell: ({ row }) => <span style={{ display: 'inline-flex', gap: 6, alignItems: 'center', flexWrap: 'wrap' }}>{row.original.walkInEnabled && <Pill c={VIZ.teal} label="Walk-in" />}<Pill c={STATUS_TONE[row.original.status].c} label={STATUS_TONE[row.original.status].label} /></span>,
    },
    { accessorKey: 'durationMinutes', header: ({ column }) => <SortHead label="Duration" sorted={column.getIsSorted()} onClick={() => column.toggleSorting(column.getIsSorted() === 'asc')} />, cell: ({ row }) => <span style={{ color: 'var(--muted)' }}>{row.original.durationMinutes} min</span> },
    { accessorKey: 'invitationCount', header: ({ column }) => <SortHead label="Candidates" sorted={column.getIsSorted()} onClick={() => column.toggleSorting(column.getIsSorted() === 'asc')} />, cell: ({ row }) => <span className="v2-mono">{row.original.invitationCount}</span> },
    { accessorKey: 'attemptTotalCount', header: ({ column }) => <SortHead label="Attempts" sorted={column.getIsSorted()} onClick={() => column.toggleSorting(column.getIsSorted() === 'asc')} />, cell: ({ row }) => <span className="v2-mono" style={{ color: 'var(--muted)' }}>{row.original.attemptTotalCount > 0 ? `${row.original.attemptSettledCount}/${row.original.attemptTotalCount}` : '—'}</span> },
    { accessorKey: 'createdAt', header: ({ column }) => <SortHead label="Created" sorted={column.getIsSorted()} onClick={() => column.toggleSorting(column.getIsSorted() === 'asc')} />, cell: ({ row }) => <span style={{ color: 'var(--muted)' }}>{new Date(row.original.createdAt).toLocaleDateString()}</span> },
    {
      id: 'actions', enableSorting: false, enableHiding: false, header: () => null,
      cell: ({ row }) => (
        <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
          <Dropdown align="end" menuWidth={160} trigger={<span style={{ ...iconBtn, width: 30, height: 30, border: 'none', background: 'transparent' }}><MoreHorizontal size={17} /></span>}>
            {(close) => (<>
              <DropdownItem onClick={() => { close(); router.push(`/exams/${row.original.id}/edit`); }}><Pencil size={15} /> Edit</DropdownItem>
              <DropdownItem onClick={() => { close(); handleDuplicate(row.original.id); }}><Copy size={15} /> Duplicate</DropdownItem>
              <DropdownItem danger onClick={() => { close(); setPendingDelete(row.original); }}><Trash2 size={15} /> Delete</DropdownItem>
            </>)}
          </Dropdown>
        </div>
      ),
    },
  ];

  const table = useTable({ features: FEATURES, data: rows, columns, getRowId: (r) => r.id, state: { sorting, columnVisibility }, onSortingChange: setSorting, onColumnVisibilityChange: setColumnVisibility });
  const hideable = table.getAllColumns().filter((c) => c.getCanHide());

  return (
    <>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, marginBottom: 16 }}>
        <h1 className="v2-title" style={{ fontSize: 22, margin: 0 }}>Exams</h1>
        <Link href="/exams/new" style={primaryBtn}><Plus size={14} /> New exam</Link>
      </div>

      {notice && (
        <div role="status" style={{ marginBottom: 12, fontSize: 13, padding: '9px 13px', borderRadius: 9, border: `1px solid ${notice.type === 'success' ? 'color-mix(in srgb, #15803d 30%, transparent)' : 'color-mix(in srgb, var(--danger) 30%, transparent)'}`, background: notice.type === 'success' ? 'color-mix(in srgb, #15803d 8%, transparent)' : 'color-mix(in srgb, var(--danger) 8%, transparent)', color: notice.type === 'success' ? STATUS.ok : 'var(--danger)' }}>{notice.text}</div>
      )}

      {/* Toolbar */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12, flexWrap: 'wrap' }}>
        <div style={{ position: 'relative', width: 260 }}>
          <Search size={14} style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', color: 'var(--muted)' }} />
          <input value={search} onChange={(e) => { setSearch(e.target.value); setPage(1); }} placeholder="Search exams…" aria-label="Search exams" style={{ width: '100%', boxSizing: 'border-box', padding: '8px 10px 8px 30px', fontSize: 13, borderRadius: 8, border: '1px solid var(--hair)', background: 'var(--surface)', color: 'var(--ink)', outline: 'none' }} />
        </div>
        <span style={{ marginLeft: 'auto', display: 'inline-flex', gap: 8 }}>
          <button type="button" style={toolBtn} onClick={exportCsv}><Download size={14} /> Export</button>
          <Dropdown align="end" menuWidth={190} trigger={<span style={toolBtn}><SlidersHorizontal size={14} /> Columns</span>}>
            {() => (<>
              <div style={{ fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.06em', color: 'var(--muted)', padding: '4px 9px 6px' }}>Toggle columns</div>
              {hideable.map((col) => (
                <label key={col.id} className="wf-opt" style={{ display: 'flex', alignItems: 'center', gap: 9, padding: '8px 9px', borderRadius: 7, fontSize: 13, cursor: 'pointer', color: 'var(--ink)' }}>
                  <span style={{ width: 16, height: 16, borderRadius: 4, border: `1.5px solid ${col.getIsVisible() ? 'var(--org-primary)' : '#cbd5e1'}`, background: col.getIsVisible() ? 'var(--org-primary)' : 'transparent', display: 'inline-grid', placeItems: 'center' }} onClick={(ev) => { ev.preventDefault(); col.toggleVisibility(!col.getIsVisible()); }}>{col.getIsVisible() && <Check size={11} color="#fff" />}</span>
                  {COLUMN_LABELS[col.id] ?? col.id}
                </label>
              ))}
            </>)}
          </Dropdown>
        </span>
      </div>

      {/* Table */}
      <div style={{ background: 'var(--paper)', border: '1px solid var(--hair)', borderRadius: 14, overflow: 'hidden' }}>
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              {table.getHeaderGroups().map((hg) => (
                <tr key={hg.id} style={{ background: 'color-mix(in srgb, var(--ink) 3%, transparent)', borderBottom: '1px solid var(--hair)' }}>
                  {hg.headers.map((header) => (
                    <th key={header.id} style={{ ...th, width: header.column.id === 'actions' ? 48 : undefined }}>
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
                <tr><td colSpan={columns.length} style={{ ...td, textAlign: 'center', color: 'var(--danger)', padding: '32px 0' }}>Failed to load exams.</td></tr>
              ) : table.getRowModel().rows.length === 0 ? (
                <tr><td colSpan={columns.length} style={{ ...td, textAlign: 'center', color: 'var(--muted)', padding: '32px 0' }}>No exams found.</td></tr>
              ) : table.getRowModel().rows.map((row, i) => (
                <tr key={row.id} className="wf-trow" style={{ background: i % 2 ? 'color-mix(in srgb, var(--ink) 2.5%, transparent)' : 'transparent' }}>
                  {row.getVisibleCells().map((cell) => (
                    <td key={cell.id} style={{ ...td, width: cell.column.id === 'actions' ? 48 : undefined, textAlign: cell.column.id === 'actions' ? 'right' : 'left' }}>
                      {flexRender(cell.column.columnDef.cell, cell.getContext())}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, padding: '10px 14px', borderTop: '1px solid var(--hair)', fontSize: 12.5, color: 'var(--muted)' }}>
          <span>Page {resp?.page ?? 1} of {resp?.totalPages ?? 1}</span>
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
            <button type="button" style={{ ...iconBtn, opacity: (resp?.page ?? 1) <= 1 ? 0.4 : 1, cursor: (resp?.page ?? 1) <= 1 ? 'not-allowed' : 'pointer' }} disabled={(resp?.page ?? 1) <= 1} onClick={() => setPage((p) => Math.max(1, p - 1))}><ChevronLeft size={15} /></button>
            <button type="button" style={{ ...iconBtn, opacity: (resp?.page ?? 1) >= (resp?.totalPages ?? 1) ? 0.4 : 1, cursor: (resp?.page ?? 1) >= (resp?.totalPages ?? 1) ? 'not-allowed' : 'pointer' }} disabled={(resp?.page ?? 1) >= (resp?.totalPages ?? 1)} onClick={() => setPage((p) => p + 1)}><ChevronRight size={15} /></button>
          </span>
        </div>
      </div>

      <Dialog open={!!pendingDelete} onClose={() => setPendingDelete(null)} title="Delete exam">
        <p style={{ fontSize: 13.5, color: 'var(--muted)', lineHeight: 1.5, margin: '0 0 18px' }}>
          Delete <strong style={{ color: 'var(--ink)' }}>{pendingDelete?.title}</strong>? Candidates and results already collected are kept, but it will no longer appear in your exam list.
        </p>
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10 }}>
          <button type="button" onClick={() => setPendingDelete(null)} style={toolBtn}>Cancel</button>
          <button type="button" onClick={handleConfirmDelete} disabled={archiveExam.isPending} style={{ fontSize: 13, fontWeight: 500, padding: '8px 14px', borderRadius: 9, border: 'none', background: 'var(--danger)', color: '#fff', cursor: 'pointer' }}>Delete</button>
        </div>
      </Dialog>
    </>
  );
}
