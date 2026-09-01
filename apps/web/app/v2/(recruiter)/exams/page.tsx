'use client';

// v2 exams list — zebra-polished shared DataTable. This surface supplies columns + data + handlers;
// the DataTable owns the format (toolbar/sort/columns/pagination). Wired to useExams /
// useDuplicateExam (routes to editor) / useArchiveExam (confirm Dialog).
import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import type { ColumnDef } from '@tanstack/react-table';
import { MoreHorizontal, Plus, ListFilter, Check, Pencil, Copy, Trash2 } from 'lucide-react';
import { useExams, useDuplicateExam, useArchiveExam } from '../../../../lib/hooks/useExams';
import type { ExamListItem, ExamStatus } from '../../../../lib/types';
import { DataTable, DT_FEATURES, dt, SortHead, Pill, Dropdown, DropdownItem, Dialog } from '../../../../components/ui-v2';
import { VIZ, STATUS } from '../../../../components/ui-v2/viz';

const STATUS_OPTS = [{ value: 'all', label: 'All statuses' }, { value: 'draft', label: 'Draft' }, { value: 'published', label: 'Published' }, { value: 'archived', label: 'Archived' }];
const STATUS_TONE: Record<ExamStatus, { c: string; label: string }> = { published: { c: STATUS.ok, label: 'Published' }, draft: { c: 'var(--muted)', label: 'Draft' }, archived: { c: STATUS.bad, label: 'Archived' } };
const COLUMN_LABELS: Record<string, string> = { durationMinutes: 'Duration', invitationCount: 'Candidates', attemptTotalCount: 'Attempts', createdAt: 'Created' };
function csvCell(v: string) { return /[",\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v; }

export default function V2ExamsPage() {
  const router = useRouter();
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
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

  const columns: ColumnDef<typeof DT_FEATURES, ExamListItem>[] = [
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
    { accessorKey: 'durationMinutes', header: ({ column }) => <SortHead label="Duration" sorted={column.getIsSorted()} onClick={() => column.toggleSorting(column.getIsSorted() === 'asc')} />, cell: ({ row }) => <span style={dt.muted}>{row.original.durationMinutes} min</span> },
    { accessorKey: 'invitationCount', header: ({ column }) => <SortHead label="Candidates" sorted={column.getIsSorted()} onClick={() => column.toggleSorting(column.getIsSorted() === 'asc')} />, cell: ({ row }) => <span className="v2-mono">{row.original.invitationCount}</span> },
    { accessorKey: 'attemptTotalCount', header: ({ column }) => <SortHead label="Attempts" sorted={column.getIsSorted()} onClick={() => column.toggleSorting(column.getIsSorted() === 'asc')} />, cell: ({ row }) => <span className="v2-mono" style={dt.muted}>{row.original.attemptTotalCount > 0 ? `${row.original.attemptSettledCount}/${row.original.attemptTotalCount}` : '—'}</span> },
    { accessorKey: 'createdAt', header: ({ column }) => <SortHead label="Created" sorted={column.getIsSorted()} onClick={() => column.toggleSorting(column.getIsSorted() === 'asc')} />, cell: ({ row }) => <span style={dt.muted}>{new Date(row.original.createdAt).toLocaleDateString()}</span> },
    {
      id: 'actions', enableSorting: false, enableHiding: false, header: () => null,
      cell: ({ row }) => (
        <Dropdown align="end" menuWidth={160} trigger={<span style={{ display: 'inline-grid', placeItems: 'center', width: 30, height: 30, color: 'var(--muted)', cursor: 'pointer' }}><MoreHorizontal size={17} /></span>}>
          {(close) => (<>
            <DropdownItem onClick={() => { close(); router.push(`/exams/${row.original.id}/edit`); }}><Pencil size={15} /> Edit</DropdownItem>
            <DropdownItem onClick={() => { close(); handleDuplicate(row.original.id); }}><Copy size={15} /> Duplicate</DropdownItem>
            <DropdownItem danger onClick={() => { close(); setPendingDelete(row.original); }}><Trash2 size={15} /> Delete</DropdownItem>
          </>)}
        </Dropdown>
      ),
    },
  ];

  return (
    <>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, marginBottom: 16 }}>
        <h1 className="v2-title" style={{ fontSize: 22, margin: 0 }}>Exams</h1>
        <Link href="/exams/new" style={dt.primaryBtn}><Plus size={14} /> New exam</Link>
      </div>

      {notice && (
        <div role="status" style={{ marginBottom: 12, fontSize: 13, padding: '9px 13px', borderRadius: 9, border: `1px solid ${notice.type === 'success' ? 'color-mix(in srgb, #15803d 30%, transparent)' : 'color-mix(in srgb, var(--danger) 30%, transparent)'}`, background: notice.type === 'success' ? 'color-mix(in srgb, #15803d 8%, transparent)' : 'color-mix(in srgb, var(--danger) 8%, transparent)', color: notice.type === 'success' ? STATUS.ok : 'var(--danger)' }}>{notice.text}</div>
      )}

      <DataTable
        columns={columns} data={rows} getRowId={(r) => r.id}
        search={search} onSearchChange={(v) => { setSearch(v); setPage(1); }} searchPlaceholder="Search exams…"
        page={resp?.page ?? 1} totalPages={resp?.totalPages ?? 1} onPageChange={setPage}
        isLoading={isLoading} isError={isError} errorMessage="Failed to load exams." emptyMessage="No exams found."
        columnLabels={COLUMN_LABELS} onExport={exportCsv}
      />

      <Dialog open={!!pendingDelete} onClose={() => setPendingDelete(null)} title="Delete exam">
        <p style={{ fontSize: 13.5, color: 'var(--muted)', lineHeight: 1.5, margin: '0 0 18px' }}>
          Delete <strong style={{ color: 'var(--ink)' }}>{pendingDelete?.title}</strong>? Candidates and results already collected are kept, but it will no longer appear in your exam list.
        </p>
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10 }}>
          <button type="button" onClick={() => setPendingDelete(null)} style={dt.toolBtn}>Cancel</button>
          <button type="button" onClick={handleConfirmDelete} disabled={archiveExam.isPending} style={{ fontSize: 13, fontWeight: 500, padding: '8px 14px', borderRadius: 9, border: 'none', background: 'var(--danger)', color: '#fff', cursor: 'pointer' }}>Delete</button>
        </div>
      </Dialog>
    </>
  );
}
