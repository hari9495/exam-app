// PAY-25 · Payroll reports: the one view the design stories and the live page both render. The stories pass sample data
// built from the design fixtures (admin-tax-loans.tsx); the app passes the API's data (GET payroll/reports/:kind). Money
// arrives as decimal strings and is only formatted here; the totals above each table are the server's, over every row.
import { useLayoutEffect, useRef, useState, type ReactNode } from 'react';
import { Download } from 'lucide-react';
import { Button } from '../../components/button';
import { EmptyState, ErrorState, Pagination, Skeleton } from '../../components/feedback';
import { useToast } from '../../components/notify';
import { PageHeader } from '../../components/shell';
import { Select } from '../../components/select';
import { DataTable, type TableColumn } from '../../components/table';
import { BarChart, LineChart } from '../../components/charts';
import { useNarrow } from '../../components/stepper';
import { formatINR } from '../../lib/format';
import { useRun } from '../org/org-kit';
import { FactRow, SectionTitle, StateBlock } from './pay-kit';
import type { LoadState } from './live/types';

export type PayReportKind = 'register' | 'recon' | 'variance' | 'ctc' | 'arrears' | 'ytd' | 'bank' | 'holds' | 'gratuity' | 'loans';

/** The reports in the picker, in the design's order. */
export const PAY_REPORTS: { id: PayReportKind; name: string; /** Shorter name in the picker. */ short?: string; desc: string; months: 'range' | 'one' | 'none' }[] = [
  { id: 'register', name: 'Salary register', desc: 'Every payslip line by employee for the months chosen', months: 'range' },
  { id: 'recon', name: 'Payroll reconciliation', short: 'Reconciliation', desc: 'This month against the month before: people, gross, deductions, net', months: 'one' },
  { id: 'arrears', name: 'Arrears', desc: 'Arrears paid in the months, by person and cause', months: 'range' },
  { id: 'ytd', name: 'Year to date', desc: 'Earnings, deductions and tax per employee from April', months: 'one' },
  { id: 'ctc', name: 'CTC report', desc: 'Cost to company by department', months: 'range' },
  { id: 'variance', name: 'Variance', desc: 'Employees whose net pay changed by more than the limit from their last paid month', months: 'one' },
  { id: 'bank', name: 'Bank advice', desc: 'Payment list for the bank', months: 'range' },
  { id: 'holds', name: 'Hold ageing', desc: 'Held salaries today, by age and reason', months: 'none' },
  { id: 'gratuity', name: 'Gratuity provision', desc: 'Monthly provision and the provision to date', months: 'one' },
  { id: 'loans', name: 'Loan ledger', desc: 'Loans, recoveries and balances', months: 'range' },
];

