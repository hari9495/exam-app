// Payroll admin: PAY-17 loans & advances, PAY-23 proof verification queue, PAY-27 EWA admin, PAY-25 payroll reports.
import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { Download, Pause, Play, Plus, Send } from 'lucide-react';
import { Button, Link } from '../../components/button';
import { Badge, type BadgeTone } from '../../components/display';
import { Drawer } from '../../components/drawer';
import { EmptyState, InlineAlert, Skeleton } from '../../components/feedback';
import { FieldRow, FormField, FormSection, useTooEarly, type FormErrorItem } from '../../components/field';
import { useToast } from '../../components/notify';
import { useRun } from '../org/org-kit';
import { dateText } from '../time/live/kit';
import { PayFormDrawer, PayPageState, fromPaise, paise, rupees, sumMoney } from './consultants';
import { FindPerson, type PersonHit } from './equity';
import { LOAN_STATE, LOAN_TYPE_TEXT, monthName, previewEmi, rateText, subjectText } from './employee-pay';
import { EntityPicker } from './live/setup';
import type { LoadState } from './live/types';
import type { SetupEntity } from './live/types-5b';
import type { EwaDrawView, EwaPolicyView, EwaRecon, EwaRecoveryMonth } from './live/types-5i';
import type { LoanChangeInput, LoanRepayments, LoanRequestInput, LoanView, ProofDecision, ProofQueueLine } from './live/types-ops';
import { CurrencyField, NumberField, TextArea, TextField } from '../../components/inputs';
import { RadioGroup, Switch } from '../../components/choice';
import { Select } from '../../components/select';
import { Dialog } from '../../components/overlay';
import { DocumentViewer } from '../../components/document';
import { DescriptionList, PageHeader, Tabs, TabsContent, TabsList, TabsTrigger } from '../../components/shell';
import { DataTable, type TableColumn } from '../../components/table';
import { PlainTable } from '../../components/plain-table';
import { FilterBar } from '../../components/filters';
import { useNarrow } from '../../components/stepper';
import { formatDate, formatINR } from '../../lib/format';
import { matchesFilter, type FilterValue } from '../../lib/table';
import { DesktopFrame, SCREEN_RAIL } from '../_kit/frames';
import { EMPLOYEES, HR_ADMIN, ME, PAY_CALENDAR, TODAY } from '../_kit/data';
import { Segment } from '../people/people-kit';
import { ReportsView, PAY_REPORTS, type LivePayrollReports, type PayReport, type PayReportKind, type ReportFilters, type ReportOptions, type ReportsAccessRequest } from './reports-live';
import { FactRow, PayFrame, PaySettingsFrame, SectionTitle, StateBlock, useFileUrl, type PayPersona, type ViewState } from './pay-kit';
import {
  ENTITY_KA,
  ENTITY_TN,
  EWA_DRAWS,
  HOLDS,
  LOANS,
  MY_DEDUCTIONS,
  MY_GROSS,
  MY_NET,
  MY_PAYSLIP,
  MY_PREV_NET,
  MY_TDS_BY_MONTH,
  ARJUN_AUG_ARREAR,
  ONE_TIME,
  PAYMENTS,
  PAYROLL_ADMIN,
  PAYSLIP_HISTORY,
  PROOF_ROWS,
  RUN,
  RUN_HISTORY,
  RUN_ROWS,
  type EwaDraw,
  type LoanRow,
  type ProofRow,
  type RunRow,
} from './pay-data';
import { codeWageAddBack, computeTax, emiAmount, emiSchedule, esiContribution, gratuity, GRATUITY_CAP, pfContribution, variance, type EmiRow } from './pay-logic';

const tableState = (s: ViewState) => (s === 'loading' ? 'loading' : s === 'error' ? 'error' : 'ready');
const sumBy = <T,>(xs: T[], f: (x: T) => number) => xs.reduce((a, x) => a + f(x), 0);

/* ================================================================== PAY-17 Loans & advances */

const LOAN_TONE: Record<LoanRow['status'], BadgeTone> = { Active: 'info', Paused: 'warning', Closed: 'success', 'Waiting for approval': 'warning', 'Pre-closure requested': 'warning' };
const LOAN_TYPES: LoanRow['type'][] = ['Salary advance', 'Personal loan', 'Vehicle loan', 'Emergency loan'];
const LOAN_RATE: Record<string, number> = { 'Personal loan': 6, 'Vehicle loan': 7.5 };

const MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const MONTH_NAME = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
/** 'Jan 2025' → a running month number, so months can be compared and counted. */
const monthIndex = (label: string) => {
  const [m, y] = label.split(' ');
  return Number(y) * 12 + MON.indexOf(m);
};
const monthLabel = (i: number) => `${MON[i % 12]} ${Math.floor(i / 12)}`;
const fullMonth = (i: number) => `${MONTH_NAME[i % 12]} ${Math.floor(i / 12)}`;
/** The run in progress ('Sep 2026') and the month after it. */
const RUN_MONTH = RUN.periodShort;
const NEXT_MONTH = monthLabel(monthIndex(RUN_MONTH) + 1);
const runName = (label: string) => `${MONTH_NAME[monthIndex(label) % 12]} run`;
const PAY_DAY = `${PAY_CALENDAR.payDate.getDate()} ${MON[PAY_CALENDAR.payDate.getMonth()]}`;

interface LoanPause {
  from: string;
  months: number;
  reason: string;
  by: string;
}
type Loan = LoanRow & { pause?: LoanPause };
/** The vehicle loan (l3, LOANS) has its September EMI paused; kept here until pay-data carries pause details. */
const LOAN_PAUSES: Record<string, LoanPause> = { l3: { from: RUN_MONTH, months: 1, reason: 'Medical leave without pay', by: HR_ADMIN.name } };

/**
 * Rule 3(7)(i) as amended in 2025: no perquisite when an employee's loans add up to ₹2,00,000 or less.
 * ponytail: assumes every company rate is below the SBI benchmark rate; compare with the benchmark once rates can exceed it.
 */
const PERQ_FREE_LIMIT = 2_00_000;
function withPerquisite<T extends LoanRow>(ls: T[]): T[] {
  return ls.map((l) => {
    const aggregate = sumBy(
      ls.filter((x) => x.employee === l.employee && x.status !== 'Closed'),
      (x) => x.principal,
    );
    return { ...l, perquisite: l.status !== 'Closed' && aggregate > PERQ_FREE_LIMIT };
  });
}

/** The loan's EMI schedule from its own start month; only the row for the run in progress is "due". */
function loanSchedule(l: Loan): EmiRow[] {
  const start = monthIndex(l.start);
  const paused = l.pause ? Array.from({ length: l.pause.months }, (_, k) => monthIndex(l.pause!.from) - start + k) : [];
  return emiSchedule(l.principal, l.rate, l.emis, start % 12, Math.floor(start / 12), l.paid, paused).map((r) => ({
    ...r,
    status: r.status === 'paid' || r.status === 'paused' ? r.status : r.month === RUN_MONTH ? 'due' : 'scheduled',
  }));
}
/** The schedule row for the run in progress, when it is still to be recovered or paused. */
const runRow = (l: Loan) => loanSchedule(l).find((r) => r.month === RUN_MONTH && r.status !== 'paid');
/** EMI recovered in the run in progress (0 when paused, not started or closed). */
const runEmi = (l: Loan) => {
  const r = runRow(l);
  return r?.status === 'due' ? r.emi : 0;
};
const SCHED_TONE: Record<EmiRow['status'], BadgeTone> = { paid: 'success', paused: 'warning', due: 'info', scheduled: 'neutral' };
const schedStatus = (r: EmiRow) => (r.status === 'paid' ? 'Recovered' : r.status === 'paused' ? 'Paused' : r.status === 'due' ? `In ${runName(r.month)}` : 'Scheduled');
/** Interest from the last EMI to the closing date (the run's pay date), on the outstanding balance. */
const closeInterest = (l: Loan) => {
  const pd = PAY_CALENDAR.payDate;
  const daysInMonth = new Date(pd.getFullYear(), pd.getMonth() + 1, 0).getDate();
  return Math.round(((l.outstanding * l.rate) / 1200) * (pd.getDate() / daysInMonth));
};
const pauseText = (p: LoanPause) => {
  const s = monthIndex(p.from);
  const span = p.months === 1 ? fullMonth(s) : `${fullMonth(s)} – ${fullMonth(s + p.months - 1)}`;
  return `EMIs paused for ${span} by ${p.by}: ${p.reason}. They resume in ${fullMonth(s + p.months)}; the schedule moves by ${p.months} month${p.months === 1 ? '' : 's'}.`;
};
const preCloseReason = (l?: LoanRow) => (l?.status === 'Pre-closure requested' ? 'Employee requested pre-closure on 26 Sep' : '');
const EMPTY_LOAN_FILTERS: FilterValue[] = [
  { key: 'status', type: 'multi', values: [] },
  { key: 'type', type: 'multi', values: [] },
];

/** PAY-17 · Loans & advances (T2 / T3): schedule, pre-closure, EMI pause. The app passes `live` (Payroll › Loans and advances). */
export function LoansScreen(p: { state?: ViewState; openId?: string; action?: 'pause' | 'preclose'; rows?: LoanRow[]; live?: LiveLoans }) {
  return p.live ? <LiveLoans live={p.live} /> : <SampleLoans {...p} />;
}

function SampleLoans({ state = 'ready', openId, action, rows = LOANS }: { state?: ViewState; openId?: string; action?: 'pause' | 'preclose'; rows?: LoanRow[] }) {
  const narrow = useNarrow(599);
  const [view, setView] = useState<ViewState>(state);
  const [list, setList] = useState<Loan[]>(() => withPerquisite(rows.map((l) => ({ ...l, pause: LOAN_PAUSES[l.id] }))));
  const [openKey, setOpenKey] = useState<string | null>(openId ?? null);
  const open = list.find((l) => l.id === openKey) ?? null;
  const [dialog, setDialog] = useState<'pause' | 'preclose' | 'add' | null>(action ?? null);
  const { toast } = useToast();
  const setNotice = (title: string) => toast({ tone: 'success', title });
  const [pauseMonths, setPauseMonths] = useState<number | null>(1);
  const [pauseFrom, setPauseFrom] = useState<string | null>(NEXT_MONTH);
  const [pauseReason, setPauseReason] = useState('');
  const [route, setRoute] = useState('pay');
  const [bankRef, setBankRef] = useState('');
  const [pcReason, setPcReason] = useState(() => preCloseReason(rows.find((l) => l.id === openId)));
  const [draft, setDraft] = useState<{ employee: string | null; type: LoanRow['type']; amount: number | null; emis: number | null }>({ employee: null, type: 'Salary advance', amount: null, emis: 3 });
  const [filters, setFilters] = useState<FilterValue[]>(EMPTY_LOAN_FILTERS);
  const [q, setQ] = useState('');
  const update = (id: string, patch: Partial<Loan>, msg: string) => {
    setList((ls) => withPerquisite(ls.map((l) => (l.id === id ? { ...l, ...patch } : l))));
    setNotice(msg);
    setDialog(null);
  };
  const addLoan = () => {
    const emp = EMPLOYEES.find((e) => e.id === draft.employee);
    if (!emp || !draft.amount || !draft.emis) return;
    const rate = LOAN_RATE[draft.type] ?? 0;
    const row: Loan = { id: `new${list.length}`, employee: emp.name, code: emp.code, type: draft.type, principal: draft.amount, rate, emis: draft.emis, emi: emiAmount(draft.amount, rate, draft.emis), paid: 0, outstanding: draft.amount, start: NEXT_MONTH, status: 'Waiting for approval', perquisite: false };
    setList((ls) => withPerquisite([row, ...ls]));
    setNotice(`${draft.type} of ${formatINR(draft.amount)} added for ${emp.name}. It waits for approval before the first EMI in ${fullMonth(monthIndex(NEXT_MONTH))}.`);
    setDialog(null);
    setDraft({ employee: null, type: 'Salary advance', amount: null, emis: 3 });
  };
  const resume = (l: Loan) => {
    // Months already in the run in progress stay paused; later ones are cancelled.
    const kept = l.pause ? Math.max(0, Math.min(l.pause.months, monthIndex(RUN_MONTH) - monthIndex(l.pause.from) + 1)) : 0;
    update(l.id, { status: 'Active', pause: kept && l.pause ? { ...l.pause, months: kept } : undefined }, `EMIs resumed for ${l.employee}. ${formatINR(l.emi)} is recovered from the ${runName(NEXT_MONTH)}.`);
  };
  const query = q.trim().toLowerCase();
  const shown = list.filter((r) => filters.every((f) => matchesFilter(f.key === 'status' ? r.status : r.type, f)) && (!query || `${r.employee} ${r.code}`.toLowerCase().includes(query)));
  const employeeCol: TableColumn<Loan> = { key: 'employee', header: 'Employee', type: 'person', value: (r) => r.employee, person: (r) => ({ name: r.employee, secondary: r.code }), width: 210 };
  const statusCol: TableColumn<Loan> = { key: 'status', header: 'Status', type: 'status', value: (r) => r.status, statusTone: (v) => LOAN_TONE[v as LoanRow['status']], width: 180 };
  const cols: TableColumn<Loan>[] = narrow
    ? [employeeCol, { key: 'sum', header: 'Loan', value: (r) => `${r.type} · EMI ${formatINR(r.emi)} · ${formatINR(r.outstanding)} left` }, statusCol]
    : [
        employeeCol,
        { key: 'type', header: 'Type', value: (r) => r.type, width: 150 },
        { key: 'principal', header: 'Principal', type: 'money', value: (r) => r.principal, total: 'sum', width: 120 },
        { key: 'rate', header: 'Interest', value: (r) => (r.rate ? `${r.rate}%` : 'Interest-free'), width: 110 },
        { key: 'emi', header: 'EMI', type: 'money', value: (r) => r.emi, width: 100 },
        { key: 'paid', header: 'EMIs paid', value: (r) => `${r.paid} of ${r.emis}`, width: 100 },
        { key: 'out', header: 'Outstanding', type: 'money', value: (r) => r.outstanding, total: 'sum', width: 130 },
        statusCol,
      ];
  const sched = open ? loanSchedule(open).slice(Math.max(0, open.paid - 2), open.paid + 6) : [];
  const toRecover = sumBy(list, runEmi);
  const opts = (xs: string[]) => xs.map((v) => ({ value: v, label: v }));
  const pauseOptions = [1, 2].map((k) => monthLabel(monthIndex(RUN_MONTH) + k)).map((m) => ({ value: m, label: fullMonth(monthIndex(m)) }));
  const interest = open ? closeInterest(open) : 0;
  const total = (open?.outstanding ?? 0) + interest;
  const thisEmi = open ? runEmi(open) : 0;
  const pauseEarly = useTooEarly([...(!pauseMonths ? [{ fieldId: 'lp-months', message: 'Enter the months to pause.' }] : []), ...(!pauseReason.trim() ? [{ fieldId: 'lp-reason', message: 'Add a reason.' }] : [])]);
  const pcEarly = useTooEarly([...(route === 'direct' && !bankRef.trim() ? [{ fieldId: 'pc-ref', message: 'Add the bank reference.' }] : []), ...(!pcReason.trim() ? [{ fieldId: 'pc-reason', message: 'Add a reason.' }] : [])]);
  const addEarly = useTooEarly([...(!draft.employee ? [{ fieldId: 'ad-emp', message: 'Choose an employee.' }] : []), ...(!draft.amount ? [{ fieldId: 'ad-amount', message: 'Enter the amount.' }] : []), ...(!draft.emis ? [{ fieldId: 'ad-emis', message: 'Enter the number of EMIs.' }] : [])]);
  const addButton = (
    <Button variant="primary" icon={Plus} onClick={() => setDialog('add')}>
      Add loan
    </Button>
  );
  return (
    <PayFrame page="loans">
      <PageHeader
        title="Loans and advances"
        description="EMIs are recovered in payroll within the protected net; balances left at exit go to the final settlement."
        facts={view === 'ready' && list.length > 0 ? `${list.filter((r) => r.status !== 'Closed').length} open · ${formatINR(sumBy(list, (r) => r.outstanding))} outstanding · ${formatINR(toRecover)} to recover in ${RUN.periodShort}` : undefined}
        actions={
          <>
            {list.length > 0 && (
              <Button icon={Download} onClick={() => view !== 'ready' ? toast({ title: 'The loan list has not loaded yet.' }) : setNotice(`Loan ledger · ${RUN.period}.xlsx downloaded (${list.length} loans).`)}>
                Loan ledger
              </Button>
            )}
            {addButton}
          </>
        }
      />
      <DataTable
        label="Loans and advances"
        columns={cols}
        rows={shown}
        getRowId={(r) => r.id}
        state={tableState(view)}
        onRetry={() => setView('ready')}
        onRowClick={(r) => setOpenKey(r.id)}
        activeRowId={open?.id}
        filtered={shown.length !== list.length}
        onClearFilters={() => {
          setFilters(EMPTY_LOAN_FILTERS);
          setQ('');
        }}
        cardSummary
        rowButtons={(r) =>
          r.status === 'Waiting for approval' ? (
            <Button variant="approve" size="sm" onClick={() => update(r.id, { status: 'Active' }, `${r.type} for ${r.employee} approved. The first EMI of ${formatINR(r.emi)} is recovered in the ${runName(r.start)}.`)}>
              Approve
            </Button>
          ) : null
        }
        toolbar={
          <FilterBar
            fields={[
              { key: 'status', label: 'Status', type: 'multi', options: opts(['Active', 'Paused', 'Closed', 'Waiting for approval', 'Pre-closure requested']) },
              { key: 'type', label: 'Type', type: 'multi', options: opts(LOAN_TYPES) },
            ]}
            value={filters}
            onChange={setFilters}
            search={q}
            onSearchChange={setQ}
            searchPlaceholder="Search employee or code"
          />
        }
        empty={<EmptyState title="No loans or advances yet." description="Employees request them from My pay; you can also add one for an employee." action={addButton} />}
      />
      <Drawer
        open={!!open}
        onOpenChange={(o) => !o && setOpenKey(null)}
        title={open ? `${open.type} · ${open.employee}` : ''}
        subtitle={open ? `${open.code} · started ${open.start}` : undefined}
        meta={open && <Badge tone={LOAN_TONE[open.status]}>{open.status}</Badge>}
        size="lg"
        footer={
          open && (
            <>
              <Button onClick={() => setOpenKey(null)}>Close</Button>
              {open.status === 'Paused' ? (
                <Button icon={Play} onClick={() => resume(open)}>
                  Resume EMIs
                </Button>
              ) : (
                <Button
                  icon={Pause}
                  onClick={() => {
                    if (open.status !== 'Active') return void toast({ title: `This loan is ${open.status.toLowerCase()}. Only an active loan can be paused.` });
                    setPauseMonths(1);
                    setPauseFrom(NEXT_MONTH);
                    setPauseReason('');
                    setDialog('pause');
                  }}
                >
                  Pause EMIs
                </Button>
              )}
              <Button
                variant="primary"
                onClick={() => {
                  if (open.status === 'Closed' || open.status === 'Waiting for approval') return void toast({ title: `This loan is ${open.status.toLowerCase()}, so it can't be pre-closed.` });
                  setRoute('pay');
                  setBankRef('');
                  setPcReason(preCloseReason(open));
                  setDialog('preclose');
                }}
              >
                Pre-close
              </Button>
            </>
          )
        }
      >
        {open && (
          <div className="yx-pay-stack">
            <FactRow
              items={[
                { label: 'Principal', value: formatINR(open.principal) },
                { label: 'Interest', value: open.rate ? `${open.rate}% a year` : 'Interest-free' },
                { label: 'EMI', value: formatINR(open.emi) },
                { label: 'Outstanding', value: formatINR(open.outstanding) },
              ]}
            />
            {open.perquisite && <InlineAlert tone="info">Loans for this employee add up to more than ₹2,00,000 at a rate below the benchmark, so the interest difference is a taxable perquisite each month (shown on the payslip as an informational line).</InlineAlert>}
            {open.pause && <InlineAlert tone="warning">{pauseText(open.pause)}</InlineAlert>}
            {narrow ? (
              <section className="yx-pay-stack" aria-label="Schedule">
                <SectionTitle>Schedule</SectionTitle>
                <ul className="yx-pay-cards">
                  {sched.map((r) => (
                    <li key={r.no} data-selected={r.status === 'due' || undefined}>
                      <div className="yx-pay-cards__row">
                        <strong>
                          {r.no}. {r.month}
                        </strong>
                        <Badge tone={SCHED_TONE[r.status]}>{schedStatus(r)}</Badge>
                      </div>
                      <span className="yx-pay-muted">
                        EMI {formatINR(r.emi)} · interest {formatINR(r.interest)} · balance {formatINR(r.balance)}
                      </span>
                    </li>
                  ))}
                </ul>
              </section>
            ) : (
              <PlainTable
                label="Schedule"
                caption="Schedule"
                rows={sched}
                getRowId={(r) => String(r.no)}
                rowTone={(r) => (r.status === 'due' ? { tone: 'selected', label: 'Due now' } : r.status === 'paused' ? { tone: 'warning', label: 'Paused' } : undefined)}
                columns={[
                  { key: 'no', header: 'No.', cell: (r) => r.no },
                  { key: 'month', header: 'Month', rowHeader: true, cell: (r) => r.month },
                  { key: 'emi', header: 'EMI', num: true, cell: (r) => formatINR(r.emi) },
                  { key: 'interest', header: 'Interest', num: true, cell: (r) => formatINR(r.interest) },
                  { key: 'balance', header: 'Balance', num: true, cell: (r) => formatINR(r.balance) },
                  { key: 'status', header: 'Status', cell: (r) => schedStatus(r) },
                ]}
              />
            )}
          </div>
        )}
      </Drawer>
      <Dialog
        open={dialog === 'pause'}
        onOpenChange={(o) => !o && setDialog(null)}
        title="Pause EMIs?"
        description="Paused months move to the end of the schedule. Interest continues on the balance."
        footer={
          <>
            <Button onClick={() => setDialog(null)}>Cancel</Button>
            <Button
              variant="primary"
              onClick={() => {
                if (pauseEarly.stop() || !open || !pauseMonths || !pauseFrom) return;
                const pause = { from: pauseFrom, months: pauseMonths, reason: pauseReason.trim(), by: PAYROLL_ADMIN.name };
                update(open.id, { status: 'Paused', pause }, `${open.employee}: ${pauseText(pause)}`);
              }}
            >
              Pause EMIs
            </Button>
          </>
        }
      >
        <FieldRow>
          <FormField id="lp-months" label="Months to pause" required error={pauseEarly.errorOf('lp-months')}>
            <NumberField value={pauseMonths} onChange={setPauseMonths} min={1} max={3} />
          </FormField>
          <FormField label="From">
            <Select value={pauseFrom} onChange={setPauseFrom} options={pauseOptions} />
          </FormField>
        </FieldRow>
        <FormField id="lp-reason" label="Reason" required error={pauseEarly.errorOf('lp-reason')}>
          <TextArea rows={2} value={pauseReason} onChange={setPauseReason} />
        </FormField>
      </Dialog>
      <Dialog
        open={dialog === 'preclose'}
        onOpenChange={(o) => !o && setDialog(null)}
        title={`Pre-close ${open?.type.toLowerCase() ?? 'loan'}?`}
        description="The outstanding balance and interest to the closing date are recovered in one go, and the loan closes."
        size="md"
        footer={
          <>
            <Button onClick={() => setDialog(null)}>Cancel</Button>
            <Button
              variant="primary"
              onClick={() =>
                !pcEarly.stop() &&
                open &&
                update(
                  open.id,
                  { status: 'Closed', outstanding: 0, paid: open.emis, pause: undefined },
                  route === 'pay'
                    ? `${open.type} for ${open.employee} pre-closed: ${formatINR(total)} is recovered in the ${runName(RUN_MONTH)}${thisEmi ? ` in place of the ${formatINR(thisEmi)} EMI` : ''}. Reason: ${pcReason.trim()}.`
                    : `${open.type} for ${open.employee} closed: ${formatINR(total)} paid directly by the employee, bank reference ${bankRef.trim()}. Nothing is recovered in payroll. Reason: ${pcReason.trim()}.`,
                )
              }
            >
              Pre-close loan
            </Button>
          </>
        }
      >
        <div className="yx-pay-stack">
          <DescriptionList
            items={[
              { label: 'Outstanding principal', value: formatINR(open?.outstanding ?? 0) },
              { label: `Interest to ${PAY_DAY}`, value: open?.rate ? formatINR(interest) : 'None (interest-free)' },
              { label: 'Total to recover', value: formatINR(total) },
            ]}
          />
          <FormField label="Recover through" required>
            <RadioGroup
              value={route}
              onChange={setRoute}
              options={[
                {
                  value: 'pay',
                  label: `${runName(RUN_MONTH)} (pays ${PAY_DAY})`,
                  description: `Recovered with ${MONTH_NAME[monthIndex(RUN_MONTH) % 12]} pay${thisEmi ? ` in place of the ${formatINR(thisEmi)} EMI` : ''}, within the protected net; any shortfall moves to the ${runName(NEXT_MONTH)}.`,
                },
                { value: 'direct', label: 'Paid directly by the employee', description: 'Record the bank reference of the payment.' },
              ]}
            />
          </FormField>
          {route === 'direct' && (
            <FormField id="pc-ref" label="Bank reference" required error={pcEarly.errorOf('pc-ref')}>
              <TextField value={bankRef} onChange={setBankRef} placeholder="UTR or transaction number" />
            </FormField>
          )}
          <FormField id="pc-reason" label="Reason" required error={pcEarly.errorOf('pc-reason')}>
            <TextArea rows={2} value={pcReason} onChange={setPcReason} />
          </FormField>
        </div>
      </Dialog>
      <Drawer
        open={dialog === 'add'}
        onOpenChange={(o) => !o && setDialog(null)}
        title="Add loan or advance"
        subtitle="Waits for approval before the first EMI."
        size="md"
        footer={
          <>
            <Button onClick={() => setDialog(null)}>Cancel</Button>
            <Button variant="primary" onClick={() => !addEarly.stop() && addLoan()}>
              Add loan
            </Button>
          </>
        }
      >
        <div className="yx-pay-stack">
          <FormField id="ad-emp" label="Employee" required error={addEarly.errorOf('ad-emp')}>
            <Select searchable value={draft.employee} onChange={(v) => setDraft({ ...draft, employee: v })} placeholder="Choose an employee" options={EMPLOYEES.map((e) => ({ value: e.id, label: e.name, description: e.code }))} />
          </FormField>
          <FormField label="Type" required>
            <Select value={draft.type} onChange={(v) => v && setDraft({ ...draft, type: v as LoanRow['type'] })} options={opts(LOAN_TYPES)} />
          </FormField>
          <FieldRow>
            <FormField id="ad-amount" label="Amount" required error={addEarly.errorOf('ad-amount')}>
              <CurrencyField value={draft.amount} onChange={(v) => setDraft({ ...draft, amount: v })} max={5_00_000} />
            </FormField>
            <FormField id="ad-emis" label="Number of EMIs" required error={addEarly.errorOf('ad-emis')}>
              <NumberField value={draft.emis} onChange={(v) => setDraft({ ...draft, emis: v })} min={1} max={60} />
            </FormField>
          </FieldRow>
          {draft.amount && draft.emis ? (
            <p className="yx-pay-muted">
              EMI {formatINR(emiAmount(draft.amount, LOAN_RATE[draft.type] ?? 0, draft.emis))} a month from {fullMonth(monthIndex(NEXT_MONTH))}, {LOAN_RATE[draft.type] ? `${LOAN_RATE[draft.type]}% interest` : 'interest-free'}.
            </p>
          ) : null}
        </div>
      </Drawer>
    </PayFrame>
  );
}

