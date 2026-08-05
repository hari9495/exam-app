'use client';

import { useEffect, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { ScrollText, Download, X } from 'lucide-react';
import { useAuditLogs, useAuditLogExport, type AuditLogFilters } from '../../../lib/hooks/useAuditLogs';
import { Button, Modal, Table, StatusBadge, Select, FilterableHeader, type StatusTone, type Column } from '../../../components/ui';
import { AuditActorFilter } from '../../../components/AuditActorFilter';
import { AuditLogEntry } from '../../../lib/types';
import {
  friendlyAction,
  auditDetail,
  auditActor,
  formatAuditTimestamp,
  formatRelativeTime,
  AUDIT_ACTION_OPTIONS,
  AUDIT_ENTITY_TYPE_OPTIONS,
} from '../../../lib/audit-display';

// Action strings are open-ended ("<entity>.<verb>", e.g. "exam.published",
// "candidate.erased", "attempt.settled") -- tone by verb suffix rather than
// an exhaustive map, since new action types are added elsewhere in the app
// without this page's knowledge.
function actionTone(action: string): StatusTone {
  if (action.endsWith('.erased') || action.endsWith('.revoked') || action.endsWith('.archived') || action.endsWith('.deleted'))
    return 'danger';
  if (action.startsWith('auth.') || action.endsWith('.suspended')) return 'warning';
  if (action.endsWith('.published') || action.endsWith('.created') || action.endsWith('.settled')) return 'success';
  return 'neutral';
}

const ACTION_OPTIONS = [{ value: 'all', label: 'All actions' }, ...AUDIT_ACTION_OPTIONS.map((o) => ({ value: o.value, label: `${o.group} — ${o.label}` }))];
const ENTITY_TYPE_SELECT_OPTIONS = [{ value: 'all', label: 'All entity types' }, ...AUDIT_ENTITY_TYPE_OPTIONS];

const CATEGORY_OPTIONS: { value: AuditLogFilters['category']; label: string }[] = [
  { value: 'all', label: 'All events' },
  { value: 'change', label: 'Changes' },
  { value: 'access', label: 'Access' },
];

// Inclusive [from, to] date-only strings (YYYY-MM-DD, matching the <input
// type="date"> format) for the quick preset buttons.
function presetRange(daysBack: number): { from: string; to: string } {
  const to = new Date();
  const from = new Date(to);
  from.setDate(from.getDate() - daysBack);
  const toDateOnly = (d: Date) => d.toISOString().slice(0, 10);
  return { from: toDateOnly(from), to: toDateOnly(to) };
}

export default function AuditLogPage() {
  const searchParams = useSearchParams();
  const linkedEntityType = searchParams.get('entityType') ?? undefined;
  const linkedEntityId = searchParams.get('entityId') ?? undefined;
  const linkedEntityName = searchParams.get('entityName') ?? undefined;

  const [filters, setFilters] = useState<AuditLogFilters>(
    linkedEntityType && linkedEntityId ? { entityType: linkedEntityType, entityId: linkedEntityId } : {},
  );
  const [formFilters, setFormFilters] = useState<AuditLogFilters>(filters);
  const [actorLabel, setActorLabel] = useState<string | undefined>(undefined);
  const [cursor, setCursor] = useState<string | undefined>(undefined);
  const [entries, setEntries] = useState<AuditLogEntry[]>([]);
  const [selected, setSelected] = useState<AuditLogEntry | null>(null);
  const { data, isLoading, isError } = useAuditLogs({ ...filters, cursor });
  const exportMutation = useAuditLogExport();

  // The Action filter's control lives in the column header, but -- like every other
  // filter on this page -- it stages into formFilters and only takes effect once
  // "Apply filters" is submitted; it does not instant-apply like the header filters
  // on other pages, so it stays consistent with the Entity Type filter beside it.
  const columns: Column<AuditLogEntry>[] = [
    { key: 'index', header: '#', render: (_entry, index) => index + 1 },
    {
      key: 'createdAt',
      header: 'When',
      // Relative in the row ("2 hours ago"), exact on hover -- auditors scan by
      // recency, but the precise timestamp is one hover away, never lost.
      render: (entry) => (
        <span title={formatAuditTimestamp(entry.createdAt)} className="whitespace-nowrap text-recruiter-text-secondary">
          {formatRelativeTime(entry.createdAt)}
        </span>
      ),
      sortValue: (entry) => entry.createdAt,
    },
    {
      key: 'action',
      header: (
        <FilterableHeader
          label="Action"
          value={formFilters.action ?? 'all'}
          onChange={(value) => setFormFilters((f) => ({ ...f, action: value === 'all' ? undefined : value }))}
          options={ACTION_OPTIONS}
        />
      ),
      sortLabel: 'Action',
      render: (entry) => <StatusBadge tone={actionTone(entry.action)}>{friendlyAction(entry.action)}</StatusBadge>,
    },
    {
      key: 'summary',
      header: 'Details',
      render: (entry) => {
        const detail = auditDetail(entry);
        return detail ? <span className="text-recruiter-text">{detail}</span> : <span className="text-recruiter-text-tertiary">—</span>;
      },
      sortValue: (entry) => auditDetail(entry),
    },
    {
      key: 'actor',
      header: 'Actor',
      render: (entry) => {
        const actor = auditActor(entry);
        return actor === 'System' ? (
          <span className="text-recruiter-text-tertiary">System</span>
        ) : (
          <span className="text-recruiter-text">
            {actor}
            {entry.actorRole && <span className="ml-1 text-xs text-recruiter-text-tertiary">({entry.actorRole})</span>}
          </span>
        );
      },
      sortValue: (entry) => auditActor(entry),
    },
    {
      key: 'view',
      header: '',
      render: (entry) => (
        <button
          type="button"
          onClick={() => setSelected(entry)}
          className="whitespace-nowrap text-sm font-medium text-primary hover:underline"
        >
          View
        </button>
      ),
    },
  ];

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

  function handleApplyFilters(e: React.FormEvent) {
    e.preventDefault();
    applyFilters(formFilters);
  }

  function handleLoadMore() {
    if (entries.length === 0) return;
    setCursor(entries[entries.length - 1].id);
  }

  function handleClearEntityFilter() {
    applyFilters({ ...formFilters, entityType: undefined, entityId: undefined });
  }

  async function handleExport() {
    const { blob } = await exportMutation.mutateAsync(filters);
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = 'audit-log.csv';
    link.click();
    URL.revokeObjectURL(url);
  }

  const total = data?.total ?? 0;

  return (
    <div>
      <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <h1 className="flex items-center gap-2 text-2xl font-semibold text-recruiter-text">
          <ScrollText size={22} aria-hidden="true" />
          Audit Log
        </h1>
        <Button
          variant="secondary"
          onClick={handleExport}
          loading={exportMutation.isPending}
          className="inline-flex items-center gap-1.5"
        >
          <Download size={16} />
          Export CSV
        </Button>
      </div>

      {linkedEntityType && linkedEntityId && filters.entityId === linkedEntityId && (
        <p className="mb-4 flex items-center gap-2 rounded-md border border-recruiter-border bg-recruiter-bg-subtle px-3 py-2 text-sm text-recruiter-text">
          Filtered by: <strong>{linkedEntityName ?? `${linkedEntityType} ${linkedEntityId}`}</strong>
          <button type="button" onClick={handleClearEntityFilter} aria-label="Clear entity filter" className="text-recruiter-text-tertiary hover:text-recruiter-text">
            <X size={14} />
          </button>
        </p>
      )}

      <div className="mb-4 flex flex-wrap items-center gap-1.5">
        <span className="mr-1 text-xs font-medium text-recruiter-text-tertiary">Quick range:</span>
        {[
          { label: 'Today', days: 0 },
          { label: 'Last 7 days', days: 7 },
          { label: 'Last 30 days', days: 30 },
        ].map((preset) => (
          <button
            key={preset.label}
            type="button"
            onClick={() => applyFilters({ ...formFilters, ...presetRange(preset.days) })}
            className="rounded-full border border-recruiter-border px-3 py-1 text-xs font-medium text-recruiter-text hover:bg-recruiter-bg-subtle"
          >
            {preset.label}
          </button>
        ))}
        <div className="ml-2 flex overflow-hidden rounded-md border border-recruiter-border">
          {CATEGORY_OPTIONS.map((option) => (
            <button
              key={option.value}
              type="button"
              onClick={() => applyFilters({ ...formFilters, category: option.value })}
              className={`px-3 py-1 text-xs font-medium ${
                (formFilters.category ?? 'all') === option.value
                  ? 'bg-primary text-white'
                  : 'bg-white text-recruiter-text hover:bg-recruiter-bg-subtle'
              }`}
            >
              {option.label}
            </button>
          ))}
        </div>
      </div>

      <form onSubmit={handleApplyFilters} className="mb-6 flex flex-wrap items-end gap-2">
        <AuditActorFilter
          actorUserId={formFilters.actorUserId}
          actorLabel={actorLabel}
          onChange={(actorUserId, label) => {
            setActorLabel(label);
            setFormFilters((f) => ({ ...f, actorUserId }));
          }}
        />
        <Select
          label="Entity Type"
          value={formFilters.entityType ?? 'all'}
          onChange={(value) => setFormFilters((f) => ({ ...f, entityType: value === 'all' ? undefined : value }))}
          options={ENTITY_TYPE_SELECT_OPTIONS}
        />
        <label className="flex flex-col gap-1 text-sm">
          <span className="font-medium text-gray-700">From</span>
          <input
            type="date"
            value={formFilters.from ?? ''}
            onChange={(e) => setFormFilters((f) => ({ ...f, from: e.target.value || undefined }))}
            className="rounded border border-recruiter-border px-3 py-2 text-sm"
          />
        </label>
        <label className="flex flex-col gap-1 text-sm">
          <span className="font-medium text-gray-700">To</span>
          <input
            type="date"
            value={formFilters.to ?? ''}
            onChange={(e) => setFormFilters((f) => ({ ...f, to: e.target.value || undefined }))}
            className="rounded border border-recruiter-border px-3 py-2 text-sm"
          />
        </label>
        <Button type="submit">Apply filters</Button>
      </form>

      {isError && (
        <p role="alert" className="text-sm text-status-danger">
          Failed to load audit log.
        </p>
      )}
      {isLoading && entries.length === 0 ? (
        <p className="text-sm text-recruiter-text-tertiary">Loading…</p>
      ) : (
        !isError && (
          <>
            <p className="mb-2 text-xs text-recruiter-text-tertiary">
              Showing {entries.length} of {total} event{total === 1 ? '' : 's'}
            </p>
            <Table columns={columns} rows={entries} rowKey={(entry) => entry.id} emptyMessage="No audit events found." />
            {entries.length > 0 && entries.length < total && (
              <div className="mt-4">
                <Button variant="secondary" onClick={handleLoadMore} disabled={isLoading}>
                  Load more
                </Button>
              </div>
            )}
          </>
        )
      )}

      {selected && (
        <Modal open title="Audit event" onClose={() => setSelected(null)}>
          <dl className="grid grid-cols-[8rem_1fr] gap-x-4 gap-y-3 text-sm">
            <dt className="font-medium text-recruiter-text-secondary">When</dt>
            <dd className="text-recruiter-text">{formatAuditTimestamp(selected.createdAt)}</dd>

            <dt className="font-medium text-recruiter-text-secondary">Action</dt>
            <dd className="text-recruiter-text">
              {friendlyAction(selected.action)}
              <span className="ml-2 font-mono text-xs text-recruiter-text-tertiary">{selected.action}</span>
            </dd>

            <dt className="font-medium text-recruiter-text-secondary">Actor</dt>
            <dd className="text-recruiter-text">
              {auditActor(selected)}
              {selected.actorRole && <span className="ml-2 text-xs text-recruiter-text-tertiary">{selected.actorRole}</span>}
              {selected.actorEmail && selected.actorName && (
                <span className="ml-2 text-xs text-recruiter-text-tertiary">{selected.actorEmail}</span>
              )}
              {/* If identity couldn't be captured, still surface the raw user id so
                  the actor remains traceable. */}
              {auditActor(selected) === 'System' && selected.actorUserId && (
                <span className="ml-2 font-mono text-xs text-recruiter-text-tertiary">{selected.actorUserId}</span>
              )}
            </dd>

            <dt className="font-medium text-recruiter-text-secondary">Entity</dt>
            <dd className="text-recruiter-text">
              {selected.entityName ? `${selected.entityName} ` : ''}
              <span className="text-xs text-recruiter-text-tertiary">{selected.entityType}</span>
            </dd>

            <dt className="font-medium text-recruiter-text-secondary">Entity ID</dt>
            <dd className="break-all font-mono text-xs text-recruiter-text">{selected.entityId ?? '—'}</dd>

            <dt className="font-medium text-recruiter-text-secondary">Details</dt>
            <dd className="text-recruiter-text">
              {selected.metadata && Object.keys(selected.metadata).length > 0 ? (
                <pre className="overflow-x-auto rounded-md bg-recruiter-bg-subtle p-3 font-mono text-xs">
                  {JSON.stringify(selected.metadata, null, 2)}
                </pre>
              ) : (
                <span className="text-recruiter-text-tertiary">No additional details recorded.</span>
              )}
            </dd>
          </dl>
        </Modal>
      )}
    </div>
  );
}