interface Paged {
  total: number;
  page: number;
  pageSize: number;
}
interface Person {
  id: string;
  employeeId: string;
  name: string;
  code: string;
}
export interface RegisterRow extends Person {
  department: string | null;
  month: string;
  runType: string;
  gross: string;
  deductions: string;
  net: string;
  employerCost: string;
  lines: Record<string, string>;
}
export type RegisterReport = Paged & { kind: 'register'; components: { code: string; name: string; kind: string }[]; rows: RegisterRow[]; totals: { gross: string; deductions: string; net: string; employerCost: string; lines: Record<string, string> } };
export interface ReconReport {
  kind: 'recon';
  month: string;
  previous: string;
  rows: { item: string; label: string; previous: string; current: string; difference: string }[];
  bridge: { joiners: { count: number; gross: string }; leavers: { count: number; gross: string }; changed: { count: number; gross: string } };
  trend: { month: string; gross: string; net: string }[];
}
export type VarianceReport = Paged & { kind: 'variance'; month: string; threshold: string | null; buckets: { below: number; down: number; up: number; above: number }; rows: (Person & { previous: string; current: string; difference: string; change: string; cause: string | null })[] };
export interface CtcReport {
  kind: 'ctc';
  rows: { id: string; department: string | null; people: number; gross: string; employer: string; ctc: string }[];
  totals: { gross: string; employer: string; ctc: string };
}
export type ArrearsReport = Paged & { kind: 'arrears'; rows: (Person & { fromMonth: string; toMonth: string; payMonth: string; reason: string; amount: string; employerCost: string; runStatus: string | null })[]; totals: { amount: string; employerCost: string } };
export type YtdReport = Paged & { kind: 'ytd'; yearStart: string; rows: (Person & { months: number; gross: string; tds: string; deductions: string; net: string })[]; totals: { gross: string; tds: string; deductions: string; net: string }; trend: { month: string; gross: string; net: string }[] };
export type BankReport = Paged & { kind: 'bank'; rows: (Person & { month: string; ifsc: string | null; account: string | null; amount: string; status: string })[]; totals: { count: number; amount: string }; left: number };
export type HoldsReport = Paged & { kind: 'holds'; asOn: string; buckets: { id: string; count: number; amount: string }[]; reasons: { reason: string; count: number; amount: string }[]; rows: (Person & { reason: string; since: string; ageDays: number; amount: string | null })[]; totals: { count: number; amount: string } };
export type GratuityReport = Paged & { kind: 'gratuity'; month: string; minYears: number | null; rows: (Person & { joined: string; serviceMonths: number; eligible: boolean | null; thisMonth: string; toDate: string })[]; totals: { thisMonth: string; toDate: string } };
export type LoansReport = Paged & { kind: 'loans'; rows: (Person & { type: string; principal: string; emi: string; opening: string; recovered: string; closing: string; status: string })[]; totals: { principal: string; opening: string; recovered: string; closing: string } };
export type PayReport = RegisterReport | ReconReport | VarianceReport | CtcReport | ArrearsReport | YtdReport | BankReport | HoldsReport | GratuityReport | LoansReport;

export interface ReportOptions {
  entities: { id: string; name: string; shortName?: string }[];
  departments: { id: string; name: string }[];
  locations: { id: string; name: string; legalEntityId: string }[];
  /** Months with approved payslips, newest first ("2026-09"). */
  months: string[];
  today: string;
}
export interface ReportFilters {
  legalEntityId: string | null;
  from: string | null;
  to: string | null;
  departmentId: string | null;
  locationId: string | null;
}

/** PAY-25 NoAccess: the person's latest request for payroll reports access (GET payroll/reports/access-request). */
export interface ReportsAccessRequest {
  id: string;
  status: string;
  askedAt: string;
}

export interface LivePayrollReports {
  /** The filter choices (GET payroll/reports); 'no-access' shows the no-access page. */
  state: LoadState;
  /** PAY-25 NoAccess: the latest access request (undefined while it loads) and "Request access" (approvals engine). */
  accessRequest?: ReportsAccessRequest | null;
  onRequestAccess?: () => Promise<unknown>;
  onRetry?: () => void;
  options: ReportOptions | null;
  kind: PayReportKind;
  onKind: (k: PayReportKind) => void;
  filters: ReportFilters;
  onFilters: (f: ReportFilters) => void;
  page: number;
  onPage: (page: number) => void;
  /** The report for the filters (null while loading). */
  report: PayReport | null;
  reportState: LoadState;
  onReportRetry?: () => void;
  /** Downloads every row as CSV (same scope and filters). */
  onExport: () => Promise<unknown>;
  /** Stories only: the design's scheduling, not built yet. */
  schedule?: ReactNode;
}

