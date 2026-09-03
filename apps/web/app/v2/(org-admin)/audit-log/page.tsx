'use client';

// v2 Audit Log — activity-feed re-skin of the old (org-admin)/audit-log page. Same hooks
// (useAuditLogs cursor pagination + useAuditLogExport) and identical logic: staged filters applied
// on submit, quick-range + category instant-apply, cursor "Load more" accumulation, entity-history
// deep link. The log list is now a Timeline feed (one row per event, most-recent first) instead of a
// DataTable; clicking a row opens the same detail Dialog. Filters keep their v2 filter card and the
// AuditActorFilter typeahead stays a Combobox over the same useUsers data.
import { Suspense, useEffect, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { Download, X } from 'lucide-react';
import { useAuditLogs, useAuditLogExport, type AuditLogFilters } from '../../../../lib/hooks/useAuditLogs';
import { useUsers } from '../../../../lib/hooks/useUsers';
import type { AuditLogEntry } from '../../../../lib/types';
import { dt, Pill, Combobox, Dialog, Timeline, TimelineRow } from '../../../../components/ui-v2';
import { STATUS } from '../../../../components/ui-v2/viz';
import {
  friendlyAction, auditDetail, auditActor, formatAuditTimestamp, formatRelativeTime,
  AUDIT_ACTION_OPTIONS, AUDIT_ENTITY_TYPE_OPTIONS,
} from '../../../../lib/audit-display';

// Action strings are open-ended ("<entity>.<verb>") -- tone by verb suffix rather than an exhaustive
// map, since new action types are added elsewhere without this page's knowledge.
function toneColor(action: string): string {
  if (action.endsWith('.erased') || action.endsWith('.revoked') || action.endsWith('.archived') || action.endsWith('.deleted')) return STATUS.bad;
  if (action.startsWith('auth.') || action.endsWith('.suspended')) return STATUS.warn;
  if (action.endsWith('.published') || action.endsWith('.created') || action.endsWith('.settled')) return STATUS.ok;
  return 'var(--muted)';
}

const ACTION_OPTIONS = [{ value: 'all', label: 'All actions' }, ...AUDIT_ACTION_OPTIONS.map((o) => ({ value: o.value, label: `${o.group} — ${o.label}` }))];
const ENTITY_TYPE_SELECT_OPTIONS = [{ value: 'all', label: 'All entity types' }, ...AUDIT_ENTITY_TYPE_OPTIONS];
const CATEGORY_OPTIONS: { value: AuditLogFilters['category']; label: string }[] = [
  { value: 'all', label: 'All events' },
  { value: 'change', label: 'Changes' },
  { value: 'access', label: 'Access' },
];

// Inclusive [from, to] date-only strings (YYYY-MM-DD) for the quick preset buttons.
function presetRange(daysBack: number): { from: string; to: string } {
  const to = new Date();
  const from = new Date(to);
  from.setDate(from.getDate() - daysBack);
  const toDateOnly = (d: Date) => d.toISOString().slice(0, 10);
  return { from: toDateOnly(from), to: toDateOnly(to) };
}

const dateInput: React.CSSProperties = { padding: '8px 10px', fontSize: 13, borderRadius: 8, border: '1px solid color-mix(in srgb, var(--ink) 15%, var(--hair))', background: 'var(--paper)', color: 'var(--ink)', outline: 'none' };
const labelStyle: React.CSSProperties = { fontSize: 11, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.06em', color: 'var(--muted)', marginBottom: 4, display: 'block' };
// Full-width clickable feed row (replaces the old table "View" button); opens the detail Dialog.
const feedRow: React.CSSProperties = { display: 'block', width: '100%', textAlign: 'left', background: 'none', border: 'none', padding: '2px 0', margin: 0, cursor: 'pointer', font: 'inherit' };

function AuditLogInner() {
  const searchParams = useSearchParams();
  const linkedEntityType = searchParams.get('entityType') ?? undefined;
  const linkedEntityId = searchParams.get('entityId') ?? undefined;
  const linkedEntityName = searchParams.get('entityName') ?? undefined;

  const [filters, setFilters] = useState<AuditLogFilters>(
    linkedEntityType && linkedEntityId ? { entityType: linkedEntityType, entityId: linkedEntityId } : {},
  );
  const [formFilters, setFormFilters] = useState<AuditLogFilters>(filters);
  const [cursor, setCursor] = useState<string | undefined>(undefined);
  const [entries, setEntries] = useState<AuditLogEntry[]>([]);
  const [selected, setSelected] = useState<AuditLogEntry | null>(null);
  const { data, isLoading, isError } = useAuditLogs({ ...filters, cursor });
  const exportMutation = useAuditLogExport();

  const { data: staff } = useUsers({ pageSize: 200 });
  const actorOptions = [{ value: '', label: 'Any actor' }, ...(staff?.data ?? []).map((u) => ({ value: u.id, label: u.name ?? u.email }))];

  useEffect(() => {
    if (!data) return;
    setEntries((current) => (cursor ? [...current, ...data.data] : data.data));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data]);

  function applyFilters(next: AuditLogFilters) {
    setEntries([]);
    setCursor(undefined);
    setFormFilters(next);
    setFilters(next);
  }
  function handleApplyFilters(e: React.FormEvent) { e.preventDefault(); applyFilters(formFilters); }
  function handleLoadMore() { if (entries.length === 0) return; setCursor(entries[entries.length - 1].id); }
  function handleClearEntityFilter() { applyFilters({ ...formFilters, entityType: undefined, entityId: undefined }); }

  async function handleExport() {
    const { blob } = await exportMutation.mutateAsync(filters);
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url; link.download = 'audit-log.csv'; link.click();
    URL.revokeObjectURL(url);
  }

  const total = data?.total ?? 0;

  return (
    <>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap', marginBottom: 16 }}>
        <div>
          <p style={{ fontSize: 11, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.12em', color: 'var(--muted)', margin: 0 }}>Security</p>
          <h1 className="v2-title" style={{ fontSize: 22, margin: '2px 0 0' }}>Audit Log</h1>
        </div>
        <button type="button" className="v2-hoverbtn" style={{ ...dt.toolBtn, opacity: exportMutation.isPending ? 0.6 : 1 }} disabled={exportMutation.isPending} onClick={handleExport}><Download size={14} /> Export CSV</button>
      </div>

      {linkedEntityType && linkedEntityId && filters.entityId === linkedEntityId && (
        <p style={{ marginBottom: 14, display: 'flex', alignItems: 'center', gap: 8, borderRadius: 9, border: '1px solid var(--hair)', background: 'var(--surface)', padding: '8px 12px', fontSize: 13, color: 'var(--ink)' }}>
          Filtered by: <strong>{linkedEntityName ?? `${linkedEntityType} ${linkedEntityId}`}</strong>
          <button type="button" onClick={handleClearEntityFilter} aria-label="Clear entity filter" style={{ color: 'var(--muted)', background: 'none', border: 'none', cursor: 'pointer', display: 'inline-flex' }}><X size={14} /></button>
        </p>
      )}

      <div style={{ background: 'var(--paper)', border: '1px solid var(--hair)', borderRadius: 14, padding: '14px 16px', marginBottom: 16 }}>
        <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 8 }}>
          <span style={{ marginRight: 2, fontSize: 12, fontWeight: 500, color: 'var(--muted)' }}>Quick range:</span>
          {[{ label: 'Today', days: 0 }, { label: 'Last 7 days', days: 7 }, { label: 'Last 30 days', days: 30 }].map((preset) => (
            <button key={preset.label} type="button" onClick={() => applyFilters({ ...formFilters, ...presetRange(preset.days) })} style={{ borderRadius: 99, border: '1px solid var(--hair)', padding: '5px 12px', fontSize: 12, fontWeight: 500, color: 'var(--ink)', background: 'var(--paper)', cursor: 'pointer' }}>{preset.label}</button>
          ))}
          <div style={{ marginLeft: 4, display: 'inline-flex', overflow: 'hidden', borderRadius: 8, border: '1px solid var(--hair)' }}>
            {CATEGORY_OPTIONS.map((option) => {
              const active = (formFilters.category ?? 'all') === option.value;
              return <button key={option.value} type="button" onClick={() => applyFilters({ ...formFilters, category: option.value })} style={{ padding: '5px 12px', fontSize: 12, fontWeight: 500, border: 'none', cursor: 'pointer', background: active ? 'var(--org-primary)' : 'var(--paper)', color: active ? 'var(--org-on-primary)' : 'var(--ink)' }}>{option.label}</button>;
            })}
          </div>
        </div>

        <form onSubmit={handleApplyFilters} style={{ marginTop: 14, display: 'flex', flexWrap: 'wrap', alignItems: 'flex-end', gap: 12 }}>
          <div><label style={labelStyle}>Actor</label><Combobox options={actorOptions} value={formFilters.actorUserId ?? ''} onChange={(v) => setFormFilters((f) => ({ ...f, actorUserId: v || undefined }))} placeholder="Any actor" width={200} active={!!formFilters.actorUserId} /></div>
          <div><label style={labelStyle}>Action</label><Combobox options={ACTION_OPTIONS} value={formFilters.action ?? 'all'} onChange={(v) => setFormFilters((f) => ({ ...f, action: v === 'all' ? undefined : v }))} width={220} active={!!formFilters.action} /></div>
          <div><label style={labelStyle}>Entity type</label><Combobox options={ENTITY_TYPE_SELECT_OPTIONS} value={formFilters.entityType ?? 'all'} onChange={(v) => setFormFilters((f) => ({ ...f, entityType: v === 'all' ? undefined : v }))} width={180} active={!!formFilters.entityType} /></div>
          <div style={{ display: 'flex', flexDirection: 'column' }}><label style={labelStyle}>From</label><input type="date" value={formFilters.from ?? ''} onChange={(e) => setFormFilters((f) => ({ ...f, from: e.target.value || undefined }))} style={dateInput} /></div>
          <div style={{ display: 'flex', flexDirection: 'column' }}><label style={labelStyle}>To</label><input type="date" value={formFilters.to ?? ''} onChange={(e) => setFormFilters((f) => ({ ...f, to: e.target.value || undefined }))} style={dateInput} /></div>
          <button type="submit" style={dt.primaryBtn}>Apply filters</button>
        </form>
      </div>

      {isError ? (
        <p role="alert" style={{ fontSize: 13, color: 'var(--danger)' }}>Failed to load audit log.</p>
      ) : (
        <>
          <p style={{ fontSize: 12, color: 'var(--muted)', margin: '0 0 12px' }}>Showing {entries.length} of {total} event{total === 1 ? '' : 's'}</p>
          {isLoading && entries.length === 0 ? (
            <p style={{ fontSize: 13, color: 'var(--muted)' }}>Loading…</p>
          ) : entries.length === 0 ? (
            <p style={{ fontSize: 13, color: 'var(--muted)' }}>No audit events found.</p>
          ) : (
            <Timeline>
              {entries.map((entry, i) => {
                const detail = auditDetail(entry);
                const actor = auditActor(entry);
                return (
                  <TimelineRow key={entry.id} color={toneColor(entry.action)} last={i === entries.length - 1}>
                    <button type="button" onClick={() => setSelected(entry)} className="wf-row" style={feedRow}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                        <Pill c={toneColor(entry.action)} label={friendlyAction(entry.action)} />
                        <span title={formatAuditTimestamp(entry.createdAt)} style={{ marginLeft: 'auto', whiteSpace: 'nowrap', fontSize: 12, color: 'var(--muted)' }}>{formatRelativeTime(entry.createdAt)}</span>
                      </div>
                      <div style={{ marginTop: 5, fontSize: 13, color: detail ? 'var(--ink)' : 'var(--muted)' }}>{detail || '—'}</div>
                      <div style={{ marginTop: 2, fontSize: 12, color: 'var(--muted)' }}>
                        {actor === 'System' ? 'System' : <>{actor}{entry.actorRole && <span style={{ marginLeft: 4 }}>({entry.actorRole})</span>}</>}
                      </div>
                    </button>
                  </TimelineRow>
                );
              })}
            </Timeline>
          )}
          {entries.length > 0 && entries.length < total && (
            <div style={{ marginTop: 14 }}><button type="button" className="v2-hoverbtn" style={{ ...dt.toolBtn, opacity: isLoading ? 0.6 : 1 }} disabled={isLoading} onClick={handleLoadMore}>Load more</button></div>
          )}
        </>
      )}

      {selected && (
        <Dialog open onClose={() => setSelected(null)} title="Audit Event" width={560}>
          <dl style={{ display: 'grid', gridTemplateColumns: '8rem 1fr', columnGap: 16, rowGap: 12, fontSize: 13, margin: 0 }}>
            <dt style={{ fontWeight: 500, color: 'var(--muted)' }}>When</dt>
            <dd style={{ color: 'var(--ink)', margin: 0 }}>{formatAuditTimestamp(selected.createdAt)}</dd>

            <dt style={{ fontWeight: 500, color: 'var(--muted)' }}>Action</dt>
            <dd style={{ color: 'var(--ink)', margin: 0 }}>{friendlyAction(selected.action)}<span style={{ marginLeft: 8, fontFamily: 'var(--font-mono)', fontSize: 12, color: 'var(--muted)' }}>{selected.action}</span></dd>

            <dt style={{ fontWeight: 500, color: 'var(--muted)' }}>Actor</dt>
            <dd style={{ color: 'var(--ink)', margin: 0 }}>
              {auditActor(selected)}
              {selected.actorRole && <span style={{ marginLeft: 8, fontSize: 12, color: 'var(--muted)' }}>{selected.actorRole}</span>}
              {selected.actorEmail && selected.actorName && <span style={{ marginLeft: 8, fontSize: 12, color: 'var(--muted)' }}>{selected.actorEmail}</span>}
              {auditActor(selected) === 'System' && selected.actorUserId && <span style={{ marginLeft: 8, fontFamily: 'var(--font-mono)', fontSize: 12, color: 'var(--muted)' }}>{selected.actorUserId}</span>}
            </dd>

            <dt style={{ fontWeight: 500, color: 'var(--muted)' }}>Entity</dt>
            <dd style={{ color: 'var(--ink)', margin: 0 }}>{selected.entityName ? `${selected.entityName} ` : ''}<span style={{ fontSize: 12, color: 'var(--muted)' }}>{selected.entityType}</span></dd>

            <dt style={{ fontWeight: 500, color: 'var(--muted)' }}>Entity ID</dt>
            <dd style={{ wordBreak: 'break-all', fontFamily: 'var(--font-mono)', fontSize: 12, color: 'var(--ink)', margin: 0 }}>{selected.entityId ?? '—'}</dd>

            <dt style={{ fontWeight: 500, color: 'var(--muted)' }}>Details</dt>
            <dd style={{ color: 'var(--ink)', margin: 0 }}>
              {selected.metadata && Object.keys(selected.metadata).length > 0 ? (
                <pre style={{ overflowX: 'auto', borderRadius: 8, background: 'var(--surface)', padding: 12, fontFamily: 'var(--font-mono)', fontSize: 12, margin: 0 }}>{JSON.stringify(selected.metadata, null, 2)}</pre>
              ) : <span style={dt.muted}>No additional details recorded.</span>}
            </dd>
          </dl>
        </Dialog>
      )}
    </>
  );
}

export default function V2AuditLogPage() {
  return (
    <Suspense fallback={<p style={{ fontSize: 13, color: 'var(--muted)' }}>Loading…</p>}>
      <AuditLogInner />
    </Suspense>
  );
}
