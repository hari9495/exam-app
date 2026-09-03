'use client';

// v2 System Logs — format-only re-skin of the old (org-admin)/system-logs page. Same hook
// (useSystemEvents) and identical logic: service/severity/time-range filters reset the cursor
// accumulation, "Load more" pages via cursor. Service + severity move into DataTable header filter
// dropdowns (instant-apply, like the candidates Status filter); time range is a filter card above.
// Old Table/PageChrome/Modal → shared DataTable + v2 Dialog.
import { useState } from 'react';
import type { ColumnDef } from '@tanstack/react-table';
import { ListFilter, Check } from 'lucide-react';
import { useSystemEvents, type SystemEventEntry, type SystemEventFilters } from '../../../../lib/hooks/useSystemEvents';
import { formatAuditTimestamp, formatRelativeTime } from '../../../../lib/audit-display';
import { plainEnglish } from '../../../../lib/system-event-message';
import { DataTable, DT_FEATURES, dt, Pill, Dropdown, DropdownItem, Dialog } from '../../../../components/ui-v2';
import { STATUS } from '../../../../components/ui-v2/viz';

const SERVICE_OPTIONS = [
  { value: 'all', label: 'All services' },
  { value: 'api', label: 'Staff API' },
  { value: 'exam-runtime', label: 'Exam runtime' },
  { value: 'candidate-browser', label: 'Candidate browser' },
];
const SEVERITY_OPTIONS = [
  { value: 'all', label: 'All severities' },
  { value: 'error', label: 'Errors' },
  { value: 'warn', label: 'Warnings' },
];
const SERVICE_LABELS: Record<string, string> = { api: 'Staff API', 'exam-runtime': 'Exam runtime', 'candidate-browser': 'Candidate browser' };

function severityColor(severity: string): string { return severity === 'error' ? STATUS.bad : STATUS.warn; }

function presetRange(daysBack: number): { from: string; to: string } {
  const to = new Date();
  const from = new Date(to);
  from.setDate(from.getDate() - daysBack);
  return { from: from.toISOString(), to: to.toISOString() };
}

// One-line context summary for the table row; the full JSON is in the detail modal.
function contextSummary(entry: SystemEventEntry): string {
  const context = entry.context ?? {};
  const parts: string[] = [];
  if (typeof context.route === 'string') parts.push(context.route);
  if (typeof context.kind === 'string') parts.push(context.kind);
  if (typeof context.detail === 'string') parts.push(context.detail);
  return parts.join(' · ');
}