const money = (x: string | null | undefined) => (x == null ? '—' : formatINR(Number(x)));
const n = (x: string) => Number(x);
const signed = (x: string) => `${Number(x) > 0 ? '+' : ''}${money(x)}`;
const MON3 = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
export const monthLabel = (m: string) => new Date(`${m}-01T00:00:00Z`).toLocaleDateString('en-GB', { month: 'long', year: 'numeric', timeZone: 'UTC' });
const shortMonth = (m: string) => MON3[Number(m.slice(5, 7)) - 1];
const dayLabel = (d: string) => new Date(`${d}T00:00:00Z`).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' });
const plural = (k: number, one: string, many = `${one}s`) => `${k} ${k === 1 ? one : many}`;
const person = <R extends Person>(width = 220): TableColumn<R> => ({ key: 'name', header: 'Employee', type: 'person', value: (r) => r.name, person: (r) => ({ name: r.name, secondary: r.code }), width });
export const HOLD_REASON: Record<string, string> = { bank_missing: 'No bank account', absconding: 'Absconding', exit_pending: 'Exit pending', investigation: 'Investigation', employee_request: 'Employee asked', other: 'Other' };
const LOAN_TYPE: Record<string, string> = { advance: 'Salary advance', loan: 'Loan', expense: 'Expense advance' };
const STATUS: Record<string, string> = { pending: 'Waiting', paid: 'Paid', failed: 'Failed', returned: 'Returned', held: 'Held', cash: 'Cash', active: 'Active', paused: 'Paused', closed: 'Closed' };
const AGE: Record<string, string> = { '0-30': '0–30 days', '31-60': '31–60 days', '61+': 'Over 60 days' };

/** "Sep 2026" (three letters always; some browsers say "Sept"). */
const monthShortYear = (m: string) => `${MON3[Number(m.slice(5, 7)) - 1]} ${m.slice(0, 4)}`;

/** The month a report opens on: the latest with approved payslips in scope, else last month. */
export function defaultMonth(o: Pick<ReportOptions, 'months' | 'today'>): string {
  if (o.months[0]) return o.months[0];
  const [y, m] = o.today.split('-').map(Number);
  return m === 1 ? `${y - 1}-12` : `${y}-${String(m - 1).padStart(2, '0')}`;
}

/** The filters the report is asked for: a missing month is the default month; a range report runs from that month to itself; hold ageing has no month. */
export function effectiveFilters(kind: PayReportKind, f: ReportFilters, o: Pick<ReportOptions, 'months' | 'today'>): ReportFilters {
  const span = PAY_REPORTS.find((r) => r.id === kind)!.months;
  if (span === 'none') return { ...f, from: null, to: null };
  const to = f.to ?? defaultMonth(o);
  return { ...f, to, from: span === 'range' ? (f.from && f.from <= to ? f.from : to) : null };
}

let canvas: CanvasRenderingContext2D | null | undefined;
/** The widest of these texts in the select's own font, measured by the browser; tests (no layout) estimate 0.55 em a character at 14 px. */
export function textPx(labels: string[], font: string | null): number {
  if (canvas === undefined) canvas = typeof document === 'undefined' || /jsdom/i.test(navigator.userAgent) ? null : document.createElement('canvas').getContext('2d');
  if (canvas && font) {
    canvas.font = font;
    return Math.max(0, ...labels.map((l) => canvas!.measureText(l).width));
  }
  return Math.max(0, ...labels.map((l) => l.length)) * 7.7;
}
/** A filter select as wide as its longest choice or placeholder plus its padding and chevron, so nothing is cut at 1278 px. */
export const fitWidth = (px: number) => `calc(${Math.ceil(px)}px + var(--yx-space-12))`;

/** True when a report has nothing to show for the filters. */
export function reportEmpty(r: PayReport): boolean {
  if (r.kind === 'recon') return r.rows.every((x) => x.previous === '0' && x.current === '0') || r.rows.find((x) => x.item === 'employees')?.current === '0';
  if (r.kind === 'ctc') return r.rows.length === 0;
  if (r.kind === 'variance') return r.buckets.below + r.buckets.down + r.buckets.up + r.buckets.above === 0;
  return r.total === 0;
}

