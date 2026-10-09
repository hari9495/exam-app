// Payroll admin: PAY-17 loans & advances, PAY-23 proof verification queue, PAY-27 EWA admin, PAY-25 payroll reports.
import { useMemo, useState } from 'react';
import { Download, Pause, Play, Plus, Send } from 'lucide-react';
import { Button, Link } from '../../components/button';
import { Badge, type BadgeTone } from '../../components/display';
import { Drawer } from '../../components/drawer';
import { EmptyState, InlineAlert } from '../../components/feedback';
import { FieldRow, FormField, FormSection } from '../../components/field';
import { CurrencyField, NumberField, TextArea, TextField } from '../../components/inputs';
import { RadioGroup, Switch } from '../../components/choice';
import { Select } from '../../components/select';
import { Dialog } from '../../components/overlay';
import { DocumentViewer } from '../../components/document';
import { DescriptionList, PageHeader, Tabs, TabsContent, TabsList, TabsTrigger } from '../../components/shell';
import { DataTable, type TableColumn } from '../../components/table';
import { FilterBar } from '../../components/filters';
import { BarChart, LineChart } from '../../components/charts';
import { useNarrow } from '../../components/stepper';
import { formatDate, formatINR } from '../../lib/format';
import { matchesFilter, type FilterValue } from '../../lib/table';
import { DesktopFrame, SCREEN_RAIL } from '../_kit/frames';
import { EMPLOYEES, HR_ADMIN, ME, PAY_CALENDAR, TODAY } from '../_kit/data';
import { Segment } from '../people/people-kit';
import { FactRow, PayFrame, PaySettingsFrame, SectionTitle, StateBlock, type PayPersona, type ViewState } from './pay-kit';
import {
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

/** PAY-17 · Loans & advances (T2 / T3): schedule, pre-closure, EMI pause. */
export function LoansScreen({ state = 'ready', openId, action, rows = LOANS }: { state?: ViewState; openId?: string; action?: 'pause' | 'preclose'; rows?: LoanRow[] }) {
  const narrow = useNarrow(599);
  const [view, setView] = useState<ViewState>(state);
  const [list, setList] = useState<Loan[]>(() => withPerquisite(rows.map((l) => ({ ...l, pause: LOAN_PAUSES[l.id] }))));
  const [openKey, setOpenKey] = useState<string | null>(openId ?? null);
  const open = list.find((l) => l.id === openKey) ?? null;
  const [dialog, setDialog] = useState<'pause' | 'preclose' | 'add' | null>(action ?? null);
  const [notice, setNotice] = useState<string | null>(null);
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
  const pauseBlock = !pauseMonths ? 'Enter the months to pause' : !pauseReason.trim() ? 'Add a reason' : null;
  const interest = open ? closeInterest(open) : 0;
  const total = (open?.outstanding ?? 0) + interest;
  const thisEmi = open ? runEmi(open) : 0;
  const pcBlock = !pcReason.trim() ? 'Add a reason' : route === 'direct' && !bankRef.trim() ? 'Add the bank reference' : null;
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
              <Button icon={Download} disabled={view !== 'ready'} onClick={() => setNotice(`Loan ledger · ${RUN.period}.xlsx downloaded (${list.length} loans).`)}>
                Loan ledger
              </Button>
            )}
            {addButton}
          </>
        }
      />
      {notice && <InlineAlert tone="success">{notice}</InlineAlert>}
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
                  disabled={open.status !== 'Active'}
                  onClick={() => {
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
                disabled={open.status === 'Closed' || open.status === 'Waiting for approval'}
                onClick={() => {
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
              <div className="yx-scroll-x" tabIndex={0} role="region" aria-label="Schedule, scrolls sideways on small screens">
                <table className="yx-pay-table">
                  <caption>Schedule</caption>
                  <thead>
                    <tr>
                      <th scope="col">No.</th>
                      <th scope="col">Month</th>
                      <th scope="col" data-num>
                        EMI
                      </th>
                      <th scope="col" data-num>
                        Interest
                      </th>
                      <th scope="col" data-num>
                        Balance
                      </th>
                      <th scope="col">Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {sched.map((r) => (
                      <tr key={r.no} data-state={r.status === 'due' ? 'selected' : r.status === 'paused' ? 'flag' : undefined}>
                        <td>{r.no}</td>
                        <th scope="row">{r.month}</th>
                        <td data-num>{formatINR(r.emi)}</td>
                        <td data-num>{formatINR(r.interest)}</td>
                        <td data-num>{formatINR(r.balance)}</td>
                        <td>{schedStatus(r)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
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
            {pauseBlock && <span className="yx-pay-irrev__why">{pauseBlock}</span>}
            <Button onClick={() => setDialog(null)}>Cancel</Button>
            <Button
              variant="primary"
              disabled={!open || !!pauseBlock}
              onClick={() => {
                if (!open || !pauseMonths || !pauseFrom) return;
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
          <FormField label="Months to pause" required>
            <NumberField value={pauseMonths} onChange={setPauseMonths} min={1} max={3} />
          </FormField>
          <FormField label="From">
            <Select value={pauseFrom} onChange={setPauseFrom} options={pauseOptions} />
          </FormField>
        </FieldRow>
        <FormField label="Reason" required>
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
            {pcBlock && <span className="yx-pay-irrev__why">{pcBlock}</span>}
            <Button onClick={() => setDialog(null)}>Cancel</Button>
            <Button
              variant="primary"
              disabled={!open || !!pcBlock}
              onClick={() =>
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
            <FormField label="Bank reference" required>
              <TextField value={bankRef} onChange={setBankRef} placeholder="UTR or transaction number" />
            </FormField>
          )}
          <FormField label="Reason" required>
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
            <Button variant="primary" disabled={!draft.employee || !draft.amount || !draft.emis} onClick={addLoan}>
              Add loan
            </Button>
          </>
        }
      >
        <div className="yx-pay-stack">
          <FormField label="Employee" required>
            <Select searchable value={draft.employee} onChange={(v) => setDraft({ ...draft, employee: v })} placeholder="Choose an employee" options={EMPLOYEES.map((e) => ({ value: e.id, label: e.name, description: e.code }))} />
          </FormField>
          <FormField label="Type" required>
            <Select value={draft.type} onChange={(v) => v && setDraft({ ...draft, type: v as LoanRow['type'] })} options={opts(LOAN_TYPES)} />
          </FormField>
          <FieldRow>
            <FormField label="Amount" required>
              <CurrencyField value={draft.amount} onChange={(v) => setDraft({ ...draft, amount: v })} max={5_00_000} />
            </FormField>
            <FormField label="Number of EMIs" required>
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

/** PAY-23 · Proof verification queue: each line approved, rejected or partly approved with a comment. */
export function ProofQueueScreen({ state = 'ready', openId, decision, rows = PROOF_ROWS }: { state?: ViewState; openId?: string; decision?: 'partial' | 'reject'; rows?: ProofRow[] }) {
  const narrow = useNarrow(599);
  const [list, setList] = useState<ProofRow[]>(rows);
  const [openKey, setOpenKey] = useState<string | null>(openId ?? null);
  const open = list.find((r) => r.id === openKey) ?? null;
  const first = rows.find((r) => r.id === openId);
  const [choice, setChoice] = useState<string>(decision ?? 'approve');
  const [amount, setAmount] = useState<number | null>(first ? amountFor(first, decision ?? 'approve') : null);
  const [comment, setComment] = useState(first ? commentFor(first, decision ?? 'approve') : '');
  const [notice, setNotice] = useState<string | null>(null);
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
  const block = !open
    ? null
    : self
      ? "You can't verify your own proof"
      : choice !== 'approve' && !comment.trim()
        ? 'Add a comment for the employee'
        : choice === 'partial' && (amount == null || amount < 1 || amount > open.proofAmount - 1)
          ? `Enter an amount from ₹1 to ${formatINR(open.proofAmount - 1)}`
          : null;
  const decide = (thenNext: boolean) => {
    if (!open || block) return;
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
          <Button icon={Download} disabled={state !== 'ready' || verified.length === 0} onClick={() => setNotice(`Verified proof lines · 2026-27.xlsx downloaded (${verified.length} lines).`)}>
            Export verified lines
          </Button>
        }
      />
      {notice && <InlineAlert tone="success">{notice}</InlineAlert>}
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
              <Button icon={Send} disabled={reminded} onClick={() => setReminded(true)}>
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
            {block && <span className="yx-pay-irrev__why">{block}</span>}
            <Button onClick={() => setOpenKey(null)}>Cancel</Button>
            <Button disabled={!!block} onClick={() => decide(true)}>
              Save and open next
            </Button>
            <Button variant={choice === 'reject' ? 'danger' : 'approve'} disabled={!!block} onClick={() => decide(false)}>
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
                  <FormField label="Approved amount" required>
                    <CurrencyField value={amount} onChange={setAmount} max={open.proofAmount} disabled={self} />
                  </FormField>
                )}
                <FormField label="Comment to employee" required={choice !== 'approve'} helper="The employee sees this on the line.">
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

/** PAY-27 · EWA admin: policy, partner connection, draws, recoveries in payroll, reconciliation. */
export function EwaAdminScreen({ tab = 'draws', persona = 'pa', state = 'ready', partner = 'connected' }: { tab?: 'policy' | 'partner' | 'draws' | 'recoveries' | 'recon'; persona?: PayPersona; state?: ViewState; partner?: 'connected' | 'not-connected' }) {
  const [notice, setNotice] = useState<string | null>(null);
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
      {notice && <InlineAlert tone="success">{notice}</InlineAlert>}
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
                <Button variant="primary" icon={Send} disabled={requested} onClick={() => setRequested(true)}>
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
          <div className="yx-scroll-x" tabIndex={0} role="region" aria-label="Table, scrolls sideways on small screens">
            <table className="yx-pay-table">
              <thead>
                <tr>
                  <th scope="col">Run</th>
                  <th scope="col" data-num>
                    Draws
                  </th>
                  <th scope="col" data-num>
                    Recovered
                  </th>
                  <th scope="col" data-num>
                    Deferred (deduction cap)
                  </th>
                  <th scope="col">To F&amp;F</th>
                </tr>
              </thead>
              <tbody>
                <tr>
                  <th scope="row">September 2026</th>
                  <td data-num>{disbursed.length}</td>
                  <td data-num>{formatINR(total - 2_000)}</td>
                  <td data-num>{formatINR(2_000)}</td>
                  <td>1 leaver: {formatINR(1_500)}</td>
                </tr>
                <tr>
                  <th scope="row">August 2026</th>
                  <td data-num>9</td>
                  <td data-num>{formatINR(31_500)}</td>
                  <td data-num>—</td>
                  <td>—</td>
                </tr>
              </tbody>
            </table>
          </div>
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

export const REPORTS = [
  { id: 'register', name: 'Salary register', desc: 'Every payslip line by employee for a run' },
  { id: 'recon', name: 'Payroll reconciliation', desc: 'This run vs last: headcount, gross, deductions, net' },
  { id: 'arrears', name: 'Arrears', desc: 'Arrears paid in this run, by month and cause' },
  { id: 'ytd', name: 'Year to date', desc: 'YTD earnings, deductions and tax per employee' },
  { id: 'ctc', name: 'CTC report', desc: 'Cost to company by department' },
  { id: 'variance', name: 'Variance', desc: 'Employees whose net pay changed by more than 10% from August' },
  { id: 'bank', name: 'Bank advice', desc: 'Payment list for the bank' },
  { id: 'holds', name: 'Hold ageing', desc: 'Held salaries by age and reason' },
  { id: 'gratuity', name: 'Gratuity provision', desc: 'Monthly provision and liability' },
  { id: 'loans', name: 'Loan ledger', desc: 'Loans, EMIs and balances' },
] as const;
export type ReportId = (typeof REPORTS)[number]['id'];
export type ReportPeriod = 'sep' | 'aug';
export type ReportGroup = 'ka' | 'tn';
const PERIOD_LABEL: Record<ReportPeriod, string> = { sep: 'September 2026', aug: 'August 2026' };
const GROUP_LABEL: Record<ReportGroup, string> = { ka: RUN.payGroup, tn: `Monthly · ${ENTITY_TN.name}` };
const GROUP_SHORT: Record<ReportGroup, string> = { ka: 'Karnataka', tn: 'Tamil Nadu' };
/** Reports built from payslip lines; the others are Karnataka run totals. */
const LINE_REPORTS: ReportId[] = ['register', 'variance', 'bank', 'gratuity', 'arrears', 'ytd'];

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

const signedPct = (p: number) => `${p > 0 ? '+' : p < 0 ? '−' : ''}${Math.abs(p).toFixed(1)}%`;
const signedINR = (v: number) => `${v < 0 ? '−' : '+'}${formatINR(Math.abs(v))}`;
const mask = (account: string) => `••••${account.slice(-4)}`;
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

/** PAY-25 · Payroll reports (T7): filters, table, chart, export, "View as table". */
export function PayrollReportsScreen({
  report = 'register',
  persona = 'pa',
  state = 'ready',
  period: initialPeriod = 'sep',
  group: initialGroup = 'ka',
}: {
  report?: ReportId;
  persona?: PayPersona;
  state?: ViewState;
  period?: ReportPeriod;
  group?: ReportGroup;
}) {
  const narrow = useNarrow();
  const [current, setCurrent] = useState<ReportId>(report);
  const [period, setPeriod] = useState<ReportPeriod>(initialPeriod);
  const [group, setGroup] = useState<ReportGroup>(initialGroup);
  const [notice, setNotice] = useState<string | null>(null);
  const [scheduling, setScheduling] = useState(false);
  const [frequency, setFrequency] = useState<'run' | 'month'>('run');
  const meta = REPORTS.find((r) => r.id === current)!;
  const depts = ['Engineering', 'Operations', 'Finance', 'People', 'Sales', 'Quality'];
  const byDept = useMemo(() => depts.map((dep) => RUN_ROWS.filter((r) => r.department === dep)), []); // eslint-disable-line react-hooks/exhaustive-deps
  // Only the September run is loaded here; August is locked and its registers are archived with the August run.
  const lines = period !== 'sep' ? [] : group === 'ka' ? KA_LINES : [DIVYA_LINE];
  const hasData = state === 'ready' && lines.length > 0 && (group === 'ka' || LINE_REPORTS.includes(current));
  const fileName = (ext: string) => `${meta.name} · ${PERIOD_LABEL[period]} · ${GROUP_LABEL[group]}.${ext}`;
  const download = (ext: string) => setNotice(`${fileName(ext)} downloaded.`);
  const clearFilters = () => {
    setPeriod('sep');
    setGroup('ka');
  };
  const body = () => {
    if (state !== 'ready') return <StateBlock state={state} rows={8}>{null}</StateBlock>;
    if (!hasData)
      return (
        <EmptyState
          title="No data for these filters."
          description={`Filters: ${meta.name} · ${PERIOD_LABEL[period]} · ${GROUP_LABEL[group]}. ${
            period === 'aug' ? 'August 2026 is locked; its reports are archived with the August run.' : `${meta.name} is built from the Karnataka run, so ${GROUP_SHORT[group]} has none.`
          }`}
          action={<Button onClick={clearFilters}>Clear filters</Button>}
        />
      );
    switch (current) {
      case 'register':
        return (
          <DataTable
            label="Salary register"
            columns={[
              { key: 'name', header: 'Employee', type: 'person', value: (r) => r.name, person: (r) => ({ name: r.name, secondary: r.code }), width: 190 },
              { key: 'dept', header: 'Department', value: (r) => r.department, groupable: true, width: 130, optional: true },
              { key: 'days', header: 'Days', type: 'number', value: (r) => r.days, width: 80, optional: true },
              { key: 'basic', header: 'Basic', type: 'money', value: (r) => r.basic, total: 'sum', width: 110, optional: true },
              { key: 'hra', header: 'HRA', type: 'money', value: (r) => r.hra, total: 'sum', width: 100, optional: true },
              { key: 'spl', header: 'Special and other', type: 'money', value: (r) => r.special, total: 'sum', width: 120, optional: true },
              { key: 'one', header: 'One-time and arrears', type: 'money', value: (r) => r.oneTime, total: 'sum', width: 130, optional: true },
              { key: 'gross', header: 'Gross', type: 'money', value: (r) => r.gross, total: 'sum', width: 110 },
              { key: 'stat', header: 'PF, ESI, PT', type: 'money', value: (r) => r.pf + r.esi + r.pt, total: 'sum', width: 110 },
              { key: 'tds', header: 'TDS', type: 'money', value: (r) => r.tds, total: 'sum', width: 100 },
              { key: 'lop', header: 'LOP', type: 'money', value: (r) => r.lop, total: 'sum', width: 90 },
              { key: 'loans', header: 'Loan EMIs', type: 'money', value: (r) => r.loans, total: 'sum', width: 100 },
              { key: 'ded', header: 'Deductions', type: 'money', value: (r) => r.deductions, total: 'sum', width: 120 },
              { key: 'net', header: 'Net', type: 'money', value: (r) => r.net, total: 'sum', width: 120 },
            ]}
            rows={lines}
            getRowId={(r) => r.id}
            pageSize={25}
            onExport={(f) => download(f)}
          />
        );
      case 'variance': {
        const pcts = lines.map((l) => variance(l.net, l.prevNet).pct);
        const buckets = [pcts.filter((p) => p < -10).length, pcts.filter((p) => p >= -10 && p < 0).length, pcts.filter((p) => p >= 0 && p <= 10).length, pcts.filter((p) => p > 10).length];
        return (
          <div className="yx-pay-stack">
            <BarChart title="Employees by net change" description="September vs August" categories={['Below −10%', '−10% to 0', '0 to +10%', 'Above +10%']} series={[{ name: 'Employees', values: buckets }]} xLabel="Change" height={200} />
            <DataTable
              label="Net changes above 10%"
              columns={[
                { key: 'name', header: 'Employee', type: 'person', value: (r) => r.name, person: (r) => ({ name: r.name, secondary: r.code }), width: 220 },
                { key: 'aug', header: 'August', type: 'money', value: (r) => r.prevNet, width: 110, optional: true },
                { key: 'sep', header: 'September', type: 'money', value: (r) => r.net, width: 110 },
                { key: 'pct', header: 'Change', type: 'number', value: (r) => variance(r.net, r.prevNet).pct, render: (r) => signedPct(variance(r.net, r.prevNet).pct), width: 90 },
                { key: 'cause', header: 'Cause', value: (r) => r.reason ?? 'Not explained yet', width: 280 },
              ]}
              rows={lines.filter((l) => variance(l.net, l.prevNet).flagged)}
              getRowId={(r) => r.id}
              cardSummary
              empty={<EmptyState title="No net change above 10%." />}
              onExport={(f) => download(f)}
            />
          </div>
        );
      }
      case 'recon': {
        const aug = RUN_HISTORY.find((h) => h.month === 'Aug')!;
        const sep = RUN_HISTORY.find((h) => h.month === 'Sep')!;
        const sepGross = sumBy(lines, (l) => l.gross);
        const sepNet = sumBy(lines, (l) => l.net);
        const recon = [
          { id: 'emp', item: 'Employees', a: aug.employees, b: sep.employees, money: false },
          { id: 'gross', item: 'Gross', a: aug.gross, b: sepGross, money: true },
          { id: 'ded', item: 'Deductions', a: aug.gross - aug.net, b: sumBy(lines, (l) => l.deductions), money: true },
          { id: 'net', item: 'Net', a: aug.net, b: sepNet, money: true },
        ];
        const fmt = (v: number, money: boolean) => (money ? formatINR(v) : String(v));
        // Gross change, part by part: joiners since the August run, one-time pay and arrears, and the rest.
        const joiners = lines.filter((l) => l.joined > new Date(2026, 7, 31));
        const joinGross = sumBy(joiners, (l) => l.regular.gross);
        const oneTime = sumBy(lines, (l) => l.oneTime);
        const diff = sepGross - aug.gross;
        const other = diff - joinGross - oneTime;
        return (
          <div className="yx-pay-stack">
            <LineChart
              title="Gross and net by run"
              categories={RUN_HISTORY.map((h) => h.month)}
              series={[
                { name: 'Gross', values: RUN_HISTORY.map((h) => (h.month === 'Sep' ? sepGross : h.gross)) },
                { name: 'Net', values: RUN_HISTORY.map((h) => (h.month === 'Sep' ? sepNet : h.net)) },
              ]}
              money
              xLabel="Month"
              height={200}
            />
            <DataTable
              label="August vs September"
              columns={[
                { key: 'item', header: 'Item', value: (r) => r.item, width: 140 },
                { key: 'a', header: 'August', type: 'number', value: (r) => r.a, render: (r) => fmt(r.a, r.money), width: 140 },
                { key: 'b', header: 'September', type: 'number', value: (r) => r.b, render: (r) => fmt(r.b, r.money), width: 140 },
                { key: 'd', header: 'Difference', type: 'number', value: (r) => r.b - r.a, render: (r) => `${r.b - r.a >= 0 ? '+' : '−'}${fmt(Math.abs(r.b - r.a), r.money)}`, width: 140 },
              ]}
              rows={recon}
              getRowId={(r) => r.id}
            />
            <p className="yx-pay-muted">
              Gross change {signedINR(diff)}:{joiners.length > 0 && ` ${joiners.length} joiner${joiners.length === 1 ? '' : 's'} since the August run (${signedINR(joinGross)}),`} one-time pay and arrears ({signedINR(oneTime)}), {joiners.length === 0 && sep.employees > aug.employees ? 'the new joiner, ' : ''}revisions, increments and other changes ({signedINR(other)}).
            </p>
          </div>
        );
      }
      case 'ytd': {
        const ytd = lines.map((l) => {
          const ms = monthsOf(l).filter((m): m is MonthPay => m != null);
          return { id: l.id, name: l.name, code: l.code, months: ms.length, gross: sumBy(ms, (m) => m.gross), ded: sumBy(ms, (m) => m.ded), tds: sumBy(ms, (m) => m.tds), net: sumBy(ms, (m) => m.net) };
        });
        const perMonth = FY_MONTHS.map((_, i) => lines.map((l) => monthsOf(l)[i]).filter((m): m is MonthPay => m != null));
        const cumulative = (f: (m: MonthPay) => number) => perMonth.map((ms) => sumBy(ms, f)).map((_, i, all) => all.slice(0, i + 1).reduce((a, v) => a + v, 0));
        return (
          <div className="yx-pay-stack">
            <LineChart title="Year to date, cumulative gross and net" categories={FY_MONTHS} series={[{ name: 'Gross', values: cumulative((m) => m.gross) }, { name: 'Net', values: cumulative((m) => m.net) }]} money xLabel="Month" height={200} />
            <p className="yx-pay-muted">April to September 2026. Earlier months use each person's regular monthly pay; September is this run, with one-time pay and unpaid leave.</p>
            <DataTable
              label="Year to date, April to September 2026"
              columns={[
                { key: 'name', header: 'Employee', type: 'person', value: (r) => r.name, person: (r) => ({ name: r.name, secondary: r.code }), width: 220 },
                { key: 'months', header: 'Months paid', type: 'number', value: (r) => r.months, width: 110, optional: true },
                { key: 'gross', header: 'Gross', type: 'money', value: (r) => r.gross, total: 'sum', width: 130 },
                { key: 'tds', header: 'TDS', type: 'money', value: (r) => r.tds, total: 'sum', width: 120 },
                { key: 'ded', header: 'All deductions', type: 'money', value: (r) => r.ded, total: 'sum', width: 130 },
                { key: 'net', header: 'Net', type: 'money', value: (r) => r.net, total: 'sum', width: 130 },
              ]}
              rows={ytd}
              getRowId={(r) => r.id}
              pageSize={25}
              cardSummary
              onExport={(f) => download(f)}
            />
          </div>
        );
      }
      case 'ctc':
        return (
          <BarChart
            title="Cost to company by department, September"
            categories={depts}
            series={[{ name: 'Gross', values: byDept.map((rs) => rs.reduce((a, r) => a + r.gross, 0)) }, { name: 'Employer contributions', values: byDept.map((rs) => rs.reduce((a, r) => a + (r.employerCost - r.gross), 0)) }]}
            stacked
            money
            xLabel="Department"
            groupSizes={byDept.map((rs) => rs.length)}
            minGroupSize={3}
            height={240}
          />
        );
      case 'holds': {
        const open = HOLDS.filter((h) => h.status !== 'Released');
        const reasons = [...new Set(open.map((h) => h.reason))];
        const ages = AGE_BUCKETS.map((b) => {
          const hs = open.filter((h) => h.ageDays >= b.from && h.ageDays <= b.to);
          return { id: b.id, label: b.label, count: hs.length, amount: sumBy(hs, (h) => h.amount) };
        });
        return (
          <div className="yx-pay-stack">
            <DataTable
              label="Open holds by age"
              columns={[
                { key: 'age', header: 'Age', value: (r) => r.label, width: 160 },
                { key: 'count', header: 'Salaries held', type: 'number', value: (r) => r.count, total: 'sum', width: 130 },
                { key: 'amount', header: 'Amount held', type: 'money', value: (r) => r.amount, total: 'sum', width: 140 },
              ]}
              rows={ages}
              getRowId={(r) => r.id}
              rowNoun={['age band', 'age bands']}
              cardSummary
            />
            <BarChart title="Open holds by reason" description="Amount held" categories={reasons} series={[{ name: 'Amount held', values: reasons.map((label) => sumBy(open.filter((h) => h.reason === label), (h) => h.amount)) }]} orientation="horizontal" money xLabel="Reason" />
          </div>
        );
      }
      case 'gratuity':
        return (
          <div className="yx-pay-stack">
            <p className="yx-pay-muted">Gratuity wage is basic plus the Code add-back that brings wages to half of pay. The liability builds from the joining date at 15 days' wages (wage ÷ 26) a year and becomes payable after 5 years' service.</p>
            <DataTable
              label="Gratuity provision"
              columns={[
                { key: 'name', header: 'Employee', type: 'person', value: (r) => r.name, person: (r) => ({ name: r.name, secondary: r.code }), width: 220 },
                { key: 'svc', header: 'Service', type: 'number', value: (r) => serviceMonths(r.joined), render: (r) => `${Math.floor(serviceMonths(r.joined) / 12)} y ${serviceMonths(r.joined) % 12} m`, width: 100 },
                { key: 'wage', header: 'Gratuity wage', type: 'money', value: (r) => gratuityWage(r), width: 130, optional: true },
                { key: 'elig', header: 'Payable now', value: (r) => (gratuity(gratuityWage(r), serviceMonths(r.joined)).eligible ? 'Yes' : 'Not yet'), width: 110 },
                { key: 'liab', header: 'Liability to date', type: 'money', value: (r) => gratuityLiability(r), total: 'sum', width: 140 },
                { key: 'prov', header: 'September provision', type: 'money', value: (r) => Math.round((gratuityWage(r) * 15) / 26 / 12), total: 'sum', width: 140 },
              ]}
              rows={lines}
              getRowId={(r) => r.id}
              pageSize={25}
              cardSummary
              onExport={(f) => download(f)}
            />
          </div>
        );
      case 'loans':
        return <LoansLedger />;
      case 'arrears':
        return (
          <DataTable
            label="Arrears"
            columns={[
              { key: 'name', header: 'Employee', type: 'person', value: (r) => r.name, person: (r) => ({ name: r.name, secondary: r.code }), width: 220 },
              { key: 'month', header: 'Month', value: (r) => r.month, width: 100 },
              { key: 'cause', header: 'Cause', value: (r) => r.cause, width: 280 },
              { key: 'amount', header: 'Arrears', type: 'money', value: (r) => r.amount, total: 'sum', width: 120 },
            ]}
            rows={group === 'ka' ? ARREARS : []}
            getRowId={(r) => r.id}
            empty={<EmptyState title="No arrears in this run." />}
            onExport={(f) => download(f)}
          />
        );
      case 'bank': {
        const paid = lines.filter((l) => l.mode === 'Bank' && l.status !== 'Held' && l.status !== 'Failed');
        const left = lines.length - paid.length;
        return (
          <div className="yx-pay-stack">
            <p className="yx-pay-muted">
              {paid.length} payments · {formatINR(paid.reduce((a, l) => a + l.net, 0))} in the bank file.
              {left > 0 && ` ${left} not in the file: held, failed or paid by cash or cheque.`}
            </p>
            <DataTable
              label="Bank advice"
              columns={[
                { key: 'name', header: 'Employee', type: 'person', value: (r) => r.name, person: (r) => ({ name: r.name, secondary: r.code }), width: 220 },
                { key: 'bank', header: 'Bank', value: (r) => r.bank, width: 200, optional: true },
                { key: 'ifsc', header: 'IFSC', type: 'id', value: (r) => r.ifsc, width: 120, optional: true },
                { key: 'acct', header: 'Account', type: 'id', value: (r) => mask(r.account), width: 110 },
                { key: 'net', header: 'Amount', type: 'money', value: (r) => r.net, total: 'sum', width: 120 },
              ]}
              rows={paid}
              getRowId={(r) => r.id}
              pageSize={25}
              onExport={(f) => download(f)}
            />
          </div>
        );
      }
    }
  };
  const periodOptions = (['sep', 'aug'] as const).map((p) => ({ value: p, label: PERIOD_LABEL[p] }));
  const groupOptions = (['ka', 'tn'] as const).map((g) => ({ value: g, label: narrow ? GROUP_LABEL[g] : GROUP_SHORT[g] }));
  const frequencyOptions = [
    { value: 'run' as const, label: 'When each run is locked' },
    { value: 'month' as const, label: 'On the 1st of every month' },
  ];
  return (
    <PayFrame page="reports" persona={persona}>
      <PageHeader
        title="Payroll reports"
        description="Figures follow your access: payroll and finance see all employees in their scope."
        actions={
          <>
            <Button onClick={() => setScheduling(true)}>Schedule</Button>
            {!hasData && state === 'ready' && <span className="yx-pay-muted">Nothing to export for these filters</span>}
            <Button icon={Download} disabled={!hasData} onClick={() => download('xlsx')}>
              Export XLSX
            </Button>
          </>
        }
      />
      <div className="yx-pay-row">
        <div style={{ flex: narrow ? '1 1 100%' : '0 1 calc(var(--yx-space-16) * 5)', minWidth: 0 }}>
          <Select aria-label="Report" value={current} onChange={(v) => v && setCurrent(v as ReportId)} options={REPORTS.map((r) => ({ value: r.id, label: r.name, description: r.desc }))} />
        </div>
        {narrow ? (
          <>
            <div style={{ flex: '1 1 100%', minWidth: 0 }}>
              <Select aria-label="Period" value={period} onChange={(v) => v && setPeriod(v as ReportPeriod)} options={periodOptions} />
            </div>
            <div style={{ flex: '1 1 100%', minWidth: 0 }}>
              <Select aria-label="Pay group" value={group} onChange={(v) => v && setGroup(v as ReportGroup)} options={groupOptions} />
            </div>
          </>
        ) : (
          <>
            <Segment label="Period" value={period} onChange={setPeriod} options={periodOptions} />
            <Segment label="Pay group" value={group} onChange={setGroup} options={groupOptions} />
          </>
        )}
      </div>
      {notice && <InlineAlert tone="success">{notice}</InlineAlert>}
      <section className="yx-pay-stack" aria-label={meta.name}>
        <SectionTitle>{meta.name}</SectionTitle>
        <p className="yx-pay-muted">{meta.desc}</p>
        {body()}
      </section>
      <Dialog
        open={scheduling}
        onOpenChange={setScheduling}
        title={`Schedule ${meta.name.toLowerCase()}?`}
        description={`Emailed to ${PAYROLL_ADMIN.name} as XLSX for ${GROUP_LABEL[group]}.`}
        footer={
          <>
            <Button onClick={() => setScheduling(false)}>Cancel</Button>
            <Button
              variant="primary"
              onClick={() => {
                setScheduling(false);
                setNotice(`${meta.name} scheduled: emailed to ${PAYROLL_ADMIN.name} ${frequency === 'run' ? 'when each run is locked' : 'on the 1st of every month'}.`);
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
    </PayFrame>
  );
}

/** September loan ledger: opening = balance after the August EMI; closing follows each loan's schedule. Loans not yet disbursed are left out. */
function LoansLedger() {
  const rows = LEDGER_LOANS.filter((l) => l.status !== 'Waiting for approval').map((l) => {
    const r = runRow(l);
    return { ...l, opening: l.outstanding, sepEmi: r?.status === 'due' ? r.emi : 0, interest: r ? r.interest : 0, closing: r ? r.balance : l.outstanding };
  });
  return (
    <DataTable
      label="Loan ledger"
      columns={[
        { key: 'employee', header: 'Employee', type: 'person', value: (r) => r.employee, person: (r) => ({ name: r.employee, secondary: r.code }), width: 220 },
        { key: 'type', header: 'Type', value: (r) => r.type, width: 150, optional: true },
        { key: 'open', header: 'Opening', type: 'money', value: (r) => r.opening, total: 'sum', width: 120 },
        { key: 'int', header: 'Interest', type: 'money', value: (r) => r.interest, total: 'sum', width: 110, optional: true },
        { key: 'rec', header: 'September EMI', type: 'money', value: (r) => r.sepEmi, total: 'sum', width: 130 },
        { key: 'close', header: 'Closing', type: 'money', value: (r) => r.closing, total: 'sum', width: 120 },
      ]}
      rows={rows}
      getRowId={(r) => r.id}
      cardSummary
    />
  );
}

/** Report page when a person has no payroll scope (P02): shown instead of figures, with only the page they opened in the panel. */
export function ReportsNoAccess() {
  const [sent, setSent] = useState(false);
  const rail = SCREEN_RAIL.filter((r) => ['home', 'people', 'time', 'pay', 'compliance', 'performance', 'helpdesk', 'analytics', 'settings'].includes(r.id));
  return (
    <DesktopFrame area="pay" panelTitle="Pay" panel={[{ label: 'Pay', items: [{ label: 'Reports', active: true }] }]} railItems={rail} user={HR_ADMIN}>
      <PageHeader title="Payroll reports" />
      <EmptyState
        title="You don't have access to payroll reports"
        description={sent ? `Request sent to ${PAYROLL_ADMIN.name} on 29 Sep 2026. You'll get a notification when it's decided.` : `Ask ${PAYROLL_ADMIN.name}, your payroll admin, for access.`}
        action={
          <Button variant="primary" icon={Send} disabled={sent} onClick={() => setSent(true)}>
            {sent ? 'Request sent' : 'Request access'}
          </Button>
        }
      />
    </DesktopFrame>
  );
}
