// Keka ideas (2026-11): Time summary on My timesheet: a bar per week of hours across the year, then each week with its
// total and status. Built in our own design from the chart and table components.
import { BarChart } from '../../components/charts';
import { DataTable, type TableColumn } from '../../components/table';
import { EmptyState } from '../../components/feedback';
import { Select } from '../../components/select';
import { formatDate } from '../../lib/format';

const SHORT = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
/** "6 Jan": a week on the chart's axis. */
const dayMonth = (d: Date) => `${d.getDate()} ${SHORT[d.getMonth()]}`;

export type TimeSummaryStatus = 'draft' | 'pending' | 'approved' | 'rejected';

export interface TimeSummaryWeek {
  /** Monday of the week (yyyy-mm-dd). */
  week: string;
  totalMinutes: number;
  status: TimeSummaryStatus;
}

export const TIME_SUMMARY_STATUS: Record<TimeSummaryStatus, { label: string; tone: 'neutral' | 'info' | 'success' | 'warning' }> = {
  draft: { label: 'Draft', tone: 'neutral' },
  pending: { label: 'Waiting for approval', tone: 'info' },
  approved: { label: 'Approved', tone: 'success' },
  rejected: { label: 'Sent back', tone: 'warning' },
};

const day = (iso: string) => new Date(Number(iso.slice(0, 4)), Number(iso.slice(5, 7)) - 1, Number(iso.slice(8, 10)));
const plus6 = (iso: string) => {
  const d = day(iso);
  return new Date(d.getFullYear(), d.getMonth(), d.getDate() + 6);
};
/** Hours with at most two decimals ("37.5"). */
export const hoursOf = (minutes: number) => Math.round((minutes / 60) * 100) / 100;

export function TimeSummary({ year, years, onYear, weeks, onOpenWeek, loading }: { year: number; years: number[]; onYear: (y: number) => void; weeks: TimeSummaryWeek[]; onOpenWeek?: (week: string) => void; loading?: boolean }) {
  const total = hoursOf(weeks.reduce((n, w) => n + w.totalMinutes, 0));
  const approved = weeks.filter((w) => w.status === 'approved').length;
  const cols: TableColumn<TimeSummaryWeek>[] = [
    { key: 'week', header: 'Week', value: (w) => w.week, render: (w) => `${dayMonth(day(w.week))} – ${formatDate(plus6(w.week))}`, width: 200 },
    { key: 'hours', header: 'Hours', type: 'number', value: (w) => hoursOf(w.totalMinutes), width: 100 },
    { key: 'status', header: 'Status', type: 'status', value: (w) => TIME_SUMMARY_STATUS[w.status].label, statusTone: (v) => Object.values(TIME_SUMMARY_STATUS).find((s) => s.label === v)?.tone ?? 'neutral', width: 180 },
  ];
  return (
    <div className="yx-tim-stack">
      <div className="yx-tim-row">
        {years.length > 1 && <Select aria-label="Year" value={String(year)} onChange={(v) => v && onYear(Number(v))} options={years.map((y) => ({ value: String(y), label: String(y) }))} />}
        <span className="yx-tim-muted">{weeks.length ? `${total} hours in ${year} · ${approved} of ${weeks.length} weeks approved` : `No timesheets in ${year} yet.`}</span>
      </div>
      {weeks.length > 0 && (
        <BarChart
          title={`Hours per week, ${year}`}
          categories={weeks.map((w) => dayMonth(day(w.week)))}
          series={[{ name: 'Hours', values: weeks.map((w) => hoursOf(w.totalMinutes)) }]}
          valueLabels={false}
          xLabel="Week starting"
          height={200}
        />
      )}
      <DataTable
        label="Weeks"
        columns={cols}
        rows={[...weeks].reverse()}
        getRowId={(w) => w.week}
        state={loading ? 'loading' : 'ready'}
        onRowClick={onOpenWeek ? (w) => onOpenWeek(w.week) : undefined}
        pageSize={10}
        empty={<EmptyState title={`No timesheets in ${year} yet.`} description="Weeks appear here once you save or submit them." />}
      />
    </div>
  );
}