export function ReportsView({ live }: { live: LivePayrollReports }) {
  const narrow = useNarrow();
  const { toast } = useToast();
  const { busy, error, run } = useRun();
  const rowRef = useRef<HTMLDivElement>(null);
  const [font, setFont] = useState<string | null>(null);
  // The selects' font, read once the row is on screen (and again when web fonts finish loading).
  useLayoutEffect(() => {
    const read = () => {
      const v = rowRef.current?.querySelector('.yx-select__value');
      if (!v) return;
      const cs = getComputedStyle(v);
      setFont(`${cs.fontStyle} ${cs.fontWeight} ${cs.fontSize} ${cs.fontFamily}`);
    };
    read();
    void document.fonts?.ready.then(read);
  }, [live.options != null, live.state]); // eslint-disable-line react-hooks/exhaustive-deps
  const meta = PAY_REPORTS.find((r) => r.id === live.kind)!;
  const o = live.options;
  const f = live.filters;
  const r = live.report;
  const hasData = live.reportState === 'ready' && !!r && r.kind === live.kind && !reportEmpty(r);
  const set = (x: Partial<ReportFilters>) => live.onFilters({ ...f, ...x });
  const exportCsv = () =>
    run('export', async () => {
      if (!hasData) {
        toast({ tone: 'warning', title: 'Nothing to export for these filters.', description: 'Try a different month, legal entity, department or location.' });
        return;
      }
      await live.onExport();
      toast({ tone: 'success', title: `${meta.name} downloaded as CSV.` });
    });
  const clearFilters = () => live.onFilters({ legalEntityId: null, from: null, to: null, departmentId: null, locationId: null });
  const header = (
    <PageHeader
      title="Payroll reports"
      description="Figures follow your access: you see the legal entities your payroll access covers."
      actions={
        live.state === 'ready' ? (
          <>
            {live.schedule}
            <Button icon={Download} loading={busy === 'export'} onClick={() => void exportCsv()}>
              Export CSV
            </Button>
          </>
        ) : undefined
      }
    />
  );
  if (live.state !== 'ready' || !o)
    return (
      <div className="yx-pay-stack">
        {header}
        {live.state === 'error' ? (
          <ErrorState title="We couldn't load payroll reports." description="Nothing has changed. Try again in a moment." onRetry={live.onRetry} />
        ) : (
          <div role="status" aria-busy="true" aria-label="Loading payroll reports">
            <Skeleton height={240} />
          </div>
        )}
      </div>
    );
  // Each select is as wide as its longest choice or placeholder; on a phone each takes the full row.
  // Report and months never shrink; a company's very long entity, department or location name gives way first.
  const cell = (child: ReactNode, labels: string[], shrink = false) => <div style={narrow ? { flex: '1 1 100%', minWidth: 0 } : { flex: `0 ${shrink ? 1 : 0} auto`, width: fitWidth(textPx(labels, font)), minWidth: shrink ? 'var(--yx-space-16)' : undefined }}>{child}</div>;
  const locations = o.locations.filter((l) => !f.legalEntityId || l.legalEntityId === f.legalEntityId);
  const e = effectiveFilters(live.kind, f, o);
  const to = e.to;
  const def = defaultMonth(o);
  const monthList = o.months.includes(def) ? o.months : [def, ...o.months];
  const entityLabel = (x: { name: string; shortName?: string }) => x.shortName || x.name;
  // Range reports: "From Sep 2026" and "To Oct 2026" (the list shows full month names); one-month reports: one "Month" select.
  const fromText = (m: string) => `From ${monthShortYear(m)}`;
  const toText = (m: string) => `To ${monthShortYear(m)}`;
  const monthOptions = monthList.map((m) => ({ value: m, label: monthLabel(m) }));
  return (
    <div className="yx-pay-stack">
      {header}
      <div className="yx-pay-row" data-testid="report-filters" ref={rowRef} style={narrow ? undefined : { flexWrap: 'nowrap' }}>
        {cell(<Select aria-label="Report" value={live.kind} onChange={(v) => v && live.onKind(v as PayReportKind)} options={PAY_REPORTS.map((x) => ({ value: x.id, label: x.short ?? x.name, description: x.desc }))} />, PAY_REPORTS.map((x) => x.short ?? x.name))}
        {o.entities.length > 1 && cell(<Select aria-label="Legal entity" placeholder="Entity" clearable value={f.legalEntityId} onChange={(v) => set({ legalEntityId: v, locationId: null })} options={o.entities.map((x) => ({ value: x.id, label: entityLabel(x), description: x.shortName && x.shortName !== x.name ? x.name : undefined }))} />, ['Entity', ...o.entities.map(entityLabel)], true)}
        {meta.months === 'range' && cell(<Select aria-label="From month" value={e.from} renderValue={(x) => fromText(x.value)} onChange={(v) => v && set({ from: v, to: to && to < v ? v : to })} options={monthOptions} />, monthList.map(fromText))}
        {meta.months === 'range' && cell(<Select aria-label="To month" value={to} renderValue={(x) => toText(x.value)} onChange={(v) => v && set({ to: v, from: e.from && e.from > v ? v : e.from })} options={monthOptions} />, monthList.map(toText))}
        {meta.months === 'one' && cell(<Select aria-label="Month" value={to} onChange={(v) => v && set({ to: v, from: null })} options={monthOptions} />, monthList.map(monthLabel))}
        {cell(<Select aria-label="Department" placeholder="Department" clearable value={f.departmentId} onChange={(v) => set({ departmentId: v })} options={o.departments.map((d) => ({ value: d.id, label: d.name }))} />, ['Department', ...o.departments.map((d) => d.name)], true)}
        {cell(<Select aria-label="Location" placeholder="Location" clearable value={f.locationId} onChange={(v) => set({ locationId: v })} options={locations.map((l) => ({ value: l.id, label: l.name }))} />, ['Location', ...locations.map((l) => l.name)], true)}
      </div>
      {error && <p className="yx-pay-muted" role="alert">{error}</p>}
      <section className="yx-pay-stack" aria-label={meta.name}>
        <SectionTitle>{meta.name}</SectionTitle>
        <p className="yx-pay-muted">{meta.desc}{meta.months === 'none' && ` As on ${dayLabel(o.today)}.`}</p>
        {live.reportState !== 'ready' || !r || r.kind !== live.kind ? (
          <StateBlock state={live.reportState === 'error' ? 'error' : 'loading'} rows={8} onRetry={live.onReportRetry}>
            {null}
          </StateBlock>
        ) : !hasData ? (
          <EmptyState title="No data for these filters." description={`Filters: ${meta.name}${!to ? '' : e.from && e.from !== to ? ` · ${monthLabel(e.from)} to ${monthLabel(to)}` : ` · ${monthLabel(to)}`}. Try a different month, legal entity, department or location.`} action={<Button onClick={clearFilters}>Clear filters</Button>} />
        ) : (
          <ReportBody r={r} />
        )}
        {r && 'total' in r && r.total > r.pageSize && <Pagination page={live.page} pageSize={r.pageSize} total={r.total} onPageChange={live.onPage} />}
      </section>
    </div>
  );
}

