'use client';

import { useState } from 'react';
import { TerminalSquare } from 'lucide-react';
import { useSystemEvents, type SystemEventEntry, type SystemEventFilters } from '../../../lib/hooks/useSystemEvents';
import { Button, Modal, Table, StatusBadge, FilterableHeader, type StatusTone, type Column } from '../../../components/ui';
import { formatAuditTimestamp, formatRelativeTime } from '../../../lib/audit-display';

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
        <span title={formatAuditTimestamp(entry.occurredAt)} className="whitespace-nowrap text-recruiter-text-secondary">
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
      render: (entry) => <span className="whitespace-nowrap text-recruiter-text">{SERVICE_LABELS[entry.service] ?? entry.service}</span>,
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
      header: 'Message',
      render: (entry) => <span className="break-all text-recruiter-text">{entry.message}</span>,
      sortValue: (entry) => entry.message,
    },
    {
      key: 'context',
      header: 'Context',
      render: (entry) => {
        const summary = contextSummary(entry);
        return summary ? (
          <span className="break-all text-xs text-recruiter-text-secondary">{summary}</span>
        ) : (
          <span className="text-recruiter-text-tertiary">—</span>
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
      <div className="mb-1 flex items-center gap-2">
        <TerminalSquare size={22} className="text-primary" aria-hidden="true" />
        <h1 className="text-2xl font-semibold">System Logs</h1>
      </div>
      <p className="mb-6 text-sm text-recruiter-text-secondary">
        Production errors from the servers and candidates&apos; browsers — what failed and why, without needing server access.
      </p>

      <div className="mb-4 flex flex-wrap items-end gap-3">
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
                  ? 'rounded-md border border-recruiter-border bg-primary px-3 py-2 text-sm font-medium text-on-primary'
                  : 'rounded-md border border-gray-300 px-3 py-2 text-sm text-recruiter-text-secondary hover:bg-gray-50'
              }
            >
              {preset.label}
            </button>
          ))}
        </div>
      </div>

      {isLoading && allEntries.length === 0 ? (
        <p className="text-sm text-gray-500">Loading…</p>
      ) : allEntries.length === 0 ? (
        <p className="text-sm text-gray-500">No events in this range — nothing has failed. 🎉</p>
      ) : (
        <>
          <p className="mb-2 text-xs text-recruiter-text-secondary">
            Showing {allEntries.length} of {total} events
          </p>
          <Table columns={columns} rows={allEntries} rowKey={(entry) => entry.id} />
          {canLoadMore && (
            <div className="mt-3 flex justify-center">
              <Button variant="secondary" onClick={loadMore}>
                Load more
              </Button>
            </div>
          )}
        </>
      )}

      <Modal open={selected !== null} title={selected ? `${SERVICE_LABELS[selected.service] ?? selected.service} — ${selected.severity}` : ''} onClose={() => setSelected(null)}>
        {selected && (
          <div className="flex flex-col gap-3 text-sm">
            <p className="text-recruiter-text">{selected.message}</p>
            <p className="text-xs text-recruiter-text-secondary">{formatAuditTimestamp(selected.occurredAt)}</p>
            {selected.context && (
              <pre className="max-h-80 overflow-auto rounded bg-gray-50 p-3 text-xs text-recruiter-text-secondary">
                {JSON.stringify(selected.context, null, 2)}
              </pre>
            )}
          </div>
        )}
      </Modal>
    </div>
  );
}