/* ================================================================== PAY-23 Proof verification queue */

const PROOF_TONE: Record<ProofRow['status'], BadgeTone> = { Waiting: 'warning', Approved: 'success', Rejected: 'danger', 'Partly approved': 'info' };
/** HRA proofs cover April–September (6 months of rent). */
const HRA_MONTHS = 6;
const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;');
const rs = (n: number) => formatINR(n).replace('₹', 'Rs ');
const slug = (s: string) =>
  s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
const svgDoc = (title: string, lines: string[]) =>
  'data:image/svg+xml;utf8,' +
  encodeURIComponent(
    `<svg xmlns='http://www.w3.org/2000/svg' width='600' height='400' viewBox='0 0 600 400'><rect x='10' y='10' width='580' height='380' fill='white' stroke='black' stroke-width='2'/><text x='40' y='60' font-family='sans-serif' font-size='26'>${esc(title)}</text>${lines
      .map((t, i) => `<text x='40' y='${110 + i * 36}' font-family='sans-serif' font-size='18'>${esc(t)}</text>`)
      .join('')}<text x='40' y='350' font-family='sans-serif' font-size='16'>Signature and stamp</text></svg>`,
  );
/** Fictional landlord PAN printed on the receipt, one per proof line. */
const landlordPan = (r: ProofRow) => `AXKPR${r.code.replace(/\D/g, '').padStart(4, '0').slice(-4)}L`;
/** The uploaded document for a proof line: the employee's own name, item, period and amount. */
function proofDoc(r: ProofRow) {
  const to = formatDate(r.submitted);
  const [title, lines]: [string, string[]] =
    r.section === 'HRA'
      ? ['Rent receipt', [`Received from ${r.employee} ${rs(r.proofAmount / HRA_MONTHS)} a month,`, `${rs(r.proofAmount)} in all, as rent for April – September 2026.`, `Landlord PAN: ${landlordPan(r)}`]]
      : r.item === 'Public provident fund'
        ? ['PPF passbook, extract', [`Account holder: ${r.employee}`, `Deposits 1 Apr 2026 – ${to}: ${rs(r.proofAmount)}`]]
        : r.item.startsWith('Health insurance')
          ? ['Health insurance premium receipt', [`Policyholder: ${r.employee}`, `Premium for parents, policy year 2026-27: ${rs(r.proofAmount)}`]]
          : r.item.startsWith('Interest certificate')
            ? ['Home loan interest certificate', [`Borrower: ${r.employee}`, `Interest for 2026-27, self-occupied house: ${rs(r.proofAmount)}`]]
            : r.item.startsWith('NPS')
              ? ['NPS Tier I statement', [`Subscriber: ${r.employee}`, `Contributions 1 Apr 2026 – ${to}: ${rs(r.proofAmount)}`]]
              : ['Fee receipt', [`Received from ${r.employee}`, `${r.item}, 2026-27: ${rs(r.proofAmount)}`]];
  return { url: svgDoc(title, lines), fileName: `${slug(title)}-${r.code.toLowerCase()}.svg` };
}
/** Starting amount and comment for a part approval: one month of rent short for HRA, otherwise what the document supports. */
function partialFor(r: ProofRow) {
  if (r.section === 'HRA') {
    const amount = (r.proofAmount / HRA_MONTHS) * (HRA_MONTHS - 1);
    return { amount, comment: `Receipt for September is missing. Approved for ${HRA_MONTHS - 1} of ${HRA_MONTHS} months.` };
  }
  const amount = Math.round((r.proofAmount * 0.8) / 1_000) * 1_000;
  return { amount, comment: `The document supports ${formatINR(amount)} of the ${formatINR(r.proofAmount)} claimed.` };
}
const rejectFor = (r: ProofRow) => (r.section === 'HRA' ? 'Receipt is not signed by the landlord. Upload a signed receipt.' : 'Document is not signed or stamped. Upload a signed copy.');
const amountFor = (r: ProofRow, c: string) => (c === 'partial' ? partialFor(r).amount : r.proofAmount);
const commentFor = (r: ProofRow, c: string) => (c === 'partial' ? partialFor(r).comment : c === 'reject' ? rejectFor(r) : '');

const PROOF_WINDOW = 'proof window 1 Sep 2026 – 28 Feb 2027';
const DEFAULT_PROOF_FILTERS: FilterValue[] = [
  { key: 'status', type: 'multi', values: ['Waiting'] },
  { key: 'section', type: 'multi', values: [] },
];

/** PAY-23 · Proof verification queue: each line approved, rejected or partly approved with a comment. The app passes `live`. */
export function ProofQueueScreen(p: {
  state?: ViewState;
  openId?: string;
  decision?: 'partial' | 'reject';
  rows?: ProofRow[];
  /** Stories: the residential-status row (founder last 10, items 7 and 10). */ residency?: ResidencyStory;
  /** Stories: the PAN link confirmation (PAY-22 NoPan, checked here). */ panLink?: PanLinkStory;
  live?: LiveProofQueue;
}) {
  return p.live ? <LiveProofQueue live={p.live} /> : p.residency ? <LiveProofQueue key={p.residency} live={sampleResidencyQueue(p.residency)} /> : p.panLink ? <LiveProofQueue key={p.panLink} live={samplePanLinkQueue(p.panLink)} /> : <SampleProofQueue {...p} />;
}

/** PAY-23 PAN link design states (PAY-22 NoPan sends them). */
export type PanLinkStory = 'queue' | 'decide' | 'refused';

/** Kaveri Foods' PAN link confirmations for 2026-27, in the shape GET tax/pan-links returns. */
function samplePanLinkQueue(view: PanLinkStory): LiveProofQueue {
  const sent: PanLinkRow = { id: 'pl-1', employeeId: 'e-63', employeeName: 'Karthik Iyer', legalEntityId: 'kf-ka', taxYear: '2026-27', file: { name: 'pan-aadhaar-link.pdf', size: 96_400, type: 'application/pdf', at: '2026-10-29T08:20:00Z' }, status: 'pending', comment: null, submittedAt: '2026-10-29T08:20:00Z', verifiedAt: null };
  const refused: PanLinkRow = { ...sent, id: 'pl-2', status: 'rejected', comment: 'The confirmation shows another PAN. Send the one for your own PAN.', verifiedAt: '2026-10-30T10:00:00Z' };
  const done = async () => undefined;
  return {
    state: 'ready',
    status: view === 'refused' ? 'rejected' : 'pending',
    onStatus: () => {},
    lines: [],
    form12b: [],
    residency: [],
    panLinks: [view === 'refused' ? refused : sent],
    onFile: done,
    onDecide: done,
    onForm12bFile: done,
    onForm12bDecide: done,
    onPanLinkFile: done,
    onPanLinkDecide: done,
    story: view === 'queue' ? undefined : { openId: `p-${view === 'refused' ? refused.id : sent.id}` },
  };
}

/** PAY-23 residency design states. */
export type ResidencyStory = 'pending-trc' | 'back-to-resident' | 'approved' | 'refused' | 'own' | 'queue';

/** Kaveri Foods' residency requests for 2026-27, in the shape GET tax/residency returns. */
function sampleResidencyQueue(view: ResidencyStory): LiveProofQueue {
  const base = { legalEntityId: 'kf-ka', taxYear: '2026-27', comment: null, verifiedAt: null } as const;
  const trc: ResidencyRow = { ...base, id: 'rs-1', employeeId: 'e-41', employeeName: 'Meera Krishnan', from: 'resident', residentialStatus: 'non_resident', trcValidTo: '2027-03-31', dtaaCountry: 'United Arab Emirates', form10fFiled: true, file: { name: 'TRC-UAE-2026.pdf', size: 184_320, at: '2026-10-24T09:12:00Z' }, status: 'pending', submittedAt: '2026-10-24T09:12:00Z' };
  const back: ResidencyRow = { ...base, id: 'rs-2', employeeId: 'e-57', employeeName: 'Rahul Menon', from: 'non_resident', residentialStatus: 'resident', trcValidTo: null, dtaaCountry: null, form10fFiled: false, file: null, status: 'pending', submittedAt: '2026-10-27T15:40:00Z' };
  const approved: ResidencyRow = { ...trc, id: 'rs-3', employeeName: 'Divya Raman', status: 'approved', verifiedAt: '2026-10-25T11:00:00Z' };
  const refused: ResidencyRow = { ...trc, id: 'rs-4', employeeName: 'Arvind Shetty', status: 'rejected', comment: 'The certificate is for 2025-26. Send the one for 2026-27.', verifiedAt: '2026-10-26T10:05:00Z', trcValidTo: '2026-03-31' };
  const rows = view === 'approved' ? [approved] : view === 'refused' ? [refused] : view === 'queue' ? [trc, back] : view === 'back-to-resident' ? [back] : [trc];
  const status = view === 'approved' ? 'approved' : view === 'refused' ? 'rejected' : 'pending';
  const done = async () => undefined;
  return {
    state: 'ready',
    status,
    onStatus: () => {},
    lines: [],
    form12b: [],
    residency: rows,
    onFile: done,
    onDecide: done,
    onForm12bFile: done,
    onForm12bDecide: done,
    onResidencyFile: done,
    onResidencyDecide: done,
    story: view === 'queue' ? undefined : { openId: `r-${rows[0].id}`, ...(view === 'own' ? { refused: 'Someone else checks your own residential status.' } : {}) },
  };
}