const labelStyle: React.CSSProperties = { fontSize: 11, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.06em', color: 'var(--muted)' };

function HeaderFilter({ label, value, options, onChange }: { label: string; value: string; options: { value: string; label: string }[]; onChange: (v: string) => void }) {
  return (
    <Dropdown align="start" menuWidth={170} trigger={<span style={{ display: 'inline-flex', alignItems: 'center', gap: 5, cursor: 'pointer', ...labelStyle, color: value !== 'all' ? 'var(--org-primary)' : 'var(--muted)' }}>{label} <ListFilter size={12} style={{ opacity: 0.75 }} /></span>}>
      {(close) => options.map((o) => (
        <DropdownItem key={o.value} onClick={() => { close(); onChange(o.value); }}><span style={{ width: 15, display: 'inline-flex', flexShrink: 0, color: 'var(--org-primary)' }}>{value === o.value && <Check size={15} />}</span>{o.label}</DropdownItem>
      ))}
    </Dropdown>
  );
}

export default function V2SystemLogsPage() {
  const [service, setService] = useState('all');
  const [severity, setSeverity] = useState('all');
  const [range, setRange] = useState<{ from?: string; to?: string; label: string }>({ ...presetRange(1), label: '24h' });
  const [cursor, setCursor] = useState<string | undefined>(undefined);
  const [entries, setEntries] = useState<SystemEventEntry[]>([]);
  const [selected, setSelected] = useState<SystemEventEntry | null>(null);

  const filters: SystemEventFilters = {
    service: service === 'all' ? undefined : service,
    severity: severity === 'all' ? undefined : severity,
    from: range.from,
    to: range.to,
    cursor,
  };
  const { data, isLoading } = useSystemEvents(filters);

  // Accumulate pages under "Load more"; any filter change resets the accumulation.
  const pageData = data?.data ?? [];
  const total = data?.total ?? 0;
  const allEntries = cursor ? [...entries, ...pageData] : pageData;
  const canLoadMore = allEntries.length < total && pageData.length > 0;

  function applyFilterChange(update: () => void) { setCursor(undefined); setEntries([]); update(); }
  function loadMore() { setEntries(allEntries); setCursor(allEntries[allEntries.length - 1]?.id); }
  function selectRange(daysBack: number, label: string) { applyFilterChange(() => setRange({ ...presetRange(daysBack), label })); }

  const columns: ColumnDef<typeof DT_FEATURES, SystemEventEntry>[] = [
    { id: 'index', enableSorting: false, header: () => <span style={labelStyle}>#</span>, cell: ({ row }) => <span style={dt.muted}>{row.index + 1}</span> },
    { id: 'when', enableSorting: false, header: () => <span style={labelStyle}>When</span>, cell: ({ row }) => <span title={formatAuditTimestamp(row.original.occurredAt)} style={{ whiteSpace: 'nowrap', color: 'var(--muted)' }}>{formatRelativeTime(row.original.occurredAt)}</span> },
    { id: 'service', enableSorting: false, header: () => <HeaderFilter label="Service" value={service} options={SERVICE_OPTIONS} onChange={(v) => applyFilterChange(() => setService(v))} />, cell: ({ row }) => <span style={{ whiteSpace: 'nowrap', color: 'var(--ink)' }}>{SERVICE_LABELS[row.original.service] ?? row.original.service}</span> },
    { id: 'severity', enableSorting: false, header: () => <HeaderFilter label="Severity" value={severity} options={SEVERITY_OPTIONS} onChange={(v) => applyFilterChange(() => setSeverity(v))} />, cell: ({ row }) => <Pill c={severityColor(row.original.severity)} label={row.original.severity} /> },
    { id: 'message', enableSorting: false, header: () => <span style={labelStyle}>What happened</span>, cell: ({ row }) => <span style={{ color: 'var(--ink)' }} title={row.original.message}>{plainEnglish(row.original).summary}</span> },
    { id: 'context', enableSorting: false, header: () => <span style={labelStyle}>Context</span>, cell: ({ row }) => { const summary = contextSummary(row.original); return summary ? <span style={{ wordBreak: 'break-all', fontSize: 12, color: 'var(--muted)' }}>{summary}</span> : <span style={dt.muted}>—</span>; } },
    { id: 'view', enableSorting: false, enableHiding: false, header: () => null, cell: ({ row }) => <button type="button" className="v2-hoverbtn" style={dt.toolBtn} onClick={() => setSelected(row.original)}>View</button> },
  ];

  return (
    <>
      <div style={{ marginBottom: 16 }}>
        <p style={{ fontSize: 11, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.12em', color: 'var(--muted)', margin: 0 }}>Security</p>
        <h1 className="v2-title" style={{ fontSize: 22, margin: '2px 0 0' }}>System Logs</h1>
        <p style={{ fontSize: 13, color: 'var(--muted)', margin: '4px 0 0', maxWidth: 640 }}>Production errors from the servers and candidates&rsquo; browsers — what failed and why, without needing server access.</p>
      </div>

      <div style={{ background: 'var(--paper)', border: '1px solid var(--hair)', borderRadius: 14, padding: '12px 16px', marginBottom: 16 }}>
        <div style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }} role="group" aria-label="Time range">
          {[{ days: 1, label: '24h' }, { days: 7, label: '7 days' }, { days: 30, label: '30 days' }].map((preset) => {
            const active = range.label === preset.label;
            return <button key={preset.label} type="button" onClick={() => selectRange(preset.days, preset.label)} style={{ borderRadius: 8, border: `1px solid ${active ? 'var(--org-primary)' : 'var(--hair)'}`, padding: '6px 14px', fontSize: 13, fontWeight: 500, cursor: 'pointer', background: active ? 'var(--org-primary)' : 'var(--paper)', color: active ? 'var(--org-on-primary)' : 'var(--muted)' }}>{preset.label}</button>;
          })}
        </div>
      </div>

      {allEntries.length > 0 && <p style={{ fontSize: 12, color: 'var(--muted)', margin: '0 0 8px' }}>Showing {allEntries.length} of {total} events</p>}
      <DataTable
        columns={columns} data={allEntries} getRowId={(e) => e.id} hideToolbar
        isLoading={isLoading && allEntries.length === 0} emptyMessage="No events in this range — nothing has failed. 🎉"
      />
      {canLoadMore && (
        <div style={{ display: 'flex', justifyContent: 'center', marginTop: 14 }}><button type="button" className="v2-hoverbtn" style={dt.toolBtn} onClick={loadMore}>Load more</button></div>
      )}

      {selected && (
        <Dialog open onClose={() => setSelected(null)} title={`${SERVICE_LABELS[selected.service] ?? selected.service} — ${selected.severity}`} width={560}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12, fontSize: 13 }}>
            <p style={{ fontWeight: 500, color: 'var(--ink)', margin: 0 }}>{plainEnglish(selected).summary}</p>
            <p style={{ color: 'var(--muted)', margin: 0 }}>{plainEnglish(selected).meaning}</p>
            <div style={{ borderRadius: 8, background: 'var(--surface)', padding: 12 }}>
              <p style={{ margin: '0 0 4px', ...labelStyle }}>What to do</p>
              <p style={{ color: 'var(--ink)', margin: 0 }}>{plainEnglish(selected).whatToDo}</p>
            </div>
            <p style={{ fontSize: 12, color: 'var(--muted)', margin: 0 }}>{formatAuditTimestamp(selected.occurredAt)}</p>
            <details style={{ fontSize: 12, color: 'var(--muted)' }}>
              <summary style={{ cursor: 'pointer', userSelect: 'none' }}>Technical details</summary>
              <p style={{ marginTop: 8, wordBreak: 'break-all', fontFamily: 'var(--font-mono)' }}>{selected.message}</p>
              {selected.context && <pre style={{ marginTop: 8, maxHeight: 320, overflow: 'auto', borderRadius: 8, background: 'var(--surface)', padding: 12 }}>{JSON.stringify(selected.context, null, 2)}</pre>}
            </details>
          </div>
        </Dialog>
      )}
    </>
  );
}
