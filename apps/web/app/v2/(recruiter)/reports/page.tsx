'use client';

// v2 Results (reports) list — exam list linking to each exam's report. Same data + behavior as the
// old /reports (useExams ≤100, client search/sort, no pagination, truncation note); only the table
// format changes (shared DataTable). Report detail pages are a later slice — rows link to /reports/:id.
import { useState } from 'react';
import Link from 'next/link';
import type { ColumnDef } from '@tanstack/react-table';
import { useExams } from '../../../../lib/hooks/useExams';
import type { ExamListItem, ExamStatus } from '../../../../lib/types';
import { DataTable, DT_FEATURES, dt, SortHead, Pill } from '../../../../components/ui-v2';
import { STATUS } from '../../../../components/ui-v2/viz';

const STATUS_TONE: Record<ExamStatus, { c: string; label: string }> = { published: { c: STATUS.ok, label: 'Published' }, draft: { c: 'var(--muted)', label: 'Draft' }, archived: { c: STATUS.bad, label: 'Archived' } };
const COLUMN_LABELS: Record<string, string> = { status: 'Status', attemptTotalCount: 'Attempts', durationMinutes: 'Duration', passCriteriaPercent: 'Pass mark', createdAt: 'Created' };

export default function V2ReportsPage() {
  const [search, setSearch] = useState('');
  // Matches the old /reports: fetch up to the server max and search/sort client-side (no pagination).
  const { data: resp, isLoading, isError } = useExams(undefined, { pageSize: 100 });
  const all = resp?.data ?? [];
  const q = search.trim().toLowerCase();
  const rows = q ? all.filter((e) => e.title.toLowerCase().includes(q)) : all;
  const truncated = resp?.total !== undefined && resp.total > all.length;

  const columns: ColumnDef<typeof DT_FEATURES, ExamListItem>[] = [
    {
      accessorKey: 'title', enableHiding: false,
      header: ({ column }) => <SortHead label="Exam" sorted={column.getIsSorted()} onClick={() => column.toggleSorting(column.getIsSorted() === 'asc')} />,
      cell: ({ row }) => <Link href={`/reports/${row.original.id}`} style={{ fontWeight: 500, color: 'var(--org-primary)', textDecoration: 'none' }}>{row.original.title}</Link>,
    },
    { accessorKey: 'status', header: ({ column }) => <SortHead label="Status" sorted={column.getIsSorted()} onClick={() => column.toggleSorting(column.getIsSorted() === 'asc')} />, cell: ({ row }) => <Pill c={STATUS_TONE[row.original.status].c} label={STATUS_TONE[row.original.status].label} /> },
    { accessorKey: 'attemptTotalCount', header: ({ column }) => <SortHead label="Attempts" sorted={column.getIsSorted()} onClick={() => column.toggleSorting(column.getIsSorted() === 'asc')} />, cell: ({ row }) => <span className="v2-mono" style={dt.muted}>{row.original.attemptSettledCount}/{row.original.attemptTotalCount}</span> },
    { accessorKey: 'durationMinutes', header: ({ column }) => <SortHead label="Duration" sorted={column.getIsSorted()} onClick={() => column.toggleSorting(column.getIsSorted() === 'asc')} />, cell: ({ row }) => <span style={dt.muted}>{row.original.durationMinutes} min</span> },
    { accessorKey: 'passCriteriaPercent', header: ({ column }) => <SortHead label="Pass mark" sorted={column.getIsSorted()} onClick={() => column.toggleSorting(column.getIsSorted() === 'asc')} />, cell: ({ row }) => <span className="v2-mono">{row.original.passCriteriaPercent}%</span> },
    { accessorKey: 'createdAt', header: ({ column }) => <SortHead label="Created" sorted={column.getIsSorted()} onClick={() => column.toggleSorting(column.getIsSorted() === 'asc')} />, cell: ({ row }) => <span style={dt.muted}>{new Date(row.original.createdAt).toLocaleDateString()}</span> },
  ];

  return (
    <>
      <h1 className="v2-title" style={{ fontSize: 22, margin: '0 0 6px' }}>Results</h1>
      <p style={{ fontSize: 12.5, color: 'var(--muted)', margin: '0 0 14px' }}>
        {rows.length} {rows.length === 1 ? 'exam' : 'exams'}
        {truncated && (q ? ` · searched only the first ${all.length} of ${resp?.total} — there may be more matches` : ` · showing ${all.length} of ${resp?.total} — search to reach the rest`)}
      </p>
      <DataTable
        columns={columns} data={rows} getRowId={(r) => r.id}
        search={search} onSearchChange={setSearch} searchPlaceholder="Search exams…"
        isLoading={isLoading} isError={isError} errorMessage="Failed to load Results." emptyMessage={q ? 'No matches.' : 'No exams yet.'}
        columnLabels={COLUMN_LABELS}
      />
    </>
  );
}
