// Run inputs and money operations: PAY-04 manual LOP, PAY-05 one-time pay, PAY-06 holds, PAY-10 payments & files,
// PAY-19 court orders / carry-forwards / overpayments, PAY-20 payslip query queue.
import { useMemo, useState, type ReactNode } from 'react';
import { ArrowUpRight, Download, Eye, EyeOff, Plus, Upload } from 'lucide-react';
import { Button, Link, type ButtonProps } from '../../components/button';
import { Badge, type BadgeTone } from '../../components/display';
import { Drawer } from '../../components/drawer';
import { EmptyState, InlineAlert, Skeleton } from '../../components/feedback';
import { Icon } from '../../components/foundations';
import { FieldRow, FormField, FormSection } from '../../components/field';
import { CurrencyField, TextArea, TextField } from '../../components/inputs';
import { Checkbox, RadioGroup } from '../../components/choice';
import { Select } from '../../components/select';
import { FileUpload } from '../../components/upload';
import { PageHeader, Tabs, TabsContent, TabsList, TabsTrigger, DescriptionList } from '../../components/shell';
import { DataTable, tableToCsv, type TableColumn } from '../../components/table';
import { FilterBar, SavedViewMenu } from '../../components/filters';
import { BarChart } from '../../components/charts';
import { MenuItem } from '../../components/menu';
import { CommentThread } from '../../components/timeline';
import { ConfirmDialog } from '../../components/overlay';
import { DatePicker } from '../../components/date';
import { formatDate, formatINR, groupIndian } from '../../lib/format';
import { matchesFilter, toCsv, type FilterValue } from '../../lib/table';
import { EMPLOYEES, LOCATIONS, TODAY } from '../_kit/data';
import { Amount, FactRow, PayFrame, SectionTitle, StateBlock, type PayPersona, type ViewState } from './pay-kit';
import { FIN_APPROVER, HOLDS, HR_HEAD, LOP_ROWS, MY_LOP_DAY, ONE_TIME, PAYROLL_ADMIN, QUERIES, RUN, RUN_HISTORY, RUN_ROWS, d, type HoldRow, type LopRow, type OneTimeRow, type QueryRow } from './pay-data';
import { FNF_LEAVER, FNF_NET } from './offcycle';
import { applyDeductionCap, computeTax, esiContribution, pfContribution, type DeductionLine } from './pay-logic';

const MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const MONTH_NAME = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
const monthLabel = (x: Date) => `${MON[x.getMonth()]} ${x.getFullYear()}`;
const daysIn = (x: Date) => new Date(x.getFullYear(), x.getMonth() + 1, 0).getDate();
const monthsApart = (a: Date, b: Date) => (b.getFullYear() - a.getFullYear()) * 12 + b.getMonth() - a.getMonth();
const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

/** People in the September run, searchable by name or ID ("Name · KF-0000" also matches). */
const findRunPerson = (q: string) => {
  const s = q.trim().toLowerCase();
  if (s.length < 3) return undefined;
  return RUN_ROWS.find((r) => `${r.name} · ${r.code}`.toLowerCase().includes(s) || `${r.name} ${r.code}`.toLowerCase().includes(s));
};

const tableState = (s: ViewState) => (s === 'loading' ? 'loading' : s === 'error' ? 'error' : 'ready');
const okUpload = async () => {};

/** Saves a text file in the browser (CSV, bank file). */
function saveFile(name: string, text: string, type = 'text/csv') {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([text], { type }));
  a.download = name;
  a.click();
  URL.revokeObjectURL(a.href);
}

const STORY = {
  holds: 'screens-pay-pay-06-·-salary-holds-and-releases--default',
  holdRelease: 'screens-pay-pay-06-·-salary-holds-and-releases--release',
  holdAgeing: 'screens-pay-pay-25-·-payroll-reports--hold-ageing',
  offCycle: 'screens-pay-pay-11-·-off-cycle-run--choose-type',
  runFailed: 'screens-pay-pay-03-·-run-workspace--failed',
};
const storyHref = (id: string) => `/?path=/story/${id}`;

/** A bordered button that opens another story (the next screen in the flow). */
function StoryButton({ to, icon, children, ...rest }: { to: string; children: ReactNode } & Pick<ButtonProps, 'variant' | 'size' | 'icon' | 'disabled'>) {
  return (
    <Button {...rest} asChild>
      <a href={storyHref(to)} target="_top">
        {icon && <Icon icon={icon} />}
        <span className="yx-button__label">{children}</span>
      </a>
    </Button>
  );
}

/** Result of the last action on the page. */
function Done({ text }: { text: string | null }) {
  return text ? <InlineAlert tone="success" title={text} /> : null;
}

/* ------------------------------------------------------------------ Bulk upload with row validation (shared) */

export interface UploadRowResult {
  row: number;
  employee: string;
  value: string;
  error?: string;
}

