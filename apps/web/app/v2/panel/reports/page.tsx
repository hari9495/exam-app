'use client';

// v2 panel Results (reports) list — same as the recruiter v2 reports list (useExams ≤100, client
// search/sort, no pagination, truncation note, shared DataTable), but rows link into the panel
// console at /v2/panel/reports/:id so panelists stay under /v2/panel/*.
import { useMemo, useState } from 'react';
import Link from 'next/link';
import type { ColumnDef } from '@tanstack/react-table';
import { ClipboardList, CircleCheck, Users, CheckCheck } from 'lucide-react';
import { useExams } from '../../../../lib/hooks/useExams';
import type { ExamListItem, ExamStatus } from '../../../../lib/types';
import { DataTable, DT_FEATURES, dt, SortHead, Pill, IconStatCard } from '../../../../components/ui-v2';
import { STATUS, VIZ } from '../../../../components/ui-v2/viz';

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
    <>
      <div style={{ marginBottom: 16 }}>
        <p style={{ fontSize: 11, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.12em', color: 'var(--muted)', margin: 0 }}>Panel</p>
        <h1 className="v2-title" style={{ fontSize: 22, margin: '2px 0 0' }}>Results</h1>
        <p style={{ fontSize: 12.5, color: 'var(--muted)', margin: '4px 0 0' }}>
          {rows.length} {rows.length === 1 ? 'exam' : 'exams'}
          {truncated && (q ? ` · searched only the first ${all.length} of ${resp?.total} — there may be more matches` : ` · showing ${all.length} of ${resp?.total} — search to reach the rest`)}
        </p>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 12, marginBottom: 16 }} className="wf-hero-kpis">
        <IconStatCard title="Exams" value={stats.total} icon={<ClipboardList size={22} />} accent={VIZ.azure} />
        <IconStatCard title="Published" value={stats.published} icon={<CircleCheck size={22} />} accent={VIZ.teal} />
        <IconStatCard title="Total attempts" value={stats.attempts} icon={<Users size={22} />} accent={VIZ.violet} />
        <IconStatCard title="Settled" value={stats.settled} icon={<CheckCheck size={22} />} accent={VIZ.amber} />
      </div>

      <DataTable
        columns={columns} data={rows} getRowId={(r) => r.id}
        search={search} onSearchChange={setSearch} searchPlaceholder="Search exams…"
        isLoading={isLoading} isError={isError} errorMessage="Failed to load Results." emptyMessage={q ? 'No matches.' : 'No exams yet.'}
        columnLabels={COLUMN_LABELS}
      />
    </>
  );
}
