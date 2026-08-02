'use client';

import { useEffect, useState } from 'react';
import { useAuditLogs, type AuditLogFilters } from '../../../lib/hooks/useAuditLogs';
import { Input, Button, Modal, Table, StatusBadge, type StatusTone, type Column } from '../../../components/ui';
import { AuditLogEntry } from '../../../lib/types';
import { friendlyAction, auditDetail, auditActor, formatAuditTimestamp } from '../../../lib/audit-display';

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

function makeColumns(onView: (entry: AuditLogEntry) => void): Column<AuditLogEntry>[] {
  return [
    {
      key: 'createdAt',
      header: 'When',
      // Short form in the row (date + time), full form on hover -- auditors scan by
      // time, so the compact form keeps rows dense while the title keeps precision.
      render: (entry) => (
        <span title={formatAuditTimestamp(entry.createdAt)} className="whitespace-nowrap text-recruiter-text-secondary">
          {new Date(entry.createdAt).toLocaleString(undefined, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}
        </span>
      ),
      sortValue: (entry) => entry.createdAt,
    },
    {
      key: 'action',
      header: 'Action',
      render: (entry) => <StatusBadge tone={actionTone(entry.action)}>{friendlyAction(entry.action)}</StatusBadge>,
      sortValue: (entry) => friendlyAction(entry.action),
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
          onClick={() => onView(entry)}
          className="whitespace-nowrap text-sm font-medium text-primary hover:underline"
        >
          View
        </button>
      ),
    },
  ];
}

export default function AuditLogPage() {
  const [filters, setFilters] = useState<AuditLogFilters>({});
  const [formFilters, setFormFilters] = useState<AuditLogFilters>({});
  const [cursor, setCursor] = useState<string | undefined>(undefined);
  const [entries, setEntries] = useState<AuditLogEntry[]>([]);
  const [selected, setSelected] = useState<AuditLogEntry | null>(null);
  const { data, isLoading, isError } = useAuditLogs({ ...filters, cursor });
  const columns = makeColumns(setSelected);

  useEffect(() => {
    if (!data) return;
    setEntries((current) => (cursor ? [...current, ...data] : data));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data]);

  function handleApplyFilters(e: React.FormEvent) {
    e.preventDefault();
    setEntries([]);
    setCursor(undefined);
    setFilters(formFilters);
  }

  function handleLoadMore() {
    if (entries.length === 0) return;
    setCursor(entries[entries.length - 1].id);
  }

  return (
    <div>
      <h1 className="mb-6 text-2xl font-semibold text-recruiter-text">Audit Log</h1>
      <form onSubmit={handleApplyFilters} className="mb-6 flex flex-wrap items-end gap-2">
        <Input
          label="Actor User ID"
          value={formFilters.actorUserId ?? ''}
          onChange={(value) => setFormFilters((f) => ({ ...f, actorUserId: value || undefined }))}
        />
        <Input
          label="Action"
          value={formFilters.action ?? ''}
          onChange={(value) => setFormFilters((f) => ({ ...f, action: value || undefined }))}
        />
        <Input
          label="Entity Type"
          value={formFilters.entityType ?? ''}
          onChange={(value) => setFormFilters((f) => ({ ...f, entityType: value || undefined }))}
        />
        <Input
          label="From"
          type="date"
          value={formFilters.from ?? ''}
          onChange={(value) => setFormFilters((f) => ({ ...f, from: value || undefined }))}
        />
        <Input
          label="To"
          type="date"
          value={formFilters.to ?? ''}
          onChange={(value) => setFormFilters((f) => ({ ...f, to: value || undefined }))}
        />
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
            <Table columns={columns} rows={entries} rowKey={(entry) => entry.id} emptyMessage="No audit events found." />
            {entries.length > 0 && (
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