function SampleProofQueue({ state = 'ready', openId, decision, rows = PROOF_ROWS }: { state?: ViewState; openId?: string; decision?: 'partial' | 'reject'; rows?: ProofRow[] }) {
  const narrow = useNarrow(599);
  const [list, setList] = useState<ProofRow[]>(rows);
  const [openKey, setOpenKey] = useState<string | null>(openId ?? null);
  const open = list.find((r) => r.id === openKey) ?? null;
  const first = rows.find((r) => r.id === openId);
  const [choice, setChoice] = useState<string>(decision ?? 'approve');
  const [amount, setAmount] = useState<number | null>(first ? amountFor(first, decision ?? 'approve') : null);
  const [comment, setComment] = useState(first ? commentFor(first, decision ?? 'approve') : '');
  const { toast } = useToast();
  const setNotice = (title: string) => toast({ tone: 'success', title });
  const [reminded, setReminded] = useState(false);
  const [q, setQ] = useState('');
  const [filters, setFilters] = useState<FilterValue[]>(DEFAULT_PROOF_FILTERS);
  const query = q.trim().toLowerCase();
  const shown = list.filter((r) => filters.every((f) => matchesFilter(f.key === 'status' ? r.status : r.section, f)) && (!query || `${r.employee} ${r.code}`.toLowerCase().includes(query)));
  const employeeCol: TableColumn<ProofRow> = { key: 'employee', header: 'Employee', type: 'person', value: (r) => r.employee, person: (r) => ({ name: r.employee, secondary: r.code }), width: 210 };
  const statusCol: TableColumn<ProofRow> = { key: 'status', header: 'Status', type: 'status', value: (r) => r.status, statusTone: (v) => PROOF_TONE[v as ProofRow['status']], width: 140 };
  const cols: TableColumn<ProofRow>[] = narrow
    ? [
        employeeCol,
        { key: 'item', header: 'Line', value: (r) => `${r.section} · ${r.item}` },
        { key: 'amt', header: 'In proof of declared', value: (r) => `${formatINR(r.proofAmount)} of ${formatINR(r.declared)} · ${r.submitted.getDate()} ${MON[r.submitted.getMonth()]}` },
        statusCol,
      ]
    : [
        employeeCol,
        {
          key: 'item',
          header: 'Line',
          value: (r) => r.item,
          render: (r) => (
            <div>
              <div>{r.item}</div>
              <div className="yx-pay-note">{r.section}</div>
            </div>
          ),
          width: 230,
        },
        { key: 'declared', header: 'Declared', type: 'money', value: (r) => r.declared, width: 110 },
        { key: 'proof', header: 'In proof', type: 'money', value: (r) => r.proofAmount, width: 110 },
        { key: 'files', header: 'Files', type: 'number', value: (r) => r.files, width: 80, optional: true },
        { key: 'submitted', header: 'Submitted', type: 'date', value: (r) => r.submitted, width: 120, optional: true },
        statusCol,
      ];
  const opts = (xs: string[]) => xs.map((v) => ({ value: v, label: v }));
  const self = open?.employee === PAYROLL_ADMIN.name;
  const verified = list.filter((r) => r.status !== 'Waiting');
  const pick = (r: ProofRow, c: string) => {
    setChoice(c);
    setAmount(amountFor(r, c));
    setComment(commentFor(r, c));
  };
  const openRow = (r: ProofRow) => {
    setOpenKey(r.id);
    pick(r, 'approve');
  };
  const early = useTooEarly([
    ...(open && choice === 'partial' && (amount == null || amount < 1 || amount > open.proofAmount - 1) ? [{ fieldId: 'pv-amount', message: `Enter an amount from ₹1 to ${formatINR(open.proofAmount - 1)}.` }] : []),
    ...(choice !== 'approve' && !comment.trim() ? [{ fieldId: 'pv-comment', message: 'Add a comment for the employee.' }] : []),
  ]);
  const decide = (thenNext: boolean) => {
    if (!open) return;
    if (self) return void toast({ title: "You can't verify your own proof. Another payroll admin does it." });
    if (early.stop()) return;
    const status: ProofRow['status'] = choice === 'approve' ? 'Approved' : choice === 'partial' ? 'Partly approved' : 'Rejected';
    const approved = choice === 'approve' ? open.proofAmount : choice === 'partial' ? (amount ?? undefined) : undefined;
    setList((ls) => ls.map((r) => (r.id === open.id ? { ...r, status, approved, comment: comment.trim() || undefined } : r)));
    const next = thenNext ? shown.find((r) => r.id !== open.id && r.status === 'Waiting' && r.employee !== PAYROLL_ADMIN.name) : undefined;
    setNotice(`${open.employee} · ${open.item}: ${status.toLowerCase()}${approved != null && status !== 'Approved' ? ` for ${formatINR(approved)}` : ''}.${thenNext && !next ? ' No more waiting lines in this view.' : ''}`);
    if (next) openRow(next);
    else setOpenKey(null);
  };
  const doc = open ? proofDoc(open) : null;
  return (
    <PayFrame page="tax" counts={{ tax: list.filter((r) => r.status === 'Waiting').length }}>
      <PageHeader
        title="Proof verification"
        description={`Tax year 2026-27 · ${PROOF_WINDOW}. Verify each line; unproven items are dropped after the cut-off and extra tax is spread over the remaining months.`}
        facts={state === 'ready' && list.length > 0 ? `${list.filter((r) => r.status === 'Waiting').length} lines waiting · ${verified.length} done` : undefined}
        actions={
          <Button icon={Download} onClick={() => state !== 'ready' ? toast({ title: 'The proof lines have not loaded yet.' }) : !verified.length ? toast({ title: 'No lines are verified yet, so there is nothing to export.' }) : setNotice(`Verified proof lines · 2026-27.xlsx downloaded (${verified.length} lines).`)}>
            Export verified lines
          </Button>
        }
      />
      <DataTable
        label="Proof lines"
        columns={cols}
        rows={shown}
        getRowId={(r) => r.id}
        state={tableState(state)}
        onRowClick={openRow}
        activeRowId={open?.id}
        cardSummary
        filtered={shown.length !== list.length && list.length > 0}
        onClearFilters={() => {
          setFilters([
            { key: 'status', type: 'multi', values: [] },
            { key: 'section', type: 'multi', values: [] },
          ]);
          setQ('');
        }}
        empty={
          <EmptyState
            title="No proofs to verify yet."
            description={reminded ? `Reminder sent on ${formatDate(TODAY)} to employees with tax declarations.` : `The ${PROOF_WINDOW} is open and no one has submitted a proof. Remind employees with tax declarations to upload them.`}
            action={
              <Button icon={Send} onClick={() => (reminded ? toast({ title: 'The reminder was already sent today.' }) : (setReminded(true), setNotice('Reminder sent to employees with tax declarations.')))}>
                {reminded ? 'Reminder sent' : 'Send reminder'}
              </Button>
            }
          />
        }
        toolbar={
          <FilterBar
            fields={[
              { key: 'status', label: 'Status', type: 'multi', options: opts(['Waiting', 'Approved', 'Rejected', 'Partly approved']) },
              { key: 'section', label: 'Section', type: 'multi', options: opts(['80C-equivalent', 'HRA', '80D-equivalent', 'Home loan interest', 'NPS (own)']) },
            ]}
            value={filters}
            onChange={setFilters}
            search={q}
            onSearchChange={setQ}
            searchPlaceholder="Search employee or code"
          />
        }
      />
      <Drawer
        open={!!open}
        onOpenChange={(o) => !o && setOpenKey(null)}
        title={open ? `${open.item}` : ''}
        subtitle={open ? `${open.employee} · ${open.code} · ${open.section}` : undefined}
        meta={open && <Badge tone={PROOF_TONE[open.status]}>{open.status}</Badge>}
        size="full"
        footer={
          <>
            <Button onClick={() => setOpenKey(null)}>Cancel</Button>
            <Button onClick={() => decide(true)}>
              Save and open next
            </Button>
            <Button variant={choice === 'reject' ? 'danger' : 'approve'} onClick={() => decide(false)}>
              {choice === 'approve' ? 'Approve line' : choice === 'partial' ? `Approve ${formatINR(amount ?? 0)}` : 'Reject line'}
            </Button>
          </>
        }
      >
        {open && doc && (
          <div className="yx-pay-stack">
            {self && (
              <InlineAlert tone="warning" title="This is your own proof">
                You can't verify your own proofs. Another payroll or HR person must verify it.
              </InlineAlert>
            )}
            <div className="yx-pay-split">
              <DocumentViewer
                key={open.id}
                fileName={doc.fileName}
                mimeType="image/svg+xml"
                versions={[{ id: 'v1', label: `Uploaded ${formatDate(open.submitted)}`, url: doc.url, uploadedBy: open.employee, uploadedAt: open.submitted, size: 48_200 }]}
              />
              <div className="yx-pay-stack">
                <FactRow
                  items={[
                    { label: 'Declared', value: formatINR(open.declared) },
                    { label: 'Amount in proof', value: formatINR(open.proofAmount) },
                    { label: 'Files', value: String(open.files) },
                  ]}
                />
                {open.section === 'HRA' && open.proofAmount > 1_00_000 && <p className="yx-pay-note">Rent for the year is above ₹1,00,000, so the landlord PAN is required. PAN on receipt: {landlordPan(open)}.</p>}
                <FormField label="Decision" required>
                  <RadioGroup
                    value={choice}
                    onChange={(c) => pick(open, c)}
                    options={[
                      { value: 'approve', label: 'Approve in full' },
                      { value: 'partial', label: 'Approve part' },
                      { value: 'reject', label: 'Reject' },
                    ]}
                    disabled={self}
                  />
                </FormField>
                {choice === 'partial' && (
                  <FormField id="pv-amount" label="Approved amount" required error={early.errorOf('pv-amount')}>
                    <CurrencyField value={amount} onChange={setAmount} max={open.proofAmount} disabled={self} />
                  </FormField>
                )}
                <FormField id="pv-comment" label="Comment to employee" required={choice !== 'approve'} error={early.errorOf('pv-comment')} helper="The employee sees this on the line.">
                  <TextArea rows={3} value={comment} onChange={setComment} disabled={self} />
                </FormField>
              </div>
            </div>
          </div>
        )}
      </Drawer>
    </PayFrame>
  );
}

/* ================================================================== PAY-27 EWA admin */

const DRAW_TONE: Record<EwaDraw['status'], BadgeTone> = { Disbursed: 'info', Failed: 'danger', Recovered: 'success', Requested: 'warning' };

/** PAY-27 · EWA admin: policy, partner connection, draws, recoveries in payroll, reconciliation. The app passes `live`. */
export function EwaAdminScreen(p: { tab?: 'policy' | 'partner' | 'draws' | 'recoveries' | 'recon'; persona?: PayPersona; state?: ViewState; partner?: 'connected' | 'not-connected'; live?: LiveEwaAdmin }) {
  return p.live ? <LiveEwaAdmin live={p.live} /> : <SampleEwaAdmin {...p} />;
}

