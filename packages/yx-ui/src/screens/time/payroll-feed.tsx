// Payroll feed (M02 §B6): what payroll reads for each person and month, read only, frozen at the period lock.
// Designed in the Time style (founder rule: a live page with no design is designed first), then made live.
import { useState } from 'react';
import { Badge } from '../../components/display';
import { EmptyState, InlineAlert } from '../../components/feedback';
import { PageHeader } from '../../components/shell';
import { DataTable, type TableColumn } from '../../components/table';
import { Select } from '../../components/select';
import { ENTITIES } from '../_kit/data';
import { TimePage } from './time-kit';
import { HR_ADMIN } from './time-data';
import { fmtDuration } from './time-logic';
import type { ViewState } from './attendance';
import type { FeedRow, LoadState, PayrollFeed } from './live/types';
import './time.css';

const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
const monthTitle = (m: string) => `${MONTHS[Number(m.slice(5, 7)) - 1]} ${m.slice(0, 4)}`;
const dayMonth = (iso: string) => `${Number(iso.slice(8, 10))} ${MONTHS[Number(iso.slice(5, 7)) - 1].slice(0, 3)}`;
const MODE: Record<string, string> = { punch: 'Check in and out', assumed_present: 'Present unless on leave', timesheet: 'Timesheet' };

const row = (employeeId: string, name: string, code: string, paid: number, lop: number, ot: number, night: number, comp = 0): FeedRow => ({
  employeeId, name, code, mode: 'punch', calendarDays: 30, paidDays: paid, lopDays: lop, otNormalMinutes: ot, otWeeklyOffMinutes: 0, otHolidayMinutes: 0, nightShifts: night, compOffDays: comp, timesheetMinutes: 0, unevaluatedDays: 0,
});
/** September 2026 for the Hosur plant workers (the same people as Form 25 and the night register, TIM-16). */
const SAMPLE: FeedRow[] = [
  row('w1', 'Sanjay Rao', 'KF-0131', 30, 0, 0, 0),
  row('w2', 'Gopal Iyer', 'KF-0144', 29, 1, 180, 0),
  row('w3', 'Kavitha Sundaram', 'KF-0177', 30, 0, 570, 12),
  row('w4', 'Rekha Balan', 'KF-0182', 30, 0, 120, 0),
  { ...row('w5', 'Anil Kumar', 'KF-0190', 30, 0, 360, 0), otHolidayMinutes: 360 },
  row('w6', 'Selvi Arumugam', 'KF-0186', 30, 0, 0, 6, 1),
];

/** What the live app gives the payroll feed: the chosen entity's month, the entities and months to pick from. */
export interface LivePayrollFeed {
  state: LoadState;
  onRetry?: () => void;
  data: PayrollFeed | null;
  entities: { id: string; name: string }[];
  entityId: string | null;
  onEntity: (id: string) => void;
  month: string;
  months: string[];
  onMonth: (month: string) => void;
}

export interface PayrollFeedScreenProps {
  /** Story: September frozen at the lock, or October still open (a live preview). */
  frozen?: boolean;
  state?: ViewState;
  live?: LivePayrollFeed;
}

const csv = (name: string, rows: (string | number)[][]) => {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([rows.map((r) => r.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(',')).join('\n')], { type: 'text/csv' }));
  a.download = name;
  a.click();
  URL.revokeObjectURL(a.href);
};

