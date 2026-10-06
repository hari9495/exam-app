import { Badge } from '../../components/display';
import { EmptyState, Pagination } from '../../components/feedback';
import { DataTable, type TableColumn } from '../../components/table';
import { RESULTS, deviceLabel, methodLabel, when } from './kit';
import type { LoginEventRow, Page } from './types';

export interface LoginEventsTableProps {
  page: Page<LoginEventRow> | null;
  state: 'ready' | 'loading' | 'error';
  onRetry?: () => void;
  onPageChange: (page: number) => void;
  /** Admin view: who tried to sign in. */
  showPerson?: boolean;
  /** Filters are on: an empty list says "No results for these filters". */
  filtered?: boolean;
  onClearFilters?: () => void;
  label: string;
}

/** Sign-in attempts, newest first (YX-IAM-10). Server-paged; becomes cards on phones. */
export function LoginEventsTable({ page, state, onRetry, onPageChange, showPerson, filtered, onClearFilters, label }: LoginEventsTableProps) {
  const columns: TableColumn<LoginEventRow>[] = [
    { key: 'when', header: 'When', value: (r) => r.createdAt, render: (r) => when(r.createdAt), width: 190, hideable: false },
    ...(showPerson ? [{ key: 'who', header: 'Email or number', value: (r: LoginEventRow) => r.identifier, width: 220 }] : []),
    {
      key: 'result',
      header: 'Result',
      value: (r) => r.result,
      render: (r) => (
        <span className="yx-auth__badges">
          <Badge tone={RESULTS[r.result]?.tone ?? 'neutral'}>{RESULTS[r.result]?.label ?? r.result}</Badge>
          {r.newDevice && <Badge tone="info">New device</Badge>}
        </span>
      ),
      width: 190,
    },
    { key: 'method', header: 'Method', value: (r) => methodLabel(r.method), width: 160 },
    { key: 'device', header: 'Device', value: (r) => deviceLabel(r.userAgent), optional: true, width: 170 },
    { key: 'ip', header: 'IP address', value: (r) => r.ipAddress ?? '', optional: true, width: 150 },
  ];
  return (
    <div className="yx-auth__stack">
      <DataTable
        label={label}
        columns={columns}
        rows={page?.data ?? []}
        getRowId={(r) => r.id}
        state={state}
        onRetry={onRetry}
        errorTitle="We couldn't load sign-in activity."
        empty={<EmptyState compact title="No sign-in attempts yet." />}
        filtered={filtered}
        onClearFilters={onClearFilters}
        rowNoun={['sign-in attempt', 'sign-in attempts']}
        cardSummary
      />
      {page && page.total > page.pageSize && <Pagination page={page.page} pageSize={page.pageSize} total={page.total} onPageChange={onPageChange} />}
    </div>
  );
}