function SampleEwaAdmin({ tab = 'draws', persona = 'pa', state = 'ready', partner = 'connected' }: { tab?: 'policy' | 'partner' | 'draws' | 'recoveries' | 'recon'; persona?: PayPersona; state?: ViewState; partner?: 'connected' | 'not-connected' }) {
  const { toast } = useToast();
  const setNotice = (title: string) => toast({ tone: 'success', title });
  const [requested, setRequested] = useState(false);
  const cols: TableColumn<EwaDraw>[] = [
    { key: 'employee', header: 'Employee', type: 'person', value: (r) => r.employee, person: (r) => ({ name: r.employee, secondary: r.code }), width: 210 },
    { key: 'req', header: 'Requested', type: 'date', value: (r) => r.requested, width: 120 },
    { key: 'earned', header: 'Earned to date', type: 'money', value: (r) => r.earnedToDate, width: 130 },
    { key: 'amount', header: 'Draw', type: 'money', value: (r) => r.amount, total: 'sum', width: 110 },
    { key: 'fee', header: 'Fee', type: 'money', value: (r) => r.fee, total: 'sum', width: 80 },
    { key: 'payer', header: 'Fee paid by', value: (r) => r.feePayer, width: 110 },
    { key: 'status', header: 'Status', type: 'status', value: (r) => r.status, statusTone: (v) => DRAW_TONE[v as EwaDraw['status']], width: 110 },
    { key: 'rec', header: 'Recovery', value: (r) => (r.status === 'Failed' ? 'Nothing to recover' : r.recovery), width: 170 },
    { key: 'rem', header: 'Remittance', value: (r) => r.remittance, width: 120 },
  ];
  const disbursed = EWA_DRAWS.filter((x) => x.status === 'Disbursed');
  const total = disbursed.reduce((a, x) => a + x.amount, 0);
  const content = (
    <div className="yx-pay-stack">
      <Tabs defaultValue={tab}>
        <TabsList aria-label="Earned wage access">
          <TabsTrigger value="policy">Policy</TabsTrigger>
          <TabsTrigger value="partner">Partner</TabsTrigger>
          <TabsTrigger value="draws" count={EWA_DRAWS.length}>
            Draws
          </TabsTrigger>
          <TabsTrigger value="recoveries">Recoveries in payroll</TabsTrigger>
          <TabsTrigger value="recon">Reconciliation</TabsTrigger>
        </TabsList>
        <TabsContent value="policy">
          <div className="yx-pay-grid">
            <div data-span="7" className="yx-pay-stack">
              <InlineAlert tone="info">Starter template (labelled). Change any value; the policy is dated and applies from the next pay period.</InlineAlert>
              <FormSection title="Who can use it">
                <Switch label="On for Monthly · Kaveri Foods Pvt Ltd" defaultChecked />
                <Switch label="On for Hosur plant, loaders (weekly)" />
                <p className="yx-pay-muted">Eligible: confirmed employees, not serving notice, no active salary hold.</p>
              </FormSection>
              <FormSection title="Limits">
                <FieldRow>
                  <FormField label="Available share of earned-to-date" required>
                    <NumberField value={50} onChange={() => {}} min={10} max={80} suffix="%" />
                  </FormField>
                  <FormField label="Draws per pay period" required>
                    <NumberField value={3} onChange={() => {}} min={1} max={5} />
                  </FormField>
                </FieldRow>
                <FieldRow>
                  <FormField label="Minimum draw">
                    <CurrencyField value={500} onChange={() => {}} />
                  </FormField>
                  <FormField label="Maximum draw">
                    <CurrencyField value={25_000} onChange={() => {}} />
                  </FormField>
                </FieldRow>
                <FormField label="Blackout before cut-off" helper="No draws in these days before payroll cut-off.">
                  <NumberField value={3} onChange={() => {}} min={0} max={7} suffix="days" />
                </FormField>
              </FormSection>
              <FormSection title="Fee and funding">
                <FormField label="Fee paid by">
                  <RadioGroup orientation="horizontal" defaultValue="employee" options={[{ value: 'employee', label: 'Employee' }, { value: 'employer', label: 'Company' }, { value: 'split', label: 'Split' }]} />
                </FormField>
                <FormField label="Funding">
                  <RadioGroup
                    defaultValue="partner"
                    options={[
                      { value: 'partner', label: 'Partner-funded (starter)', description: 'The partner pays the employee and is repaid from payroll. The company carries no credit risk.' },
                      { value: 'employer', label: 'Company-funded', description: 'Uses the salary-advance rules; paid in the next bank file.' },
                    ]}
                  />
                </FormField>
              </FormSection>
              <div className="yx-pay-row">
                <Button variant="primary" onClick={() => setNotice('Policy saved by Suresh Pillai on 29 Sep 2026. It applies from the October 2026 pay period.')}>
                  Save policy
                </Button>
              </div>
            </div>
            <div data-span="5" className="yx-pay-panel">
              <SectionTitle>Example</SectionTitle>
              <p className="yx-pay-muted">Expected net ₹30,000 for a 30-day month, 12 payable days so far: earned ₹12,000; 50% available = ₹6,000; fee ₹49 shown before the employee confirms.</p>
            </div>
          </div>
        </TabsContent>
        <TabsContent value="partner">
          {partner === 'not-connected' ? (
            <EmptyState
              title="No EWA partner connected."
              description={requested ? 'Connection request sent to Pragati EarlyPay Pvt Ltd on 29 Sep 2026. They confirm within 2 working days; you can then switch the policy on.' : 'Earned wage access needs a partner (third-party add-on). Connect one to switch the policy on.'}
              action={
                <Button variant="primary" icon={Send} onClick={() => (requested ? toast({ title: 'The connection request was already sent. The partner confirms within 2 working days.' }) : (setRequested(true), setNotice('Connection request sent to Pragati EarlyPay Pvt Ltd.')))}>
                  {requested ? 'Request sent' : 'Connect a partner'}
                </Button>
              }
            />
          ) : (
            <DescriptionList
              columns={2}
              items={[
                { label: 'Partner', value: 'Pragati EarlyPay Pvt Ltd' },
                { label: 'Connection', value: <Badge tone="success">Connected since 1 Aug 2026</Badge> },
                { label: 'Fee per draw', value: '₹49 (up to ₹10,000), ₹79 above' },
                { label: 'Agreement', value: <Link href="#agreement">Signed 28 Jul 2026 (PDF)</Link> },
                { label: 'Unrecovered draws', value: "Partner's risk under the agreement; never invoiced to the company" },
                { label: 'Remittance', value: 'One line in each run bank file' },
              ]}
            />
          )}
        </TabsContent>
        <TabsContent value="draws">
          <DataTable label="EWA draws, September 2026" columns={cols} rows={EWA_DRAWS} getRowId={(r) => r.id} state={tableState(state)} onExport={(format) => setNotice(`EWA draws · September 2026.${format} downloaded (${EWA_DRAWS.length} draws).`)} />
        </TabsContent>
        <TabsContent value="recoveries">
          <PlainTable
            label="Recoveries in payroll"
            rows={[
              { run: 'September 2026', draws: String(disbursed.length), recovered: formatINR(total - 2_000), deferred: formatINR(2_000), ff: `1 leaver: ${formatINR(1_500)}` },
              { run: 'August 2026', draws: '9', recovered: formatINR(31_500), deferred: '—', ff: '—' },
            ]}
            getRowId={(r) => r.run}
            columns={[
              { key: 'run', header: 'Run', rowHeader: true, cell: (r) => r.run },
              { key: 'draws', header: 'Draws', num: true, cell: (r) => r.draws },
              { key: 'recovered', header: 'Recovered', num: true, cell: (r) => r.recovered },
              { key: 'deferred', header: 'Deferred (deduction cap)', num: true, cell: (r) => r.deferred },
              { key: 'ff', header: 'To F&F', cell: (r) => r.ff },
            ]}
          />
        </TabsContent>
        <TabsContent value="recon">
          <div className="yx-pay-stack">
            <FactRow
              items={[
                { label: 'Draws disbursed by partner', value: formatINR(total) },
                { label: 'Recovered in payroll', value: formatINR(total - 2_000) },
                { label: 'Remitted to partner', value: formatINR(total - 2_000) },
                { label: 'Difference', value: `${formatINR(2_000)} (deferred to October)` },
              ]}
            />
            <InlineAlert tone="info">Each draw is matched to its payslip deduction and to the remittance line in the bank file. A shortfall the payroll can't recover stays with the partner.</InlineAlert>
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
  return tab === 'policy' ? (
    <PaySettingsFrame page="4.10">
      <PageHeader title="Earned wage access" description="Policy per pay group, partner connection and payroll recovery." />
      <StateBlock state={state}>{content}</StateBlock>
    </PaySettingsFrame>
  ) : (
    <PayFrame page="loans" persona={persona}>
      <PageHeader title="Earned wage access" description="Draws against earned-to-date salary, recovered in the next run and remitted to the partner." facts={`${EWA_DRAWS.length} draws in September · ${formatINR(total)} disbursed`} />
      <StateBlock state={state}>{content}</StateBlock>
    </PayFrame>
  );
}

/* ================================================================== PAY-25 Payroll reports */

export type ReportId = PayReportKind;
export type ReportPeriod = 'sep' | 'aug';
export type ReportGroup = 'ka' | 'tn';

interface MonthPay {
  gross: number;
  ded: number;
  tds: number;
  net: number;
}
/** One payslip in the register: every deduction line on its own, Net = Gross − deductions. */
interface PayLine {
  id: string;
  code: string;
  name: string;
  department: string;
  days: number;
  basic: number;
  hra: number;
  special: number;
  /** One-time earnings and arrears paid in this run (in Gross). */
  oneTime: number;
  gross: number;
  pf: number;
  esi: number;
  pt: number;
  tds: number;
  lop: number;
  loans: number;
  deductions: number;
  net: number;
  prevNet: number;
  /** A month of regular pay: no one-time pay, no unpaid leave. */
  regular: MonthPay;
  status: RunRow['status'];
  reason?: string;
  mode: RunRow['mode'];
  joined: Date;
  bank: string;
  account: string;
  ifsc: string;
}

/** Loans with their pauses, for the register's EMI line and the loan ledger. */
const LEDGER_LOANS: Loan[] = LOANS.map((l) => ({ ...l, pause: LOAN_PAUSES[l.id] }));
/** EMIs recovered in this run: active loans and loans waiting to be pre-closed, from each schedule. */
const runLoanEmi = (name: string) => sumBy(
  LEDGER_LOANS.filter((l) => l.employee === name),
  runEmi,
);
/** Arjun Kulkarni's revision is effective 1 Aug and was approved after the August run, so August arrears are paid now. */
const ARJUN_ROW = RUN_ROWS.find((r) => r.name === 'Arjun Kulkarni')!;
/** Taxable one-time pay in the run (approved September earnings; Arjun's arrear is taxable salary). */
const runTaxableOneTime = (name: string) =>
  sumBy(
    ONE_TIME.filter((o) => o.employee === name && o.kind === 'Earning' && o.period === RUN.periodShort && o.status === 'Approved' && o.taxable),
    (o) => o.amount,
  ) + (name === ARJUN_ROW.name ? ARJUN_AUG_ARREAR : 0);

/** Karnataka payslip: Basic 45%, HRA 18%; PF 12% of basic to the ₹15,000 ceiling; PT ₹200 from ₹25,000; ESI to ₹21,000; TDS from the new-regime projection plus tax on one-time pay; LOP = gross ÷ 30 × days.
    RunRow.gross already includes one-time pay (r.oneTime), so the statutory lines work on the regular month (base). */
function payLine(r: RunRow): PayLine {
  const base = r.gross - r.oneTime;
  const basic = Math.round(base * 0.45);
  const hra = Math.round(base * 0.18);
  const pf = pfContribution(basic, { restrictToCeiling: true }).employee;
  const esi = esiContribution(base).employee;
  const pt = base >= 25_000 ? 200 : 0;
  const annualTax = computeTax(base * 12, 'new').total;
  const regularTds = Math.round(annualTax / 12);
  const oneTime = r.oneTime;
  const tds = regularTds + Math.round(computeTax(base * 12 + runTaxableOneTime(r.name), 'new').total - annualTax);
  const lop = Math.round((base / 30) * r.lop);
  const loans = runLoanEmi(r.name);
  const gross = r.gross;
  const deductions = pf + esi + pt + tds + lop + loans;
  const net = gross - deductions;
  const regularDed = pf + esi + pt + regularTds + loans;
  const regular = { gross: base, ded: regularDed, tds: regularTds, net: base - regularDed };
  // August: a full month of regular pay (no unpaid leave); a revision or new component scales it back by the run's jump.
  const prevNet = r.status === 'Flagged' ? (r.lop > 0 ? regular.net : Math.round((regular.net * r.prevNet) / r.net)) : Math.round((net * r.prevNet) / r.net);
  const pay = PAYMENTS.find((p) => p.id === r.id)!;
  return {
    id: r.id,
    code: r.code,
    name: r.name,
    department: r.department,
    days: r.payableDays,
    basic,
    hra,
    special: base - basic - hra,
    oneTime,
    gross,
    pf,
    esi,
    pt,
    tds,
    lop,
    loans,
    deductions,
    net,
    prevNet,
    regular,
    status: r.status,
    reason: r.reason,
    mode: r.mode,
    joined: EMPLOYEES.find((e) => e.id === r.id)?.joined ?? TODAY,
    bank: pay.bank,
    account: pay.account,
    ifsc: pay.ifsc,
  };
}

/** Divya is paid by the Tamil Nadu entity: her line comes from her own payslip. */
const slipAmt = (xs: { label: string; amount: number }[], start: string) => xs.filter((x) => x.label.startsWith(start)).reduce((a, x) => a + x.amount, 0);
const DIVYA_LOP = slipAmt(MY_PAYSLIP.deductions, 'Unpaid');
const DIVYA_TDS = slipAmt(MY_PAYSLIP.deductions, 'Income tax');
const DIVYA_LINE: PayLine = {
  id: ME.id,
  code: ME.code,
  name: ME.name,
  department: ME.department,
  days: MY_PAYSLIP.paidDays,
  basic: slipAmt(MY_PAYSLIP.earnings, 'Basic'),
  hra: slipAmt(MY_PAYSLIP.earnings, 'House rent'),
  special: MY_GROSS - slipAmt(MY_PAYSLIP.earnings, 'Basic') - slipAmt(MY_PAYSLIP.earnings, 'House rent'),
  oneTime: 0,
  gross: MY_GROSS,
  pf: slipAmt(MY_PAYSLIP.deductions, 'Provident'),
  esi: 0,
  pt: slipAmt(MY_PAYSLIP.deductions, 'Professional'),
  tds: DIVYA_TDS,
  lop: DIVYA_LOP,
  loans: 0,
  deductions: MY_DEDUCTIONS,
  net: MY_NET,
  prevNet: MY_PREV_NET,
  regular: { gross: MY_GROSS, ded: MY_DEDUCTIONS - DIVYA_LOP, tds: DIVYA_TDS, net: MY_GROSS - MY_DEDUCTIONS + DIVYA_LOP },
  status: 'Calculated',
  mode: 'Bank',
  joined: MY_PAYSLIP.employee.joinedOn,
  bank: MY_PAYSLIP.employee.bankName,
  account: MY_PAYSLIP.employee.accountNumber,
  ifsc: 'CCOB0000452',
};
const KA_LINES = RUN_ROWS.map(payLine).filter((l) => l.code !== ME.code);

/** Arrears paid in the September run: Arjun Kulkarni's revision, and Farida Das's night shift arrear from one-time pay (RUN_PICKS.night). */
const NIGHT_ARREAR = ONE_TIME.find((o) => o.type === 'Arrear')!;
const ARREARS = [
  { id: 'a1', name: ARJUN_ROW.name, code: ARJUN_ROW.code, month: 'Aug 2026', cause: 'Salary revision from 1 Aug, approved after the August run', amount: ARJUN_AUG_ARREAR },
  { id: 'a2', name: NIGHT_ARREAR.employee, code: NIGHT_ARREAR.code, month: 'Aug 2026', cause: 'Night shift allowance missed in August', amount: NIGHT_ARREAR.amount },
];

/** Tax-year months so far. Earlier months use each person's regular pay; September is this run. */
const FY_MONTHS = ['Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep'];
const loanEmiIn = (name: string, month: string) =>
  sumBy(
    LEDGER_LOANS.filter((l) => l.employee === name),
    (l) => loanSchedule(l).find((r) => r.month === month && r.status === 'paid')?.emi ?? 0,
  );
// ponytail: April–August are rebuilt from regular pay, not read from locked registers; read the archived registers once they are loaded here.
function monthsOf(l: PayLine): (MonthPay | null)[] {
  if (l.id === ME.id) {
    const hist = [...PAYSLIP_HISTORY].reverse();
    return hist.map((h, i) => ({ gross: h.gross, net: h.net, ded: h.gross - h.net, tds: i < MY_TDS_BY_MONTH.length ? MY_TDS_BY_MONTH[i] : l.tds }));
  }
  return FY_MONTHS.map((m, i) => {
    if (l.joined > new Date(2026, 4 + i, 0)) return null;
    if (i === FY_MONTHS.length - 1) return { gross: l.gross, ded: l.deductions, tds: l.tds, net: l.net };
    // Earlier EMIs come from each loan's own schedule (an advance from August has no April EMI).
    const ded = l.regular.ded - l.loans + loanEmiIn(l.name, `${m} 2026`);
    return { gross: l.regular.gross, ded, tds: l.regular.tds, net: l.regular.gross - ded };
  });
}

const serviceMonths = (joined: Date) => (TODAY.getFullYear() - joined.getFullYear()) * 12 + TODAY.getMonth() - joined.getMonth() - (TODAY.getDate() < joined.getDate() ? 1 : 0);
/** Gratuity wage: basic (no DA here) plus the Code add-back that lifts wages to half of pay. */
const gratuityWage = (l: PayLine) => codeWageAddBack(l.basic, l.regular.gross).codeWage;
/** Liability built up to date: 15 days' wages (wage ÷ 26) per year of service, from the joining date. */
const gratuityLiability = (l: PayLine) => Math.min(GRATUITY_CAP, Math.round(((gratuityWage(l) * 15) / 26) * (serviceMonths(l.joined) / 12)));
const AGE_BUCKETS = [
  { id: 'b1', label: '0–30 days', from: 0, to: 30 },
  { id: 'b2', label: '31–60 days', from: 31, to: 60 },
  { id: 'b3', label: 'Over 60 days', from: 61, to: Infinity },
];

/* The design's sample data for the one reports view (reports-live.tsx): the September Karnataka run and Divya's Tamil
   Nadu payslip, in the shape the API sends. August is locked here, so its reports are empty. */
const SEP = '2026-09';
const AUG = '2026-08';
const s2 = (x: number) => x.toFixed(2);
const isoDay = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
const SAMPLE_PAGE = (total: number) => ({ total, page: 1, pageSize: 200 });
const BLR = 'blr';
const CHE = 'che';
const SAMPLE_OPTIONS: ReportOptions = {
  entities: [
    { id: ENTITY_KA.id, name: ENTITY_KA.name },
    { id: ENTITY_TN.id, name: ENTITY_TN.name },
  ],
  departments: [...new Set([...RUN_ROWS.map((r) => r.department), ME.department])].sort().map((d) => ({ id: d, name: d })),
  locations: [
    { id: BLR, name: 'Bengaluru', legalEntityId: ENTITY_KA.id },
    { id: CHE, name: 'Chennai', legalEntityId: ENTITY_TN.id },
  ],
  months: [SEP, AUG],
  today: isoDay(TODAY),
};
/** The register's columns: one per pay part, as the API sends one per component. */
const REGISTER_PARTS: [string, string, string, (l: PayLine) => number][] = [
  ['basic', 'Basic', 'earning', (l) => l.basic],
  ['hra', 'HRA', 'earning', (l) => l.hra],
  ['special', 'Special and other', 'earning', (l) => l.special],
  ['one_time', 'One-time and arrears', 'earning', (l) => l.oneTime],
  ['pf_employee', 'Provident fund', 'deduction', (l) => l.pf],
  ['esi_employee', 'ESI', 'deduction', (l) => l.esi],
  ['pt', 'Professional tax', 'deduction', (l) => l.pt],
  ['tds', 'TDS', 'deduction', (l) => l.tds],
  ['lop', 'Unpaid leave', 'deduction', (l) => l.lop],
  ['loans', 'Loan EMIs', 'deduction', (l) => l.loans],
];
const employerOf = (l: PayLine) => RUN_ROWS.find((r) => r.id === l.id)?.employerCost ?? l.gross;
const monthOf = (short: string) => `2026-${String(MON.indexOf(short) + 1).padStart(2, '0')}`;
const deptOfCode = (code: string) => RUN_ROWS.find((r) => r.code === code)?.department ?? '';

function sampleReport(kind: ReportId, f: ReportFilters): PayReport {
  const to = f.to ?? SEP;
  const inSep = (f.from ?? to) <= SEP && to >= SEP;
  const deptOk = (d: string) => !f.departmentId || d === f.departmentId;
  const lines = !inSep ? [] : [...(f.legalEntityId !== ENTITY_TN.id && f.locationId !== CHE ? KA_LINES : []), ...(f.legalEntityId !== ENTITY_KA.id && f.locationId !== BLR ? [DIVYA_LINE] : [])].filter((l) => deptOk(l.department));
  // The run totals, holds and loans are the Karnataka run's.
  const ka = inSep && f.legalEntityId !== ENTITY_TN.id && f.locationId !== CHE;
  const who = (l: PayLine) => ({ id: l.id, employeeId: l.id, name: l.name, code: l.code });
  const sum = (xs: PayLine[], g: (l: PayLine) => number) => s2(sumBy(xs, g));
  switch (kind) {
    case 'register':
      return {
        kind,
        components: REGISTER_PARTS.map(([code, name, k]) => ({ code, name, kind: k })),
        rows: lines.map((l) => ({ ...who(l), department: l.department, month: SEP, runType: 'regular', gross: s2(l.gross), deductions: s2(l.deductions), net: s2(l.net), employerCost: s2(employerOf(l)), lines: Object.fromEntries(REGISTER_PARTS.map(([code, , , get]) => [code, s2(get(l))])) })),
        totals: { gross: sum(lines, (l) => l.gross), deductions: sum(lines, (l) => l.deductions), net: sum(lines, (l) => l.net), employerCost: sum(lines, employerOf), lines: Object.fromEntries(REGISTER_PARTS.map(([code, , , get]) => [code, sum(lines, get)])) },
        ...SAMPLE_PAGE(lines.length),
      };
    case 'recon': {
      // August's totals are the whole Karnataka run's, so the sample has no department split.
      const ls = ka && !f.departmentId ? KA_LINES : [];
      const aug = RUN_HISTORY.find((h) => h.month === 'Aug')!;
      const sepGross = sumBy(ls, (l) => l.gross);
      const sepNet = sumBy(ls, (l) => l.net);
      const joiners = ls.filter((l) => l.joined > new Date(2026, 7, 31));
      const joinGross = sumBy(joiners, (l) => l.regular.gross);
      const row = (item: string, label: string, a: number, b: number, isMoney = true) => ({ item, label, previous: isMoney ? s2(a) : String(a), current: isMoney ? s2(b) : String(b), difference: isMoney ? s2(b - a) : String(b - a) });
      return {
        kind,
        month: SEP,
        previous: AUG,
        rows: [
          row('employees', 'Employees', aug.employees, ls.length, false),
          row('gross', 'Gross', aug.gross, sepGross),
          row('deductions', 'Deductions', aug.gross - aug.net, sumBy(ls, (l) => l.deductions)),
          row('net', 'Net', aug.net, sepNet),
          row('employerCost', 'Cost to company', RUN.lastEmployerCost, ls.length ? RUN.employerCost : 0),
        ],
        bridge: {
          joiners: { count: joiners.length, gross: s2(joinGross) },
          leavers: { count: 0, gross: '0.00' },
          changed: { count: ls.filter((l) => l.oneTime > 0 || l.lop > 0 || l.prevNet !== l.net).length, gross: s2(sepGross - aug.gross - joinGross) },
        },
        trend: RUN_HISTORY.map((h) => ({ month: monthOf(h.month), gross: s2(h.month === 'Sep' ? sepGross : h.gross), net: s2(h.month === 'Sep' ? sepNet : h.net) })),
      };
    }
    case 'variance': {
      const all = lines.map((l) => ({ l, v: variance(l.net, l.prevNet) }));
      const flagged = all.filter((x) => x.v.flagged);
      return {
        kind,
        month: SEP,
        threshold: '10',
        buckets: { below: all.filter((x) => x.v.pct < -10).length, down: all.filter((x) => x.v.pct >= -10 && x.v.pct < 0).length, up: all.filter((x) => x.v.pct >= 0 && x.v.pct <= 10).length, above: all.filter((x) => x.v.pct > 10).length },
        rows: flagged.map(({ l, v }) => ({ ...who(l), previous: s2(l.prevNet), current: s2(l.net), difference: s2(l.net - l.prevNet), change: v.pct.toFixed(1), cause: l.reason ?? null })),
        ...SAMPLE_PAGE(flagged.length),
      };
    }
    case 'ctc': {
      const rs = ka ? RUN_ROWS.filter((r) => r.code !== ME.code && deptOk(r.department)) : [];
      const depts = [...new Set(rs.map((r) => r.department))].sort();
      const rows = depts.map((d) => {
        const xs = rs.filter((r) => r.department === d);
        return { id: d, department: d, people: xs.length, gross: s2(sumBy(xs, (r) => r.gross)), employer: s2(sumBy(xs, (r) => r.employerCost - r.gross)), ctc: s2(sumBy(xs, (r) => r.employerCost)) };
      });
      return { kind, rows, totals: { gross: s2(sumBy(rs, (r) => r.gross)), employer: s2(sumBy(rs, (r) => r.employerCost - r.gross)), ctc: s2(sumBy(rs, (r) => r.employerCost)) } };
    }
    case 'arrears': {
      const rows = (ka ? ARREARS : []).filter((a) => deptOk(deptOfCode(a.code))).map((a) => ({ id: a.id, employeeId: a.id, name: a.name, code: a.code, fromMonth: AUG, toMonth: AUG, payMonth: SEP, reason: a.cause, amount: s2(a.amount), employerCost: '0.00', runStatus: 'approved' }));
      return { kind, rows, totals: { amount: s2(sumBy(rows, (r) => Number(r.amount))), employerCost: '0.00' }, ...SAMPLE_PAGE(rows.length) };
    }
    case 'ytd': {
      const rows = lines.map((l) => {
        const ms = monthsOf(l).filter((m): m is MonthPay => m != null);
        return { ...who(l), months: ms.length, gross: s2(sumBy(ms, (m) => m.gross)), tds: s2(sumBy(ms, (m) => m.tds)), deductions: s2(sumBy(ms, (m) => m.ded)), net: s2(sumBy(ms, (m) => m.net)) };
      });
      const perMonth = FY_MONTHS.map((_, i) => lines.map((l) => monthsOf(l)[i]).filter((m): m is MonthPay => m != null));
      let [g, n] = [0, 0];
      const trend = lines.length ? perMonth.map((ms, i) => ({ month: monthOf(FY_MONTHS[i]), gross: s2((g += sumBy(ms, (m) => m.gross))), net: s2((n += sumBy(ms, (m) => m.net))) })) : [];
      const tot = (k: 'gross' | 'tds' | 'deductions' | 'net') => s2(sumBy(rows, (r) => Number(r[k])));
      return { kind, yearStart: '2026-04', rows, totals: { gross: tot('gross'), tds: tot('tds'), deductions: tot('deductions'), net: tot('net') }, trend, ...SAMPLE_PAGE(rows.length) };
    }
    case 'bank': {
      const paid = lines.filter((l) => l.mode === 'Bank' && l.status !== 'Held' && l.status !== 'Failed');
      return { kind, rows: paid.map((l) => ({ ...who(l), month: SEP, ifsc: l.ifsc, account: l.account.slice(-4), amount: s2(l.net), status: 'pending' })), totals: { count: paid.length, amount: sum(paid, (l) => l.net) }, left: lines.length - paid.length, ...SAMPLE_PAGE(paid.length) };
    }
    case 'holds': {
      // Holds are as on today: the month does not apply.
      const ka2 = f.legalEntityId !== ENTITY_TN.id && f.locationId !== CHE;
      const open = (ka2 ? HOLDS : []).filter((h) => h.status !== 'Released' && deptOk(deptOfCode(h.code)));
      const reasons = [...new Set(open.map((h) => h.reason))];
      return {
        kind,
        asOn: SAMPLE_OPTIONS.today,
        buckets: AGE_BUCKETS.map((b) => {
          const hs = open.filter((h) => h.ageDays >= b.from && h.ageDays <= b.to);
          return { id: b.id, count: hs.length, amount: s2(sumBy(hs, (h) => h.amount)) };
        }),
        reasons: reasons.map((reason) => ({ reason, count: open.filter((h) => h.reason === reason).length, amount: s2(sumBy(open.filter((h) => h.reason === reason), (h) => h.amount)) })),
        rows: open.map((h) => ({ id: h.id, employeeId: h.id, name: h.employee, code: h.code, reason: h.reason, since: isoDay(h.since), ageDays: h.ageDays, amount: s2(h.amount) })),
        totals: { count: open.length, amount: s2(sumBy(open, (h) => h.amount)) },
        ...SAMPLE_PAGE(open.length),
      };
    }
    case 'gratuity': {
      const rows = lines.map((l) => ({ ...who(l), joined: isoDay(l.joined), serviceMonths: serviceMonths(l.joined), eligible: gratuity(gratuityWage(l), serviceMonths(l.joined)).eligible, thisMonth: s2(Math.round((gratuityWage(l) * 15) / 26 / 12)), toDate: s2(gratuityLiability(l)) }));
      return { kind, month: SEP, minYears: 5, rows, totals: { thisMonth: s2(sumBy(rows, (r) => Number(r.thisMonth))), toDate: s2(sumBy(rows, (r) => Number(r.toDate))) }, ...SAMPLE_PAGE(rows.length) };
    }
    case 'loans': {
      const rows = (ka ? LEDGER_LOANS : [])
        .filter((l) => l.status !== 'Waiting for approval' && deptOk(deptOfCode(l.code)))
        .map((l) => {
          const r = runRow(l);
          const recovered = r?.status === 'due' ? r.emi : 0;
          const closing = r ? r.balance : l.outstanding;
          return { id: l.id, employeeId: l.id, name: l.employee, code: l.code, type: l.type, principal: s2(l.principal), emi: s2(l.emi), opening: s2(closing + recovered), recovered: s2(recovered), closing: s2(closing), status: l.status };
        });
      const tot = (k: 'principal' | 'opening' | 'recovered' | 'closing') => s2(sumBy(rows, (r) => Number(r[k])));
      return { kind, rows, totals: { principal: tot('principal'), opening: tot('opening'), recovered: tot('recovered'), closing: tot('closing') }, ...SAMPLE_PAGE(rows.length) };
    }
  }
}

/** PAY-25 · Payroll reports (T7): the report picker, filters on one row, the report's chart and table, CSV export. The app passes `live`. */
export function PayrollReportsScreen({
  live,
  report = 'register',
  persona = 'pa',
  state = 'ready',
  period = 'sep',
  group = 'ka',
}: {
  /** The live app's /yx/payroll/reports. */
  live?: LivePayrollReports;
  report?: ReportId;
  persona?: PayPersona;
  state?: ViewState;
  period?: ReportPeriod;
  group?: ReportGroup;
}) {
  if (live) return live.state === 'no-access' ? <ReportsNoAccess live={{ request: live.accessRequest, onRequest: live.onRequestAccess }} /> : <ReportsView live={live} />;
  return (
    <PayFrame page="reports" persona={persona}>
      <SampleReports key={`${report}${state}${period}${group}`} report={report} state={state} period={period} group={group} />
    </PayFrame>
  );
}

function SampleReports({ report, state, period, group }: { report: ReportId; state: ViewState; period: ReportPeriod; group: ReportGroup }) {
  const [kind, setKind] = useState<ReportId>(report);
  const [filters, setFilters] = useState<ReportFilters>({ legalEntityId: group === 'tn' ? ENTITY_TN.id : ENTITY_KA.id, from: null, to: period === 'aug' ? AUG : SEP, departmentId: null, locationId: null });
  const [scheduling, setScheduling] = useState(false);
  const [frequency, setFrequency] = useState<'run' | 'month'>('run');
  const { toast } = useToast();
  const narrow = useNarrow();
  const meta = PAY_REPORTS.find((r) => r.id === kind)!;
  const entity = SAMPLE_OPTIONS.entities.find((e) => e.id === filters.legalEntityId)?.name ?? 'all legal entities';
  const frequencyOptions = [
    { value: 'run' as const, label: 'When each run is locked' },
    { value: 'month' as const, label: 'On the 1st of every month' },
  ];
  return (
    <>
      <ReportsView
        live={{
          state: 'ready',
          options: SAMPLE_OPTIONS,
          kind,
          onKind: setKind,
          filters,
          onFilters: setFilters,
          page: 1,
          onPage: () => undefined,
          report: state === 'ready' ? sampleReport(kind, filters) : null,
          reportState: state === 'error' ? 'error' : state === 'ready' ? 'ready' : 'loading',
          onExport: async () => undefined,
          schedule: <Button onClick={() => setScheduling(true)}>Schedule</Button>,
        }}
      />
      <Dialog
        open={scheduling}
        onOpenChange={setScheduling}
        title={`Schedule ${meta.name.toLowerCase()}?`}
        description={`Emailed to ${PAYROLL_ADMIN.name} as CSV for ${entity}.`}
        footer={
          <>
            <Button onClick={() => setScheduling(false)}>Cancel</Button>
            <Button
              variant="primary"
              onClick={() => {
                setScheduling(false);
                toast({ tone: 'success', title: `${meta.name} scheduled: emailed to ${PAYROLL_ADMIN.name} ${frequency === 'run' ? 'when each run is locked' : 'on the 1st of every month'}.` });
              }}
            >
              Schedule report
            </Button>
          </>
        }
      >
        <FormField label="Send" required>
          {narrow ? <Select value={frequency} onChange={(v) => v && setFrequency(v as 'run' | 'month')} options={frequencyOptions} /> : <Segment label="Send" value={frequency} onChange={setFrequency} options={frequencyOptions} />}
        </FormField>
      </Dialog>
    </>
  );
}

/** Report page when a person has no payroll scope (P02): shown instead of figures. The app passes `live` (its own shell around it). */
export function ReportsNoAccess({ live }: { /** Live: the latest request and "Request access" (approvals engine); without onRequest it says whom to ask. */ live?: { request?: ReportsAccessRequest | null; onRequest?: () => Promise<unknown> } }) {
  const [sent, setSent] = useState(false);
  const { toast } = useToast();
  const { busy, run } = useRun();
  const req = live?.request;
  const pending = req?.status === 'pending';
  const ask = () => {
    if (pending) return toast({ title: 'You already asked for access. It is waiting for approval.' });
    void run('ask', async () => {
      try {
        await live!.onRequest!();
        toast({ tone: 'success', title: 'Request sent', description: "Someone who gives access decides; you'll get a notification." });
      } catch (e) {
        toast({ tone: 'error', title: e instanceof Error && e.message ? e.message : 'The request was not sent. Try again.' });
      }
    });
  };
  const body = (
    <>
      <PageHeader title="Payroll reports" />
      {live ? (
        live.onRequest ? (
          <EmptyState
            title="You don't have access to payroll reports"
            description={
              pending
                ? `Request sent on ${formatDate(new Date(req!.askedAt))}${req!.legalEntity ? ` for ${req!.legalEntity}` : ''}. Someone who gives access decides; you'll get a notification.`
                : req?.status === 'approved' && req.grant && req.grant.status !== 'active'
                  ? `Your read-only access${req.legalEntity ? ` to ${req.legalEntity}` : ''} ended on ${formatDate(new Date(`${req.grant.validTo}T00:00:00`))}. You can ask again.`
                  : req?.status === 'approved'
                  ? `Your request of ${formatDate(new Date(req.askedAt))} was approved${req.grant ? `: read-only access until ${formatDate(new Date(`${req.grant.validTo}T00:00:00`))}. Reload the page to open the reports.` : '. Reload the page to open the reports.'}`
                  : req?.status === 'rejected'
                    ? `Your request of ${formatDate(new Date(req.askedAt))} was turned down. You can ask again.`
                    : 'Payroll reports need payroll access for a legal entity. Ask for it here; someone who gives access decides.'
            }
            action={
              <Button variant="primary" icon={Send} loading={busy === 'ask'} onClick={ask}>
                {pending ? 'Request sent' : 'Request access'}
              </Button>
            }
          />
        ) : (
          <EmptyState title="You don't have access to payroll reports" description="Payroll reports need payroll access for a legal entity. Ask your payroll admin or a system admin to give it to you." />
        )
      ) : (
        <EmptyState
          title="You don't have access to payroll reports"
          description={sent ? `Request sent to ${PAYROLL_ADMIN.name} on 29 Sep 2026. You'll get a notification when it's decided.` : `Ask ${PAYROLL_ADMIN.name}, your payroll admin, for access.`}
          action={
            <Button variant="primary" icon={Send} onClick={() => (sent ? toast({ title: `You already asked ${PAYROLL_ADMIN.name} for access.` }) : (setSent(true), toast({ tone: 'success', title: 'Request sent', description: `${PAYROLL_ADMIN.name} decides; you'll get a notification.` })))}>
              {sent ? 'Request sent' : 'Request access'}
            </Button>
          }
        />
      )}
    </>
  );
  if (live) return <div className="yx-pay-stack">{body}</div>;
  const rail = SCREEN_RAIL.filter((r) => ['home', 'people', 'time', 'pay', 'compliance', 'performance', 'helpdesk', 'analytics', 'settings'].includes(r.id));
  return (
    <DesktopFrame area="pay" panelTitle="Pay" panel={[{ label: 'Pay', items: [{ label: 'Reports', active: true }] }]} railItems={rail} user={HR_ADMIN}>
      {body}
    </DesktopFrame>
  );
}

/* ================================================================== Live (the app passes `live`; stories show the samples above) */

const MONEY_RX = /^\d{1,10}(\.\d{1,2})?$/;
const MONTH_RX = /^\d{4}-\d{2}$/;
const DAY_RX = /^\d{4}-\d{2}-\d{2}$/;
const nextMonthOf = () => {
  const t = new Date(Date.now() + 330 * 60_000);
  return new Date(Date.UTC(t.getUTCFullYear(), t.getUTCMonth() + 1, 1)).toISOString().slice(0, 7);
};

/** A short decision with fields in a dialog: the confirm button is never disabled; pressed too early the errors show and the first field takes focus; done is a 5-second toast. */
function FormDialog({ title, description, confirm, done, errors, tone = 'primary', onClose, onSave, children }: { title: string; description?: ReactNode; confirm: string; done: string; errors: FormErrorItem[]; tone?: 'primary' | 'danger'; onClose: () => void; onSave: () => Promise<unknown>; children: (errorOf: (id: string) => string | undefined) => ReactNode }) {
  const { toast } = useToast();
  const early = useTooEarly(errors);
  const { busy, error, run } = useRun();
  return (
    <Dialog
      open
      onOpenChange={(o) => !o && onClose()}
      title={title}
      description={description}
      size="md"
      preventClose={busy != null}
      notice={
        error && (
          <InlineAlert tone="danger" title="That did not work">
            {error}
          </InlineAlert>
        )
      }
      footer={
        <>
          <Button onClick={onClose}>Cancel</Button>
          <Button
            variant={tone}
            loading={busy === 'save'}
            onClick={() => {
              if (early.stop()) return;
              void run('save', onSave).then((ok) => {
                if (!ok) return;
                toast({ title: done, tone: 'success' });
                onClose();
              });
            }}
          >
            {confirm}
          </Button>
        </>
      }
    >
      <div className="yx-pay-stack">{children(early.errorOf)}</div>
    </Dialog>
  );
}

/* ------------------------------------------------------------------ PAY-17 live: Payroll › Loans and advances */

export interface LiveLoans {
  state: LoadState;
  onRetry?: () => void;
  loans: LoanView[] | null;
  nameOf: (employeeId: string) => string;
  /** payroll.loan.manage: asks for someone and changes loans (never one's own; the API checks both again). */
  can: { manage: boolean };
  onSearch: (q: string) => Promise<PersonHit[]>;
  onRequest: (x: LoanRequestInput) => Promise<unknown>;
  onChange: (loan: LoanView, x: LoanChangeInput) => Promise<unknown>;
  /** GET payroll/loans/:id/repayments (founder answer 5): the schedule and the pre-closure today. */
  onRepayments: (loan: LoanView) => Promise<LoanRepayments>;
}

const LIVE_SCHED: Record<LoanRepayments['rows'][number]['status'], string> = { recovered: 'Recovered', paused: 'Paused', scheduled: 'Scheduled' };

/** The loan's months as the PAY-17 design shows them (No., month, EMI, interest, balance, status), from the API. */
function LiveSchedule({ data }: { data: LoanRepayments | null | 'error' }) {
  if (data === 'error') return <InlineAlert tone="danger">The schedule didn't load. Close the loan and open it again.</InlineAlert>;
  if (!data) return <p className="yx-pay-muted" role="status">Loading the schedule…</p>;
  if (!data.rows.length) return <p className="yx-pay-note">No instalments yet. They start once the loan is approved.</p>;
  return (
    <PlainTable
      label="Schedule"
      caption="Schedule"
      rows={data.rows}
      getRowId={(r) => String(r.no)}
      rowTone={(r) => (r.status === 'paused' ? { tone: 'warning', label: 'Paused' } : undefined)}
      columns={[
        { key: 'no', header: 'No.', cell: (r) => r.no },
        { key: 'month', header: 'Month', rowHeader: true, cell: (r) => monthName(r.month) },
        { key: 'emi', header: 'EMI', num: true, cell: (r) => rupees(r.emi) },
        { key: 'interest', header: 'Interest', num: true, cell: (r) => rupees(r.interest) },
        { key: 'balance', header: 'Balance', num: true, cell: (r) => rupees(r.balance) },
        { key: 'status', header: 'Status', cell: (r) => LIVE_SCHED[r.status] },
      ]}
    />
  );
}

const LIVE_LOAN_FILTERS: FilterValue[] = [
  { key: 'status', type: 'multi', values: [] },
  { key: 'type', type: 'multi', values: [] },
];

function LiveLoans({ live }: { live: LiveLoans }) {
  const all = live.loans ?? [];
  const [openId, setOpenId] = useState<string | null>(null);
  const open = all.find((l) => l.id === openId) ?? null;
  const [dialog, setDialog] = useState<'pause' | 'reschedule' | 'preclose' | 'add' | null>(null);
  const [filters, setFilters] = useState<FilterValue[]>(LIVE_LOAN_FILTERS);
  const [q, setQ] = useState('');
  const [months, setMonths] = useState<LoanRepayments | null | 'error'>(null);
  useEffect(() => {
    setMonths(null);
    if (!openId) return;
    const loan = all.find((l) => l.id === openId);
    if (loan) live.onRepayments(loan).then(setMonths, () => setMonths('error'));
  }, [openId]); // eslint-disable-line react-hooks/exhaustive-deps
  const query = q.trim().toLowerCase();
  const typeOf = (l: LoanView) => LOAN_TYPE_TEXT[l.loanType] ?? l.loanType;
  const stateOf = (l: LoanView) => LOAN_STATE[l.status]?.label ?? l.status;
  const shown = all.filter((l) => filters.every((f) => matchesFilter(f.key === 'status' ? stateOf(l) : typeOf(l), f)) && (!query || live.nameOf(l.employeeId).toLowerCase().includes(query)));
  const openLoans = all.filter((l) => ['requested', 'active', 'paused'].includes(l.status));
  const canChange = (l: LoanView) => live.can.manage && !l.mine && ['active', 'paused'].includes(l.status);
  const cols: TableColumn<LoanView>[] = [
    { key: 'employee', header: 'Employee', type: 'person', value: (r) => live.nameOf(r.employeeId), person: (r) => ({ name: live.nameOf(r.employeeId), secondary: r.mine ? 'You' : undefined }), width: 210 },
    { key: 'type', header: 'Type', value: typeOf, width: 190 },
    { key: 'principal', header: 'Amount', type: 'money', value: (r) => Number(r.principal), render: (r) => rupees(r.principal), width: 130 },
    { key: 'emi', header: 'Instalment', type: 'money', value: (r) => Number(r.emi), render: (r) => rupees(r.emi), width: 120 },
    { key: 'out', header: 'Left to repay', type: 'money', value: (r) => Number(r.outstanding), render: (r) => rupees(r.outstanding), width: 140 },
    { key: 'from', header: 'From', value: (r) => r.firstMonth, render: (r) => monthName(r.firstMonth), width: 140, optional: true },
    { key: 'status', header: 'Status', type: 'status', value: stateOf, statusTone: (_v, r) => LOAN_STATE[r.status]?.tone ?? 'neutral', width: 180 },
  ];
  const addButton = live.can.manage && (
    <Button variant="primary" icon={Plus} onClick={() => setDialog('add')}>
      Add loan
    </Button>
  );
  return (
    <PayFrame page="loans">
      <PageHeader
        title="Loans and advances"
        description="Requests go to Approvals. Instalments are recovered in payroll; balances left at exit go to the final settlement."
        facts={live.state === 'ready' && all.length > 0 ? `${openLoans.length} open · ${rupees(sumMoney(openLoans.map((l) => l.outstanding)))} left to repay` : undefined}
        actions={live.state === 'ready' ? addButton : undefined}
      />
      <PayPageState state={live.state} onRetry={live.onRetry} what="loans" grantedBy="your payroll admin">
        <DataTable
          label="Loans and advances"
          columns={cols}
          rows={shown}
          getRowId={(r) => r.id}
          onRowClick={(r) => setOpenId(r.id)}
          activeRowId={open?.id}
          filtered={shown.length !== all.length}
          onClearFilters={() => {
            setFilters(LIVE_LOAN_FILTERS);
            setQ('');
          }}
          cardSummary
          rowButtons={(r) =>
            canChange(r) ? (
              <Button size="sm" onClick={() => setOpenId(r.id)} aria-label={`Change the loan of ${live.nameOf(r.employeeId)}`}>
                Change
              </Button>
            ) : null
          }
          toolbar={
            <FilterBar
              fields={[
                { key: 'status', label: 'Status', type: 'multi', options: Object.values(LOAN_STATE).map((s) => ({ value: s.label, label: s.label })) },
                { key: 'type', label: 'Type', type: 'multi', options: Object.values(LOAN_TYPE_TEXT).map((t) => ({ value: t, label: t })) },
              ]}
              value={filters}
              onChange={setFilters}
              search={q}
              onSearchChange={setQ}
              searchPlaceholder="Search employee"
            />
          }
          empty={<EmptyState title="No loans or advances yet." description="Employees ask for them in My pay; requests appear here and in Approvals." action={addButton || undefined} />}
        />
      </PayPageState>
      <Drawer
        open={!!open && dialog == null}
        onOpenChange={(o) => !o && setOpenId(null)}
        title={open ? `${typeOf(open)} · ${live.nameOf(open.employeeId)}` : ''}
        subtitle={open ? `First instalment ${monthName(open.firstMonth)}` : undefined}
        meta={open && <Badge tone={LOAN_STATE[open.status]?.tone ?? 'neutral'}>{stateOf(open)}</Badge>}
        size="lg"
        footer={
          open && (
            <>
              <Button onClick={() => setOpenId(null)}>Close</Button>
              {canChange(open) && (
                <>
                  <Button icon={Pause} onClick={() => setDialog('pause')}>
                    Pause EMIs
                  </Button>
                  <Button onClick={() => setDialog('reschedule')}>Change instalment</Button>
                  <Button variant="primary" onClick={() => setDialog('preclose')}>
                    Pre-close
                  </Button>
                </>
              )}
            </>
          )
        }
      >
        {open && (
          <div className="yx-pay-stack">
            <FactRow
              items={[
                { label: 'Amount', value: rupees(open.principal) },
                { label: 'Interest', value: rateText(open.interestRate) },
                { label: 'Instalment', value: rupees(open.emi) },
                { label: 'Left to repay', value: rupees(open.outstanding) },
              ]}
            />
            {open.pausedUntil && <InlineAlert tone="warning">Instalments are paused until {monthName(open.pausedUntil)}. They start again that month.</InlineAlert>}
            {open.status === 'requested' && <InlineAlert tone="info">Waiting for approval. The approver decides in Approvals; the first instalment is recovered in {monthName(open.firstMonth)} once approved.</InlineAlert>}
            {open.mine && <InlineAlert tone="info">This is your own loan. Someone else in payroll changes it.</InlineAlert>}
            {open.loanType === 'expense' && <p className="yx-pay-note">An expense advance that was not settled in time, recovered from pay like a salary advance.</p>}
            {months && months !== 'error' && <p className="yx-pay-muted">Recovered in payroll so far: {rupees(months.recovered)}.</p>}
            <LiveSchedule data={months} />
          </div>
        )}
      </Drawer>
      {open && dialog === 'pause' && (
        <LoanChange loan={open} who={live.nameOf(open.employeeId)} kind="pause" onClose={() => setDialog(null)} onSave={(x) => live.onChange(open, x)} />
      )}
      {open && dialog === 'reschedule' && (
        <LoanChange loan={open} who={live.nameOf(open.employeeId)} kind="reschedule" onClose={() => setDialog(null)} onSave={(x) => live.onChange(open, x)} />
      )}
      {open && dialog === 'preclose' && (
        <LoanChange loan={open} who={live.nameOf(open.employeeId)} kind="preclose" closing={months && months !== 'error' ? months.closing : null} onClose={() => setDialog(null)} onSave={(x) => live.onChange(open, x)} />
      )}
      {dialog === 'add' && <AddLoanDrawer onSearch={live.onSearch} onClose={() => setDialog(null)} onSave={live.onRequest} />}
    </PayFrame>
  );
}

function LoanChange({ loan, who, kind, closing, onClose, onSave }: { loan: LoanView; who: string; kind: LoanChangeInput['kind']; closing?: LoanRepayments['closing']; onClose: () => void; onSave: (x: LoanChangeInput) => Promise<unknown> }) {
  const [until, setUntil] = useState(nextMonthOf());
  const [emi, setEmi] = useState('');
  const [reason, setReason] = useState('');
  const errors: FormErrorItem[] = [
    ...(kind === 'pause' && !MONTH_RX.test(until) ? [{ fieldId: 'lc-until', message: 'Choose the month instalments start again.' }] : []),
    ...(kind === 'reschedule' && (!MONEY_RX.test(emi.trim()) || paise(emi.trim()) <= 0n || paise(emi.trim()) > paise(loan.outstanding)) ? [{ fieldId: 'lc-emi', message: `Enter a new instalment above zero and not more than ${rupees(loan.outstanding)}.` }] : []),
    ...(reason.trim().length < 5 ? [{ fieldId: 'lc-why', message: 'Give a reason (at least 5 letters).' }] : []),
  ];
  const title = kind === 'pause' ? 'Pause EMIs?' : kind === 'reschedule' ? 'Change the instalment?' : `Pre-close ${who}'s loan?`;
  return (
    <FormDialog
      title={title}
      description={`${who} · ${rupees(loan.outstanding)} left, ${rupees(loan.emi)} a month`}
      confirm={kind === 'pause' ? 'Pause EMIs' : kind === 'reschedule' ? 'Save instalment' : 'Pre-close loan'}
      done={kind === 'pause' ? `EMIs paused for ${who}.` : kind === 'reschedule' ? `New instalment saved for ${who}.` : `${who}'s loan is closed.`}
      tone={kind === 'preclose' ? 'danger' : 'primary'}
      errors={errors}
      onClose={onClose}
      onSave={() => onSave({ kind, reason: reason.trim(), ...(kind === 'pause' ? { pauseUntil: until } : {}), ...(kind === 'reschedule' ? { emi: emi.trim() } : {}) })}
    >
      {(errorOf) => (
        <>
          {kind === 'pause' && (
            <FormField id="lc-until" label="Paused until" required error={errorOf('lc-until')} helper="No instalment up to and including this month; they start again the month after.">
              <TextField type="month" value={until} onChange={setUntil} />
            </FormField>
          )}
          {kind === 'reschedule' && (
            <FormField id="lc-emi" label="New instalment" required error={errorOf('lc-emi')}>
              <TextField value={emi} onChange={setEmi} prefix="₹" inputMode="decimal" maxLength={13} />
            </FormField>
          )}
          {kind === 'preclose' && (
            <>
              <DescriptionList
                items={[
                  { label: 'Outstanding principal', value: rupees(closing?.principal ?? loan.outstanding) },
                  { label: closing ? `Interest to ${dateText(closing.on)}` : 'Interest to today', value: !closing ? '—' : Number(closing.interest) ? `${rupees(closing.interest)} · ${closing.days} ${closing.days === 1 ? 'day' : 'days'} at ${rateText(loan.interestRate)}` : 'None (interest-free)' },
                  { label: 'Total to collect', value: <strong>{rupees(closing?.total ?? loan.outstanding)}</strong> },
                ]}
              />
              <InlineAlert tone="warning" title="Closing writes off nothing">
                The loan is marked repaid now. Collect {rupees(closing?.total ?? loan.outstanding)} outside payroll first.
              </InlineAlert>
            </>
          )}
          <FormField id="lc-why" label="Reason" required error={errorOf('lc-why')}>
            <TextArea rows={2} value={reason} onChange={setReason} maxLength={300} />
          </FormField>
        </>
      )}
    </FormDialog>
  );
}

function AddLoanDrawer({ onSearch, onClose, onSave }: { onSearch: LiveLoans['onSearch']; onClose: () => void; onSave: LiveLoans['onRequest'] }) {
  const [who, setWho] = useState<PersonHit | null>(null);
  const [type, setType] = useState<'advance' | 'loan'>('advance');
  const [amount, setAmount] = useState('');
  const [count, setCount] = useState('');
  const [first, setFirst] = useState(nextMonthOf());
  const [reason, setReason] = useState('');
  const n = Number(count);
  const errors: FormErrorItem[] = [
    ...(!who ? [{ fieldId: 'ln-who', message: 'Choose the person.' }] : []),
    ...(!MONEY_RX.test(amount.trim()) || paise(amount.trim()) <= 0n ? [{ fieldId: 'ln-amount', message: 'Enter the amount in rupees.' }] : []),
    ...(!Number.isInteger(n) || n < 1 || n > 120 ? [{ fieldId: 'ln-count', message: 'Enter 1 to 120 instalments.' }] : []),
    ...(!MONTH_RX.test(first) ? [{ fieldId: 'ln-first', message: 'Choose the month of the first instalment.' }] : []),
    ...(reason.trim().length < 5 ? [{ fieldId: 'ln-why', message: 'Give a reason (at least 5 letters).' }] : []),
  ];
  // Founder answer 1: the interest is the company's rate for the type in the person's entity, applied by the server.
  const emi = Number.isInteger(n) && n >= 1 ? previewEmi(amount.trim(), '', n) : null;
  return (
    <PayFormDrawer
      title="Add loan or advance"
      subtitle="For someone in your scope. It waits for approval before the first instalment; the company's loan rules apply."
      confirm="Send for approval"
      done="Sent for approval. The approver decides in Approvals."
      errors={errors}
      onClose={onClose}
      onSave={() => onSave({ employeeId: who!.id, loanType: type, principal: amount.trim(), instalments: n, firstMonth: first, reason: reason.trim() })}
    >
      {(errorOf) => (
        <>
          <FindPerson id="ln-who" label="Employee" value={who} onChange={setWho} onSearch={onSearch} error={errorOf('ln-who')} />
          <FormField id="ln-type" label="Type" required>
            <Segment
              label="Type"
              value={type}
              onChange={setType}
              options={[
                { value: 'advance', label: 'Salary advance' },
                { value: 'loan', label: 'Personal loan' },
              ]}
            />
          </FormField>
          <FieldRow>
            <FormField id="ln-amount" label="Amount" required error={errorOf('ln-amount')}>
              <TextField value={amount} onChange={setAmount} prefix="₹" inputMode="decimal" maxLength={13} />
            </FormField>
            <FormField id="ln-count" label="Instalments" required error={errorOf('ln-count')}>
              <TextField value={count} onChange={setCount} inputMode="numeric" maxLength={3} />
            </FormField>
          </FieldRow>
          <FormField id="ln-first" label="First instalment in" required error={errorOf('ln-first')}>
            <TextField type="month" value={first} onChange={setFirst} />
          </FormField>
          <FormField id="ln-why" label="Reason" required error={errorOf('ln-why')}>
            <TextArea rows={2} value={reason} onChange={setReason} maxLength={300} />
          </FormField>
          {emi && paise(emi.emi) > 0n && <p className="yx-pay-muted">Instalment {rupees(emi.emi)} a month from {MONTH_RX.test(first) ? monthName(first) : 'the first month'}, before interest.</p>}
          <p className="yx-pay-note">Interest is the company's rate for this loan type (Settings). It is added when the request is made.</p>
        </>
      )}
    </PayFormDrawer>
  );
}

/* ------------------------------------------------------------------ PAY-23 live: Payroll › Proof checking (and Form 12B, founder decision 6) */

/** GET tax/form12b: previous employer income sent by employees, for payroll to check. */
export interface Form12bRow {
  id: string;
  employeeId: string;
  employeeName: string;
  legalEntityId: string;
  taxYear: string;
  employerName: string | null;
  employerTan: string;
  gross: string;
  exemptions: string;
  tds: string;
  status: 'pending' | 'approved' | 'rejected';
  comment: string | null;
  file: { name: string; size: number; at: string };
  submittedAt: string;
}

/** GET tax/residency (founder answer 2): residential-status changes sent with the TRC, for payroll to approve. */
export interface ResidencyRow {
  id: string;
  employeeId: string;
  employeeName: string;
  legalEntityId: string;
  taxYear: string;
  from: 'resident' | 'non_resident';
  residentialStatus: 'resident' | 'non_resident';
  trcValidTo: string | null;
  dtaaCountry: string | null;
  form10fFiled: boolean;
  file: { name: string; size: number; at: string } | null;
  status: 'pending' | 'approved' | 'rejected';
  comment: string | null;
  submittedAt: string;
  /** When payroll decided (approved or refused). */
  verifiedAt?: string | null;
}

export type ProofStatusFilter = 'pending' | 'approved' | 'partly' | 'rejected';

/** GET tax/pan-links (PAY-22 NoPan): a PAN-Aadhaar link confirmation waiting for payroll, or decided. */
export interface PanLinkRow {
  id: string;
  employeeId: string;
  employeeName: string;
  legalEntityId: string;
  taxYear: string;
  file: { name: string; size: number; type: string; at: string } | null;
  status: 'pending' | 'approved' | 'rejected';
  comment: string | null;
  submittedAt: string;
  verifiedAt: string | null;
}

export interface LiveProofQueue {
  state: LoadState;
  onRetry?: () => void;
  status: ProofStatusFilter;
  onStatus: (s: ProofStatusFilter) => void;
  lines: ProofQueueLine[] | null;
  /** Form 12B in the same status (none for "partly"). */
  form12b: Form12bRow[] | null;
  onFile: (line: ProofQueueLine, n: number, name: string) => Promise<unknown>;
  /** PAY-23 Line: the file for the in-page viewer (images and PDFs; download stays). */
  onPreview?: (line: ProofQueueLine, n: number) => Promise<Blob>;
  onDecide: (line: ProofQueueLine, d: ProofDecision) => Promise<unknown>;
  onForm12bFile: (row: Form12bRow) => Promise<unknown>;
  onForm12bDecide: (row: Form12bRow, d: { decision: 'approve' | 'reject'; comment?: string }) => Promise<unknown>;
  /** Residential-status changes in the same status (none for "partly"). */
  residency?: ResidencyRow[] | null;
  onResidencyFile?: (row: ResidencyRow) => Promise<unknown>;
  onResidencyDecide?: (row: ResidencyRow, d: { decision: 'approve' | 'reject'; comment?: string }) => Promise<unknown>;
  /** PAY-22 NoPan: PAN link confirmations in the same status (none for "partly"). */
  panLinks?: PanLinkRow[] | null;
  onPanLinkFile?: (row: PanLinkRow) => Promise<unknown>;
  onPanLinkPreview?: (row: PanLinkRow) => Promise<Blob>;
  onPanLinkDecide?: (row: PanLinkRow, d: { decision: 'approve' | 'reject'; comment?: string }) => Promise<unknown>;
  /** Stories only: open a row, and show a refusal the server sent. */
  story?: { openId?: string; refused?: string };
  /** A deep link: the row to open ("l-<line id>", "f-<Form 12B id>", "r-<residency id>"). */
  openId?: string;
  /**
   * A deep link to the viewer's own item, which the queue never lists (PAY-23 OwnProof, ResidencyOwn): the drawer opens
   * with the designed refusal. The server refuses deciding one's own either way.
   */
  own?: { line?: ProofQueueLine; residency?: ResidencyRow };
}

type QueueRow = { kind: 'line'; id: string; line: ProofQueueLine } | { kind: 'form12b'; id: string; row: Form12bRow } | { kind: 'residency'; id: string; res: ResidencyRow } | { kind: 'pan'; id: string; pan: PanLinkRow };
const RES_LABEL = { resident: 'Resident', non_resident: 'Non-resident' } as const;
/** The residency row's second line: the change, then the document (a TRC, or none going back to resident). */
export const residencyNote = (r: ResidencyRow) =>
  [`${RES_LABEL[r.from]} → ${RES_LABEL[r.residentialStatus].toLowerCase()}`, r.residentialStatus === 'resident' ? 'no document needed' : r.trcValidTo ? `TRC until ${dateText(r.trcValidTo)}${r.dtaaCountry ? ` · ${r.dtaaCountry}` : ''}` : 'TRC', r.taxYear].join(' · ');
const itemText = (r: QueueRow) => (r.kind === 'line' ? subjectText(r.line.subjectKey, r.line.section) : r.kind === 'form12b' ? 'Previous employer (Form 12B)' : r.kind === 'pan' ? 'PAN linked with Aadhaar' : 'Residential status');
const statusOf = (r: QueueRow) => (r.kind === 'line' ? r.line.proofStatus : r.kind === 'form12b' ? r.row.status : r.kind === 'pan' ? r.pan.status : r.res.status);
/** A residency request is approved or refused (founder last 10, item 7). */
const RES_STATE: Record<string, { label: string; tone: BadgeTone }> = {
  pending: { label: 'Waiting', tone: 'warning' },
  approved: { label: 'Approved', tone: 'success' },
  rejected: { label: 'Refused', tone: 'danger' },
};
const LIVE_PROOF_STATE: Record<string, { label: string; tone: BadgeTone }> = {
  pending: { label: 'Waiting', tone: 'warning' },
  approved: { label: 'Approved', tone: 'success' },
  partly: { label: 'Partly approved', tone: 'info' },
  rejected: { label: 'Rejected', tone: 'danger' },
};

function LiveProofQueue({ live }: { live: LiveProofQueue }) {
  const [openId, setOpenId] = useState<string | null>(live.story?.openId ?? live.openId ?? null);
  const [ownOpen, setOwnOpen] = useState(true);
  const [q, setQ] = useState('');
  const rows: QueueRow[] = [
    ...(live.lines ?? []).map((l) => ({ kind: 'line' as const, id: `l-${l.id}`, line: l })),
    ...(live.form12b ?? []).map((r) => ({ kind: 'form12b' as const, id: `f-${r.id}`, row: r })),
    ...(live.residency ?? []).map((r) => ({ kind: 'residency' as const, id: `r-${r.id}`, res: r })),
    ...(live.panLinks ?? []).map((r) => ({ kind: 'pan' as const, id: `p-${r.id}`, pan: r })),
  ];
  const query = q.trim().toLowerCase();
  const nameOf = (r: QueueRow) => (r.kind === 'line' ? r.line.employeeName : r.kind === 'form12b' ? r.row.employeeName : r.kind === 'pan' ? r.pan.employeeName : r.res.employeeName) || 'Someone';
  const shown = rows.filter((r) => !query || nameOf(r).toLowerCase().includes(query));
  const open = rows.find((r) => r.id === openId) ?? null;
  const cols: TableColumn<QueueRow>[] = [
    { key: 'employee', header: 'Employee', type: 'person', value: nameOf, person: (r) => ({ name: nameOf(r) }), width: 200 },
    {
      key: 'item',
      header: 'Line',
      value: itemText,
      render: (r) => (
        <div>
          <div>{itemText(r)}</div>
          <div className="yx-pay-note">
            {r.kind === 'line' ? `${r.line.proofs.length} ${r.line.proofs.length === 1 ? 'file' : 'files'}` : r.kind === 'form12b' ? `${r.row.employerName ?? r.row.employerTan} · ${r.row.taxYear}` : r.kind === 'pan' ? `Portal confirmation · ${r.pan.taxYear}` : residencyNote(r.res)}
          </div>
          {r.kind === 'residency' && r.res.status === 'rejected' && r.res.comment && <div className="yx-pay-note">Refused: {r.res.comment}</div>}
          {r.kind === 'pan' && r.pan.status === 'rejected' && r.pan.comment && <div className="yx-pay-note">Refused: {r.pan.comment}</div>}
        </div>
      ),
      width: 260,
    },
    { key: 'declared', header: 'Declared', type: 'money', value: (r) => Number(r.kind === 'line' ? r.line.amount : r.kind === 'form12b' ? r.row.gross : 0), render: (r) => (r.kind === 'line' ? `${rupees(r.line.amount)}${r.line.subjectKey === 'hra' ? ' a month' : ''}` : r.kind === 'form12b' ? `${rupees(r.row.gross)} salary` : r.kind === 'pan' ? 'Confirmation sent' : r.res.file ? 'Certificate sent' : 'No document'), width: 170 },
    { key: 'accepted', header: 'Approved', type: 'money', value: (r) => (r.kind === 'line' && r.line.approvedAmount ? Number(r.line.approvedAmount) : 0), render: (r) => (r.kind === 'line' && r.line.approvedAmount ? rupees(r.line.approvedAmount) : '—'), width: 120, optional: true },
    { key: 'status', header: 'Status', type: 'status', value: (r) => (r.kind === 'residency' || r.kind === 'pan' ? RES_STATE : LIVE_PROOF_STATE)[statusOf(r)]?.label, statusTone: (_v, r) => LIVE_PROOF_STATE[statusOf(r)]?.tone ?? 'neutral', width: 140 },
  ];
  return (
    <PayFrame page="tax" counts={live.status === 'pending' ? { tax: rows.length } : undefined}>
      <PageHeader title="Proof verification" description="Proofs employees sent for their tax declarations, previous employers' Form 12B and residential-status changes. What you approve counts in their tax; a line rejected goes back with your comment. Your own proofs never show here." facts={live.state === 'ready' ? `${rows.length} ${live.status === 'pending' ? 'waiting' : 'lines'}` : undefined} />
      <PayPageState state={live.state} onRetry={live.onRetry} what="proofs" grantedBy="your payroll admin">
        <DataTable
          label="Proof lines"
          columns={cols}
          rows={shown}
          getRowId={(r) => r.id}
          onRowClick={(r) => setOpenId(r.id)}
          activeRowId={open?.id}
          cardSummary
          filtered={!!query}
          onClearFilters={() => setQ('')}
          rowButtons={(r) =>
            statusOf(r) === 'pending' ? (
              <Button size="sm" onClick={() => setOpenId(r.id)} aria-label={`Decide on ${nameOf(r)}'s ${r.kind === 'line' ? subjectText(r.line.subjectKey) : r.kind === 'form12b' ? 'Form 12B' : r.kind === 'pan' ? 'PAN link' : 'residential status'}`}>
                Decide
              </Button>
            ) : null
          }
          toolbar={
            <div className="yx-pay-row">
              <Segment
                label="Show"
                value={live.status}
                onChange={live.onStatus}
                options={[
                  { value: 'pending', label: 'Waiting' },
                  { value: 'approved', label: 'Approved' },
                  { value: 'partly', label: 'Partly approved' },
                  { value: 'rejected', label: 'Rejected' },
                ]}
              />
              <TextField value={q} onChange={setQ} placeholder="Search employee" aria-label="Search employee" />
            </div>
          }
          empty={<EmptyState title={live.status === 'pending' ? 'No proofs to verify yet.' : 'Nothing here.'} description="Proofs appear when employees send them in their tax workspace." />}
        />
      </PayPageState>
      {open?.kind === 'line' && <ProofDecisionDrawer line={open.line} onFile={live.onFile} onPreview={live.onPreview} onClose={() => setOpenId(null)} onSave={(d) => live.onDecide(open.line, d)} />}
      {open?.kind === 'form12b' && <Form12bDecisionDrawer row={open.row} onFile={live.onForm12bFile} onClose={() => setOpenId(null)} onSave={(d) => live.onForm12bDecide(open.row, d)} />}
      {open?.kind === 'residency' && live.onResidencyDecide && (
        <ResidencyDecisionDrawer row={open.res} refused={live.story?.refused} onFile={live.onResidencyFile} onClose={() => setOpenId(null)} onSave={(d) => live.onResidencyDecide!(open.res, d)} />
      )}
      {open?.kind === 'pan' && live.onPanLinkDecide && (
        <PanLinkDecisionDrawer row={open.pan} onFile={live.onPanLinkFile} onPreview={live.onPanLinkPreview} onClose={() => setOpenId(null)} onSave={(d) => live.onPanLinkDecide!(open.pan, d)} />
      )}
      {ownOpen && !open && live.own?.line && <ProofDecisionDrawer line={live.own.line} own onFile={live.onFile} onClose={() => setOwnOpen(false)} onSave={(d) => live.onDecide(live.own!.line!, d)} />}
      {ownOpen && !open && !live.own?.line && live.own?.residency && live.onResidencyDecide && (
        <ResidencyDecisionDrawer row={live.own.residency} onClose={() => setOwnOpen(false)} onSave={(d) => live.onResidencyDecide!(live.own!.residency!, d)} />
      )}
    </PayFrame>
  );
}

/** PAY-23 Line: the design's document viewer on the file sent (one at a time; a Segment picks among several). */
function ProofFileViewer({ line, onFile, onPreview }: { line: ProofQueueLine; onFile: LiveProofQueue['onFile']; onPreview: NonNullable<LiveProofQueue['onPreview']> }) {
  const [n, setN] = useState(line.proofs[0]?.n ?? 0);
  const f = line.proofs.find((x) => x.n === n) ?? line.proofs[0];
  const file = useFileUrl(f ? `${line.id}-${f.n}` : null, f ? () => onPreview(line, f.n) : undefined, f?.name ?? '');
  const { run } = useRun();
  if (!f) return null;
  return (
    <div className="yx-pay-stack">
      {line.proofs.length > 1 && <Segment label="File" value={String(f.n)} onChange={(v) => setN(Number(v))} options={line.proofs.map((x) => ({ value: String(x.n), label: x.name }))} />}
      <DocumentViewer
        key={`${line.id}-${f.n}`}
        fileName={f.name}
        mimeType={file?.type || undefined}
        state={!file ? 'loading' : file.failed ? 'error' : 'ready'}
        versions={[{ id: 'v1', label: `Sent ${dateText(f.at.slice(0, 10))}`, url: file?.url ?? '', uploadedBy: line.employeeName || 'Someone', uploadedAt: new Date(f.at), size: f.size }]}
        onDownload={() => void run(`f-${f.n}`, () => onFile(line, f.n, f.name))}
      />
    </div>
  );
}

function ProofDecisionDrawer({ line, own, onFile, onPreview, onClose, onSave }: { line: ProofQueueLine; own?: boolean; onFile: LiveProofQueue['onFile']; onPreview?: LiveProofQueue['onPreview']; onClose: () => void; onSave: (d: ProofDecision) => Promise<unknown> }) {
  const [decision, setDecision] = useState<ProofDecision['decision']>('approve');
  const [amount, setAmount] = useState('');
  const [comment, setComment] = useState('');
  const { busy, run } = useRun();
  const pending = line.proofStatus === 'pending';
  const errors: FormErrorItem[] = [
    ...(decision === 'partly' && (!MONEY_RX.test(amount.trim()) || paise(amount.trim()) <= 0n || paise(amount.trim()) >= paise(line.amount)) ? [{ fieldId: 'pf-amount', message: `Enter an amount above zero and below ${rupees(line.amount)}.` }] : []),
    ...(decision !== 'approve' && comment.trim().length < 3 ? [{ fieldId: 'pf-why', message: 'Add a comment for the employee, so they can fix it.' }] : []),
  ];
  const label = subjectText(line.subjectKey, line.section);
  const files = (
    <section aria-label="Files">
      <SectionTitle>Files sent</SectionTitle>
      {onPreview ? (
        <ProofFileViewer line={line} onFile={onFile} onPreview={onPreview} />
      ) : (
        <div className="yx-pay-row">
          {line.proofs.map((f) => (
            <Button key={f.n} size="sm" icon={Download} loading={busy === `f-${f.n}`} onClick={() => void run(`f-${f.n}`, () => onFile(line, f.n, f.name))} aria-label={`Open ${f.name}`}>
              {f.name}
            </Button>
          ))}
        </div>
      )}
    </section>
  );
  const facts = (
    <FactRow
      items={[
        { label: 'Declared', value: `${rupees(line.amount)}${line.subjectKey === 'hra' ? ' a month' : ''}` },
        ...(line.approvedAmount ? [{ label: 'Approved', value: rupees(line.approvedAmount) }] : []),
        { label: 'Files', value: String(line.proofs.length) },
      ]}
    />
  );
  // PAY-23 OwnProof: one's own line opens read only with the design's warning (the server refuses a decision too).
  if (own)
    return (
      <Drawer open onOpenChange={(o) => !o && onClose()} title={label} subtitle="Your own proof" meta={<Badge tone={LIVE_PROOF_STATE[line.proofStatus]?.tone ?? 'neutral'}>{LIVE_PROOF_STATE[line.proofStatus]?.label}</Badge>} size="lg" footer={<Button onClick={onClose}>Close</Button>}>
        <div className="yx-pay-stack">
          <InlineAlert tone="warning" title="This is your own proof">
            You can't verify your own proofs. Another payroll or HR person must verify it.
          </InlineAlert>
          {facts}
          <p className="yx-pay-note">Files sent: {line.proofs.map((f) => f.name).join(', ') || 'none'}</p>
        </div>
      </Drawer>
    );
  if (!pending)
    return (
      <Drawer open onOpenChange={(o) => !o && onClose()} title={label} subtitle={line.employeeName || 'Someone'} meta={<Badge tone={LIVE_PROOF_STATE[line.proofStatus]?.tone ?? 'neutral'}>{LIVE_PROOF_STATE[line.proofStatus]?.label}</Badge>} size="lg" footer={<Button onClick={onClose}>Close</Button>}>
        <div className="yx-pay-stack">
          {facts}
          {line.comment && <p className="yx-pay-note">Comment: {line.comment}</p>}
          {files}
        </div>
      </Drawer>
    );
  return (
    <PayFormDrawer
      title={label}
      subtitle={`${line.employeeName || 'Someone'} · declared ${rupees(line.amount)}${line.subjectKey === 'hra' ? ' a month' : ''}`}
      confirm={decision === 'approve' ? 'Approve line' : decision === 'partly' ? 'Approve part' : 'Reject line'}
      done={`${line.employeeName || 'Someone'} · ${label}: ${decision === 'approve' ? 'approved' : decision === 'partly' ? 'part approved' : 'rejected'}.`}
      errors={errors}
      onClose={onClose}
      size="lg"
      onSave={() => onSave({ decision, ...(decision === 'partly' ? { amount: amount.trim() } : {}), ...(comment.trim() ? { comment: comment.trim() } : {}) })}
    >
      {(errorOf) => (
        <>
          {facts}
          {files}
          {line.subjectKey === 'hra' && line.landlordPan && <p className="yx-pay-note">Landlord {line.landlordName ?? ''} · PAN {line.landlordPan}</p>}
          <FormField id="pf-decision" label="Decision" required>
            <Segment
              label="Decision"
              value={decision}
              onChange={setDecision}
              options={[
                { value: 'approve', label: 'Approve in full' },
                { value: 'partly', label: 'Approve part' },
                { value: 'reject', label: 'Reject' },
              ]}
            />
          </FormField>
          {decision === 'partly' && (
            <FormField id="pf-amount" label="Approved amount" required error={errorOf('pf-amount')}>
              <TextField value={amount} onChange={setAmount} prefix="₹" inputMode="decimal" maxLength={13} />
            </FormField>
          )}
          <FormField id="pf-why" label="Comment to employee" required={decision !== 'approve'} optional={decision === 'approve'} helper="The employee sees this on the line." error={errorOf('pf-why')}>
            <TextArea rows={3} value={comment} onChange={setComment} maxLength={500} />
          </FormField>
        </>
      )}
    </PayFormDrawer>
  );
}

function Form12bDecisionDrawer({ row, onFile, onClose, onSave }: { row: Form12bRow; onFile: LiveProofQueue['onForm12bFile']; onClose: () => void; onSave: (d: { decision: 'approve' | 'reject'; comment?: string }) => Promise<unknown> }) {
  const [decision, setDecision] = useState<'approve' | 'reject'>('approve');
  const [comment, setComment] = useState('');
  const { busy, run } = useRun();
  const errors: FormErrorItem[] = decision === 'reject' && comment.trim().length < 3 ? [{ fieldId: 'fb-why', message: 'Add a comment for the employee, so they can fix it.' }] : [];
  const body = (
    <>
      <FactRow
        items={[
          { label: 'Salary', value: rupees(row.gross) },
          { label: 'Exemptions', value: rupees(row.exemptions) },
          { label: 'Tax deducted', value: rupees(row.tds) },
          { label: 'TAN', value: row.employerTan },
        ]}
      />
      <div className="yx-pay-row">
        <Button size="sm" icon={Download} loading={busy === 'file'} onClick={() => void run('file', () => onFile(row))} aria-label={`Open ${row.file.name}`}>
          {row.file.name}
        </Button>
        <span className="yx-pay-note">Sent {dateText(row.submittedAt.slice(0, 10))}. Check the figures against the signed Form 12B.</span>
      </div>
    </>
  );
  if (row.status !== 'pending')
    return (
      <Drawer open onOpenChange={(o) => !o && onClose()} title="Previous employer (Form 12B)" subtitle={`${row.employeeName} · ${row.employerName ?? row.employerTan}`} meta={<Badge tone={LIVE_PROOF_STATE[row.status]?.tone ?? 'neutral'}>{LIVE_PROOF_STATE[row.status]?.label}</Badge>} size="lg" footer={<Button onClick={onClose}>Close</Button>}>
        <div className="yx-pay-stack">
          {body}
          {row.comment && <p className="yx-pay-note">Comment: {row.comment}</p>}
        </div>
      </Drawer>
    );
  return (
    <PayFormDrawer
      title="Previous employer (Form 12B)"
      subtitle={`${row.employeeName} · ${row.employerName ?? row.employerTan} · ${row.taxYear}`}
      confirm={decision === 'approve' ? 'Approve Form 12B' : 'Reject Form 12B'}
      done={`${row.employeeName} · Form 12B ${decision === 'approve' ? 'approved: it counts in their tax from the next payslip' : 'rejected'}.`}
      errors={errors}
      onClose={onClose}
      size="lg"
      onSave={() => onSave({ decision, ...(comment.trim() ? { comment: comment.trim() } : {}) })}
    >
      {(errorOf) => (
        <>
          {body}
          <FormField id="fb-decision" label="Decision" required>
            <Segment
              label="Decision"
              value={decision}
              onChange={setDecision}
              options={[
                { value: 'approve', label: 'Approve' },
                { value: 'reject', label: 'Reject' },
              ]}
            />
          </FormField>
          <FormField id="fb-why" label="Comment to employee" required={decision === 'reject'} optional={decision === 'approve'} error={errorOf('fb-why')}>
            <TextArea rows={3} value={comment} onChange={setComment} maxLength={500} />
          </FormField>
        </>
      )}
    </PayFormDrawer>
  );
}

/**
 * PAY-22 NoPan, checked here: the portal's PAN-Aadhaar link confirmation. Approving it makes the PAN operative again
 * (normal-rate tax from the next payslip); a refusal needs the reason. Nobody decides their own (the server refuses it).
 */
function PanLinkDecisionDrawer({ row, onFile, onPreview, onClose, onSave }: { row: PanLinkRow; onFile?: LiveProofQueue['onPanLinkFile']; onPreview?: LiveProofQueue['onPanLinkPreview']; onClose: () => void; onSave: (d: { decision: 'approve' | 'reject'; comment?: string }) => Promise<unknown> }) {
  const { toast } = useToast();
  const [decision, setDecision] = useState<'approve' | 'reject'>('approve');
  const [comment, setComment] = useState('');
  const { busy, error, run } = useRun();
  const early = useTooEarly(decision === 'reject' && comment.trim().length < 3 ? [{ fieldId: 'pl-why', message: 'Give the reason, so the employee can fix it.' }] : []);
  const pending = row.status === 'pending';
  const state = RES_STATE[row.status] ?? { label: row.status, tone: 'neutral' as const };
  const file = useFileUrl(row.file && onPreview ? row.id : null, onPreview ? () => onPreview(row) : undefined, row.file?.name ?? '');
  const save = () => {
    if (early.stop()) return;
    void run('save', () => onSave({ decision, ...(comment.trim() ? { comment: comment.trim() } : {}) })).then((ok) => {
      if (!ok) return;
      toast({ tone: 'success', title: `${row.employeeName || 'Someone'} · ${decision === 'approve' ? 'PAN works again: normal-rate tax from the next payslip' : 'PAN link refused'}.` });
      onClose();
    });
  };
  return (
    <Drawer
      open
      onOpenChange={(o) => !o && onClose()}
      title="PAN linked with Aadhaar"
      subtitle={`${row.employeeName || 'Someone'} · tax year ${row.taxYear}`}
      meta={<Badge tone={state.tone}>{state.label}</Badge>}
      size="lg"
      notice={
        error && (
          <InlineAlert tone="danger" title="That did not go through">
            {error}
          </InlineAlert>
        )
      }
      footer={
        pending ? (
          <>
            <Button onClick={onClose}>Cancel</Button>
            <Button variant="primary" loading={busy === 'save'} onClick={save}>
              {decision === 'approve' ? 'Approve PAN link' : 'Refuse PAN link'}
            </Button>
          </>
        ) : (
          <Button onClick={onClose}>Close</Button>
        )
      }
    >
      <div className="yx-pay-stack">
        <DescriptionList
          columns={1}
          items={[
            { label: 'Sent', value: dateText(row.submittedAt.slice(0, 10)) },
            ...(row.verifiedAt ? [{ label: row.status === 'approved' ? 'Approved' : 'Refused', value: dateText(row.verifiedAt.slice(0, 10)) }] : []),
            ...(row.status === 'rejected' && row.comment ? [{ label: 'Reason', value: row.comment }] : []),
          ]}
        />
        {row.file && onPreview ? (
          <DocumentViewer
            key={row.id}
            fileName={row.file.name}
            mimeType={file?.type || undefined}
            state={!file ? 'loading' : file.failed ? 'error' : 'ready'}
            versions={[{ id: 'v1', label: `Sent ${dateText(row.file.at.slice(0, 10))}`, url: file?.url ?? '', uploadedBy: row.employeeName || 'Someone', uploadedAt: new Date(row.file.at), size: row.file.size }]}
            onDownload={() => onFile && void run('file', () => onFile(row))}
          />
        ) : row.file && onFile ? (
          <div className="yx-pay-row">
            <Button size="sm" icon={Download} loading={busy === 'file'} onClick={() => void run('file', () => onFile(row))} aria-label={`Open ${row.file.name}`}>
              {row.file.name}
            </Button>
          </div>
        ) : null}
        {pending && (
          <>
            <p className="yx-pay-note">Check that the confirmation is from the income-tax portal and shows this person's PAN as linked. Once approved, tax is worked out at the normal rate from the next payslip.</p>
            <FormField id="pl-decision" label="Decision" required>
              <Segment
                label="Decision"
                value={decision}
                onChange={setDecision}
                options={[
                  { value: 'approve', label: 'Approve' },
                  { value: 'reject', label: 'Refuse' },
                ]}
              />
            </FormField>
            <FormField id="pl-why" label="Reason for the employee" required={decision === 'reject'} optional={decision === 'approve'} error={early.errorOf('pl-why')}>
              <TextArea rows={3} value={comment} onChange={setComment} maxLength={500} />
            </FormField>
          </>
        )}
      </div>
    </Drawer>
  );
}

/**
 * Founder answer 2 and last 10, items 7 and 10: a residential-status change. To non-resident it comes with the TRC and
 * Form 10F; back to resident needs HR approval only, no document. Approving changes the person's tax from the next run;
 * a refusal needs the reason. Nobody decides their own (the server refuses it; the queue never lists it).
 */
function ResidencyDecisionDrawer({ row, refused, onFile, onClose, onSave }: { row: ResidencyRow; refused?: string; onFile?: LiveProofQueue['onResidencyFile']; onClose: () => void; onSave: (d: { decision: 'approve' | 'reject'; comment?: string }) => Promise<unknown> }) {
  const { toast } = useToast();
  const [decision, setDecision] = useState<'approve' | 'reject'>('approve');
  const [comment, setComment] = useState('');
  const { busy, error, run } = useRun();
  const early = useTooEarly(decision === 'reject' && comment.trim().length < 3 ? [{ fieldId: 'rs-why', message: 'Give the reason, so the employee can fix it.' }] : []);
  const toNr = row.residentialStatus === 'non_resident';
  const pending = row.status === 'pending';
  const state = RES_STATE[row.status] ?? { label: row.status, tone: 'neutral' as const };
  const shown = error ?? refused ?? null;
  const save = () => {
    if (early.stop()) return;
    void run('save', () => onSave({ decision, ...(comment.trim() ? { comment: comment.trim() } : {}) })).then((ok) => {
      if (!ok) return;
      toast({ tone: 'success', title: `${row.employeeName} · ${decision === 'approve' ? 'now ' + RES_LABEL[row.residentialStatus].toLowerCase() + ' from the next payslip' : 'change refused'}.` });
      onClose();
    });
  };
  return (
    <Drawer
      open
      onOpenChange={(o) => !o && onClose()}
      title="Residential status change"
      subtitle={`${row.employeeName} · tax year ${row.taxYear}`}
      meta={<Badge tone={state.tone}>{state.label}</Badge>}
      size="md"
      notice={
        shown && (
          <InlineAlert tone="danger" title="That did not go through">
            {shown}
          </InlineAlert>
        )
      }
      footer={
        pending ? (
          <>
            <Button onClick={onClose}>Cancel</Button>
            <Button variant="primary" loading={busy === 'save'} onClick={save}>
              {decision === 'approve' ? 'Approve change' : 'Refuse change'}
            </Button>
          </>
        ) : (
          <Button onClick={onClose}>Close</Button>
        )
      }
    >
      <div className="yx-pay-stack">
        <DescriptionList
          columns={1}
          items={[
            { label: 'Change', value: `${RES_LABEL[row.from]} → ${RES_LABEL[row.residentialStatus]}` },
            { label: 'Sent', value: dateText(row.submittedAt.slice(0, 10)) },
            ...(toNr
              ? [
                  {
                    label: 'Tax residency certificate',
                    value:
                      row.file && onFile ? (
                        <Button size="sm" icon={Download} loading={busy === 'file'} onClick={() => void run('file', () => onFile(row))} aria-label={`Open ${row.file.name}`}>
                          {row.file.name}
                        </Button>
                      ) : (
                        (row.file?.name ?? 'Not attached')
                      ),
                  },
                  { label: 'Valid until', value: row.trcValidTo ? dateText(row.trcValidTo) : '—' },
                  { label: 'Treaty country', value: row.dtaaCountry ?? '—' },
                  { label: 'Form 10F', value: row.form10fFiled ? 'Filed (the employee confirmed)' : 'Not confirmed' },
                ]
              : [{ label: 'Document', value: 'None needed: going back to resident only needs your approval.' }]),
            ...(row.verifiedAt ? [{ label: row.status === 'approved' ? 'Approved' : 'Refused', value: dateText(row.verifiedAt.slice(0, 10)) }] : []),
            ...(row.status === 'rejected' && row.comment ? [{ label: 'Reason', value: row.comment }] : []),
          ]}
        />
        {pending && (
          <p className="yx-pay-note">
            {toNr
              ? 'Check the name, tax year and country on the certificate. Once approved, no rebate applies from the next payslip; a treaty rate is handled by hand.'
              : 'Once approved, their tax is worked out as a resident from the next payslip.'}
          </p>
        )}
        {pending && (
          <>
            <FormField id="rs-decision" label="Decision" required>
              <Segment
                label="Decision"
                value={decision}
                onChange={setDecision}
                options={[
                  { value: 'approve', label: 'Approve' },
                  { value: 'reject', label: 'Refuse' },
                ]}
              />
            </FormField>
            <FormField id="rs-why" label="Reason for the employee" required={decision === 'reject'} optional={decision === 'approve'} helper="The employee sees this with the decision." error={early.errorOf('rs-why')}>
              <TextArea id="rs-why" rows={3} value={comment} onChange={setComment} maxLength={500} />
            </FormField>
          </>
        )}
      </div>
    </Drawer>
  );
}

/* ------------------------------------------------------------------ PAY-27 live: Payroll › Earned wage access */

export interface LiveEwaAdmin {
  state: LoadState;
  onRetry?: () => void;
  entities: SetupEntity[];
  entityId: string | null;
  onEntity: (id: string | null) => void;
  month: string;
  onMonth: (m: string) => void;
  nameOf: (employeeId: string) => string;
  policies: EwaPolicyView[] | null;
  draws: EwaDrawView[] | null;
  onPolicy: (x: Omit<EwaPolicyView, 'id'>) => Promise<unknown>;
  onPaid: (d: EwaDrawView, reference: string) => Promise<unknown>;
  onFailed: (d: EwaDrawView, reason: string) => Promise<unknown>;
  /** PAY-27 Recoveries: the last six months (payroll.ewa.manage). */
  recoveries?: EwaRecoveryMonth[] | null;
  /** PAY-27 Reconciliation (payroll, or the finance approver with payroll.run.approve). */
  recon?: EwaRecon | null;
  /** False for the finance approver: only the reconciliation shows. */
  canManage?: boolean;
}

const LIVE_DRAW: Record<EwaDrawView['status'], { label: string; tone: BadgeTone }> = { requested: { label: 'To pay', tone: 'warning' }, paid: { label: 'Paid, recovered in payroll', tone: 'success' }, failed: { label: 'Failed', tone: 'danger' }, cancelled: { label: 'Cancelled', tone: 'neutral' } };

/** PAY-27 Reconciliation: the design's figures from the month's draws matched to their payslip deductions. */
function EwaReconPanel({ recon }: { recon: EwaRecon | null | undefined }) {
  const t = recon?.totals;
  if (!recon) return <Skeleton height="var(--yx-space-16)" />;
  if (!t || !t.draws) return <EmptyState title={`No draws paid in ${monthName(recon.month)}.`} description="Draws paid by payroll are matched here to the deduction on each payslip." />;
  const next = monthName(addMonth(recon.month));
  const why = [paise(t.waiting) ? `${rupees(t.waiting)} waiting for the ${monthName(recon.month)} payroll` : '', paise(t.deferred) ? `${rupees(t.deferred)} carried to ${next}` : '', paise(t.fnf) ? `${rupees(t.fnf)} in final settlements` : ''].filter(Boolean).join('; ');
  return (
    <div className="yx-pay-stack">
      <FactRow
        items={[
          { label: 'Draws paid by the company', value: `${rupees(t.paidOut)}${paise(t.fees) ? ` + ${rupees(t.fees)} fees` : ''}` },
          { label: 'Recovered in payroll', value: rupees(t.recovered) },
          { label: 'Carried or in settlements', value: rupees(fromPaise(paise(t.deferred) + paise(t.fnf))) },
          { label: 'Difference', value: paise(t.difference) ? `${rupees(t.difference)} (${why || 'not recovered yet'})` : `None${why ? ` (${why})` : ''}` },
        ]}
      />
      <InlineAlert tone="info">Each draw is matched to its payslip deduction. A part the payslip could not take is carried to the next month; a leaver's goes to the final settlement.</InlineAlert>
    </div>
  );
}

const addMonth = (m: string) => {
  const d = new Date(Date.UTC(Number(m.slice(0, 4)), Number(m.slice(5, 7)), 1));
  return d.toISOString().slice(0, 7);
};

function LiveEwaAdmin({ live }: { live: LiveEwaAdmin }) {
  const manage = live.canManage !== false;
  const [tab, setTab] = useState<'draws' | 'policy' | 'partner' | 'recoveries' | 'recon'>(manage ? 'draws' : 'recon');
  const [policyOpen, setPolicyOpen] = useState(false);
  const [paying, setPaying] = useState<EwaDrawView | null>(null);
  const [failing, setFailing] = useState<EwaDrawView | null>(null);
  const draws = live.draws ?? [];
  const current = live.policies?.[0] ?? null;
  const paid = draws.filter((d) => d.status === 'paid');
  const toPay = draws.filter((d) => d.status === 'requested');
  const cols: TableColumn<EwaDrawView>[] = [
    { key: 'employee', header: 'Employee', type: 'person', value: (r) => live.nameOf(r.employeeId), person: (r) => ({ name: live.nameOf(r.employeeId) }), width: 210 },
    { key: 'req', header: 'Requested', value: (r) => r.createdAt, render: (r) => dateText(r.createdAt.slice(0, 10)), width: 130 },
    { key: 'available', header: 'Available then', type: 'money', value: (r) => Number(r.available), render: (r) => rupees(r.available), width: 140, optional: true },
    { key: 'amount', header: 'Draw', type: 'money', value: (r) => Number(r.amount), render: (r) => rupees(r.amount), width: 120 },
    { key: 'fee', header: 'Fee', type: 'money', value: (r) => Number(r.fee), render: (r) => rupees(r.fee), width: 100 },
    { key: 'payer', header: 'Fee paid by', value: (r) => (r.feePayer === 'employee' ? 'Employee' : 'Company'), width: 120 },
    { key: 'status', header: 'Status', type: 'status', value: (r) => LIVE_DRAW[r.status].label, statusTone: (_v, r) => LIVE_DRAW[r.status].tone, width: 200 },
  ];
  return (
    <PayFrame page="loans">
      <PageHeader
        title="Earned wage access"
        description="People draw part of the pay they have already earned this month; payroll pays it and recovers it in the month's payroll."
        facts={live.state === 'ready' && live.entityId && manage ? `${draws.length} draws in ${monthName(live.month)} · ${rupees(sumMoney(paid.map((d) => d.amount)))} paid · ${toPay.length} to pay` : undefined}
      />
      <PayPageState state={live.state} onRetry={live.onRetry} what="earned wage access" grantedBy="your payroll admin">
        <div className="yx-pay-stack">
          <div className="yx-pay-row">
            <EntityPicker entities={live.entities} value={live.entityId} onChange={live.onEntity} />
            <FormField id="ewa-month" label="Month">
              <TextField type="month" value={live.month} onChange={live.onMonth} />
            </FormField>
          </div>
          {live.entityId && (
            <Tabs value={tab} onValueChange={(v) => setTab(v as typeof tab)}>
              <TabsList aria-label="Earned wage access">
                {manage && (
                  <>
                    <TabsTrigger value="draws" count={draws.length}>
                      Draws
                    </TabsTrigger>
                    <TabsTrigger value="policy">Policy</TabsTrigger>
                    <TabsTrigger value="partner">Partner</TabsTrigger>
                    <TabsTrigger value="recoveries">Recoveries in payroll</TabsTrigger>
                  </>
                )}
                <TabsTrigger value="recon">Reconciliation</TabsTrigger>
              </TabsList>
              <TabsContent value="draws">
                <DataTable
                  label={`EWA draws, ${monthName(live.month)}`}
                  columns={cols}
                  rows={draws}
                  getRowId={(r) => r.id}
                  state={live.draws ? 'ready' : 'loading'}
                  cardSummary
                  rowButtons={(r) =>
                    r.status === 'requested' ? (
                      <div className="yx-pay-row">
                        <Button size="sm" variant="primary" onClick={() => setPaying(r)} aria-label={`Record payment to ${live.nameOf(r.employeeId)}`}>
                          Record payment
                        </Button>
                        <Button size="sm" onClick={() => setFailing(r)} aria-label={`Payment to ${live.nameOf(r.employeeId)} failed`}>
                          Failed
                        </Button>
                      </div>
                    ) : r.failureReason ? (
                      <span className="yx-pay-note">{r.failureReason}</span>
                    ) : r.paidRef ? (
                      <span className="yx-pay-note">Ref {r.paidRef}</span>
                    ) : null
                  }
                  empty={<EmptyState title={`No draws in ${monthName(live.month)}.`} description={current?.enabled ? 'Draws show here when people ask for them.' : 'Nobody can draw until a policy is switched on.'} />}
                />
              </TabsContent>
              <TabsContent value="policy">
                <div className="yx-pay-grid">
                  <div data-span="7" className="yx-pay-stack">
                    {!current ? (
                      <InlineAlert tone="info" title="Off">
                        Nobody can draw until a policy is switched on.
                      </InlineAlert>
                    ) : (
                      <DescriptionList
                        columns={2}
                        items={[
                          { label: 'Status', value: current.enabled ? <Badge tone="success">On</Badge> : <Badge tone="neutral">Off</Badge> },
                          { label: 'From', value: dateText(current.validFrom) },
                          { label: 'Share of earned pay', value: `${current.percentAvailable}%` },
                          { label: 'Least and most a draw', value: `${rupees(current.minAmount)} to ${rupees(current.maxAmount)}` },
                          { label: 'Draws a month', value: String(current.drawsPerMonth) },
                          { label: 'Closed before cut-off', value: `${current.blackoutDays} days` },
                          { label: 'Fee a draw', value: `${rupees(current.fee)}, paid by the ${current.feePayer === 'employee' ? 'person' : 'company'}` },
                        ]}
                      />
                    )}
                    <div className="yx-pay-row">
                      <Button variant="primary" onClick={() => setPolicyOpen(true)}>
                        {current ? 'Change from a date' : 'Set up the policy'}
                      </Button>
                    </div>
                  </div>
                  <div data-span="5" className="yx-pay-panel">
                    <SectionTitle>How it works</SectionTitle>
                    <p className="yx-pay-muted">Earned so far = expected net pay ÷ days in the month × days worked, less earlier draws and dues. A person can take the policy's share of that, within the least and most a draw.</p>
                  </div>
                </div>
              </TabsContent>
              <TabsContent value="partner">
                <EmptyState title="No EWA partner connected." description="Draws are paid by the company from payroll today. A partner who pays people and is repaid from payroll is not available yet." />
              </TabsContent>
              <TabsContent value="recoveries">
                <div className="yx-pay-stack">
                  <FactRow
                    items={[
                      { label: 'Paid this month', value: rupees(sumMoney(paid.map((d) => d.amount))) },
                      { label: 'Fees paid by people', value: rupees(sumMoney(paid.filter((d) => d.feePayer === 'employee').map((d) => d.fee))) },
                      { label: 'To recover in payroll', value: rupees(sumMoney(paid.map((d) => (d.feePayer === 'employee' ? fromPaise(paise(d.amount) + paise(d.fee)) : d.amount)))) },
                    ]}
                  />
                  {live.recoveries && live.recoveries.length > 0 && (
                    <PlainTable
                      label="Recoveries in payroll"
                      rows={live.recoveries}
                      getRowId={(r) => r.month}
                      columns={[
                        { key: 'run', header: 'Run', rowHeader: true, cell: (r) => monthName(r.month) },
                        { key: 'draws', header: 'Draws', num: true, cell: (r) => String(r.draws) },
                        { key: 'recovered', header: 'Recovered', num: true, cell: (r) => (paise(r.waiting) && !paise(r.recovered) ? 'Not run yet' : rupees(r.recovered)) },
                        { key: 'deferred', header: 'Deferred (deduction cap)', num: true, cell: (r) => (paise(r.deferred) ? rupees(r.deferred) : '—') },
                        { key: 'ff', header: 'To F&F', cell: (r) => (r.fnf.people ? `${r.fnf.people} ${r.fnf.people === 1 ? 'leaver' : 'leavers'}: ${rupees(r.fnf.amount)}` : '—') },
                      ]}
                    />
                  )}
                  <p className="yx-pay-note">Each paid draw (and the person's fee) is taken back as "Earned wage access" on that month's payslip. A part the payslip could not take is carried to the next month; a balance left at exit goes to the final settlement.</p>
                </div>
              </TabsContent>
              <TabsContent value="recon">
                <EwaReconPanel recon={live.recon} />
              </TabsContent>
            </Tabs>
          )}
        </div>
      </PayPageState>
      {policyOpen && <EwaPolicyDrawer onClose={() => setPolicyOpen(false)} onSave={live.onPolicy} />}
      {paying && <EwaTextDialog title={`Payment to ${live.nameOf(paying.employeeId)}`} label="Bank reference" pattern={/^[A-Za-z0-9/-]{4,60}$/} hint="Enter the reference of the transfer (4 to 60 letters, digits, / or -)." confirm="Record payment" done={`Payment to ${live.nameOf(paying.employeeId)} recorded.`} onClose={() => setPaying(null)} onSave={(ref) => live.onPaid(paying, ref)} />}
      {failing && <EwaTextDialog title="Payment failed" label="Why" pattern={/^[\s\S]{5,300}$/} hint="Say why (at least 5 letters)." confirm="Record failure" done="Failure recorded. Nothing is recovered for this draw." onClose={() => setFailing(null)} onSave={(why) => live.onFailed(failing, why)} />}
    </PayFrame>
  );
}

function EwaPolicyDrawer({ onClose, onSave }: { onClose: () => void; onSave: LiveEwaAdmin['onPolicy'] }) {
  const [x, setX] = useState({ validFrom: '', enabled: true, percentAvailable: '50', minAmount: '500', maxAmount: '20000', drawsPerMonth: '3', blackoutDays: '3', fee: '0', feePayer: 'employer' as 'employee' | 'employer' });
  const errors: FormErrorItem[] = [
    ...(!DAY_RX.test(x.validFrom) ? [{ fieldId: 'ep-from', message: 'Choose the first day it applies.' }] : []),
    ...(!/^\d{1,3}(\.\d{1,2})?$/.test(x.percentAvailable) || Number(x.percentAvailable) > 100 || Number(x.percentAvailable) <= 0 ? [{ fieldId: 'ep-pct', message: 'Enter a per cent above 0, at most 100.' }] : []),
    ...(!MONEY_RX.test(x.minAmount) ? [{ fieldId: 'ep-min', message: 'Enter the least a draw can be, in rupees.' }] : []),
    ...(!MONEY_RX.test(x.maxAmount) || (MONEY_RX.test(x.minAmount) && paise(x.maxAmount) < paise(x.minAmount)) ? [{ fieldId: 'ep-max', message: 'Enter the most a draw can be, not less than the least.' }] : []),
    ...(!/^\d{1,2}$/.test(x.drawsPerMonth) || Number(x.drawsPerMonth) < 1 ? [{ fieldId: 'ep-draws', message: 'Enter 1 or more draws a month.' }] : []),
    ...(!/^\d{1,2}$/.test(x.blackoutDays) ? [{ fieldId: 'ep-blackout', message: 'Enter the days (0 for none).' }] : []),
    ...(!MONEY_RX.test(x.fee) ? [{ fieldId: 'ep-fee', message: 'Enter the fee a draw (0 for none).' }] : []),
  ];
  return (
    <PayFormDrawer
      title="Earned wage access policy"
      subtitle="From a date; the earlier policy applies until then."
      confirm="Save policy"
      done="Policy saved. It applies from the date you chose."
      errors={errors}
      onClose={onClose}
      onSave={() => onSave({ ...x, drawsPerMonth: Number(x.drawsPerMonth), blackoutDays: Number(x.blackoutDays) })}
    >
      {(errorOf) => (
        <>
          <FormField id="ep-on" label="Earned wage access">
            <Segment label="Earned wage access" value={x.enabled ? 'on' : 'off'} onChange={(v) => setX({ ...x, enabled: v === 'on' })} options={[{ value: 'on', label: 'On' }, { value: 'off', label: 'Off' }]} />
          </FormField>
          <FormField id="ep-from" label="From" required error={errorOf('ep-from')}>
            <TextField type="date" value={x.validFrom} onChange={(validFrom) => setX({ ...x, validFrom })} />
          </FormField>
          <FieldRow>
            <FormField id="ep-pct" label="Share of earned pay" required error={errorOf('ep-pct')}>
              <TextField value={x.percentAvailable} onChange={(percentAvailable) => setX({ ...x, percentAvailable })} suffix="%" inputMode="decimal" />
            </FormField>
            <FormField id="ep-draws" label="Draws a month" required error={errorOf('ep-draws')}>
              <TextField value={x.drawsPerMonth} onChange={(drawsPerMonth) => setX({ ...x, drawsPerMonth })} inputMode="numeric" maxLength={2} />
            </FormField>
          </FieldRow>
          <FieldRow>
            <FormField id="ep-min" label="Least a draw" required error={errorOf('ep-min')}>
              <TextField value={x.minAmount} onChange={(minAmount) => setX({ ...x, minAmount })} prefix="₹" inputMode="decimal" />
            </FormField>
            <FormField id="ep-max" label="Most a draw" required error={errorOf('ep-max')}>
              <TextField value={x.maxAmount} onChange={(maxAmount) => setX({ ...x, maxAmount })} prefix="₹" inputMode="decimal" />
            </FormField>
          </FieldRow>
          <FormField id="ep-blackout" label="Closed before payroll cut-off" required helper="No draws in these days before the cut-off." error={errorOf('ep-blackout')}>
            <TextField value={x.blackoutDays} onChange={(blackoutDays) => setX({ ...x, blackoutDays })} suffix="days" inputMode="numeric" maxLength={2} />
          </FormField>
          <FieldRow>
            <FormField id="ep-fee" label="Fee a draw" required error={errorOf('ep-fee')}>
              <TextField value={x.fee} onChange={(fee) => setX({ ...x, fee })} prefix="₹" inputMode="decimal" />
            </FormField>
            <FormField id="ep-payer" label="Fee paid by">
              <Segment label="Fee paid by" value={x.feePayer} onChange={(feePayer) => setX({ ...x, feePayer })} options={[{ value: 'employer', label: 'The company' }, { value: 'employee', label: 'The person' }]} />
            </FormField>
          </FieldRow>
        </>
      )}
    </PayFormDrawer>
  );
}

function EwaTextDialog({ title, label, pattern, hint, confirm, done, onClose, onSave }: { title: string; label: string; pattern: RegExp; hint: string; confirm: string; done: string; onClose: () => void; onSave: (v: string) => Promise<unknown> }) {
  const [v, setV] = useState('');
  return (
    <FormDialog title={title} confirm={confirm} done={done} errors={pattern.test(v.trim()) ? [] : [{ fieldId: 'ew-v', message: hint }]} onClose={onClose} onSave={() => onSave(v.trim())}>
      {(errorOf) => (
        <FormField id="ew-v" label={label} required error={errorOf('ew-v')}>
          <TextField value={v} onChange={setV} maxLength={300} />
        </FormField>
      )}
    </FormDialog>
  );
}
