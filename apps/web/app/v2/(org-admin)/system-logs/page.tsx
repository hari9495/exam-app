'use client';

// v2 System Logs — activity-feed re-skin of the old (org-admin)/system-logs page. Same hook
// (useSystemEvents) and identical logic: service/severity/time-range filters reset the cursor
// accumulation, "Load more" pages via cursor. The log list is now a Timeline feed (one row per
// event, most-recent first) instead of a DataTable; clicking a row opens the same detail Dialog.
// Service + severity move from DataTable header dropdowns into Combobox filters in the toolbar card
// (still instant-apply); time range presets stay beside them.
import { useState } from 'react';
import { useSystemEvents, type SystemEventEntry, type SystemEventFilters } from '../../../../lib/hooks/useSystemEvents';
import { formatAuditTimestamp, formatRelativeTime } from '../../../../lib/audit-display';
import { plainEnglish } from '../../../../lib/system-event-message';
import { dt, Pill, Combobox, Dialog, Timeline, TimelineRow } from '../../../../components/ui-v2';
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

const labelStyle: React.CSSProperties = { fontSize: 11, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.06em', color: 'var(--muted)', marginBottom: 4, display: 'block' };
// Full-width clickable feed row (replaces the old table "View" button); opens the detail Dialog.
const feedRow: React.CSSProperties = { display: 'block', width: '100%', textAlign: 'left', background: 'none', border: 'none', padding: '2px 0', margin: 0, cursor: 'pointer', font: 'inherit' };

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

  return (
    <>
      <div style={{ marginBottom: 16 }}>
        <p style={{ fontSize: 11, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.12em', color: 'var(--muted)', margin: 0 }}>Security</p>
        <h1 className="v2-title" style={{ fontSize: 22, margin: '2px 0 0' }}>System Logs</h1>
        <p style={{ fontSize: 13, color: 'var(--muted)', margin: '4px 0 0', maxWidth: 640 }}>Production errors from the servers and candidates&rsquo; browsers — what failed and why, without needing server access.</p>
      </div>

      <div style={{ background: 'var(--paper)', border: '1px solid var(--hair)', borderRadius: 14, padding: '14px 16px', marginBottom: 16, display: 'flex', flexWrap: 'wrap', alignItems: 'flex-end', gap: 12 }}>
        <div><label style={labelStyle}>Service</label><Combobox options={SERVICE_OPTIONS} value={service} onChange={(v) => applyFilterChange(() => setService(v))} width={180} active={service !== 'all'} /></div>
        <div><label style={labelStyle}>Severity</label><Combobox options={SEVERITY_OPTIONS} value={severity} onChange={(v) => applyFilterChange(() => setSeverity(v))} width={160} active={severity !== 'all'} /></div>
        <div>
          <label style={labelStyle}>Time range</label>
          <div style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }} role="group" aria-label="Time range">
            {[{ days: 1, label: '24h' }, { days: 7, label: '7 days' }, { days: 30, label: '30 days' }].map((preset) => {
              const active = range.label === preset.label;
              return <button key={preset.label} type="button" onClick={() => selectRange(preset.days, preset.label)} style={{ borderRadius: 8, border: `1px solid ${active ? 'var(--org-primary)' : 'var(--hair)'}`, padding: '6px 14px', fontSize: 13, fontWeight: 500, cursor: 'pointer', background: active ? 'var(--org-primary)' : 'var(--paper)', color: active ? 'var(--org-on-primary)' : 'var(--muted)' }}>{preset.label}</button>;
            })}
          </div>
        </div>
      </div>

      {allEntries.length > 0 && <p style={{ fontSize: 12, color: 'var(--muted)', margin: '0 0 12px' }}>Showing {allEntries.length} of {total} events</p>}
      {isLoading && allEntries.length === 0 ? (
        <p style={{ fontSize: 13, color: 'var(--muted)' }}>Loading…</p>
      ) : allEntries.length === 0 ? (
        <p style={{ fontSize: 13, color: 'var(--muted)' }}>No events in this range — nothing has failed. 🎉</p>
      ) : (
        <Timeline>
          {allEntries.map((entry, i) => {
            const summary = contextSummary(entry);
            return (
              <TimelineRow key={entry.id} color={severityColor(entry.severity)} last={i === allEntries.length - 1}>
                <button type="button" onClick={() => setSelected(entry)} className="wf-row" style={feedRow}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                    <Pill c={severityColor(entry.severity)} label={entry.severity} />
                    <span style={{ fontSize: 13, fontWeight: 500, color: 'var(--ink)' }}>{SERVICE_LABELS[entry.service] ?? entry.service}</span>
                    <span title={formatAuditTimestamp(entry.occurredAt)} style={{ marginLeft: 'auto', whiteSpace: 'nowrap', fontSize: 12, color: 'var(--muted)' }}>{formatRelativeTime(entry.occurredAt)}</span>
                  </div>
                  <div style={{ marginTop: 5, fontSize: 13, color: 'var(--ink)' }}>{plainEnglish(entry).summary}</div>
                  {summary && <div style={{ marginTop: 2, wordBreak: 'break-all', fontSize: 12, color: 'var(--muted)' }}>{summary}</div>}
                </button>
              </TimelineRow>
            );
          })}
        </Timeline>
      )}
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
