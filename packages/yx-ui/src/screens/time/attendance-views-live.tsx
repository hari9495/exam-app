// Batch A item 5 (attendance-leave A1): my month as a list (a row per day with a worked-time bar and "late by") and as a
// table (first in, last out, worked, late by), beside the calendar. A day opens the same day panel (A2). Kit parts only.
import { Badge, type BadgeTone } from '../../components/display';
import { Meter } from '../../components/feedback';
import { DataTable, type TableColumn } from '../../components/table';
import { formatDate } from '../../lib/format';
import { DAY_CODE_LABEL, fmtDuration, type DayCode } from './time-logic';

export interface DayViewRow {
  on: string;
  code: DayCode;
  /** Already in the person's time zone, e.g. "9:12 am". */
  firstIn: string | null;
  lastOut: string | null;
  workedMin: number | null;
  /** The day's shift length, for the bar (null: a day off). */
  shiftMin: number | null;
  lateMin: number | null;
  note?: string;
}

const TONE: Partial<Record<DayCode, BadgeTone>> = { P: 'success', WFH: 'success', OD: 'success', L: 'warning', HD: 'info', LV: 'info', H: 'neutral', WO: 'neutral', A: 'danger', MP: 'danger', MI: 'danger', R: 'info', TODAY: 'info' };
const day = (on: string) => formatDate(new Date(`${on}T00:00:00`));
const weekday = (on: string) => new Date(`${on}T00:00:00`).toLocaleDateString('en-IN', { weekday: 'short' });

/** The list: one row per day that has happened, newest first. */
export function AttendanceDayList({ rows, onOpen }: { rows: DayViewRow[]; onOpen: (on: string) => void }) {
  const shown = rows.filter((r) => r.code !== 'FUT').reverse();
  if (!shown.length) return <p className="yx-tim-muted">No days yet this month.</p>;
  return (
    <ul className="yx-tim-list" aria-label="Days this month">
      {shown.map((r) => (
        <li key={r.on}>
          <button type="button" className="yx-tim-dayrow" onClick={() => onOpen(r.on)} aria-label={`${day(r.on)}: ${DAY_CODE_LABEL[r.code]}`}>
            <span className="yx-tim-list__main">
              <strong>
                {weekday(r.on)} {day(r.on)}
              </strong>
              <span className="yx-tim-muted">{r.firstIn ? `${r.firstIn} – ${r.lastOut ?? 'no clock-out'}` : (r.note ?? '')}</span>
            </span>
            <span className="yx-tim-row">
              {r.workedMin != null && r.shiftMin ? <Meter value={r.workedMin} max={r.shiftMin} label={`Worked on ${day(r.on)}`} warnAt={101} dangerAt={1000} valueText={fmtDuration(r.workedMin)} /> : null}
              {r.lateMin ? <span className="yx-tim-muted">{`Late by ${fmtDuration(r.lateMin)}`}</span> : null}
              <Badge tone={TONE[r.code] ?? 'neutral'}>{DAY_CODE_LABEL[r.code]}</Badge>
            </span>
          </button>
        </li>
      ))}
    </ul>
  );
}

/** The table: first in, last out, worked and late by, a day per row. */
export function AttendanceDayTable({ rows, onOpen }: { rows: DayViewRow[]; onOpen: (on: string) => void }) {
  const columns: TableColumn<DayViewRow>[] = [
    { key: 'on', header: 'Date', value: (r) => r.on, render: (r) => `${weekday(r.on)} ${day(r.on)}`, width: 150 },
    { key: 'status', header: 'Status', value: (r) => DAY_CODE_LABEL[r.code], render: (r) => <Badge tone={TONE[r.code] ?? 'neutral'}>{DAY_CODE_LABEL[r.code]}</Badge>, width: 170 },
    { key: 'in', header: 'First in', value: (r) => r.firstIn ?? '', render: (r) => r.firstIn ?? '—', width: 110 },
    { key: 'out', header: 'Last out', value: (r) => r.lastOut ?? '', render: (r) => r.lastOut ?? '—', width: 110 },
    { key: 'worked', header: 'Worked', type: 'number', value: (r) => r.workedMin ?? 0, render: (r) => (r.workedMin ? fmtDuration(r.workedMin) : '—'), width: 110 },
    { key: 'late', header: 'Late by', type: 'number', value: (r) => r.lateMin ?? 0, render: (r) => (r.lateMin ? fmtDuration(r.lateMin) : '—'), width: 110 },
  ];
  return <DataTable label="Days this month" columns={columns} rows={rows.filter((r) => r.code !== 'FUT')} getRowId={(r) => r.on} onRowClick={(r) => onOpen(r.on)} rowNoun={['day', 'days']} />;
}
