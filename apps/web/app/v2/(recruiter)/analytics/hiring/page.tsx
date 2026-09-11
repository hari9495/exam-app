'use client';

// v2 Hiring Analytics — composite report (filters + funnel + KPI cards + Sources/Jobs tables).
// Format only, existing hooks (useHiringAnalytics / useJobs). Embedded tables use the shared
// DataTable in hideToolbar mode so the table format matches the rest of the product.
import { useMemo, useState } from 'react';
import Link from 'next/link';
import type { ColumnDef } from '@tanstack/react-table';
import { useHiringAnalytics } from '../../../../../lib/hooks/useHiringAnalytics';
import { useJobs } from '../../../../../lib/hooks/usePipeline';
import { type HiringJobRow, type HiringSourceRow, type JobStatus } from '../../../../../lib/types';
import { DataTable, DT_FEATURES, SortHead, Pill, Panel, Combobox } from '../../../../../components/ui-v2';
import { VIZ, STATUS } from '../../../../../components/ui-v2/viz';

const WINDOWS = [{ value: '7', label: 'Last 7 days' }, { value: '14', label: 'Last 14 days' }, { value: '30', label: 'Last 30 days' }, { value: '90', label: 'Last 90 days' }];
const STATUS_PILL: Record<JobStatus, { c: string; label: string }> = {
  draft: { c: 'var(--muted)', label: 'Draft' },
  pending_approval: { c: STATUS.warn, label: 'Pending approval' },
  open: { c: STATUS.ok, label: 'Open' },
  closed: { c: 'var(--muted)', label: 'Closed' },
};
const SOURCE_LABEL: Record<string, string> = { manual: 'Manual', exam: 'Exam', application: 'Application', drive: 'Drive' };
const fmtDays = (v: number | null) => (v === null ? '—' : v.toFixed(1));
// Funnel rows are now the 3 category buckets from apps/api/src/analytics/pipeline-analytics.ts
// (CATEGORY_ORDER: 'active' | 'offer' | 'hired'), not the old 5 name-based stage rows.
const FUNNEL_STAGE_LABEL: Record<string, string> = { active: 'Active', offer: 'Offer', hired: 'Hired' };
const funnelStageLabel = (s: string) => FUNNEL_STAGE_LABEL[s] ?? (s.charAt(0).toUpperCase() + s.slice(1));
function jobStatusPill(status: string) { return status in STATUS_PILL ? STATUS_PILL[status as JobStatus] : { c: 'var(--muted)', label: status.charAt(0).toUpperCase() + status.slice(1) }; }
const sectionHead: React.CSSProperties = { fontSize: 13, fontWeight: 600, color: 'var(--ink)', margin: '0 0 10px' };
const chip = (active: boolean): React.CSSProperties => ({ fontSize: 12.5, padding: '6px 11px', borderRadius: 8, cursor: 'pointer', border: `1px solid ${active ? 'color-mix(in srgb, var(--org-primary) 30%, transparent)' : 'var(--hair)'}`, background: active ? 'color-mix(in srgb, var(--org-primary) 10%, transparent)' : 'var(--surface)', color: active ? 'var(--org-primary)' : 'var(--ink)', fontWeight: active ? 600 : 400 });

const card: React.CSSProperties = { background: 'var(--paper)', border: '1px solid var(--hair)', borderRadius: 14, boxShadow: '0 1px 2px rgba(11,18,32,.04), 0 12px 32px -18px rgba(11,18,32,.22)' };

