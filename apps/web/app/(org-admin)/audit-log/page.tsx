'use client';

import { useEffect, useState } from 'react';
import { useAuditLogs, type AuditLogFilters } from '../../../lib/hooks/useAuditLogs';
import { Input, Button, Table, StatusBadge, type Column, type StatusTone } from '../../../components/ui';
import { AuditLogEntry } from '../../../lib/types';

// Action strings are open-ended ("<entity>.<verb>", e.g. "exam.published",
// "candidate.erased", "attempt.settled") -- tone by verb suffix rather than
// an exhaustive map, since new action types are added elsewhere in the app
// without this page's knowledge.
function actionTone(action: string): StatusTone {
  if (action.endsWith('.erased') || action.endsWith('.revoked') || action.endsWith('.archived')) return 'danger';
  if (action.endsWith('.published') || action.endsWith('.created') || action.endsWith('.settled')) return 'success';
  return 'neutral';
}

export default function AuditLogPage() {
  const [filters, setFilters] = useState<AuditLogFilters>({});
  const [formFilters, setFormFilters] = useState<AuditLogFilters>({});
  const [cursor, setCursor] = useState<string | undefined>(undefined);
  const [entries, setEntries] = useState<AuditLogEntry[]>([]);
  const { data, isLoading, isError } = useAuditLogs({ ...filters, cursor });

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

  const columns: Column<AuditLogEntry>[] = [
    {
      key: 'createdAt',
      header: 'When',
      render: (entry) => <span className="text-recruiter-text-tertiary">{new Date(entry.createdAt).toLocaleString()}</span>,
      sortValue: (entry) => entry.createdAt,
    },
    { key: 'actorEmail', header: 'Actor', render: (entry) => entry.actorEmail ?? 'System' },
    { key: 'action', header: 'Action', render: (entry) => <StatusBadge tone={actionTone(entry.action)}>{entry.action}</StatusBadge> },
    { key: 'entityType', header: 'Entity', render: (entry) => entry.entityType },
  ];

  return (
    <div>
      <h1 className="mb-6 text-2xl font-semibold text-recruiter-text">Audit Log</h1>
      <form onSubmit={handleApplyFilters} className="mb-6 flex flex-wrap items-end gap-2">
        <Input
          label="Actor user ID"
          value={formFilters.actorUserId ?? ''}
          onChange={(value) => setFormFilters((f) => ({ ...f, actorUserId: value || undefined }))}
        />
        <Input
          label="Action"
          value={formFilters.action ?? ''}
          onChange={(value) => setFormFilters((f) => ({ ...f, action: value || undefined }))}
        />
        <Input
          label="Entity type"
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
    </div>
  );
}
