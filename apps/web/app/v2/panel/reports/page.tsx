'use client';

// v2 panel Results (reports) list — same as the recruiter v2 reports list (useExams ≤100, client
// search/sort, no pagination, truncation note, shared DataTable), but rows link into the panel
// console at /v2/panel/reports/:id so panelists stay under /v2/panel/*.
import { useMemo, useState } from 'react';
import Link from 'next/link';
import type { ColumnDef } from '@tanstack/react-table';
import { useExams } from '../../../../lib/hooks/useExams';
import type { ExamListItem, ExamStatus } from '../../../../lib/types';
import { DataTable, DT_FEATURES, dt, SortHead, Pill } from '../../../../components/ui-v2';
import { STATUS } from '../../../../components/ui-v2/viz';

const card: React.CSSProperties = { background: 'var(--paper)', border: '1px solid var(--hair)', borderRadius: 14, boxShadow: '0 1px 2px rgba(11,18,32,.04), 0 12px 32px -18px rgba(11,18,32,.22)' };

// Demoted metric for the quiet strip (Workfox rule 4/8): label + tabular number, no rainbow icon
// stat tiles -- one card, thin dividers between cells.
function QuietStat({ label, value }: { label: string; value: number }) {
  return (
    <div style={{ padding: '14px 18px', minWidth: 0 }}>
      <div style={{ fontSize: 11, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.08em', color: 'var(--muted)' }}>{label}</div>
      <div className="v2-mono" style={{ fontSize: 24, fontWeight: 600, color: 'var(--ink)', marginTop: 6 }}>{value.toLocaleString()}</div>
    </div>
  );
}

const STATUS_TONE: Record<ExamStatus, { c: string; label: string }> = { published: { c: STATUS.ok, label: 'Published' }, draft: { c: 'var(--muted)', label: 'Draft' }, archived: { c: STATUS.bad, label: 'Archived' } };
const COLUMN_LABELS: Record<string, string> = { status: 'Status', attemptTotalCount: 'Attempts', durationMinutes: 'Duration', passCriteriaPercent: 'Pass mark', createdAt: 'Created' };

export default function V2PanelReportsPage() {
  const [search, setSearch] = useState('');
  // Matches the old /reports: fetch up to the server max and search/sort client-side (no pagination).
  const { data: resp, isLoading, isError } = useExams(undefined, { pageSize: 100 });
  const all = resp?.data ?? [];
  const q = search.trim().toLowerCase();
  const rows = q ? all.filter((e) => e.title.toLowerCase().includes(q)) : all;
  const truncated = resp?.total !== undefined && resp.total > all.length;

  // Stats strip reflects the fetched exams (up to the server max), not the current search.
  const stats = useMemo(() => ({
    total: all.length,
    published: all.filter((e) => e.status === 'published').length,
    attempts: all.reduce((sum, e) => sum + (e.attemptTotalCount ?? 0), 0),
    settled: all.reduce((sum, e) => sum + (e.attemptSettledCount ?? 0), 0),
  }), [all]);

  const columns: ColumnDef<typeof DT_FEATURES, ExamListItem>[] = [
    {
      accessorKey: 'title', enableHiding: false,
      header: ({ column }) => <SortHead label="Exam" sorted={column.getIsSorted()} onClick={() => column.toggleSorting(column.getIsSorted() === 'asc')} />,
      cell: ({ row }) => <Link href={`/v2/panel/reports/${row.original.id}`} style={{ fontWeight: 500, color: 'var(--org-primary)', textDecoration: 'none' }}>{row.original.title}</Link>,
    },
    { accessorKey: 'status', header: ({ column }) => <SortHead label="Status" sorted={column.getIsSorted()} onClick={() => column.toggleSorting(column.getIsSorted() === 'asc')} />, cell: ({ row }) => <Pill c={STATUS_TONE[row.original.status].c} label={STATUS_TONE[row.original.status].label} /> },
    { accessorKey: 'attemptTotalCount', header: ({ column }) => <SortHead label="Attempts" sorted={column.getIsSorted()} onClick={() => column.toggleSorting(column.getIsSorted() === 'asc')} />, cell: ({ row }) => <span className="v2-mono" style={dt.muted}>{row.original.attemptSettledCount}/{row.original.attemptTotalCount}</span> },
    { accessorKey: 'durationMinutes', header: ({ column }) => <SortHead label="Duration" sorted={column.getIsSorted()} onClick={() => column.toggleSorting(column.getIsSorted() === 'asc')} />, cell: ({ row }) => <span style={dt.muted}>{row.original.durationMinutes} min</span> },
    { accessorKey: 'passCriteriaPercent', header: ({ column }) => <SortHead label="Pass mark" sorted={column.getIsSorted()} onClick={() => column.toggleSorting(column.getIsSorted() === 'asc')} />, cell: ({ row }) => <span className="v2-mono">{row.original.passCriteriaPercent}%</span> },
    { accessorKey: 'createdAt', header: ({ column }) => <SortHead label="Created" sorted={column.getIsSorted()} onClick={() => column.toggleSorting(column.getIsSorted() === 'asc')} />, cell: ({ row }) => <span style={dt.muted}>{new Date(row.original.createdAt).toLocaleDateString()}</span> },
  ];

  return (
    <div className="v2-rise">
      <div style={{ marginBottom: 16 }}>
        <p style={{ fontSize: 11, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.12em', color: 'var(--muted)', margin: 0 }}>Panel</p>
        <h1 className="v2-title" style={{ fontSize: 22, margin: '2px 0 0' }}>Results</h1>
        <p style={{ fontSize: 12.5, color: 'var(--muted)', margin: '4px 0 0' }}>
          {rows.length} {rows.length === 1 ? 'exam' : 'exams'}
          {truncated && (q ? ` · searched only the first ${all.length} of ${resp?.total} — there may be more matches` : ` · showing ${all.length} of ${resp?.total} — search to reach the rest`)}
        </p>
      </div>

      {/* Quiet metric strip — one card, thin dividers, no rainbow icon stat tiles (Workfox rule 4/8). */}
      <div style={{ ...card, display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', marginBottom: 16 }} className="wf-hero-kpis">
        <QuietStat label="Exams" value={stats.total} />
        <div style={{ borderLeft: '1px solid var(--hair)' }}><QuietStat label="Published" value={stats.published} /></div>
        <div style={{ borderLeft: '1px solid var(--hair)' }}><QuietStat label="Total attempts" value={stats.attempts} /></div>
        <div style={{ borderLeft: '1px solid var(--hair)' }}><QuietStat label="Settled" value={stats.settled} /></div>
      </div>

      <DataTable
        columns={columns} data={rows} getRowId={(r) => r.id}
        search={search} onSearchChange={setSearch} searchPlaceholder="Search exams…"
        isLoading={isLoading} isError={isError} errorMessage="Failed to load Results." emptyMessage={q ? 'No matches.' : 'No exams yet.'}
        columnLabels={COLUMN_LABELS}
      />
    </div>
  );
}