// Demoted metric for the quiet strip (Workfox rule 4/8): label + tabular number, no display-700
// hero, no equal-weight card grid. One card, thin dividers between cells.
function QuietStat({ label, value, unit }: { label: string; value: string; unit?: string }) {
  return (
    <div style={{ padding: '14px 18px', minWidth: 0 }}>
      <p style={{ fontSize: 11, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.08em', color: 'var(--muted)', margin: 0 }}>{label}</p>
      <p style={{ margin: '6px 0 0' }}>
        <span className="v2-mono" style={{ fontSize: 24, fontWeight: 600, color: 'var(--ink)' }}>{value}</span>
        {unit && <span style={{ fontSize: 12, fontWeight: 400, color: 'var(--muted)', marginLeft: 4 }}>{unit}</span>}
      </p>
    </div>
  );
}

// Numeric columns right-align (spreadsheet convention): headers and cells hug the column's right
// edge so digits line up down the column. DataTable left-aligns cells by default, so we right-align
// per-cell here.
const rightHead = (label: string) => () => <span style={{ display: 'block', textAlign: 'right', fontSize: 11, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.06em', color: 'var(--muted)' }}>{label}</span>;
const numCell = (value: React.ReactNode, muted = false) => <div className="v2-mono" style={{ textAlign: 'right', color: muted ? 'var(--muted)' : undefined }}>{value}</div>;
const rightSortHead = (label: string) => ({ column }: { column: { getIsSorted: () => false | 'asc' | 'desc'; toggleSorting: (d: boolean) => void } }) => (
  <div style={{ textAlign: 'right' }}><SortHead label={label} sorted={column.getIsSorted()} onClick={() => column.toggleSorting(column.getIsSorted() === 'asc')} /></div>
);

export default function V2HiringAnalyticsPage() {
  const [windowDays, setWindowDays] = useState('90');
  const [jobId, setJobId] = useState('all');
  const { from, to } = useMemo(() => {
    const now = Date.now(); const days = Number(windowDays);
    return { from: new Date(now - days * 86_400_000).toISOString(), to: new Date(now).toISOString() };
  }, [windowDays]);
  const { data: jobs } = useJobs();
  const { data, isLoading } = useHiringAnalytics({ from, to, jobId: jobId === 'all' ? undefined : jobId });
  const jobOptions = [{ value: 'all', label: 'All jobs' }, ...(jobs ?? []).map((j) => ({ value: j.id, label: j.title }))];

  const sourceColumns: ColumnDef<typeof DT_FEATURES, HiringSourceRow>[] = [
    { accessorKey: 'source', header: () => <span style={{ fontSize: 11, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.06em', color: 'var(--muted)' }}>Source</span>, cell: ({ row }) => <span style={{ fontWeight: 500 }}>{SOURCE_LABEL[row.original.source] ?? row.original.source}</span> },
    { accessorKey: 'entered', header: rightHead('Entered'), cell: ({ row }) => numCell(row.original.entered) },
    { accessorKey: 'hired', header: rightHead('Hired'), cell: ({ row }) => numCell(row.original.hired) },
    { accessorKey: 'hireRate', header: rightHead('Hire rate'), cell: ({ row }) => numCell(`${Math.round(row.original.hireRate * 100)}%`) },
  ];
  const jobColumns: ColumnDef<typeof DT_FEATURES, HiringJobRow>[] = [
    { accessorKey: 'title', header: ({ column }) => <SortHead label="Job" sorted={column.getIsSorted()} onClick={() => column.toggleSorting(column.getIsSorted() === 'asc')} />, cell: ({ row }) => <Link href={`/jobs/${row.original.jobId}`} style={{ fontWeight: 500, color: 'var(--org-primary)', textDecoration: 'none' }}>{row.original.title}</Link> },
    { accessorKey: 'status', enableSorting: false, header: () => <span style={{ fontSize: 11, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.06em', color: 'var(--muted)' }}>Status</span>, cell: ({ row }) => { const p = jobStatusPill(row.original.status); return <Pill c={p.c} label={p.label} />; } },
    { accessorKey: 'entered', header: rightSortHead('Entered'), cell: ({ row }) => numCell(row.original.entered) },
    { accessorKey: 'hired', header: rightSortHead('Hired'), cell: ({ row }) => numCell(row.original.hired) },
    { accessorKey: 'conversionPct', header: rightSortHead('Conversion'), cell: ({ row }) => numCell(`${Math.round(row.original.conversionPct)}%`) },
    { accessorKey: 'avgTimeToHireDays', header: rightSortHead('Avg time to hire'), cell: ({ row }) => numCell(fmtDays(row.original.avgTimeToHireDays), true) },
  ];

  const funnelMax = data && data.funnel.length ? Math.max(1, data.funnel[0].reached) : 1;

  return (
    <div className="v2-rise">
      <div style={{ marginBottom: 16 }}>
        <h1 className="v2-title" style={{ fontSize: 22, margin: 0 }}>Hiring Analytics</h1>
        <p style={{ fontSize: 13, color: 'var(--muted)', margin: '4px 0 0' }}>Funnel, time-to-hire, and source performance across your pipeline.</p>
      </div>

      <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', marginBottom: 16 }}>
        <span style={{ fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.1em', color: 'var(--muted)', marginRight: 2 }}>Window</span>
        {WINDOWS.map((w) => <button key={w.value} type="button" style={chip(windowDays === w.value)} onClick={() => setWindowDays(w.value)}>{w.label}</button>)}
        <span style={{ marginLeft: 8 }}><Combobox options={jobOptions} value={jobId} onChange={setJobId} placeholder="All jobs" width={200} active={jobId !== 'all'} /></span>
      </div>

      {isLoading || !data ? (
        <p style={{ fontSize: 13, color: 'var(--muted)' }}>Loading…</p>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          <Panel title="Funnel">
            {data.funnel.length === 0 ? <p style={{ fontSize: 13, color: 'var(--muted)' }}>No pipeline activity in this window.</p> : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                {data.funnel.map((r, i) => {
                  const pct = Math.round((r.reached / funnelMax) * 100);
                  const conv = i === 0 ? null : data.funnel[i - 1].reached > 0 ? Math.round((r.reached / data.funnel[i - 1].reached) * 100) : null;
                  const isLast = i === data.funnel.length - 1;
                  return (
                    <div key={r.stage} style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                      <span style={{ width: 92, fontSize: 12.5, color: 'var(--muted)', flexShrink: 0 }}>{funnelStageLabel(r.stage)}</span>
                      <div style={{ flex: 1, height: 22, background: 'var(--surface)', borderRadius: 6, overflow: 'hidden' }}><div style={{ width: `${Math.max(pct, 2)}%`, height: '100%', background: isLast ? VIZ.green : 'var(--org-primary)', borderRadius: 6 }} /></div>
                      <span className="v2-mono" style={{ width: 52, textAlign: 'right', fontSize: 12.5, color: 'var(--ink)', flexShrink: 0 }}>{r.reached.toLocaleString()}</span>
                      <span className="v2-mono" style={{ width: 44, textAlign: 'right', fontSize: 11.5, color: 'var(--muted)', flexShrink: 0 }}>{conv == null ? '' : `${conv}%`}</span>
                    </div>
                  );
                })}
              </div>
            )}
          </Panel>

          {/* Quiet metric strip — one card, thin dividers, demoted numbers (Workfox rule 4/8:
              metrics demoted, no equal-weight KPI card grid). */}
          <div style={{ ...card, display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)' }}>
            <QuietStat label="Avg time to hire" value={fmtDays(data.timeToHire.avgDays)} unit={data.timeToHire.avgDays !== null ? 'days' : undefined} />
            <div style={{ borderLeft: '1px solid var(--hair)' }}><QuietStat label="Median time to hire" value={fmtDays(data.timeToHire.medianDays)} unit={data.timeToHire.medianDays !== null ? 'days' : undefined} /></div>
            <div style={{ borderLeft: '1px solid var(--hair)' }}><QuietStat label="Hired" value={String(data.timeToHire.hiredCount)} /></div>
          </div>

          <div>
            <h2 style={sectionHead}>Sources</h2>
            <DataTable columns={sourceColumns} data={data.sources} getRowId={(r) => r.source} hideToolbar emptyMessage="No applications in this window." />
          </div>

          {jobId === 'all' && (
            <div>
              <h2 style={sectionHead}>Jobs</h2>
              <DataTable columns={jobColumns} data={data.jobs} getRowId={(r) => r.jobId} hideToolbar emptyMessage="No jobs in this window." />
            </div>
          )}
        </div>
      )}
    </div>
  );
}
