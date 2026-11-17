// Batch A item 2 (attendance-leave C2): the full history of my leave: every request, filtered by type, status and dates,
// searched by reason, a page at a time from the server. Opens from "My requests" on Leave home (TIM-17); a row opens the
// request as Leave home does. Kit parts only.
import { useEffect, useRef, useState } from 'react';
import { Drawer } from '../../components/drawer';
import { DataTable, type TableColumn } from '../../components/table';
import { FilterBar, type FilterFieldDef } from '../../components/filters';
import { EmptyState, Pagination } from '../../components/feedback';
import { formatDate } from '../../lib/format';
import type { FilterValue } from '../../lib/table';
import { LEAVE_STATUS, LeaveStatusBadge } from './live/kit';
import type { LeaveRequestRow, LeaveStatus } from './live/types';

export interface LeaveHistoryQuery {
  page: number;
  pageSize: number;
  types: string[];
  statuses: LeaveStatus[];
  from: string | null;
  to: string | null;
  q: string;
}
export interface LeaveHistoryPage {
  rows: LeaveRequestRow[];
  total: number;
  page: number;
  pageSize: number;
}

const PAGE = 25;
const days = (n: number) => `${n} ${n === 1 ? 'day' : 'days'}`;
const span = (from: string, to: string) => (from === to ? formatDate(new Date(`${from}T00:00:00`)) : `${formatDate(new Date(`${from}T00:00:00`))} – ${formatDate(new Date(`${to}T00:00:00`))}`);

export function LeaveHistoryDrawer({
  open,
  onClose,
  types,
  load,
  onOpenRequest,
}: {
  open: boolean;
  onClose: () => void;
  /** My leave types, for the filter. */
  types: { id: string; name: string }[];
  load: (q: LeaveHistoryQuery) => Promise<LeaveHistoryPage>;
  onOpenRequest: (r: LeaveRequestRow) => void;
}) {
  const [filters, setFilters] = useState<FilterValue[]>([]);
  const [q, setQ] = useState('');
  const [page, setPage] = useState(1);
  const [data, setData] = useState<LeaveHistoryPage | null>(null);
  const [state, setState] = useState<'loading' | 'ready' | 'error'>('loading');
  const [tick, setTick] = useState(0);
  const seq = useRef(0);
  const loadRef = useRef(load);
  loadRef.current = load;

  const multi = (key: string) => (filters.find((f) => f.key === key && f.type === 'multi') as { values: string[] } | undefined)?.values ?? [];
  const range = filters.find((f) => f.key === 'dates' && f.type === 'date') as { from: string | null; to: string | null } | undefined;
  const query: LeaveHistoryQuery = { page, pageSize: PAGE, types: multi('type'), statuses: multi('status') as LeaveStatus[], from: range?.from ?? null, to: range?.to ?? null, q: q.trim() };
  const key = JSON.stringify(query);

  useEffect(() => {
    if (!open) return;
    const mine = ++seq.current;
    setState('loading');
    loadRef.current(JSON.parse(key) as LeaveHistoryQuery).then(
      (d) => mine === seq.current && (setData(d), setState('ready')),
      () => mine === seq.current && setState('error'),
    );
  }, [open, key, tick]);

  const fields: FilterFieldDef[] = [
    { key: 'type', label: 'Leave type', type: 'multi', options: types.map((t) => ({ value: t.id, label: t.name })) },
    { key: 'status', label: 'Status', type: 'multi', options: (Object.keys(LEAVE_STATUS) as LeaveStatus[]).map((s) => ({ value: s, label: LEAVE_STATUS[s].label })) },
    { key: 'dates', label: 'Dates', type: 'date' },
  ];
  const columns: TableColumn<LeaveRequestRow>[] = [
    { key: 'type', header: 'Leave type', value: (r) => r.type?.name ?? 'Leave', width: 180 },
    { key: 'dates', header: 'Dates', value: (r) => span(r.from, r.to), width: 220 },
    { key: 'days', header: 'Days', type: 'number', value: (r) => r.days, render: (r) => days(r.days), width: 90 },
    { key: 'status', header: 'Status', value: (r) => LEAVE_STATUS[r.status].label, render: (r) => <LeaveStatusBadge status={r.status} />, width: 190 },
    { key: 'applied', header: 'Applied', value: (r) => formatDate(new Date(r.createdAt)), width: 130 },
  ];
  const filtered = filters.length > 0 || q.trim() !== '';
  return (
    <Drawer open={open} onOpenChange={(o) => !o && onClose()} size="lg" title="My leave history" subtitle="Every request, newest first">
      <div className="yx-tim-stack">
        <FilterBar
          fields={fields}
          value={filters}
          onChange={(v) => {
            setFilters(v);
            setPage(1);
          }}
          search={q}
          onSearchChange={(s) => {
            setQ(s);
            setPage(1);
          }}
          searchPlaceholder="Search the reason"
        />
        <DataTable
          label="My leave history"
          columns={columns}
          rows={data?.rows ?? []}
          getRowId={(r) => r.id}
          state={state}
          errorTitle="Your leave history didn't load"
          onRetry={() => setTick((t) => t + 1)}
          filtered={filtered}
          onClearFilters={() => {
            setFilters([]);
            setQ('');
            setPage(1);
          }}
          empty={<EmptyState compact title="No leave requests yet" description="Requests you send show here, with their status." />}
          onRowClick={onOpenRequest}
          rowNoun={['request', 'requests']}
        />
        {data && data.total > data.pageSize && <Pagination page={data.page} pageSize={data.pageSize} total={data.total} onPageChange={setPage} />}
      </div>
    </Drawer>
  );
}