/** CSV / XLSX upload with a validation preview per row; only valid rows are imported. */
export function BulkUploadDrawer({
  open,
  onOpenChange,
  title,
  template,
  columns = ['Employee ID', 'Employee name', 'Value', 'Reason'],
  results,
  onImport,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  title: string;
  template: string;
  /** Header row of the downloadable template. */
  columns?: string[];
  results?: UploadRowResult[];
  onImport: () => void;
}) {
  const bad = results?.filter((r) => r.error) ?? [];
  const good = (results?.length ?? 0) - bad.length;
  return (
    <Drawer
      open={open}
      onOpenChange={onOpenChange}
      title={title}
      subtitle={`Use the ${template} template. Rows with errors are skipped; fix them and upload again.`}
      size="lg"
      footer={
        <>
          {!results && <span className="yx-pay-muted">Upload a file to check the rows.</span>}
          <Button onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button variant="primary" disabled={!results || good === 0} onClick={onImport}>
            {results ? `Import ${good} valid rows` : 'Import rows'}
          </Button>
        </>
      }
    >
      <div className="yx-pay-stack">
        <div className="yx-pay-row">
          <Button size="sm" icon={Download} onClick={() => saveFile(`${template.toLowerCase().replace(/\s+/g, '-')}-template.csv`, `${columns.join(',')}\n`)}>
            Download {template} template (CSV)
          </Button>
        </div>
        <FileUpload upload={okUpload} accept={['.csv', '.xlsx']} multiple={false} />
        {results && (
          <>
            <InlineAlert tone={bad.length ? 'warning' : 'success'} title={`${good} rows ready · ${bad.length} rows with errors`}>
              {bad.length ? 'Each error says what to change in the file.' : 'Every row passed validation.'}
            </InlineAlert>
            <div className="yx-scroll-x" tabIndex={0} role="region" aria-label="Table, scrolls sideways on small screens">
            <table className="yx-pay-table">
              <thead>
                <tr>
                  <th scope="col" data-num>
                    Row
                  </th>
                  <th scope="col">Employee</th>
                  <th scope="col">Value</th>
                  <th scope="col">Result</th>
                </tr>
              </thead>
              <tbody>
                {results.map((r) => (
                  <tr key={r.row} data-state={r.error ? 'error' : undefined}>
                    <td data-num>{r.row}</td>
                    <th scope="row">{r.employee}</th>
                    <td>{r.value}</td>
                    <td>{r.error ? <span>{r.error}</span> : <Badge tone="success">Ready</Badge>}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            </div>
          </>
        )}
      </div>
    </Drawer>
  );
}

/* ================================================================== PAY-04 Manual LOP / payable days */

/** Upload preview rows: the people in the LOP list (code and name from EMPLOYEES), so each code belongs to the person named. */
const lopWho = (i: number) => `${LOP_ROWS[i].code} · ${LOP_ROWS[i].employee}`;
export const LOP_UPLOAD: UploadRowResult[] = [
  { row: 2, employee: lopWho(0), value: 'LOP 1 · Absent, informed manager' },
  { row: 3, employee: lopWho(1), value: 'LOP 2 · Unapproved absence' },
  { row: 4, employee: lopWho(2), value: 'LOP 32', error: 'LOP days (32) are more than the 30 days in September. Enter 30 or fewer.' },
  { row: 5, employee: 'KF-9999', value: 'LOP 1', error: 'No employee with ID KF-9999 in this pay group. Check the ID.' },
  { row: 6, employee: lopWho(5), value: 'LOP 1', error: 'Reason is empty. Add a reason for each row with LOP.' },
];

/** PAY-04 · Manual LOP / payable-days input for Assumed-present groups (+ bulk upload). */
export function LopInputScreen({ state = 'ready', upload, locked, rows: initial = LOP_ROWS }: { state?: ViewState; upload?: boolean; locked?: boolean; rows?: LopRow[] }) {
  const [rows, setRows] = useState(initial);
  const [showUpload, setShowUpload] = useState(!!upload);
  const [done, setDone] = useState<string | null>(null);
  const errors = rows.filter((r) => r.error);
  const cols: TableColumn<LopRow>[] = [
    { key: 'employee', header: 'Employee', type: 'person', value: (r) => r.employee, person: (r) => ({ name: r.employee, secondary: r.code }), width: 240 },
    { key: 'lop', header: 'LOP days', type: 'number', value: (r) => r.lop, editable: locked ? undefined : 'number', total: 'sum', width: 110 },
    { key: 'payable', header: 'Payable days', type: 'number', value: (r) => r.payable, width: 120, optional: true },
    { key: 'reason', header: 'Reason', value: (r) => r.reason, editable: locked ? undefined : 'text', width: 260 },
    { key: 'source', header: 'Source', value: (r) => r.source, width: 90, optional: true },
    { key: 'err', header: 'Check', value: (r) => r.error ?? '', render: (r) => (r.error ? <span className="yx-pay-note">{r.error}</span> : <Badge tone="success">OK</Badge>), width: 300 },
  ];
  return (
    <PayFrame page="runs" persona="hr">
      <PageHeader
        title="Loss of pay input"
        description="Assumed-present groups raise no attendance exceptions. Enter unpaid days per employee for the period, each with a reason."
        facts={`${RUN.period} · Sales field staff (Assumed present) · ${rows.length} employees · Due by cut-off ${formatDate(RUN.cutOff)}`}
        status={locked ? <Badge tone="neutral">Period frozen</Badge> : <Badge tone="warning">Open</Badge>}
        actions={
          <>
            <Button icon={Upload} disabled={locked} onClick={() => setShowUpload(true)}>
              Bulk upload
            </Button>
            <Button variant="primary" disabled={locked || errors.length > 0} onClick={() => setDone(`LOP saved for ${rows.length} employees · ${rows.reduce((a, r) => a + r.lop, 0)} unpaid days in total`)}>
              Save LOP for {rows.length} employees
            </Button>
          </>
        }
      />
      <Done text={done} />
      {locked && (
        <InlineAlert tone="info" title="Inputs are frozen for September">
          The cut-off passed on {formatDate(RUN.cutOff)}. Changes now go through a late request; approved late items reach October as arrears or LOP reversal.
        </InlineAlert>
      )}
      {errors.length > 0 && !locked && (
        <InlineAlert tone="danger" title={`${errors.length} row needs a change before you can save`}>
          {errors[0].employee}: {errors[0].error}
        </InlineAlert>
      )}
      <DataTable
        label="LOP input"
        columns={cols}
        rows={rows}
        getRowId={(r) => r.id}
        state={tableState(state)}
        onCellEdit={(row, key, value) =>
          setRows((rs) =>
            rs.map((r) => {
              if (r.id !== row.id) return r;
              if (key === 'lop') {
                const lop = Number(value) || 0;
                return { ...r, lop, payable: 30 - lop, error: lop > 30 ? 'LOP days are more than the 30 days in September. Enter 30 or fewer.' : lop > 0 && !r.reason ? 'Add a reason for LOP.' : undefined };
              }
              return { ...r, reason: String(value), error: r.lop > 0 && !String(value) ? 'Add a reason for LOP.' : undefined };
            }),
          )
        }
        empty={<EmptyState title="No Assumed-present groups in this run." description="Every group in this pay group uses punches or timesheets, so LOP comes from the attendance feed." />}
        onExport={() => saveFile('lop-input-sep-2026.csv', tableToCsv(rows, cols))}
      />
      <BulkUploadDrawer
        open={showUpload}
        onOpenChange={setShowUpload}
        title="Upload LOP for September 2026"
        template="LOP input"
        columns={['Employee ID', 'Employee name', 'LOP days', 'Reason']}
        results={upload ? LOP_UPLOAD : undefined}
        onImport={() => {
          // Valid upload rows set that person's LOP and reason in the list (rows 2 and 3 are LOP_ROWS 0 and 1).
          const ok = LOP_UPLOAD.filter((r) => !r.error);
          const byCode = new Map(ok.map((u) => [u.employee.split(' · ')[0], u.value]));
          setRows((rs) =>
            rs.map((r) => {
              const v = byCode.get(r.code);
              if (!v) return r;
              const [lopPart, reason = r.reason] = v.split(' · ');
              const lop = Number(lopPart.replace('LOP ', ''));
              return { ...r, lop, payable: 30 - lop, reason, source: 'Upload', error: undefined };
            }),
          );
          setShowUpload(false);
          setDone(`${ok.length} LOP rows imported · ${LOP_UPLOAD.length - ok.length} rows skipped with errors`);
        }}
      />
    </PayFrame>
  );
}

/* ================================================================== PAY-05 One-time pay */

/** Status words in the list: "Awaiting approval" keeps the badge on one line. */
const OTP_STATUS: Record<OneTimeRow['status'], string> = { Draft: 'Draft', 'Waiting for approval': 'Awaiting approval', Approved: 'Approved', Paid: 'Paid', Rejected: 'Rejected' };
const OTP_TONE: Record<string, BadgeTone> = { Draft: 'neutral', 'Awaiting approval': 'warning', Approved: 'info', Paid: 'success', Rejected: 'danger' };
const nextMonth = (period: string) => {
  const [m, y] = period.split(' ');
  const x = new Date(Number(y), MON.indexOf(m) + 1, 1);
  return monthLabel(x);
};
const ONE_TIME_ROWS: OneTimeRow[] = ONE_TIME;
const PAY_IN = ['Oct 2026', 'Nov 2026', 'Dec 2026'];
const BASE_TYPES: OneTimeRow['type'][] = ['Bonus', 'Incentive', 'Recovery', 'Reimbursement', 'Arrear'];
const APPROVAL_ROUTE = `${HR_HEAD.name} (HR head), then ${FIN_APPROVER.name} (Finance)`;
const ADD_REASON = 'Festival bonus, operations team';
const RECURRING_REASON = 'Retention incentive, paid monthly until March';
/** A person in the run with a clean payslip: the default in the add sheet. */
const DEFAULT_PAYEE = RUN_ROWS.filter((r) => r.status === 'Calculated' && r.mode === 'Bank')[10];
/** Current employees in the run for the sample upload file (no one who is leaving). */
const UPLOAD_PEOPLE = RUN_ROWS.filter((r) => r.status === 'Calculated' && r.mode === 'Bank').slice(12, 15);
/** The upload that brings in o7 (its bonus comes from this file, so the upload story starts without it). */
const O7 = ONE_TIME.find((o) => o.id === 'o7')!;
const OTP_UPLOAD: { row: number; item: Pick<OneTimeRow, 'employee' | 'code' | 'type' | 'amount' | 'period'>; error?: string }[] = [
  { row: 2, item: { employee: O7.employee, code: O7.code, type: O7.type, amount: O7.amount, period: O7.period } },
  { row: 3, item: { employee: UPLOAD_PEOPLE[0].name, code: UPLOAD_PEOPLE[0].code, type: 'Incentive', amount: 12_000, period: 'Oct 2026' } },
  { row: 4, item: { employee: UPLOAD_PEOPLE[1].name, code: UPLOAD_PEOPLE[1].code, type: 'Recovery', amount: 8_000, period: '' }, error: 'Period is empty. Enter the month to pay in, e.g. Oct 2026.' },
  { row: 5, item: { employee: UPLOAD_PEOPLE[2].name, code: UPLOAD_PEOPLE[2].code, type: 'Bonus', amount: 5_00_000, period: 'Oct 2026' }, error: 'Amount is above the ₹2,00,000 limit for bonus without HR head approval. Split it or ask HR head.' },
];
const payeeLabel = (p: { name: string; code: string }) => `${p.name} · ${p.code}`;

/** Prorated months of a recurring item: part month at the start, full months, part month at the end. */
function recurringPlan(amount: number, start: Date, end: Date) {
  const apart = monthsApart(start, end);
  if (apart < 1 || end <= start) return null;
  const firstDays = daysIn(start) - start.getDate() + 1;
  const first = start.getDate() === 1 ? amount : Math.round((amount * firstDays) / daysIn(start));
  const last = end.getDate() === daysIn(end) ? amount : Math.round((amount * end.getDate()) / daysIn(end));
  const full = apart - 1;
  const lines = [{ label: `${MONTH_NAME[start.getMonth()]} (${start.getDate()}–${daysIn(start)} ${MON[start.getMonth()]})`, value: first }];
  if (full > 0) {
    const a = new Date(start.getFullYear(), start.getMonth() + 1, 1);
    const b = new Date(end.getFullYear(), end.getMonth() - 1, 1);
    lines.push({ label: `${full === 1 ? MON[a.getMonth()] : `${MON[a.getMonth()]}–${MON[b.getMonth()]}`} (${plural(full, 'full month')})`, value: amount * full });
  }
  lines.push({ label: `${MONTH_NAME[end.getMonth()]} (1–${end.getDate()} ${MON[end.getMonth()]})`, value: last });
  return { lines, months: apart + 1, total: lines.reduce((s, l) => s + l.value, 0) };
}

type Hold = HoldRow & { /** New hold: applies from the October run (September's bank file is already released). */ fromOct?: boolean };

/** PAY-05 · One-time pay: list, bulk upload, recurring, add sheet with effect summary. */
export function OneTimePayScreen({ state = 'ready', sheet, upload, rows: initialRows = ONE_TIME_ROWS, tab = 'onetime' }: { state?: ViewState; sheet?: 'add' | 'recurring'; upload?: boolean; rows?: OneTimeRow[]; tab?: 'onetime' | 'holds' }) {
  const ready = state === 'ready';
  // Before the upload is imported, its bonus (o7) is not in the list yet.
  const [rows, setRows] = useState(upload ? initialRows.filter((r) => r.id !== O7.id) : initialRows);
  const [holds, setHolds] = useState<Hold[]>(HOLDS);
  const [selected, setSelected] = useState<string[]>([]);
  const [done, setDone] = useState<string | null>(null);
  const [type, setType] = useState<OneTimeRow['type']>(sheet === 'recurring' ? 'Incentive' : 'Bonus');
  const [payIn, setPayIn] = useState('Oct 2026');
  const [who, setWho] = useState(sheet ? payeeLabel(DEFAULT_PAYEE) : '');
  const [start, setStart] = useState<Date | null>(sheet === 'recurring' ? d(15, 9) : null);
  const [end, setEnd] = useState<Date | null>(sheet === 'recurring' ? d(15, 2, 2027) : null);
  const [reason, setReason] = useState(sheet === 'recurring' ? RECURRING_REASON : sheet ? ADD_REASON : '');
  const [editing, setEditing] = useState<OneTimeRow | null>(null);
  const [deleting, setDeleting] = useState<string[] | null>(null);
  const [view, setView] = useState('all');
  const draftsIn = (ids: string[]) => rows.filter((r) => ids.includes(r.id) && r.status === 'Draft').map((r) => r.id);
  const sendForApproval = (ids: string[]) => {
    setRows((rs) => rs.map((r) => (ids.includes(r.id) ? { ...r, status: 'Waiting for approval' } : r)));
    setSelected([]);
    setDone(`${plural(ids.length, 'item')} sent to ${HR_HEAD.name} (HR head) for approval`);
  };
  const deleteDrafts = (ids: string[]) => {
    setRows((rs) => rs.filter((r) => !ids.includes(r.id)));
    setSelected([]);
    setDone(`${plural(ids.length, 'draft')} deleted`);
  };
  const [filters, setFilters] = useState<FilterValue[]>([
    { key: 'type', type: 'multi', values: [] },
    { key: 'source', type: 'multi', values: [] },
    { key: 'status', type: 'multi', values: [] },
  ]);
  const [q, setQ] = useState('');
  const [adding, setAdding] = useState(!!sheet);
  const [showUpload, setShowUpload] = useState(!!upload);
  const [amount, setAmount] = useState<number | null>(sheet === 'recurring' ? 5_000 : 25_000);
  const [recurring, setRecurring] = useState(sheet === 'recurring');
  const known = rows.find((r) => editing && r.id === editing.id && payeeLabel({ name: r.employee, code: r.code }) === who.trim());
  const runPerson = findRunPerson(who);
  const payee = runPerson ? { name: runPerson.name, code: runPerson.code, gross: runPerson.gross } : known ? { name: known.employee, code: known.code, gross: null } : null;
  const plan = recurring && start && end ? recurringPlan(amount ?? 0, start, end) : null;
  const addMissing = !who.trim()
    ? 'Choose an employee'
    : !payee
      ? 'No one with that name or ID in this pay group'
      : !amount
        ? 'Enter an amount'
        : recurring && (!start || !end)
          ? 'Enter the start and end dates'
          : recurring && !plan
            ? 'End date must be at least a month after the start'
            : !reason.trim()
              ? 'Add a reason'
              : null;
  const openAdd = () => {
    setEditing(null);
    setWho('');
    setType('Bonus');
    setAmount(null);
    setRecurring(false);
    setStart(null);
    setEnd(null);
    setPayIn('Oct 2026');
    setReason('');
    setAdding(true);
  };
  const openEdit = (r: OneTimeRow) => {
    setEditing(r);
    setWho(payeeLabel({ name: r.employee, code: r.code }));
    setType(r.type);
    setAmount(r.amount);
    setRecurring(!!r.recurring);
    const [a, b] = (r.recurring ?? '').split(' – ').map((s) => new Date(s));
    setStart(r.recurring && !Number.isNaN(+a) ? a : null);
    setEnd(r.recurring && !Number.isNaN(+b) ? b : null);
    setPayIn(PAY_IN.includes(r.period) ? r.period : 'Oct 2026');
    setReason('');
    setAdding(true);
  };
  const saveItem = () => {
    if (addMissing || !payee || !amount) return;
    const deduction = type === 'Recovery' || type === 'Joining bonus clawback';
    const item = {
      employee: payee.name,
      code: payee.code,
      type,
      kind: deduction ? 'Deduction' : 'Earning',
      amount,
      period: recurring && start ? monthLabel(start) : payIn,
      recurring: recurring && start && end ? `${formatDate(start)} – ${formatDate(end)}` : undefined,
      status: 'Waiting for approval',
      taxable: !deduction && type !== 'Reimbursement',
    } as const;
    if (editing) {
      setRows((rs) => rs.map((r) => (r.id === editing.id ? { ...r, ...item } : r)));
      setDone(`${type} for ${payee.name} changed to ${formatINR(amount)} and sent to ${HR_HEAD.name} for approval`);
    } else {
      setRows((rs) => [...rs, { id: `o${rs.length + 1}-new`, source: 'Manual', ...item }]);
      setDone(`${type} of ${formatINR(amount)}${recurring ? ' a month' : ''} for ${payee.name} sent to ${HR_HEAD.name} for approval`);
    }
    setEditing(null);
    setAdding(false);
  };
  const moveNext = (r: OneTimeRow) => {
    const to = nextMonth(r.period);
    setRows((rs) => rs.map((x) => (x.id === r.id ? { ...x, period: to } : x)));
    setDone(`${r.type} for ${r.employee} moved from ${r.period} to ${to}`);
  };
  const viewRows = view === 'rec' ? rows.filter((r) => r.recurring) : rows;
  const shown = useMemo(
    () =>
      viewRows.filter(
        (r) =>
          filters.every((f) => matchesFilter(f.key === 'type' ? r.type : f.key === 'source' ? r.source : OTP_STATUS[r.status], f)) &&
          (q === '' || `${r.employee} ${r.code}`.toLowerCase().includes(q.toLowerCase())),
      ),
    [viewRows, filters, q],
  );
  const cols: TableColumn<OneTimeRow>[] = [
    { key: 'employee', header: 'Employee', type: 'person', value: (r) => r.employee, person: (r) => ({ name: r.employee, secondary: r.code }), width: 220 },
    { key: 'type', header: 'Type', value: (r) => r.type, width: 180, groupable: true },
    { key: 'kind', header: 'Earning or deduction', value: (r) => r.kind, width: 150, optional: true },
    { key: 'amount', header: 'Amount', type: 'money', value: (r) => (r.kind === 'Deduction' ? -r.amount : r.amount), total: 'sum', width: 120 },
    { key: 'period', header: 'Pay in', value: (r) => r.period, width: 100 },
    { key: 'recurring', header: 'Recurring', value: (r) => r.recurring ?? 'One time', width: 200, optional: true },
    { key: 'source', header: 'Source', value: (r) => r.source, width: 120, optional: true },
    { key: 'taxable', header: 'Taxable', value: (r) => (r.taxable ? 'Yes' : 'No'), width: 80, optional: true },
    { key: 'status', header: 'Status', type: 'status', value: (r) => OTP_STATUS[r.status], statusTone: (v) => OTP_TONE[String(v)], width: 170 },
  ];
  const opts = (xs: string[]) => xs.map((v) => ({ value: v, label: v }));
  const toDelete = rows.filter((r) => deleting?.includes(r.id));
  const typeOptions = BASE_TYPES.includes(type) ? BASE_TYPES : [...BASE_TYPES, type];
  const annual = (payee?.gross ?? 50_000) * 12;
  const extraTds = computeTax(annual + (amount ?? 0), 'new').total - computeTax(annual, 'new').total;
  const esiCovered = payee?.gross != null && esiContribution(payee.gross).covered;
  const tdsLine = {
    label: `Extra TDS in ${payIn}`,
    value: extraTds > 0 ? `${formatINR(extraTds)} (new regime, projected salary ${formatINR(annual + (amount ?? 0))} a year)` : `None: projected salary ${formatINR(annual + (amount ?? 0))} a year stays within the new-regime rebate`,
  };
  const effect: { label: string; value: ReactNode }[] =
    type === 'Recovery'
      ? [
          { label: 'Effect', value: `Reduces net pay by ${formatINR(amount ?? 0)} in ${payIn}` },
          { label: 'Tax', value: 'No TDS change (a deduction)' },
          { label: 'PF / ESI', value: 'Not affected' },
        ]
      : type === 'Reimbursement'
        ? [
            { label: 'Taxable', value: 'Not taxable (paid against bills)' },
            { label: `Extra TDS in ${payIn}`, value: 'None' },
            { label: 'PF / ESI', value: 'Not affected' },
          ]
        : [
            { label: 'Taxable', value: 'Yes, salary income' },
            tdsLine,
            {
              label: 'PF / ESI',
              value:
                type === 'Arrear'
                  ? 'PF wage if it is an arrear of basic or DA; ESI wage if the employee is covered'
                  : type === 'Incentive'
                    ? `Not PF wage; ${esiCovered ? 'counts for ESI' : 'no ESI (gross above ₹21,000)'}`
                    : 'Not PF wage; not ESI wage (bonus excluded)',
            },
          ];
  const approval = { label: 'Approval', value: <>{APPROVAL_ROUTE}<br /><span className="yx-pay-note">You can't approve your own item</span></> };
  return (
    <PayFrame page="onetime">
      <PageHeader
        title="One-time pay"
        description="Single-period earnings and deductions, and recurring items with a start and end. Part months at the start and end are paid prorated."
        facts={ready ? `${plural(rows.length, 'item')} · ${formatINR(rows.filter((r) => r.kind === 'Earning').reduce((a, r) => a + r.amount, 0))} earnings · ${formatINR(rows.filter((r) => r.kind === 'Deduction').reduce((a, r) => a + r.amount, 0))} deductions` : undefined}
        actions={
          <>
            <Button icon={Upload} disabled={!ready} onClick={() => setShowUpload(true)}>
              Bulk upload
            </Button>
            <Button variant="primary" icon={Plus} disabled={!ready} onClick={openAdd}>
              Add one-time pay
            </Button>
          </>
        }
      />
      <Done text={done} />
      <Tabs defaultValue={tab}>
        <TabsList aria-label="One-time pay and holds">
          <TabsTrigger value="onetime" count={ready ? rows.length : undefined}>
            One-time pay
          </TabsTrigger>
          <TabsTrigger value="holds" count={ready ? holds.filter((h) => h.status !== 'Released').length : undefined}>
            Salary holds
          </TabsTrigger>
        </TabsList>
        <TabsContent value="onetime">
          <DataTable
            label="One-time pay items"
            columns={cols}
            rows={shown}
            getRowId={(r) => r.id}
            state={tableState(state)}
            selectable
            selectedIds={selected}
            onSelectedChange={setSelected}
            bulkActions={(ids) => {
              const drafts = draftsIn(ids);
              return (
                <>
                  <Button size="sm" disabled={drafts.length === 0} onClick={() => sendForApproval(drafts)}>
                    Send {drafts.length} for approval
                  </Button>
                  <Button size="sm" variant="danger" disabled={drafts.length === 0} onClick={() => setDeleting(drafts)}>
                    Delete {plural(drafts.length, 'draft')}
                  </Button>
                  {drafts.length < ids.length && <span className="yx-pay-note">Only drafts can be sent or deleted</span>}
                </>
              );
            }}
            filtered={shown.length !== rows.length}
            onClearFilters={() => {
              setFilters((fs) => fs.map((f) => ({ ...f, values: [] }) as FilterValue));
              setQ('');
              setView('all');
            }}
            empty={<EmptyState title="No one-time pay yet." description="Items from expenses, hiring, performance, engage and cases appear here automatically once approved." action={<Button variant="primary" icon={Plus} onClick={openAdd}>Add one-time pay</Button>} />}
            toolbar={
              <FilterBar
                fields={[
                  { key: 'type', label: 'Type', type: 'multi', options: opts(['Bonus', 'Incentive', 'Recovery', 'Reimbursement', 'Arrear', 'Referral bonus', 'Joining bonus clawback', 'Reward payout', 'Subsistence allowance']) },
                  { key: 'source', label: 'Source', type: 'multi', options: opts(['Manual', 'Upload', 'Hiring', 'Expenses', 'Performance', 'Engage', 'Cases']) },
                  { key: 'status', label: 'Status', type: 'multi', options: opts(['Draft', 'Awaiting approval', 'Approved', 'Paid', 'Rejected']) },
                ]}
                value={filters}
                onChange={setFilters}
                search={q}
                onSearchChange={setQ}
                searchPlaceholder="Search employee or ID"
              />
            }
            views={<SavedViewMenu views={[{ id: 'all', name: 'All items' }, { id: 'rec', name: 'Recurring items', shared: true }]} currentId={view} onSelect={setView} />}
            rowActions={(r) => (
              <>
                <MenuItem disabled={r.status === 'Paid'} onSelect={() => openEdit(r)}>
                  {r.status === 'Paid' ? 'Edit (paid items are final)' : 'Edit'}
                </MenuItem>
                <MenuItem disabled={r.status === 'Paid'} onSelect={() => moveNext(r)}>
                  Move to {nextMonth(r.period)}
                </MenuItem>
                <MenuItem destructive disabled={r.status !== 'Draft'} onSelect={() => setDeleting([r.id])}>
                  {r.status === 'Draft' ? 'Delete draft' : 'Delete (drafts only)'}
                </MenuItem>
              </>
            )}
            onExport={() => saveFile('one-time-pay.csv', tableToCsv(shown, cols))}
          />
        </TabsContent>
        <TabsContent value="holds">
          <HoldsPanel state={state} holds={holds} setHolds={setHolds} />
        </TabsContent>
      </Tabs>
      <ConfirmDialog
        open={!!deleting}
        onOpenChange={(o) => !o && setDeleting(null)}
        title={`Delete ${plural(toDelete.length, 'draft')}?`}
        consequence={`${toDelete.map((r) => `${r.employee} (${r.type}, ${formatINR(r.amount)})`).join(', ')}. Total ${formatINR(toDelete.reduce((a, r) => a + r.amount, 0))}. This can't be undone.`}
        confirmLabel={`Delete ${plural(toDelete.length, 'draft')}`}
        destructive
        onConfirm={() => {
          if (deleting) deleteDrafts(deleting);
          setDeleting(null);
        }}
      />
      <Drawer
        open={adding}
        onOpenChange={(o) => {
          setAdding(o);
          if (!o) setEditing(null);
        }}
        title={editing ? `Edit ${editing.type.toLowerCase()} for ${editing.employee}` : recurring ? 'Add recurring item' : 'Add one-time pay'}
        subtitle="Approved items enter the next open run (October 2026). September is locked."
        size="lg"
        footer={
          <>
            <Button onClick={() => setAdding(false)}>Cancel</Button>
            {addMissing && <span className="yx-pay-note">{addMissing}</span>}
            <Button variant="primary" disabled={!!addMissing} onClick={saveItem}>
              Send for approval
            </Button>
          </>
        }
      >
        <div className="yx-pay-split">
          <div className="yx-pay-stack">
            <FormField label="Employee" required helper={payee ? (payee.gross ? `Gross ${formatINR(payee.gross)} a month · ${esiCovered ? 'covered by ESI' : 'not covered by ESI'}` : 'Not in the September run') : 'Name or employee ID'}>
              <TextField value={who} onChange={setWho} placeholder="Search employee" />
            </FormField>
            <FieldRow>
              <FormField label="Type" required>
                <Select value={type} onChange={(v) => v && setType(v as OneTimeRow['type'])} options={opts(typeOptions)} />
              </FormField>
              <FormField label="Amount" required>
                <CurrencyField value={amount} onChange={setAmount} />
              </FormField>
            </FieldRow>
            <Checkbox
              label="Recurring (has a start and end)"
              checked={recurring}
              onChange={(on) => {
                setRecurring(on);
                if (on && reason === ADD_REASON) setReason(RECURRING_REASON);
                if (!on && reason === RECURRING_REASON) setReason(ADD_REASON);
              }}
              description="Part months at the start and end are paid prorated."
            />
            {recurring ? (
              <FieldRow>
                <FormField label="Start date" required>
                  <DatePicker value={start} onChange={setStart} min={d(1, 9)} />
                </FormField>
                <FormField label="End date" required>
                  <DatePicker value={end} onChange={setEnd} min={start ?? d(1, 9)} />
                </FormField>
              </FieldRow>
            ) : (
              <FormField label="Pay in" required helper="September is locked (cut-off 25 Sep).">
                <Select value={payIn} onChange={(v) => v && setPayIn(String(v))} options={opts(PAY_IN)} />
              </FormField>
            )}
            <FormField label="Reason" required>
              <TextArea value={reason} onChange={setReason} rows={2} />
            </FormField>
          </div>
          <aside className="yx-pay-panel" aria-label="Effect">
            <SectionTitle>Effect</SectionTitle>
            <DescriptionList
              items={
                recurring
                  ? [
                      { label: 'Each month', value: formatINR(amount ?? 0) },
                      ...(plan ? plan.lines.map((l) => ({ label: l.label, value: formatINR(l.value) })) : []),
                      { label: plan ? `Total over ${plan.months} months` : 'Total', value: plan ? formatINR(plan.total) : 'Enter start and end dates' },
                      approval,
                    ]
                  : [...effect, approval]
              }
            />
          </aside>
        </div>
      </Drawer>
      <BulkUploadDrawer
        open={showUpload}
        onOpenChange={setShowUpload}
        title="Upload one-time pay"
        template="One-time pay"
        columns={['Employee ID', 'Employee name', 'Type', 'Amount', 'Pay in', 'Reason']}
        onImport={() => {
          const ok = OTP_UPLOAD.filter((u) => !u.error);
          setRows((rs) => [...rs, ...ok.map((u, i): OneTimeRow => ({ ...u.item, id: `up${rs.length + i}`, kind: u.item.type === 'Recovery' ? 'Deduction' : 'Earning', source: 'Upload', status: 'Draft', taxable: u.item.type !== 'Recovery' }))]);
          setShowUpload(false);
          setDone(`${plural(ok.length, 'one-time pay row')} added as drafts · ${plural(OTP_UPLOAD.length - ok.length, 'row')} skipped with errors`);
        }}
        results={upload ? OTP_UPLOAD.map(({ row, item, error }) => ({ row, employee: `${item.code} · ${item.employee}`, value: `${item.type} ${formatINR(item.amount)}${item.period ? ` · ${item.period}` : ''}`, error })) : undefined}
      />
    </PayFrame>
  );
}

/* ================================================================== PAY-06 Salary holds & releases */

const HOLD_TONE: Record<HoldRow['status'], BadgeTone> = { 'On hold': 'warning', 'Release requested': 'info', Released: 'success' };

const HOLD_REASONS: HoldRow['reason'][] = ['Absconding', 'Pending documents', 'Disciplinary', 'Bank failure', 'Exit clearance', 'Other'];

/** Runs a hold covers, ending with September (a new hold starts with October). */
const heldMonths = (h: Hold) => (h.fromOct ? ['Oct'] : MON.slice(9 - h.runs, 9));
/** Net held across every held run; a new hold has held nothing yet. */
const heldTotal = (h: Hold) => (h.fromOct ? 0 : h.amount * h.runs);
const openHolds = (hs: Hold[]) => hs.filter((h) => h.status !== 'Released');
const RELEASE_DOCS_REASON = 'Bank proof verified by a ₹1 test deposit on 29 Sep';
const releaseDefault = (h: Hold | null) => (h?.reason === 'Pending documents' ? RELEASE_DOCS_REASON : '');
/** PF, ESI (only when the gross is within ₹21,000) and TDS on the held pay; September's are deposited in October. */
function statutoryText(h: Hold) {
  const row = RUN_ROWS.find((r) => r.code === h.code);
  const esi = !!row && esiContribution(row.gross).covered;
  const list = esi ? 'PF, ESI and TDS computed' : 'PF and TDS computed (no ESI: gross above ₹21,000)';
  const earlier = heldMonths(h).filter((m) => m !== 'Sep' && m !== 'Oct');
  const [mon, next] = h.fromOct ? ['October', 'Nov'] : ['September', 'Oct'];
  return `${list}.${earlier.length ? ` ${earlier.join(' and ')} deposited.` : ''} ${mon}'s due: TDS by 7 ${next}, PF${esi ? ' and ESI' : ''} by 15 ${next}.`;
}

function HoldsPanel({ state, holds, setHolds, releaseId, addOpen }: { state: ViewState; holds: Hold[]; setHolds: (fn: (hs: Hold[]) => Hold[]) => void; releaseId?: string; addOpen?: boolean }) {
  const [done, setDone] = useState<string | null>(null);
  const [release, setRelease] = useState<Hold | null>(holds.find((h) => h.id === releaseId) ?? null);
  const [payThrough, setPayThrough] = useState('next');
  const [releaseReason, setReleaseReason] = useState(releaseDefault(release));
  const [confirmRelease, setConfirmRelease] = useState(false);
  const [adding, setAdding] = useState(!!addOpen);
  const [confirmHold, setConfirmHold] = useState(false);
  const [holdWho, setHoldWho] = useState('');
  const [holdReason, setHoldReason] = useState<HoldRow['reason'] | null>(null);
  const [holdNote, setHoldNote] = useState('');
  const open = openHolds(holds);
  const buckets = [
    ['0–30 days', open.filter((h) => h.ageDays <= 30)],
    ['31–60 days', open.filter((h) => h.ageDays > 30 && h.ageDays <= 60)],
    ['61–90 days', open.filter((h) => h.ageDays > 60 && h.ageDays <= 90)],
    ['Over 90 days', open.filter((h) => h.ageDays > 90)],
  ] as const;
  const openRelease = (h: Hold) => {
    setRelease(h);
    setReleaseReason(releaseDefault(h));
    setPayThrough('next');
  };
  const doRelease = () => {
    if (!release) return;
    setHolds((hs) => hs.map((h) => (h.id === release.id ? { ...h, status: 'Released', note: releaseReason } : h)));
    setDone(`${formatINR(heldTotal(release))} for ${release.employee} released ${payThrough === 'next' ? 'into the October bank file' : 'as an off-cycle payment today'}`);
    setRelease(null);
    setReleaseReason('');
  };
  const holdPerson = findRunPerson(holdWho);
  const holdEsi = holdPerson && esiContribution(holdPerson.gross).covered;
  const doHold = () => {
    if (!holdReason || !holdPerson) return;
    setHolds((hs) => [{ id: `h${hs.length + 1}-new`, employee: holdPerson.name, code: holdPerson.code, reason: holdReason, trigger: 'Manual', since: d(29), ageDays: 0, amount: holdPerson.net, runs: 1, status: 'On hold', note: holdNote, fromOct: true }, ...hs]);
    setDone(`Salary for ${holdPerson.name} (${formatINR(holdPerson.net)} a month) is held from the October run`);
    setAdding(false);
    setHoldWho('');
    setHoldReason(null);
    setHoldNote('');
  };
  const holdMissing = !holdWho.trim() ? 'Enter an employee name or ID' : !holdPerson ? 'No one with that name or ID in this pay group' : !holdReason ? 'Choose a reason code' : !holdNote.trim() ? 'Add a note' : null;
  const cols: TableColumn<Hold>[] = [
    { key: 'employee', header: 'Employee', type: 'person', value: (r) => r.employee, person: (r) => ({ name: r.employee, secondary: r.code }), width: 220 },
    {
      key: 'reason',
      header: 'Reason code',
      value: (r) => r.reason,
      width: 160,
      hideable: false,
      groupable: true,
    },
    { key: 'since', header: 'Held since', type: 'date', value: (r) => r.since, width: 130, optional: true },
    { key: 'age', header: 'Age', type: 'number', value: (r) => r.ageDays, render: (r) =>
        r.fromOct ? (
          'From Oct run'
        ) : (
          <>
            {plural(r.ageDays, 'day')}
            <br />
            <span className="yx-pay-note">{plural(r.runs, 'run')}</span>
          </>
        ),
      width: 110,
      optional: true,
    },
    {
      key: 'amount',
      header: 'Net held',
      type: 'money',
      // Released salaries are not held any more, so they stay out of the total.
      value: (r) => (r.status === 'Released' ? 0 : heldTotal(r)),
      render: (r) =>
        r.status === 'Released' ? (
          <span className="yx-pay-note">
            Released
            <br />
            {formatINR(r.amount * r.runs)}
          </span>
        ) : r.fromOct ? (
          <span className="yx-pay-note">{formatINR(r.amount)} a month from Oct</span>
        ) : (
          <>
            <Amount value={heldTotal(r)} />
            {r.runs > 1 && (
              <>
                <br />
                <span className="yx-pay-note">
                  {r.runs} × {formatINR(r.amount)}
                </span>
              </>
            )}
          </>
        ),
      total: 'sum',
      width: 150,
    },
    { key: 'note', header: 'Note', value: (r) => r.note, width: 260, optional: true },
    { key: 'status', header: 'Status', type: 'status', value: (r) => r.status, statusTone: (v) => HOLD_TONE[v as HoldRow['status']], width: 160 },
  ];
  const releaseMonths = release ? heldMonths(release) : [];
  return (
    <div className="yx-pay-stack">
      <Done text={done} />
      <InlineAlert tone="info">While a salary is held, PF, ESI and TDS are still computed and deposited on the accrued pay. Only the net is held.</InlineAlert>
      <SectionTitle
        actions={
          <StoryButton to={STORY.holdAgeing} icon={ArrowUpRight} size="sm">
            Open hold-ageing report
          </StoryButton>
        }
      >
        Holds by reason and age
      </SectionTitle>
      <div className="yx-pay-grid">
        <div data-span="12">
          <DataTable
            label="Salary holds"
            columns={cols}
            rows={holds}
            getRowId={(r) => r.id}
            state={tableState(state)}
            onRowClick={(r) => r.status !== 'Released' && !r.fromOct && openRelease(r)}
            rowButtons={(r) => (r.status !== 'Released' && !r.fromOct ? <Button size="sm" onClick={() => openRelease(r)}>Release</Button> : null)}
            toolbar={<Button size="sm" icon={Plus} onClick={() => setAdding(true)}>Hold a salary</Button>}
            empty={
              <EmptyState
                title="No salaries on hold."
                description="Holds are raised automatically for absconding, returned payments and pending exit clearance, or manually with a reason."
                action={<Button icon={Plus} onClick={() => setAdding(true)}>Hold a salary</Button>}
              />
            }
          />
        </div>
        {state !== 'error' && (
          <div data-span="6">
            <BarChart
              title="Hold ageing"
              description="Open holds by age"
              categories={buckets.map((b) => b[0])}
              series={[{ name: 'Holds', values: buckets.map((b) => b[1].length) }]}
              xLabel="Age"
              height={180}
              loading={state === 'loading'}
            />
          </div>
        )}
      </div>
      <Drawer
        open={!!release}
        onOpenChange={(o) => !o && setRelease(null)}
        title={`Release salary for ${release?.employee ?? ''}`}
        subtitle={release ? `${release.reason} (raised ${release.trigger === 'Automatic' ? 'automatically' : 'manually'}) · held since ${formatDate(release.since)} · ${plural(release.runs, 'run')}` : undefined}
        footer={
          <>
            <Button onClick={() => setRelease(null)}>Cancel</Button>
            {!releaseReason.trim() && <span className="yx-pay-note">Add a reason to release</span>}
            <Button variant="primary" disabled={!releaseReason.trim()} onClick={() => setConfirmRelease(true)}>
              Release {release ? formatINR(heldTotal(release)) : ''}
            </Button>
          </>
        }
      >
        {release && (
          <div className="yx-pay-stack">
            <FactRow
              items={[
                { label: 'Net held', value: <Amount value={heldTotal(release)} strong /> },
                { label: 'Runs released', value: `${releaseMonths.join(', ')} (${plural(release.runs, 'run')} × ${formatINR(release.amount)})` },
                { label: 'Statutory', value: statutoryText(release) },
              ]}
            />
            <FormField label="Pay through" required>
              <RadioGroup
                value={payThrough}
                onChange={setPayThrough}
                options={[
                  { value: 'next', label: 'Next bank file (October run)', description: `Pays every held run (${releaseMonths.join(', ')}) in one line; releasing twice has no effect.` },
                  { value: 'offcycle', label: 'Off-cycle payment now', description: 'Creates an off-cycle payment with its own bank file.' },
                ]}
              />
            </FormField>
            <FormField label="Reason for release" required>
              <TextArea value={releaseReason} onChange={setReleaseReason} rows={2} />
            </FormField>
          </div>
        )}
      </Drawer>
      <ConfirmDialog
        open={confirmRelease}
        onOpenChange={setConfirmRelease}
        title={release ? `Release ${formatINR(heldTotal(release))} to ${release.employee}?` : ''}
        consequence={
          release
            ? `Paid ${payThrough === 'next' ? 'in the October bank file on 30 Oct' : 'in an off-cycle bank file today, 29 Sep'} for ${releaseMonths.join(', ')}. The reason is saved in the audit trail.`
            : undefined
        }
        confirmLabel={release ? `Release ${formatINR(heldTotal(release))}` : 'Release'}
        onConfirm={doRelease}
      />
      <Drawer
        open={adding}
        onOpenChange={setAdding}
        title="Hold a salary"
        subtitle="September's bank file was released on 29 Sep, so a new hold starts with the October run."
        footer={
          <>
            <Button onClick={() => setAdding(false)}>Cancel</Button>
            {holdMissing && <span className="yx-pay-note">{holdMissing}</span>}
            <Button variant="primary" disabled={!!holdMissing} onClick={() => setConfirmHold(true)}>
              Hold salary
            </Button>
          </>
        }
      >
        <div className="yx-pay-stack">
          <FormField label="Employee" required helper={holdPerson ? `${holdPerson.name} · ${holdPerson.code} · net ${formatINR(holdPerson.net)} a month` : 'Name or employee ID'}>
            <TextField value={holdWho} onChange={setHoldWho} placeholder="Search employee" />
          </FormField>
          <FormField label="Reason code" required>
            <Select value={holdReason} onChange={setHoldReason} options={HOLD_REASONS.map((v) => ({ value: v, label: v }))} />
          </FormField>
          <FormField label="Note" required helper="Visible to payroll and HR, not to the employee.">
            <TextArea value={holdNote} onChange={setHoldNote} rows={2} />
          </FormField>
        </div>
      </Drawer>
      <ConfirmDialog
        open={confirmHold}
        onOpenChange={setConfirmHold}
        title={holdPerson ? `Hold ${holdPerson.name}'s salary (${formatINR(holdPerson.net)})?` : ''}
        consequence={`The net pay is held from the October run until someone releases it. ${holdEsi ? 'PF, ESI and TDS' : 'PF and TDS'} are still computed and deposited.`}
        confirmLabel="Hold salary"
        onConfirm={doHold}
      />
    </div>
  );
}

/** PAY-06 · Salary holds & releases (reason codes, hold ageing). Lives on the One-time pay & holds page. */
export function SalaryHoldsScreen({ state = 'ready', releaseId, addOpen }: { state?: ViewState; releaseId?: string; addOpen?: boolean }) {
  const [holds, setHolds] = useState<Hold[]>(HOLDS);
  const open = openHolds(holds);
  return (
    <PayFrame page="onetime">
      <PageHeader
        title="Salary holds"
        description="Held salaries by reason code and age. Release into the next bank file or an off-cycle payment."
        facts={state === 'ready' ? `${plural(open.length, 'open hold')} · ${formatINR(open.reduce((a, h) => a + heldTotal(h), 0))} held` : undefined}
      />
      <HoldsPanel state={state} holds={holds} setHolds={setHolds} releaseId={releaseId} addOpen={addOpen} />
    </PayFrame>
  );
}

/* ================================================================== PAY-10 Payments & files */

type PayStatus = 'Paid' | 'Pending' | 'Failed' | 'Returned' | 'Held' | 'Not calculated';
interface PayLine {
  id: string;
  employee: string;
  code: string;
  bank?: string;
  account?: string;
  ifsc?: string;
  amount: number;
  mode: 'Bank' | 'Cash' | 'Cheque';
  /** Status before a cash or cheque acknowledgement is uploaded; the screen shows Paid once acknowledged. */
  status: PayStatus;
  reason?: string;
  reference?: string;
  chequeNo?: string;
  approval?: string;
  acknowledged?: boolean;
  /** What the bank said, and what the employee has done since. */
  failure?: { code: 'R03' | 'R12'; newAccount?: string };
  /** Held rows: the screen that owns the hold. */
  holdLink?: { to: string; label: string };
}

const PAY_TONE: Record<PayStatus, BadgeTone> = { Pending: 'warning', Paid: 'success', Failed: 'danger', Returned: 'danger', Held: 'neutral', 'Not calculated': 'danger' };
/** Cash and cheque lines wait for a signed receipt: the same words on both tabs. */
const payStatusText = (r: { status: PayStatus; mode: string }) => (r.mode !== 'Bank' && r.status === 'Pending' ? 'Waiting for receipt' : r.status);
const BANKS = [
  { name: 'Cauvery Co-operative Bank', ifsc: 'CCOB0000452' },
  { name: 'Deccan Gramin Bank', ifsc: 'DGBK0001187' },
  { name: 'Malabar Commercial Bank', ifsc: 'MCBL0000093' },
];
type Emp = (typeof EMPLOYEES)[number];
const isKarnataka = (location: string) => LOCATIONS.find((l) => l.name === location)?.state === 'Karnataka';
/** The run is "Monthly · Karnataka": only people of the Karnataka entity (Bengaluru head office) are paid by it. */
const KA_PEOPLE = EMPLOYEES.filter((e) => isKarnataka(e.location));
/** Net from the run's payslip (PAY-03) where the run lists the person; same formula otherwise. */
const netFor = (e: Emp) => RUN_ROWS.find((r) => r.id === e.id)?.net ?? Math.round(Math.round((e.ctc * 0.92) / 10) * 10 * 0.84);
/** Exceptions go to ordinary staff from EMPLOYEES 48 on (pay-data KA_LATER); never department heads or signed-in personas. */
const KA_OTHERS = KA_PEOPLE.filter((e) => EMPLOYEES.indexOf(e) >= 48);
const PICK = { heldA: KA_OTHERS[0].id, heldB: KA_OTHERS[1].id, returned: KA_OTHERS[2].id, failed: KA_OTHERS[3].id };
const CHEQUE_ID = [...KA_OTHERS.slice(4)].sort((a, b) => netFor(a) - netFor(b))[0].id;

export const PAY_LINES: PayLine[] = KA_PEOPLE.map((e, i) => {
  const run = RUN_ROWS.find((r) => r.id === e.id);
  const bank = BANKS[i % 3];
  const base = { id: e.id, employee: e.name, code: e.code, amount: netFor(e) };
  const inBank = { ...base, mode: 'Bank' as const, bank: bank.name, account: `00${4512 + i * 37}0000${1880 + i}`, ifsc: bank.ifsc };
  if (run?.mode === 'Cash') return { ...base, mode: 'Cash', status: 'Pending', approval: 'Bank account closed, new one not given yet. Cash approved by HR head', acknowledged: false };
  if (e.id === CHEQUE_ID) return { ...base, mode: 'Cheque', status: 'Pending', chequeNo: `0045${12 + i}`, approval: 'Account frozen by the bank. Cheque approved by finance', acknowledged: true };
  if (run?.status === 'Failed') return { ...inBank, status: 'Not calculated', reason: `Not paid · calculation failed: ${run.reason ?? ''}`, holdLink: { to: STORY.runFailed, label: 'Open run' } };
  if (e.id === PICK.heldA) return { ...inBank, status: 'Held', reason: 'Absconding: no attendance since 2 Sep', holdLink: { to: STORY.holds, label: 'Open hold' } };
  if (e.id === PICK.heldB) return { ...inBank, status: 'Held', reason: 'Pending documents: bank proof', holdLink: { to: STORY.holdRelease, label: 'Release' } };
  if (run?.status === 'Held') return { ...inBank, status: 'Held', reason: run.reason ?? 'Salary on hold', holdLink: { to: STORY.holds, label: 'Open hold' } };
  if (e.id === PICK.returned) return { ...inBank, bank: BANKS[2].name, ifsc: BANKS[2].ifsc, status: 'Returned', reason: 'Bank said: account closed', failure: { code: 'R03', newAccount: 'Deccan Gramin Bank ••••7731' } };
  if (e.id === PICK.failed) return { ...inBank, bank: BANKS[1].name, ifsc: 'DGBK001187', status: 'Failed', reason: 'Bank said: IFSC not valid', failure: { code: 'R12' } };
  return { ...inBank, status: 'Paid', reference: `KFB26273${10_000 + i * 7}` };
});

const isFailure = (r: PayLine) => r.status === 'Failed' || r.status === 'Returned';
const acct = (r: PayLine) => (r.bank && r.account ? `${r.bank} ••••${r.account.slice(-4)}` : '—');

interface BankFile {
  id: string;
  name: string;
  run: string;
  note?: string;
  payments: number;
  total: number;
  status: 'Released' | 'Replaced';
}
/** Payments in the September bank file: everyone in the run except held or failed payslips and cash or cheque. */
const IN_BANK_FILE = RUN.inBankFile;
/** August: that month's people less the salaries held in August (bank-failure holds were paid, then returned) and the cash or cheque lines. */
const AUG_RUN = RUN_HISTORY.find((h) => h.month === 'Aug')!;
const AUG_HELD = HOLDS.filter((h) => h.since < d(1) && h.reason !== 'Bank failure').length;
const AUG_PAYMENTS = AUG_RUN.employees - AUG_HELD - RUN.cashCheque;
const AUG_TOTAL = Math.round((AUG_RUN.net * AUG_PAYMENTS) / AUG_RUN.employees);
const BANK_FILES: BankFile[] = [
  { id: 'f1', name: 'KFD_SAL_202609_01.txt', run: 'September 2026 · Monthly', payments: IN_BANK_FILE, total: RUN.bankFileTotal, status: 'Released' },
  // PAY-11 F&F: FNF_LEAVER, last working day 29 Sep; net payable from the F&F lines.
  { id: 'f2', name: 'KFD_OFF_202609_02.txt', run: `F&F · ${FNF_LEAVER.name} (${FNF_LEAVER.code})`, payments: 1, total: FNF_NET, status: 'Released' },
  { id: 'f3', name: 'KFD_SAL_202608_02.txt', run: 'August 2026 · Monthly', payments: AUG_PAYMENTS, total: AUG_TOTAL, status: 'Released' },
  { id: 'f4', name: 'KFD_SAL_202608_01.txt', run: 'August 2026 · Monthly', note: 'Wrong debit account', payments: AUG_PAYMENTS, total: AUG_TOTAL, status: 'Replaced' },
];

/* Journal: every line is summed from the run's payslips (same formulas as pay-data), so employee deductions add up to RUN.deductions with no balancing figure. */
const J = RUN_ROWS.reduce(
  (a, r) => {
    const basic = Math.round(r.gross * 0.45);
    const pf = pfContribution(basic, { restrictToCeiling: true });
    const esi = esiContribution(r.gross);
    const pt = r.gross >= 25_000 ? 200 : 0;
    const tds = Math.round(computeTax(r.gross * 12, 'new').total / 12);
    const lop = Math.round((r.gross / 30) * r.lop);
    a.lop += lop;
    a.pfEe += pf.employee;
    a.pfEr += pf.eps + pf.epf;
    a.pfAdmin += pf.edli + Math.round(Math.min(basic, 15_000) * 0.005);
    a.esiEe += esi.employee;
    a.esiEr += esi.employer;
    a.pt += pt;
    a.tds += tds;
    a.loans += r.deductions - (pf.employee + esi.employee + pt + tds + lop);
    a.gratuity += Math.round(basic * 0.0481);
    return a;
  },
  { lop: 0, pfEe: 0, pfEr: 0, pfAdmin: 0, esiEe: 0, esiEr: 0, pt: 0, tds: 0, loans: 0, gratuity: 0 },
);
const JOURNAL: { ledger: string; debit: number; credit: number }[] = [
  { ledger: 'Salaries and wages (after unpaid leave)', debit: RUN.gross - J.lop, credit: 0 },
  { ledger: 'Employer PF, EDLI and admin charges', debit: J.pfEr + J.pfAdmin, credit: 0 },
  { ledger: 'Employer ESI', debit: J.esiEr, credit: 0 },
  { ledger: 'Gratuity provision', debit: J.gratuity, credit: 0 },
  { ledger: 'Net salary payable', debit: 0, credit: RUN.net },
  { ledger: 'TDS payable (salary)', debit: 0, credit: J.tds },
  { ledger: 'PF payable (employee, employer, EDLI and admin)', debit: 0, credit: J.pfEe + J.pfEr + J.pfAdmin },
  { ledger: 'ESI payable (employee and employer)', debit: 0, credit: J.esiEe + J.esiEr },
  { ledger: 'PT payable (Karnataka)', debit: 0, credit: J.pt },
  { ledger: 'Loan EMI and salary advance recoveries', debit: 0, credit: J.loans },
  { ledger: 'Gratuity liability', debit: 0, credit: J.gratuity },
].filter((l) => l.debit > 0 || l.credit > 0); // e.g. no ESI lines when nobody in the run is ESI-covered

const REPAY_ROUTE = {
  next: { button: 'Add to October bank file', when: 'in the October bank file on 30 Oct' },
  offcycle: { button: 'Create off-cycle payment', when: 'in an off-cycle bank file today, 29 Sep' },
  reimb: { button: 'Pay to reimbursement account', when: 'today, 29 Sep' },
} as const;
type RepayRoute = keyof typeof REPAY_ROUTE;

/** PAY-10 · Payments & files: payment status and failures, disbursement register, journal export. */
export function PaymentsScreen({ persona = 'pa', tab = 'status', state = 'ready', failure: openStatus }: { persona?: PayPersona; tab?: 'status' | 'register' | 'files' | 'journal'; state?: ViewState; failure?: 'Returned' | 'Failed' }) {
  // After Retry on the error state the panel loads (StateBlock waits 1.2 s), so the header follows it.
  const [retried, setRetried] = useState(false);
  const ready = state === 'ready' || (state === 'error' && retried);
  const defaultReason = (r: PayLine | null) => (r?.failure?.code === 'R03' ? 'Account closed. Employee gave a new account and the account check matched.' : '');
  const first = PAY_LINES.find((p) => p.status === openStatus) ?? null;
  const [failure, setFailure] = useState<PayLine | null>(first);
  const [route, setRoute] = useState<RepayRoute>('next');
  const [repayReason, setRepayReason] = useState(defaultReason(first));
  const [confirming, setConfirming] = useState(false);
  const [done, setDone] = useState<string | null>(null);
  const [acks, setAcks] = useState(PAY_LINES.filter((p) => p.acknowledged).map((p) => p.id));
  const [uploading, setUploading] = useState(false);
  const [format, setFormat] = useState('csv');
  const [lastExport, setLastExport] = useState<string | null>(null);
  /** R1: per-person amounts stay hidden until Show pay (each show is recorded). */
  const [showPay, setShowPay] = useState(false);
  const pay = (n: number) => (showPay ? formatINR(n) : '₹ •••');
  const lines = PAY_LINES.map((p) => (p.mode !== 'Bank' ? { ...p, status: (acks.includes(p.id) ? 'Paid' : 'Pending') as PayStatus } : p));
  const openFailure = (r: PayLine) => {
    setFailure(r);
    setRoute('next');
    setRepayReason(defaultReason(r));
  };
  const failedOrReturned = lines.filter(isFailure).length;
  const paidSum = lines.filter((r) => r.status === 'Paid').reduce((a, r) => a + r.amount, 0);
  const notPaidSum = lines.reduce((a, r) => a + r.amount, 0) - paidSum;
  const cols: TableColumn<PayLine>[] = [
    { key: 'employee', header: 'Employee', type: 'person', value: (r) => r.employee, person: (r) => ({ name: r.employee, secondary: r.code }), width: 220 },
    { key: 'amount', header: 'Amount', type: 'money', value: (r) => r.amount, render: (r) => pay(r.amount), width: 120 },
    {
      key: 'status',
      header: 'Status',
      value: (r) => (r.reason ? `${payStatusText(r)} · ${r.reason}` : payStatusText(r)),
      render: (r) => (
        <>
          <Badge tone={PAY_TONE[r.status]}>{payStatusText(r)}</Badge>
          {r.reason && (
            <>
              <br />
              <span className="yx-pay-note">{r.reason}</span>
            </>
          )}
        </>
      ),
      width: 260,
    },
    { key: 'bank', header: 'Bank account', value: acct, width: 220 },
    { key: 'ifsc', header: 'IFSC', type: 'id', value: (r) => r.ifsc ?? '—', width: 140, optional: true },
    { key: 'mode', header: 'Mode', value: (r) => r.mode, width: 80, optional: true },
    { key: 'ref', header: 'Bank reference', type: 'id', value: (r) => r.reference ?? '—', width: 150, optional: true },
  ];
  const register = lines.filter((p) => p.mode !== 'Bank');
  const acked = register.filter((r) => acks.includes(r.id)).length;
  const regCols: TableColumn<PayLine>[] = [
    { key: 'employee', header: 'Employee', type: 'person', value: (r) => r.employee, person: (r) => ({ name: r.employee, secondary: r.code }), width: 220 },
    { key: 'mode', header: 'Mode', value: (r) => (r.chequeNo ? `Cheque ${r.chequeNo}` : r.mode), width: 130 },
    { key: 'amount', header: 'Amount', type: 'money', value: (r) => r.amount, render: (r) => pay(r.amount), total: showPay ? 'sum' : undefined, width: 120 },
    { key: 'approval', header: 'Approved reason', value: (r) => r.approval ?? '', width: 300, optional: true },
    {
      key: 'ack',
      header: 'Receipt',
      value: (r) => (acks.includes(r.id) ? 'Signed receipt uploaded' : 'Waiting for receipt'),
      render: (r) => (acks.includes(r.id) ? <Badge tone="success">Receipt uploaded</Badge> : <Badge tone="warning">Waiting for receipt</Badge>),
      width: 160,
    },
  ];
  const fileCols: TableColumn<BankFile>[] = [
    { key: 'name', header: 'File', type: 'id', value: (r) => r.name, width: 220 },
    {
      key: 'run',
      header: 'Run',
      value: (r) => r.run,
      render: (r) => (
        <>
          {r.run}
          {r.note && (
            <>
              <br />
              <span className="yx-pay-note">{r.note}</span>
            </>
          )}
        </>
      ),
      width: 220,
    },
    { key: 'payments', header: 'Payments', type: 'number', value: (r) => r.payments, width: 100 },
    { key: 'total', header: 'Total', type: 'money', value: (r) => r.total, width: 140 },
    { key: 'status', header: 'Status', type: 'status', value: (r) => r.status, statusTone: (v) => (v === 'Replaced' ? 'neutral' : 'success'), width: 110 },
  ];
  const debits = JOURNAL.reduce((a, l) => a + l.debit, 0);
  const credits = JOURNAL.reduce((a, l) => a + l.credit, 0);
  const balanced = debits === credits;
  const exportJournal = () => {
    if (format === 'api') {
      setLastExport('Sent to accounting system, 29 Sep');
      setDone(`September journal sent to the accounting system · ${JOURNAL.length} ledgers · ${formatINR(debits)}`);
      return;
    }
    const csv = toCsv(['Ledger', 'Debit', 'Credit'], [...JOURNAL.map((l) => [l.ledger, String(l.debit), String(l.credit)]), ['Total', String(debits), String(credits)]]);
    saveFile(`journal-sep-2026.${format === 'tally' ? 'xml' : 'csv'}`, csv, format === 'tally' ? 'application/xml' : 'text/csv');
    setLastExport(`${format === 'tally' ? 'Tally (XML)' : 'CSV'}, 29 Sep`);
    setDone(`September journal exported as ${format === 'tally' ? 'Tally (XML)' : 'CSV'} · ${JOURNAL.length} ledgers`);
  };
  const repayTo = failure?.failure?.code === 'R03' && route !== 'reimb' ? failure.failure.newAccount : route === 'reimb' ? 'verified reimbursement account ••••2210' : null;
  const repayBlocked = !failure ? null : failure.failure?.code === 'R12' && route !== 'reimb' ? 'Waiting for the employee to correct the IFSC' : !repayReason.trim() ? 'Add a reason' : null;
  return (
    <PayFrame page="payments" persona={persona}>
      <PageHeader
        title="Payments & files"
        description={`${RUN.name} · bank file released 29 Sep, 10:05 am`}
        facts={ready ? `${RUN.employees} employees · ${IN_BANK_FILE - failedOrReturned} paid by bank · ${failedOrReturned} failed or returned · ${RUN.cashCheque} cash or cheque · ${RUN.withheld} held · ${RUN.failed} not calculated` : undefined}
        actions={
          <>
            <Button icon={showPay ? EyeOff : Eye} aria-pressed={showPay} disabled={!ready} onClick={() => setShowPay(!showPay)}>
              {showPay ? 'Hide pay' : 'Show pay'}
            </Button>
            <Button icon={Upload} disabled={!ready} onClick={() => setUploading(true)}>
              Upload bank response
            </Button>
            {persona === 'pa' &&
              (ready ? (
                <StoryButton to={STORY.offCycle} variant="primary">
                  Start off-cycle payment
                </StoryButton>
              ) : (
                <Button variant="primary" disabled>
                  Start off-cycle payment
                </Button>
              ))}
          </>
        }
      />
      <Done text={done} />
      {showPay && <p className="yx-pay-muted">Pay is showing. Each time you show it is recorded.</p>}
      <StateBlock state={state} rows={8} onRetry={() => setTimeout(() => setRetried(true), 1200)}>
      <Tabs defaultValue={tab}>
        <TabsList aria-label="Payments">
          <TabsTrigger value="status" count={lines.length}>
            Payment status
          </TabsTrigger>
          <TabsTrigger value="register" count={register.length}>
            Cash and cheque
          </TabsTrigger>
          <TabsTrigger value="files" count={BANK_FILES.length}>
            Bank files
          </TabsTrigger>
          <TabsTrigger value="journal">Journal export</TabsTrigger>
        </TabsList>
        <TabsContent value="status">
          <div className="yx-pay-stack">
            <DataTable
              label="Payment status"
              columns={cols}
              rows={lines}
              getRowId={(r) => r.id}
              pageSize={25}
              onRowClick={(r) => isFailure(r) && openFailure(r)}
              rowButtons={(r) =>
                isFailure(r) ? (
                  <Button size="sm" onClick={() => openFailure(r)}>
                    Re-pay
                  </Button>
                ) : r.holdLink ? (
                  <StoryButton to={r.holdLink.to} size="sm">
                    {r.holdLink.label}
                  </StoryButton>
                ) : null
              }
              onExport={() => {
                saveFile('payment-status-sep-2026.csv', tableToCsv(lines, cols));
                setDone(`Payment status exported (${lines.length} rows)`);
              }}
            />
            <p className="yx-pay-muted">
              Paid {pay(paidSum)} · not paid yet {pay(notPaidSum)} (held, not calculated, failed, returned or waiting for a receipt)
            </p>
          </div>
        </TabsContent>
        <TabsContent value="register">
          <div className="yx-pay-stack">
            <InlineAlert tone="info">Cash and cheque are on for this company. Each payslip needs a signature or acknowledgement upload before the period closes.</InlineAlert>
            <DataTable
              label="Cash and cheque register"
              columns={regCols}
              rows={register}
              getRowId={(r) => r.id}
              rowButtons={(r) =>
                acks.includes(r.id) ? null : (
                  <Button
                    size="sm"
                    icon={Upload}
                    onClick={() => {
                      setAcks((a) => [...a, r.id]);
                      setDone(`Signed receipt uploaded for ${r.employee} (${formatINR(r.amount)} ${r.mode.toLowerCase()})`);
                    }}
                  >
                    Upload acknowledgement
                  </Button>
                )
              }
            />
            <p className="yx-pay-muted">
              {acked} of {register.length} acknowledged · {formatINR(register.reduce((a, r) => a + r.amount, 0))} in total ·{' '}
              {acked === register.length ? 'every line is acknowledged, the period can close' : 'the period can close when every line is acknowledged'}
            </p>
          </div>
        </TabsContent>
        <TabsContent value="files">
          <DataTable
            label="Bank files"
            columns={fileCols}
            rows={BANK_FILES}
            getRowId={(r) => r.id}
            rowButtons={(r) => (
              <Button
                size="sm"
                icon={Download}
                onClick={() => {
                  saveFile(r.name, `${r.name}\n${r.run}\nPayments: ${r.payments}\nTotal: ${r.total}\n`, 'text/plain');
                  setDone(`${r.name} downloaded (${groupIndian(r.payments)} ${r.payments === 1 ? 'payment' : 'payments'}, ${formatINR(r.total)})`);
                }}
              >
                Download
              </Button>
            )}
          />
        </TabsContent>
        <TabsContent value="journal">
          <div className="yx-pay-stack">
            <FactRow
              items={[
                { label: 'Journal', value: 'September 2026 salary' },
                { label: 'Lines', value: `${JOURNAL.length} ledgers` },
                { label: 'Debits and credits', value: balanced ? `Both ${formatINR(debits)}` : `Debits ${formatINR(debits)} · credits ${formatINR(credits)}` },
                { label: 'Last export', value: lastExport ?? 'Not exported' },
              ]}
            />
            {!balanced && (
              <InlineAlert tone="danger" title={`Debits and credits differ by ${formatINR(Math.abs(debits - credits))}`}>
                The journal can't be exported until it balances. Check the run's deductions and employer contributions.
              </InlineAlert>
            )}
            <FormField label="Export to">
              <RadioGroup
                value={format}
                onChange={setFormat}
                orientation="horizontal"
                options={[
                  { value: 'tally', label: 'Tally (XML)' },
                  { value: 'csv', label: 'CSV' },
                  { value: 'api', label: 'Send to accounting system' },
                ]}
              />
            </FormField>
            <div className="yx-scroll-x" tabIndex={0} role="region" aria-label="Table, scrolls sideways on small screens">
            <table className="yx-pay-table">
              <thead>
                <tr>
                  <th scope="col">Ledger</th>
                  <th scope="col" data-num>
                    Debit
                  </th>
                  <th scope="col" data-num>
                    Credit
                  </th>
                </tr>
              </thead>
              <tbody>
                {JOURNAL.map((l) => (
                  <tr key={l.ledger}>
                    <th scope="row">{l.ledger}</th>
                    <td data-num>{l.debit ? formatINR(l.debit) : ''}</td>
                    <td data-num>{l.credit ? formatINR(l.credit) : ''}</td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr>
                  <th scope="row">Total</th>
                  <td data-num>{formatINR(debits)}</td>
                  <td data-num>{formatINR(credits)}</td>
                </tr>
              </tfoot>
            </table>
            </div>
            <div className="yx-pay-row">
              <Button variant="primary" icon={format === 'api' ? undefined : Download} disabled={!balanced} onClick={exportJournal}>
                {format === 'api' ? 'Send journal' : 'Export journal'}
              </Button>
              {!balanced && <span className="yx-pay-note">Debits and credits must match</span>}
            </div>
          </div>
        </TabsContent>
      </Tabs>
      </StateBlock>
      <Drawer
        open={uploading}
        onOpenChange={setUploading}
        title="Upload bank response"
        subtitle="The bank's response file for KFD_SAL_202609_01.txt. Each payment's status updates from it."
        footer={
          <>
            <Button onClick={() => setUploading(false)}>Cancel</Button>
            <Button
              variant="primary"
              onClick={() => {
                setUploading(false);
                setDone(`Bank response applied · ${IN_BANK_FILE - failedOrReturned} paid · ${failedOrReturned} failed or returned`);
              }}
            >
              Apply response
            </Button>
          </>
        }
      >
        <FileUpload upload={okUpload} accept={['.txt', '.csv']} multiple={false} />
      </Drawer>
      <Drawer
        open={!!failure}
        onOpenChange={(o) => !o && setFailure(null)}
        title={`Payment ${failure?.status.toLowerCase() ?? ''}: ${failure?.employee ?? ''}`}
        subtitle={failure?.reason}
        size="lg"
        footer={
          <>
            <Button onClick={() => setFailure(null)}>Cancel</Button>
            {repayBlocked && <span className="yx-pay-note">{repayBlocked}</span>}
            <Button variant="primary" disabled={!!repayBlocked} onClick={() => setConfirming(true)}>
              {REPAY_ROUTE[route].button}
            </Button>
          </>
        }
      >
        {failure && (
          <div className="yx-pay-stack">
            <FactRow
              items={[
                { label: 'Amount', value: <Amount value={failure.amount} strong /> },
                { label: 'Sent to', value: `${acct(failure)} on 29 Sep` },
                { label: failure.status, value: '29 Sep' },
              ]}
            />
            <InlineAlert tone="info" title="Employee notified">
              In the app and by SMS (no amounts), asking them to {failure.failure?.code === 'R12' ? 'correct the IFSC of their account' : 'give a new bank account'}. Sent 29 Sep, 10:40 am.
            </InlineAlert>
            <FormSection title="Bank details">
              <DescriptionList
                items={
                  failure.failure?.code === 'R03'
                    ? [
                        { label: 'Bank said', value: 'Account closed' },
                        { label: 'New account', value: `${failure.failure.newAccount} (given 29 Sep)` },
                        { label: 'Account check', value: <Badge tone="success">Name matched (₹1 test deposit)</Badge> },
                        { label: 'Waiting period before paying a new account', value: 'Waived after a second person approved the change' },
                      ]
                    : [
                        { label: 'Bank said', value: 'IFSC not valid' },
                        { label: 'IFSC on file', value: `${failure.ifsc ?? '—'} (an IFSC has 11 characters)` },
                        { label: 'Corrected IFSC', value: <Badge tone="warning">Waiting for employee</Badge> },
                      ]
                }
              />
            </FormSection>
            <FormField label="Pay through" required>
              <RadioGroup
                value={route}
                onChange={(v) => setRoute(v as RepayRoute)}
                options={[
                  { value: 'next', label: 'Next bank file', description: 'Included in the October bank file, paid 30 Oct.' },
                  { value: 'offcycle', label: 'Off-cycle payment now', description: 'Its own bank file today, same approval.' },
                  { value: 'reimb', label: 'Verified reimbursement account ••••2210', description: 'Interim payment; needs a reason and is audited.' },
                ]}
              />
            </FormField>
            <FormField label="Reason" required>
              <TextArea rows={2} value={repayReason} onChange={setRepayReason} />
            </FormField>
          </div>
        )}
      </Drawer>
      <ConfirmDialog
        open={confirming}
        onOpenChange={setConfirming}
        title={failure ? `Pay ${formatINR(failure.amount)} to ${repayTo ?? acct(failure)}?` : ''}
        consequence={failure ? `${failure.employee} is paid ${REPAY_ROUTE[route].when}. The reason is saved in the audit trail.` : undefined}
        confirmLabel={REPAY_ROUTE[route].button}
        onConfirm={() => {
          if (!failure) return;
          setDone(`${formatINR(failure.amount)} for ${failure.employee} will be paid to ${repayTo ?? acct(failure)} ${REPAY_ROUTE[route].when}`);
          setFailure(null);
        }}
      />
    </PayFrame>
  );
}

/* ================================================================== PAY-19 Court orders, carry-forwards, overpayments */

export interface CourtOrder {
  id: string;
  employee: string;
  code: string;
  ref: string;
  court: string;
  amount: string;
  /** Amount remitted each month. */
  monthly: number;
  priority: number;
  payee: string;
  /** Date of the order: earlier orders are deducted first. */
  orderDate: Date;
  /** First month deducted. */
  start: Date;
  /** Months remitted before September. */
  paidMonths: number;
  remitted: number;
  total: number;
  endDate: Date;
  status: 'Active' | 'Completed';
}
/**
 * Current Karnataka staff with a clean September payslip who appear nowhere else in Pay (not PAY-10's holds, bank
 * exceptions or cheque line), so codes match the one employee list.
 */
const SPARE = KA_OTHERS.slice(4)
  .filter((e) => e.status === 'Active' && e.id !== CHEQUE_ID && RUN_ROWS.find((r) => r.id === e.id)?.status === 'Calculated')
  .reverse();
/** Months from the start month to the end month, both included. */
const monthsInclusive = (a: Date, b: Date) => monthsApart(a, b) + 1;
const order = (o: Omit<CourtOrder, 'remitted' | 'total' | 'priority'>): Omit<CourtOrder, 'priority'> => ({ ...o, remitted: o.monthly * o.paidMonths, total: o.monthly * monthsInclusive(o.start, o.endDate) });
/** Priority follows the order date (earliest first). */
const withPriority = (os: Omit<CourtOrder, 'priority'>[]): CourtOrder[] => os.map((o) => ({ ...o, priority: os.filter((x) => x.orderDate < o.orderDate).length + 1 }));
export const COURT_ORDERS: CourtOrder[] = withPriority([
  order({ id: 'co1', employee: SPARE[0].name, code: SPARE[0].code, ref: 'MC 214/2026', court: 'Family Court, Bengaluru', amount: '₹12,000 a month (maintenance)', monthly: 12_000, payee: 'Court deposit account', orderDate: d(12, 4), start: d(1, 5), paidMonths: 3, endDate: d(31, 4, 2027), status: 'Active' }),
  order({ id: 'co2', employee: SPARE[1].name, code: SPARE[1].code, ref: 'OS 88/2025', court: 'City Civil Court, Bengaluru', amount: '25% of net (decree)', monthly: 15_600, payee: 'Decree holder via court', orderDate: d(2, 5), start: d(1, 5), paidMonths: 3, endDate: d(31, 2, 2027), status: 'Active' }),
]);

export interface Recovery {
  id: string;
  employee: string;
  code: string;
  kind: 'Carry-forward' | 'Overpayment';
  origin: string;
  balance: number;
  plan: string;
  note?: string;
  consent: 'Acknowledged' | 'Waiting' | 'Not needed';
  status: 'Recovering' | 'Needs consent' | 'Write-off asked' | 'Closed';
}
export const RECOVERIES: Recovery[] = [
  { id: 'r1', employee: SPARE[2].name, code: SPARE[2].code, kind: 'Carry-forward', origin: 'Negative net in July (−₹4,000)', balance: 4_000, plan: 'October run', note: 'Deferred in Aug and Sep: protected net', consent: 'Not needed', status: 'Recovering' },
  { id: 'r2', employee: SPARE[3].name, code: SPARE[3].code, kind: 'Overpayment', origin: 'Duplicate HRA in June 2026', balance: 15_000, plan: '₹3,000 × 5 months left', note: '1 of 6 recovered in September', consent: 'Acknowledged', status: 'Recovering' },
  // Left the company in March, so the code is not in the current employee list.
  { id: 'r3', employee: 'Karthik Nair', code: 'KF-0261', kind: 'Overpayment', origin: 'Paid after last working day, 31 Mar 2026', note: 'Previous tax year (Form 10E)', balance: 21_500, plan: '₹5,375 × 4 months', consent: 'Waiting', status: 'Needs consent' },
  { id: 'r4', employee: SPARE[4].name, code: SPARE[4].code, kind: 'Overpayment', origin: 'Incentive paid twice, Feb 2025', balance: 2_300, plan: 'Write off', note: 'Below the cost of recovery', consent: 'Not needed', status: 'Write-off asked' },
];

/** PAY-19 · Court orders, carry-forwards & overpayment recoveries (T2 / T3) with the deduction-cap preview. */
export function RecoveriesScreen({ tab = 'court', state = 'ready', openId }: { tab?: 'court' | 'carry' | 'over' | 'cap'; state?: ViewState; openId?: string }) {
  const [orders, setOrders] = useState(COURT_ORDERS);
  const [openRef, setOpenRef] = useState<string | null>(COURT_ORDERS.find((c) => c.id === openId)?.id ?? null);
  const open = orders.find((c) => c.id === openRef) ?? null;
  const setOpen = (c: CourtOrder | null) => setOpenRef(c?.id ?? null);
  const [septRemitted, setSeptRemitted] = useState<string[]>([]);
  const [recoveries, setRecoveries] = useState(RECOVERIES);
  const [writeOff, setWriteOff] = useState<Recovery | null>(null);
  const [done, setDone] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);
  const [newWho, setNewWho] = useState('');
  const [newRef, setNewRef] = useState('');
  const [newCourt, setNewCourt] = useState('');
  const [newMonthly, setNewMonthly] = useState<number | null>(null);
  const [newOrderDate, setNewOrderDate] = useState<Date | null>(null);
  const [newEnd, setNewEnd] = useState<Date | null>(null);
  const [remitting, setRemitting] = useState<CourtOrder | null>(null);
  const [remitRef, setRemitRef] = useState('');
  const newPerson = findRunPerson(newWho);
  // Deductions start with the October 2026 run and run to the end month.
  const OCT = d(1, 9);
  const newMonths = newEnd ? monthsInclusive(OCT, newEnd) : 0;
  const newMissing = !newWho.trim()
    ? 'Choose the employee'
    : !newPerson
      ? 'No one with that name or ID in this pay group'
      : !newRef.trim()
        ? 'Enter the order reference'
        : !newCourt.trim()
          ? 'Enter the court'
          : !newOrderDate
            ? 'Enter the order date'
            : !newMonthly
              ? 'Enter the monthly amount'
              : newMonths < 1
                ? 'Choose an end date in October 2026 or later'
                : null;
  const newPriority = newOrderDate ? orders.filter((o) => o.orderDate <= newOrderDate).length + 1 : orders.length + 1;
  const addOrder = () => {
    if (newMissing || !newMonthly || !newPerson || !newOrderDate || !newEnd) return;
    const added = order({ id: `co${orders.length + 1}-new`, employee: newPerson.name, code: newPerson.code, ref: newRef.trim(), court: newCourt.trim(), amount: `${formatINR(newMonthly)} a month`, monthly: newMonthly, payee: 'Court deposit account', orderDate: newOrderDate, start: OCT, paidMonths: 0, endDate: newEnd, status: 'Active' });
    setOrders((os) => withPriority([...os, added]));
    setDone(`Court order ${newRef.trim()} added for ${newPerson.name} · priority ${newPriority} (order date ${formatDate(newOrderDate)}) · deducted from the October run`);
    setAdding(false);
    setNewWho('');
    setNewRef('');
    setNewCourt('');
    setNewMonthly(null);
    setNewOrderDate(null);
    setNewEnd(null);
  };
  const recordRemittance = (c: CourtOrder) => {
    setOrders((os) => os.map((o) => (o.id === c.id ? { ...o, remitted: o.remitted + o.monthly } : o)));
    setSeptRemitted((s) => [...s, c.id]);
    setDone(`September remittance of ${formatINR(c.monthly)} recorded for ${c.ref} (${c.employee}) · payment reference ${remitRef.trim()}`);
    setRemitting(null);
    setRemitRef('');
  };
  const wages = 48_000;
  const first = COURT_ORDERS[0];
  const lines: DeductionLine[] = [
    { id: 's', label: 'PF, ESI, PT, TDS', kind: 'statutory', amount: 7_420 },
    { id: 'c', label: `Court order ${first.ref}`, kind: 'court', amount: first.monthly, priority: first.priority },
    { id: 'e', label: 'Earned wage access recovery', kind: 'ewa', amount: 3_000 },
    { id: 'l', label: 'Personal loan EMI', kind: 'loan', amount: 8_864 },
    { id: 'a', label: 'Expense advance instalment', kind: 'advance', amount: 2_500 },
  ];
  const cap = applyDeductionCap(wages, lines, 50, 12_000);
  const cols: TableColumn<Recovery>[] = [
    { key: 'employee', header: 'Employee', type: 'person', value: (r) => r.employee, person: (r) => ({ name: r.employee, secondary: r.code }), width: 220 },
    { key: 'origin', header: 'Origin', value: (r) => r.origin, width: 300 },
    { key: 'balance', header: 'Balance', type: 'money', value: (r) => r.balance, total: 'sum', width: 110 },
    {
      key: 'plan',
      header: 'Plan',
      value: (r) => (r.note ? `${r.plan} · ${r.note}` : r.plan),
      render: (r) => (
        <>
          {r.plan}
          {r.note && (
            <>
              <br />
              <span className="yx-pay-note">{r.note}</span>
            </>
          )}
        </>
      ),
      width: 260,
    },
    // Consent shows in the status ("Needs consent"), so it has no column of its own.
    { key: 'status', header: 'Status', type: 'status', value: (r) => r.status, statusTone: (v) => (v === 'Recovering' ? 'info' : v === 'Closed' ? 'success' : 'warning'), width: 170 },
  ];
  const orderCols: TableColumn<CourtOrder>[] = [
    { key: 'employee', header: 'Employee', type: 'person', value: (c) => c.employee, person: (c) => ({ name: c.employee, secondary: c.code }), width: 220 },
    {
      key: 'ref',
      header: 'Order',
      value: (c) => `${c.ref} · ${c.court} · ${c.payee}`,
      render: (c) => (
        <>
          {c.ref}
          <br />
          <span className="yx-pay-note">
            {c.court} · pays {c.payee.toLowerCase()}
          </span>
        </>
      ),
      width: 280,
    },
    { key: 'amount', header: 'Amount', value: (c) => c.amount, width: 190 },
    { key: 'priority', header: 'Priority', type: 'number', value: (c) => c.priority, width: 110, optional: true },
    { key: 'remitted', header: 'Remitted / total', type: 'money', value: (c) => c.remitted, render: (c) => `${formatINR(c.remitted)} / ${formatINR(c.total)}`, width: 190 },
    { key: 'ends', header: 'Ends', type: 'date', value: (c) => c.endDate, width: 120 },
  ];
  const openMonths = open ? Array.from({ length: Math.max(0, monthsInclusive(open.start, d(1))) }, (_, i) => new Date(open.start.getFullYear(), open.start.getMonth() + i, 1)) : [];
  return (
    <PayFrame page="loans">
      <PageHeader
        title="Court orders and recoveries"
        description="Court orders, unpaid balances carried to the next run, and overpayment recovery plans. Total deductions stay within the legal cap."
        actions={
          <Button variant="primary" icon={Plus} disabled={state !== 'ready'} onClick={() => setAdding(true)}>
            Add court order
          </Button>
        }
      />
      <Done text={done} />
      <StateBlock state={state} rows={6}>
        <Tabs defaultValue={tab}>
          <TabsList aria-label="Recoveries">
            <TabsTrigger value="court" count={orders.length}>
              Court orders
            </TabsTrigger>
            <TabsTrigger value="carry" count={recoveries.filter((r) => r.kind === 'Carry-forward').length}>
              Carry-forwards
            </TabsTrigger>
            <TabsTrigger value="over" count={recoveries.filter((r) => r.kind === 'Overpayment').length}>
              Overpayments
            </TabsTrigger>
            <TabsTrigger value="cap">Deduction cap check</TabsTrigger>
          </TabsList>
          <TabsContent value="court">
            <DataTable
              label="Court orders"
              columns={orderCols}
              rows={orders}
              getRowId={(c) => c.id}
              onRowClick={setOpen}
              activeRowId={open?.id}
              rowButtons={(c) => (
                <Button size="sm" onClick={() => setOpen(c)}>
                  Open
                </Button>
              )}
              empty={<EmptyState title="No court orders." description="Add an order when the company receives one; deductions start with the next open run." action={<Button icon={Plus} onClick={() => setAdding(true)}>Add court order</Button>} />}
            />
          </TabsContent>
          <TabsContent value="carry">
            <DataTable label="Carry-forward balances" columns={cols} rows={recoveries.filter((r) => r.kind === 'Carry-forward')} getRowId={(r) => r.id} />
          </TabsContent>
          <TabsContent value="over">
            <div className="yx-pay-stack">
              <InlineAlert tone="info">An overpayment is recovered only by a plan the employee acknowledges. A write-off needs approval with a reason.</InlineAlert>
              <DataTable
                label="Overpayment plans"
                columns={cols}
                rows={recoveries.filter((r) => r.kind === 'Overpayment')}
                getRowId={(r) => r.id}
                rowButtons={(r) =>
                  r.status === 'Write-off asked' ? (
                    <Button size="sm" variant="review" onClick={() => setWriteOff(r)}>
                      Review write-off
                    </Button>
                  ) : r.consent === 'Waiting' ? (
                    <Button size="sm" onClick={() => setDone(`Reminder sent to ${r.employee} to acknowledge the plan (${r.plan})`)}>
                      Send reminder
                    </Button>
                  ) : null
                }
              />
            </div>
          </TabsContent>
          <TabsContent value="cap">
            <CapPreview wages={wages} result={cap} />
          </TabsContent>
        </Tabs>
      </StateBlock>
      <Drawer
        open={!!open}
        onOpenChange={(o) => !o && setOpen(null)}
        title={`Court order ${open?.ref ?? ''}`}
        subtitle={open ? `${open.employee} · ${open.court}` : undefined}
        size="lg"
        footer={
          <>
            <Button onClick={() => setOpen(null)}>Close</Button>
            {open && (open.start > d(1) ? <span className="yx-pay-note">Deductions start with the October run</span> : septRemitted.includes(open.id) && <span className="yx-pay-note">September is already remitted</span>)}
            <Button variant="primary" disabled={!open || open.start > d(1) || septRemitted.includes(open.id)} onClick={() => open && setRemitting(open)}>
              Record September remittance
            </Button>
          </>
        }
      >
        {open && (
          <div className="yx-pay-stack">
            <DescriptionList
              columns={2}
              items={[
                { label: 'Amount', value: open.amount },
                { label: 'Priority', value: `${open.priority} (order dated ${formatDate(open.orderDate)})` },
                { label: 'Payee', value: open.payee },
                { label: 'Deducted', value: `${monthLabel(open.start)} to ${monthLabel(open.endDate)} (${plural(monthsInclusive(open.start, open.endDate), 'month')})` },
                { label: 'Remitted', value: `${formatINR(open.remitted)} of ${formatINR(open.total)}` },
                { label: 'Remaining', value: formatINR(open.total - open.remitted) },
              ]}
            />
            {openMonths.length ? (
              <div className="yx-scroll-x" tabIndex={0} role="region" aria-label="Remittances, scrolls sideways on small screens">
                <table className="yx-pay-table">
                  <caption>Remittances</caption>
                  <tbody>
                    {openMonths.map((m, i) => (
                      <tr key={m.getMonth()}>
                        <th scope="row">{monthLabel(m)}</th>
                        <td data-num>{formatINR(open.monthly)}</td>
                        <td>{i < open.paidMonths || septRemitted.includes(open.id) ? <Badge tone="success">Remitted</Badge> : <Badge tone="warning">Due with September run</Badge>}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <p className="yx-pay-muted">No remittances yet. The first deduction is in the October run.</p>
            )}
          </div>
        )}
      </Drawer>
      <ConfirmDialog
        open={!!remitting}
        onOpenChange={(o) => {
          if (!o) {
            setRemitting(null);
            setRemitRef('');
          }
        }}
        title={remitting ? `Record ${formatINR(remitting.monthly)} paid to the ${remitting.payee.toLowerCase()} for ${remitting.ref} (September)?` : ''}
        consequence={remitting ? `Remitted becomes ${formatINR(remitting.remitted + remitting.monthly)} of ${formatINR(remitting.total)}. The payment reference is saved in the audit trail.` : undefined}
        confirmLabel="Record remittance"
        confirmDisabled={!remitRef.trim()}
        onConfirm={() => {
          if (remitting) recordRemittance(remitting);
        }}
      >
        <FormField label="Payment reference" required helper="The bank or challan reference of the payment to the court.">
          <TextField value={remitRef} onChange={setRemitRef} placeholder="UTR or challan number" />
        </FormField>
      </ConfirmDialog>
      <Drawer
        open={adding}
        onOpenChange={setAdding}
        title="Add court order"
        subtitle="Deductions start with the next open run. Priority follows the order date."
        footer={
          <>
            <Button onClick={() => setAdding(false)}>Cancel</Button>
            {newMissing && <span className="yx-pay-note">{newMissing}</span>}
            <Button variant="primary" disabled={!!newMissing} onClick={addOrder}>
              Add court order
            </Button>
          </>
        }
      >
        <div className="yx-pay-stack">
          <FormField label="Employee" required helper={newPerson ? `${newPerson.name} · ${newPerson.code} · net ${formatINR(newPerson.net)} a month` : 'Name or employee ID'}>
            <TextField value={newWho} onChange={setNewWho} placeholder="Search employee" />
          </FormField>
          <FieldRow>
            <FormField label="Order reference" required>
              <TextField value={newRef} onChange={setNewRef} placeholder="MC 301/2026" />
            </FormField>
            <FormField label="Court" required>
              <TextField value={newCourt} onChange={setNewCourt} placeholder="Family Court, Bengaluru" />
            </FormField>
          </FieldRow>
          <FieldRow>
            <FormField label="Order date" required helper={newOrderDate ? `Priority ${newPriority} of ${orders.length + 1}` : 'Sets the priority: earlier orders are deducted first.'}>
              <DatePicker value={newOrderDate} onChange={setNewOrderDate} max={TODAY} />
            </FormField>
            <FormField label="Amount each month" required>
              <CurrencyField value={newMonthly} onChange={setNewMonthly} />
            </FormField>
          </FieldRow>
          <FormField label="End date" required helper={newMonths > 0 && newMonthly ? `${plural(newMonths, 'month')} from October · ${formatINR(newMonthly * newMonths)} in total` : 'Last month of deduction.'}>
            <DatePicker value={newEnd} onChange={setNewEnd} min={OCT} />
          </FormField>
        </div>
      </Drawer>
      <ConfirmDialog
        open={!!writeOff}
        onOpenChange={(o) => !o && setWriteOff(null)}
        title={writeOff ? `Approve write-off of ${formatINR(writeOff.balance)} for ${writeOff.employee}?` : ''}
        consequence={writeOff ? `${writeOff.origin}. ${writeOff.plan}. The balance is closed and not recovered.` : undefined}
        confirmLabel="Approve write-off"
        confirmVariant="approve"
        onConfirm={() => {
          if (!writeOff) return;
          setRecoveries((rs) => rs.map((r) => (r.id === writeOff.id ? { ...r, balance: 0, status: 'Closed' } : r)));
          setDone(`Write-off of ${formatINR(writeOff.balance)} for ${writeOff.employee} approved`);
          setWriteOff(null);
        }}
      />
    </PayFrame>
  );
}

type CapLine = ReturnType<typeof applyDeductionCap>['lines'][number];
const capCols: TableColumn<CapLine>[] = [
  { key: 'label', header: 'Deduction', value: (l) => l.label, width: 260 },
  { key: 'due', header: 'Due', type: 'money', value: (l) => l.amount, total: 'sum', width: 120 },
  { key: 'deducted', header: 'Deducted', type: 'money', value: (l) => l.deducted, total: 'sum', width: 120 },
  { key: 'deferred', header: 'Deferred', type: 'money', value: (l) => l.deferred, render: (l) => (l.deferred ? formatINR(l.deferred) : '—'), total: 'sum', width: 120 },
];

function CapPreview({ wages, result }: { wages: number; result: ReturnType<typeof applyDeductionCap> }) {
  return (
    <div className="yx-pay-stack">
      <FactRow
        items={[
          { label: 'Employee', value: `${COURT_ORDERS[0].employee} · ${COURT_ORDERS[0].code}` },
          { label: 'Wages this month', value: formatINR(wages) },
          { label: 'Legal cap (Code on Wages)', value: `50% · ${formatINR(result.cap)}` },
          { label: 'Protected net (company)', value: formatINR(12_000) },
          { label: 'Net pay', value: <Amount value={result.net} strong /> },
        ]}
      />
      <DataTable
        label="Deductions in priority order"
        columns={capCols}
        rows={result.lines}
        getRowId={(l) => l.id}
        rowNoun={['deduction', 'deductions']}
        cardSummary
      />
      <p className="yx-pay-muted">Deducted in this order: statutory, court orders (by order date), earned wage access, loans, advances, carry-forwards. Deferred amounts move to the next run to stay within the cap; that is law, not company policy.</p>
    </div>
  );
}

/* ================================================================== PAY-20 Payslip query queue */

const Q_TONE: Record<QueryRow['status'], BadgeTone> = { New: 'info', 'In progress': 'warning', 'Waiting for employee': 'neutral', Resolved: 'success' };
const OTHER_ASSIGNEE = 'Priya Nair';
const UNASSIGNED = 'Unassigned';
const at = (day: number, month: number, h: number, m: number) => new Date(2026, month, day, h, m);

/** What the payslip line says and why, and the reply already sent (if any). The time the query came in is QueryRow.raised. */
const QUERY_INFO: Record<string, { amount: string; cause: string; reply?: { body: string; at: Date; by: string }; waitingSince?: Date }> = {
  q1: { amount: `−${formatINR(4_664)} (1 day, ${MY_LOP_DAY} Sep)`, cause: `Attendance ${MY_LOP_DAY} Sep: absent, no approved leave` },
  q2: {
    amount: `${formatINR(6_450)} (+${formatINR(2_100)} on August)`,
    cause: `Referral bonus ${formatINR(25_000)} paid in September raised the projected tax for the year`,
    reply: { body: `Your September TDS includes tax on the ${formatINR(25_000)} referral bonus; the tax for the rest of the year was recalculated.`, at: at(29, 8, 9, 15), by: PAYROLL_ADMIN.name },
  },
  q3: {
    amount: `Net ${formatINR(38_940)} for August`,
    cause: 'Paid 31 Aug; the bank returned it on 2 Sep (account closed). Needs the new account details.',
    waitingSince: d(3),
    reply: { body: 'Your bank returned the August salary because the account is closed. Please add your new account in My pay › Bank details and we will pay it in the next bank file.', at: at(3, 8, 11, 30), by: PAYROLL_ADMIN.name },
  },
  q4: { amount: `${formatINR(2_400)} (8 nights × ${formatINR(300)})`, cause: 'The rota shows 8 approved night shifts; 3 more are waiting for manager approval' },
  q5: {
    amount: `${formatINR(1_800)} (12% of ${formatINR(15_000)})`,
    cause: 'The ₹15,000 ceiling applies from August; July was corrected as arrears',
    reply: { body: 'The ceiling is now applied. July\'s extra PF was refunded in your August payslip.', at: at(10, 7, 12, 0), by: PAYROLL_ADMIN.name },
  },
  q6: {
    amount: `${formatINR(200)} Karnataka + ${formatINR(208)} Tamil Nadu`,
    cause: 'Transferred to Chennai on 14 Sep; both states charged PT for September',
    reply: { body: 'Checking with the Chennai office: only one state should charge PT for September. We will refund the extra in October.', at: at(28, 8, 10, 20), by: OTHER_ASSIGNEE },
  },
};
const QUERY_ROWS: QueryRow[] = QUERIES;
const dayOnly = (x: Date) => new Date(x.getFullYear(), x.getMonth(), x.getDate());
/** Reply target: 2 working days (Mon–Fri) after the query came in; days from today to that date. */
function replyDue(raised: Date) {
  const due = dayOnly(raised);
  for (let n = 0; n < 2; ) {
    due.setDate(due.getDate() + 1);
    if (due.getDay() !== 0 && due.getDay() !== 6) n++;
  }
  return Math.round((due.getTime() - dayOnly(TODAY).getTime()) / 86_400_000);
}
const dueText = (q: QueryRow) => {
  if (q.status === 'Resolved') return '—';
  const w = QUERY_INFO[q.id]?.waitingSince;
  if (q.status === 'Waiting for employee') return `Paused since ${w ? `${w.getDate()} ${MON[w.getMonth()]}` : formatDate(q.raised)}`;
  const n = replyDue(q.raised);
  return n < 0 ? `Overdue ${plural(-n, 'day')}` : n === 0 ? 'Today' : `In ${plural(n, 'day')}`;
};

/** PAY-20 · Payslip query queue (T2) with in-app reply thread. */
export function QueryQueueScreen({ state = 'ready', openId, rows: initialRows = QUERY_ROWS }: { state?: ViewState; openId?: string; rows?: QueryRow[] }) {
  const [rows, setRows] = useState(initialRows);
  const [openRef, setOpenRef] = useState<string | null>(initialRows.find((q) => q.id === openId)?.id ?? null);
  const open = rows.find((q) => q.id === openRef) ?? null;
  const setOpen = (q: QueryRow | null) => setOpenRef(q?.id ?? null);
  const [selected, setSelected] = useState<string[]>([]);
  const [done, setDone] = useState<string | null>(null);
  const [assignTo, setAssignTo] = useState<string | null>(null);
  const [replied, setReplied] = useState<string[]>([]);
  const ASSIGNEES = [PAYROLL_ADMIN.name, OTHER_ASSIGNEE];
  const ready = state === 'ready';
  const openCount = rows.filter((r) => r.status !== 'Resolved').length;
  const info = open ? QUERY_INFO[open.id] : undefined;
  const hasReply = !!open && (!!info?.reply || replied.includes(open.id));
  const update = (ids: string[], patch: (q: QueryRow) => Partial<QueryRow>) => setRows((rs) => rs.map((q) => (ids.includes(q.id) ? { ...q, ...patch(q) } : q)));
  const assignToMe = (ids: string[]) => {
    update(ids, (q) => ({ assignee: PAYROLL_ADMIN.name, status: q.status === 'New' ? 'In progress' : q.status }));
    setSelected([]);
    setDone(`${ids.length} ${ids.length === 1 ? 'query' : 'queries'} assigned to you (${PAYROLL_ADMIN.name})`);
  };
  const [filters, setFilters] = useState<FilterValue[]>([{ key: 'status', type: 'multi', values: ['New', 'In progress', 'Waiting for employee'] }]);
  const shown = rows.filter((r) => filters.every((f) => matchesFilter(r.status, f)));
  const cols: TableColumn<QueryRow>[] = [
    { key: 'employee', header: 'Employee', type: 'person', value: (r) => r.employee, person: (r) => ({ name: r.employee, secondary: r.code }), width: 210 },
    {
      key: 'text',
      header: 'Question',
      value: (r) => `${r.line} · ${r.payslip}: ${r.text}`,
      render: (r) => (
        <span>
          <span className="yx-pay-note">
            {r.line} · {r.payslip}
          </span>
          <br />
          {r.text}
        </span>
      ),
      width: 360,
      hideable: false,
    },
    { key: 'raised', header: 'Raised', type: 'date', value: (r) => r.raised, width: 110, optional: true },
    {
      key: 'due',
      header: 'Reply due',
      value: (r) => dueText(r),
      render: (r) => {
        const text = dueText(r);
        if (text === '—') return text;
        const n = replyDue(r.raised);
        const tone: BadgeTone = r.status === 'Waiting for employee' ? 'neutral' : n < 0 ? 'danger' : n <= 1 ? 'warning' : 'neutral';
        return <Badge tone={tone}>{text}</Badge>;
      },
      width: 150,
      hideable: false,
    },
    { key: 'assignee', header: 'Assignee', value: (r) => r.assignee, width: 130 },
    { key: 'status', header: 'Status', type: 'status', value: (r) => r.status, statusTone: (v) => Q_TONE[v as QueryRow['status']], width: 170 },
  ];
  const opts = (xs: string[]) => xs.map((v) => ({ value: v, label: v }));
  return (
    <PayFrame page="queries" counts={{ queries: openCount }}>
      <PageHeader title="Payslip queries" description="Questions employees raised on a payslip or a line. Replies stay in the app." facts={ready ? `${openCount} open · reply target 2 working days` : undefined} />
      <Done text={done} />
      <DataTable
        label="Payslip queries"
        columns={cols}
        rows={shown}
        getRowId={(r) => r.id}
        state={tableState(state)}
        onRowClick={setOpen}
        activeRowId={open?.id}
        filtered={shown.length !== rows.length && rows.length > 0}
        onClearFilters={() => setFilters([{ key: 'status', type: 'multi', values: [] }])}
        empty={<EmptyState title="No payslip queries." description="When an employee asks about a payslip, the question lands here with the payslip and line." />}
        toolbar={<FilterBar fields={[{ key: 'status', label: 'Status', type: 'multi', options: opts(['New', 'In progress', 'Waiting for employee', 'Resolved']) }]} value={filters} onChange={setFilters} searchPlaceholder="Search employee or question" />}
        cardSummary
        selectable
        selectedIds={selected}
        onSelectedChange={setSelected}
        bulkActions={(ids) => (
          <Button size="sm" onClick={() => assignToMe(ids)}>
            Assign {ids.length} to me
          </Button>
        )}
      />
      <Drawer
        open={!!open}
        onOpenChange={(o) => !o && setOpen(null)}
        title={open ? `${open.employee}: ${open.line}` : ''}
        subtitle={open ? `${open.payslip} payslip · raised ${formatDate(open.raised)}` : undefined}
        meta={open && <Badge tone={Q_TONE[open.status]}>{open.status}</Badge>}
        size="lg"
        footer={
          <>
            <Button onClick={() => setOpen(null)}>Close</Button>
            {!assignTo && <span className="yx-pay-note">Choose who to {open?.assignee === UNASSIGNED ? 'assign' : 'reassign'} to</span>}
            <Button
              disabled={!assignTo}
              onClick={() => {
                if (!open || !assignTo) return;
                update([open.id], () => ({ assignee: assignTo }));
                setDone(`Query from ${open.employee} ${open.assignee === UNASSIGNED ? 'assigned' : 'reassigned'} to ${assignTo}`);
                setAssignTo(null);
              }}
            >
              {open?.assignee === UNASSIGNED ? 'Assign' : 'Reassign'}
            </Button>
            {open?.status === 'Resolved' ? <span className="yx-pay-note">Already resolved</span> : !hasReply && <span className="yx-pay-note">Reply to the employee first</span>}
            <Button
              variant="primary"
              disabled={!open || open.status === 'Resolved' || !hasReply}
              onClick={() => {
                if (!open) return;
                update([open.id], () => ({ status: 'Resolved' }));
                setDone(`Query from ${open.employee} on "${open.line}" marked resolved`);
                setOpen(null);
              }}
            >
              Mark resolved
            </Button>
          </>
        }
      >
        {open && (
          <div className="yx-pay-stack">
            <DescriptionList
              columns={2}
              items={[
                { label: 'Line', value: open.line },
                { label: 'Amount on payslip', value: info?.amount ?? '—' },
                { label: 'Explanation', value: info?.cause ?? '—' },
                { label: 'Assignee', value: open.assignee },
              ]}
            />
            <FormField label={open.assignee === UNASSIGNED ? 'Assign to' : 'Reassign to'}>
              <Select value={assignTo} onChange={setAssignTo} options={ASSIGNEES.filter((a) => a !== open.assignee).map((a) => ({ value: a, label: a }))} />
            </FormField>
            <CommentThread
              key={open.id}
              currentUser={{ id: 'pa', name: PAYROLL_ADMIN.name }}
              people={[{ id: 'kar', name: 'Karthik Subramanian' }]}
              canWritePrivate
              resolvable={false}
              now={TODAY}
              onAdd={(c) => !c.private && setReplied((r) => [...r, open.id])}
              defaultComments={[
                { id: 'c1', author: { id: 'emp', name: open.employee }, body: open.text, at: open.raised },
                ...(info?.reply ? [{ id: 'c2', author: { id: info.reply.by === PAYROLL_ADMIN.name ? 'pa' : 'pn', name: info.reply.by }, body: info.reply.body, at: info.reply.at }] : []),
              ]}
            />
          </div>
        )}
      </Drawer>
    </PayFrame>
  );
}