export function PayrollFeedScreen({ frozen: storyFrozen = true, state: storyState = 'ready', live }: PayrollFeedScreenProps) {
  const [storyMonth, setStoryMonth] = useState(storyFrozen ? '2026-09' : '2026-10');
  const story: PayrollFeed = { entity: { id: ENTITIES[0].id, name: ENTITIES[0].name }, month: storyMonth, frozen: storyMonth === '2026-09', lockedAt: storyMonth === '2026-09' ? '2026-10-01T10:30:00Z' : null, rows: storyState === 'empty' ? [] : storyMonth === '2026-09' ? SAMPLE : SAMPLE.map((r) => ({ ...r, paidDays: Math.min(r.paidDays, 19), calendarDays: 31, unevaluatedDays: 12 })) };
  const d = live ? live.data : story;
  const month = live ? live.month : storyMonth;
  const months = live ? live.months : ['2026-10', '2026-09'];
  const entities = live ? live.entities : [{ id: ENTITIES[0].id, name: ENTITIES[0].name }];
  const entityId = live ? live.entityId : ENTITIES[0].id;
  const state = live ? live.state : storyState === 'empty' ? 'ready' : storyState;
  const rows = d?.rows ?? [];
  const tableState = state === 'loading' ? 'loading' : state === 'error' ? 'error' : 'ready';
  const unworked = rows.reduce((a, r) => a + r.unevaluatedDays, 0);
  const cols: TableColumn<FeedRow>[] = [
    { key: 'name', header: 'Employee', type: 'person', width: 200, value: (r) => r.name, person: (r) => ({ name: r.name, secondary: r.code ?? undefined }) },
    { key: 'mode', header: 'Attendance', optional: true, value: (r) => MODE[r.mode] ?? r.mode },
    { key: 'paid', header: 'Paid days', type: 'number', value: (r) => r.paidDays, total: 'sum', render: (r) => (r.unevaluatedDays ? <span className="yx-tim-list__main"><span>{r.paidDays}</span><span className="yx-tim-muted">of {r.calendarDays}</span></span> : r.paidDays) },
    { key: 'lop', header: 'Unpaid days (LOP)', type: 'number', value: (r) => r.lopDays, total: 'sum' },
    { key: 'ot', header: 'OT working day', type: 'number', value: (r) => r.otNormalMinutes / 60, render: (r) => (r.otNormalMinutes ? fmtDuration(r.otNormalMinutes) : '—') },
    { key: 'otwo', header: 'OT weekly off', type: 'number', optional: true, value: (r) => r.otWeeklyOffMinutes / 60, render: (r) => (r.otWeeklyOffMinutes ? fmtDuration(r.otWeeklyOffMinutes) : '—') },
    { key: 'oth', header: 'OT holiday', type: 'number', optional: true, value: (r) => r.otHolidayMinutes / 60, render: (r) => (r.otHolidayMinutes ? fmtDuration(r.otHolidayMinutes) : '—') },
    { key: 'night', header: 'Night shifts', type: 'number', value: (r) => r.nightShifts, total: 'sum' },
    { key: 'comp', header: 'Comp-off days', type: 'number', optional: true, value: (r) => r.compOffDays, total: 'sum' },
    { key: 'ts', header: 'Timesheet', type: 'number', optional: true, value: (r) => r.timesheetMinutes / 60, render: (r) => (r.timesheetMinutes ? fmtDuration(r.timesheetMinutes) : '—') },
  ];
  const status = !d ? undefined : d.frozen ? <Badge tone="neutral">{`Frozen ${d.lockedAt ? dayMonth(d.lockedAt.slice(0, 10)) : ''}`.trim()}</Badge> : <Badge tone="warning">Preview · month open</Badge>;
  return (
    <TimePage active="Periods" user={HR_ADMIN}>
      <PageHeader
        title="Payroll feed"
        status={status}
        description={`${d ? `${d.entity.name} · ${monthTitle(month)}. ` : ''}What payroll reads for each person. Read only: it is frozen when the month is locked.`}
        actions={
          <div className="yx-tim-row">
            {entities.length > 1 && <div className="yx-tim-picker"><Select aria-label="Legal entity" value={entityId} onChange={(v) => v && live?.onEntity(v)} options={entities.map((e) => ({ value: e.id, label: e.name }))} /></div>}
            <div className="yx-tim-picker"><Select aria-label="Month" value={month} onChange={(v) => v && (live ? live.onMonth(v) : setStoryMonth(v))} options={months.map((m) => ({ value: m, label: monthTitle(m) }))} /></div>
          </div>
        }
      />
      {d && !d.frozen && unworked > 0 && (
        <InlineAlert tone="info" title={`${monthTitle(month)} is still open`}>
          Days still to come are not counted yet. The figures change until the month is locked in Periods.
        </InlineAlert>
      )}
      {live?.state === 'no-access' ? (
        <EmptyState title="No payroll feed to show" description="The feed needs attendance.view over the legal entity's people." />
      ) : (
        <DataTable
          label="Payroll feed"
          columns={cols}
          rows={rows}
          getRowId={(r) => r.employeeId}
          state={tableState}
          onRetry={live?.onRetry ?? (() => {})}
          // ponytail: CSV for both choices (no Excel writer in the library yet).
          onExport={state === 'ready' && rows.length ? () => csv(`payroll-feed-${month}.csv`, [cols.map((c) => String(c.header)), ...rows.map((r) => cols.map((c) => String(c.value?.(r) ?? '')))]) : undefined}
          empty={<EmptyState title={`No one in the feed for ${monthTitle(month)}`} description="People of this legal entity in your scope appear here." />}
        />
      )}
    </TimePage>
  );
}