const PAGE_TOTALS = (r: Paged) => r.total <= r.pageSize;

function ReportBody({ r }: { r: PayReport }) {
  const sum = (paged: Paged | null) => (paged && !PAGE_TOTALS(paged) ? undefined : ('sum' as const));
  switch (r.kind) {
    case 'register': {
      const t = sum(r);
      return (
        <div className="yx-pay-stack">
          <FactRow items={[{ label: 'Payslips', value: String(r.total) }, { label: 'Gross', value: money(r.totals.gross) }, { label: 'Deductions', value: money(r.totals.deductions) }, { label: 'Net', value: money(r.totals.net) }, { label: 'Cost to company', value: money(r.totals.employerCost) }]} />
          <DataTable
            label="Salary register"
            columns={[
              person<RegisterRow>(190),
              { key: 'dept', header: 'Department', value: (x) => x.department ?? '—', groupable: true, width: 130, optional: true },
              { key: 'month', header: 'Month', value: (x) => x.month, render: (x) => `${shortMonth(x.month)}${x.runType === 'regular' ? '' : ' · off-cycle'}`, width: 110, optional: true },
              ...r.components.map((c): TableColumn<RegisterRow> => ({ key: `c-${c.code}`, header: c.name, type: 'money', value: (x) => n(x.lines[c.code] ?? '0'), total: t, width: 120, optional: true })),
              { key: 'gross', header: 'Gross', type: 'money', value: (x) => n(x.gross), total: t, width: 120 },
              { key: 'ded', header: 'Deductions', type: 'money', value: (x) => n(x.deductions), total: t, width: 120 },
              { key: 'net', header: 'Net', type: 'money', value: (x) => n(x.net), total: t, width: 120 },
            ]}
            rows={r.rows}
            getRowId={(x) => x.id}
            rowNoun={['payslip', 'payslips']}
          />
        </div>
      );
    }
    case 'variance': {
      const lim = r.threshold ? `${Number(r.threshold)}%` : 'the limit';
      return (
        <div className="yx-pay-stack">
          <BarChart title="Employees by net change" description={`${monthLabel(r.month)} against the last paid month`} categories={[`Below −${lim}`, `−${lim} to 0`, `0 to +${lim}`, `Above +${lim}`]} series={[{ name: 'Employees', values: [r.buckets.below, r.buckets.down, r.buckets.up, r.buckets.above] }]} xLabel="Change" height={200} />
          <DataTable
            label={`Net changes above ${lim}`}
            columns={[
              person(),
              { key: 'prev', header: 'Last paid month', type: 'money', value: (x) => n(x.previous), width: 130, optional: true },
              { key: 'cur', header: shortMonth(r.month), type: 'money', value: (x) => n(x.current), width: 120 },
              { key: 'pct', header: 'Change', type: 'number', value: (x) => n(x.change), render: (x) => `${n(x.change) > 0 ? '+' : n(x.change) < 0 ? '−' : ''}${Math.abs(n(x.change)).toFixed(1)}%`, width: 90 },
              { key: 'cause', header: 'Cause', value: (x) => x.cause ?? 'Not explained yet', width: 280 },
            ]}
            rows={r.rows}
            getRowId={(x) => x.id}
            cardSummary
            empty={<EmptyState title={`No net change above ${lim}.`} />}
          />
        </div>
      );
    }
    case 'recon': {
      const fmt = (x: { item: string }, v: string) => (x.item === 'employees' ? v : money(v));
      const g = r.rows.find((x) => x.item === 'gross')!;
      const b = r.bridge;
      return (
        <div className="yx-pay-stack">
          <LineChart title="Gross and net by month" categories={r.trend.map((x) => shortMonth(x.month))} series={[{ name: 'Gross', values: r.trend.map((x) => n(x.gross)) }, { name: 'Net', values: r.trend.map((x) => n(x.net)) }]} money xLabel="Month" height={200} />
          <DataTable
            label={`${shortMonth(r.previous)} against ${shortMonth(r.month)}`}
            columns={[
              { key: 'item', header: 'Item', value: (x) => x.label, width: 160 },
              { key: 'a', header: monthLabel(r.previous), type: 'number', value: (x) => n(x.previous), render: (x) => fmt(x, x.previous), width: 150 },
              { key: 'b', header: monthLabel(r.month), type: 'number', value: (x) => n(x.current), render: (x) => fmt(x, x.current), width: 150 },
              { key: 'd', header: 'Difference', type: 'number', value: (x) => n(x.difference), render: (x) => (x.item === 'employees' ? `${n(x.difference) > 0 ? '+' : ''}${x.difference}` : signed(x.difference)), width: 150 },
            ]}
            rows={r.rows}
            getRowId={(x) => x.item}
          />
          <p className="yx-pay-muted">
            Gross change {signed(g.difference)}: {plural(b.joiners.count, 'joiner')} ({signed(b.joiners.gross)}), {plural(b.leavers.count, 'leaver')} ({signed(b.leavers.gross)}), and changes for {plural(b.changed.count, 'person', 'people')} paid in both months ({signed(b.changed.gross)}).
          </p>
        </div>
      );
    }
    case 'ytd': {
      const t = sum(r);
      return (
        <div className="yx-pay-stack">
          <LineChart title="Year to date, cumulative gross and net" categories={r.trend.map((x) => shortMonth(x.month))} series={[{ name: 'Gross', values: r.trend.map((x) => n(x.gross)) }, { name: 'Net', values: r.trend.map((x) => n(x.net)) }]} money xLabel="Month" height={200} />
          <FactRow items={[{ label: 'Employees', value: String(r.total) }, { label: 'Gross', value: money(r.totals.gross) }, { label: 'TDS', value: money(r.totals.tds) }, { label: 'Net', value: money(r.totals.net) }]} />
          <DataTable
            label={`Year to date from ${monthLabel(r.yearStart)}`}
            columns={[
              person(),
              { key: 'months', header: 'Months paid', type: 'number', value: (x) => x.months, width: 110, optional: true },
              { key: 'gross', header: 'Gross', type: 'money', value: (x) => n(x.gross), total: t, width: 130 },
              { key: 'tds', header: 'TDS', type: 'money', value: (x) => n(x.tds), total: t, width: 120 },
              { key: 'ded', header: 'All deductions', type: 'money', value: (x) => n(x.deductions), total: t, width: 130 },
              { key: 'net', header: 'Net', type: 'money', value: (x) => n(x.net), total: t, width: 130 },
            ]}
            rows={r.rows}
            getRowId={(x) => x.id}
            cardSummary
          />
        </div>
      );
    }
    case 'ctc':
      return (
        <div className="yx-pay-stack">
          <BarChart
            title="Cost to company by department"
            categories={r.rows.map((x) => x.department ?? 'No department')}
            series={[{ name: 'Gross', values: r.rows.map((x) => n(x.gross)) }, { name: 'Employer contributions', values: r.rows.map((x) => n(x.employer)) }]}
            stacked
            money
            xLabel="Department"
            groupSizes={r.rows.map((x) => x.people)}
            minGroupSize={3}
            height={240}
          />
          <FactRow items={[{ label: 'Gross', value: money(r.totals.gross) }, { label: 'Employer contributions', value: money(r.totals.employer) }, { label: 'Cost to company', value: money(r.totals.ctc) }]} />
        </div>
      );
    case 'holds':
      return (
        <div className="yx-pay-stack">
          <DataTable
            label="Open holds by age"
            columns={[
              { key: 'age', header: 'Age', value: (x) => AGE[x.id] ?? x.id, width: 160 },
              { key: 'count', header: 'Salaries held', type: 'number', value: (x) => x.count, total: 'sum', width: 130 },
              { key: 'amount', header: 'Amount held', type: 'money', value: (x) => n(x.amount), total: 'sum', width: 140 },
            ]}
            rows={r.buckets}
            getRowId={(x) => x.id}
            rowNoun={['age band', 'age bands']}
            cardSummary
          />
          <BarChart title="Open holds by reason" description="Amount held" categories={r.reasons.map((x) => HOLD_REASON[x.reason] ?? x.reason)} series={[{ name: 'Amount held', values: r.reasons.map((x) => n(x.amount)) }]} orientation="horizontal" money xLabel="Reason" />
        </div>
      );
    case 'gratuity': {
      const t = sum(r);
      return (
        <div className="yx-pay-stack">
          <p className="yx-pay-muted">
            The provision is the gratuity line on each payslip. Gratuity is payable once service reaches {r.minYears == null ? 'the minimum in the gratuity rule' : plural(r.minYears, 'year')}.
          </p>
          <DataTable
            label="Gratuity provision"
            columns={[
              person(),
              { key: 'svc', header: 'Service', type: 'number', value: (x) => x.serviceMonths, render: (x) => `${Math.floor(x.serviceMonths / 12)} y ${x.serviceMonths % 12} m`, width: 100 },
              { key: 'elig', header: 'Payable now', value: (x) => (x.eligible == null ? '—' : x.eligible ? 'Yes' : 'Not yet'), width: 110 },
              { key: 'prov', header: `${shortMonth(r.month)} provision`, type: 'money', value: (x) => n(x.thisMonth), total: t, width: 140 },
              { key: 'liab', header: 'Provision to date', type: 'money', value: (x) => n(x.toDate), total: t, width: 140 },
            ]}
            rows={r.rows}
            getRowId={(x) => x.id}
            cardSummary
          />
          {!PAGE_TOTALS(r) && <FactRow items={[{ label: 'Provision this month', value: money(r.totals.thisMonth) }, { label: 'Provision to date', value: money(r.totals.toDate) }]} />}
        </div>
      );
    }
    case 'loans': {
      const t = sum(r);
      return (
        <div className="yx-pay-stack">
          {!PAGE_TOTALS(r) && <FactRow items={[{ label: 'Opening', value: money(r.totals.opening) }, { label: 'Recovered', value: money(r.totals.recovered) }, { label: 'Closing', value: money(r.totals.closing) }]} />}
          <DataTable
            label="Loan ledger"
            columns={[
              person(),
              { key: 'type', header: 'Type', value: (x) => LOAN_TYPE[x.type] ?? x.type, width: 150, optional: true },
              { key: 'open', header: 'Opening', type: 'money', value: (x) => n(x.opening), total: t, width: 120 },
              { key: 'rec', header: 'Recovered', type: 'money', value: (x) => n(x.recovered), total: t, width: 120 },
              { key: 'close', header: 'Closing', type: 'money', value: (x) => n(x.closing), total: t, width: 120 },
              { key: 'status', header: 'Status', value: (x) => STATUS[x.status] ?? x.status, width: 100, optional: true },
            ]}
            rows={r.rows}
            getRowId={(x) => x.id}
            cardSummary
          />
        </div>
      );
    }
    case 'arrears': {
      const t = sum(r);
      return (
        <DataTable
          label="Arrears"
          columns={[
            person(),
            { key: 'month', header: 'Month', value: (x) => x.fromMonth, render: (x) => (x.fromMonth === x.toMonth ? shortMonth(x.fromMonth) : `${shortMonth(x.fromMonth)} to ${shortMonth(x.toMonth)}`), width: 120 },
            { key: 'cause', header: 'Cause', value: (x) => x.reason, width: 280 },
            { key: 'amount', header: 'Arrears', type: 'money', value: (x) => n(x.amount), total: t, width: 120 },
          ]}
          rows={r.rows}
          getRowId={(x) => x.id}
          empty={<EmptyState title="No arrears in these months." />}
        />
      );
    }
    case 'bank':
      return (
        <div className="yx-pay-stack">
          <p className="yx-pay-muted">
            {plural(r.totals.count, 'payment')} · {money(r.totals.amount)} in the bank file.
            {r.left > 0 && ` ${r.left} not in the file: held, or paid by cash or cheque.`}
          </p>
          <DataTable
            label="Bank advice"
            columns={[
              person(),
              { key: 'ifsc', header: 'IFSC', type: 'id', value: (x) => x.ifsc ?? 'No account', width: 130, optional: true },
              { key: 'acct', header: 'Account', type: 'id', value: (x) => (x.account ? `••••${x.account}` : '—'), width: 110 },
              { key: 'net', header: 'Amount', type: 'money', value: (x) => n(x.amount), total: sum(r), width: 120 },
              { key: 'status', header: 'Status', value: (x) => STATUS[x.status] ?? x.status, width: 100, optional: true },
            ]}
            rows={r.rows}
            getRowId={(x) => x.id}
          />
        </div>
      );
  }
}
