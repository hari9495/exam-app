'use client';

import { useState } from 'react';
import { useSystemEvents, type SystemEventEntry, type SystemEventFilters } from '../../../lib/hooks/useSystemEvents';
import { Button, Modal, Table, StatusBadge, FilterableHeader, TableSkeleton, EmptyState, type StatusTone, type Column } from '../../../components/ui';
import { PageHeader, PageSurface } from '../../../components/PageChrome';
import { formatAuditTimestamp, formatRelativeTime } from '../../../lib/audit-display';
import { plainEnglish } from '../../../lib/system-event-message';

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

const SERVICE_LABELS: Record<string, string> = {
  api: 'Staff API',
  'exam-runtime': 'Exam runtime',
  'candidate-browser': 'Candidate browser',
};

function severityTone(severity: string): StatusTone {
  return severity === 'error' ? 'danger' : 'warning';
}

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

export default function SystemLogsPage() {
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

  function applyFilterChange(update: () => void) {
    setCursor(undefined);
    setEntries([]);
    update();
  }

  function loadMore() {
    setEntries(allEntries);
    setCursor(allEntries[allEntries.length - 1]?.id);
  }

  function selectRange(daysBack: number, label: string) {
    applyFilterChange(() => setRange({ ...presetRange(daysBack), label }));
  }

  const columns: Column<SystemEventEntry>[] = [
    { key: 'index', header: '#', render: (_entry, index) => index + 1 },
    {
      key: 'occurredAt',
      header: 'When',
      render: (entry) => (
        <span title={formatAuditTimestamp(entry.occurredAt)} className="whitespace-nowrap text-muted">
          {formatRelativeTime(entry.occurredAt)}
        </span>
      ),
      sortValue: (entry) => entry.occurredAt,
    },
    {
      key: 'service',
      header: (
        <FilterableHeader
          label="Service"
          value={service}
          onChange={(value) => applyFilterChange(() => setService(value))}
          options={SERVICE_OPTIONS}
        />
      ),
      render: (entry) => <span className="whitespace-nowrap text-ink">{SERVICE_LABELS[entry.service] ?? entry.service}</span>,
    },
    {
      key: 'severity',
      header: (
        <FilterableHeader
          label="Severity"
          value={severity}
          onChange={(value) => applyFilterChange(() => setSeverity(value))}
          options={SEVERITY_OPTIONS}
        />
      ),
      render: (entry) => <StatusBadge tone={severityTone(entry.severity)}>{entry.severity}</StatusBadge>,
    },
    {
      key: 'message',
      header: 'What happened',
      // The stored message is engineering shorthand; org admins read this page. The raw
      // form stays on hover and in full in the detail modal.
      render: (entry) => (
        <span className="text-ink" title={entry.message}>
          {plainEnglish(entry).summary}
        </span>
      ),
      sortValue: (entry) => plainEnglish(entry).summary,
    },
    {
      key: 'context',
      header: 'Context',
      render: (entry) => {
        const summary = contextSummary(entry);
        return summary ? (
          <span className="break-all text-xs text-muted">{summary}</span>
        ) : (
          <span className="text-muted">—</span>
        );
      },
      sortValue: (entry) => contextSummary(entry),
    },
    {
      key: 'view',
      header: '',
      render: (entry) => (
        <Button variant="secondary" onClick={() => setSelected(entry)}>
          View
        </Button>
      ),
    },
  ];

  return (
    <div>
      <PageHeader
        eyebrow="SECURITY"
        title="System Logs"
        subtitle="Production errors from the servers and candidates’ browsers — what failed and why, without needing server access."
      />

      <PageSurface>
        <div className="flex flex-wrap items-end gap-3 border-b border-rule px-4 py-3">
          <div className="flex items-center gap-1" role="group" aria-label="Time range">
            {[
              { days: 1, label: '24h' },
              { days: 7, label: '7 days' },
              { days: 30, label: '30 days' },
            ].map((preset) => (
              <button
                key={preset.label}
                type="button"
                onClick={() => selectRange(preset.days, preset.label)}
                className={
                  range.label === preset.label
                    ? 'rounded-md border border-rule bg-primary px-3 py-2 text-sm font-medium text-on-primary'
                    : 'rounded-md border border-gray-300 px-3 py-2 text-sm text-muted hover:bg-gray-50'
                }
              >
                {preset.label}
              </button>
            ))}
          </div>
        </div>

        {isLoading && allEntries.length === 0 ? (
          <TableSkeleton />
        ) : allEntries.length === 0 ? (
          <EmptyState title="No events in this range — nothing has failed. 🎉" />
        ) : (
          <>
            <p className="px-4 pt-3 text-xs text-muted">
              Showing {allEntries.length} of {total} events
            </p>
            <Table columns={columns} rows={allEntries} rowKey={(entry) => entry.id} />
            {canLoadMore && (
              <div className="flex justify-center px-4 py-3">
                <Button variant="secondary" onClick={loadMore}>
                  Load more
                </Button>
              </div>
            )}
          </>
        )}
      </PageSurface>

      <Modal open={selected !== null} title={selected ? `${SERVICE_LABELS[selected.service] ?? selected.service} — ${selected.severity}` : ''} onClose={() => setSelected(null)}>
        {selected && (
          <div className="flex flex-col gap-3 text-sm">
            <p className="font-medium text-ink">{plainEnglish(selected).summary}</p>
            <p className="text-muted">{plainEnglish(selected).meaning}</p>
            <div className="rounded-md bg-gray-50 p-3">
              <p className="mb-1 text-xs font-medium uppercase tracking-wide text-muted">What to do</p>
              <p className="text-ink">{plainEnglish(selected).whatToDo}</p>
            </div>
            <p className="text-xs text-muted">{formatAuditTimestamp(selected.occurredAt)}</p>
            <details className="text-xs text-muted">
              <summary className="cursor-pointer select-none">Technical details</summary>
              <p className="mt-2 break-all font-mono">{selected.message}</p>
              {selected.context && (
                <pre className="mt-2 max-h-80 overflow-auto rounded bg-gray-50 p-3">
                  {JSON.stringify(selected.context, null, 2)}
                </pre>
              )}
            </details>
          </div>
        )}
      </Modal>
    </div>
  );
}
