import { useState, type ReactNode } from 'react';
import { Button } from '../../../components/button';
import { Badge, type BadgeTone } from '../../../components/display';
import { Drawer } from '../../../components/drawer';
import { EmptyState, InlineAlert } from '../../../components/feedback';
import { ErrorSummary, FormField, useSaveErrors, type FormErrorItem } from '../../../components/field';
import { TextArea, TextField } from '../../../components/inputs';
import { Segment } from '../../../components/segment';
import { Select } from '../../../components/select';
import { Card, Tabs, TabsContent, TabsList, TabsTrigger } from '../../../components/shell';
import { useRun } from '../../org/org-kit';
import { LivePage, dateText } from '../../time/live/kit';
import { IrreversibleSheet } from '../pay-kit';
import { FileButton } from './compliance';
import { PersonPicker, type PersonHit } from './inputs';
import { monthText } from './periods';
import { ReasonDrawer, rupees } from './runs';
import { EntityPicker } from './setup';
import type { Confirmation, LoadState } from './types';
import type { SetupEntity } from './types-5b';
import type { PayRun, RunPayslip } from './types-5j';
import type {
  AdvisoryView,
  CertificateRow,
  DeclarationInput,
  DeclarationLine,
  Disbursement,
  DisbursementInput,
  LoanChangeInput,
  LoanRequestInput,
  LoanView,
  MyCertificate,
  MyDeclarations,
  PartAImport,
  PaymentModeRow,
  PaymentResultRow,
  PayslipQueryView,
  ProofDecision,
  ProofQueueLine,
  RegisterRow,
} from './types-ops';

// Payroll operations, wired (PAY-10.09 … 10.16; batch 5d, 5c, 5e and 5f APIs): a run's payment results and the cash and
// cheque register, payment modes, loans and advances, payslip queries for payroll, tax declarations with proofs and their
// checking, statutory registers, advisories, Part A and the year-end certificates, and adding a nominee for the pay portal.

const MONEY = /^\d{1,10}(\.\d{1,2})?$/;
const MONTH = /^\d{4}-\d{2}$/;
const DAY = /^\d{4}-\d{2}-\d{2}$/;

/** Bank results are all or nothing: the API's row problems are shown with its message. */
const withProblems = async <T,>(fn: () => Promise<T>): Promise<T> => {
  try {
    return await fn();
  } catch (e) {
    const problems = (e as { body?: { problems?: unknown } }).body?.problems;
    if (e instanceof Error && Array.isArray(problems) && problems.length) throw new Error(`${e.message} ${problems.slice(0, 10).join(' ')}`);
    throw e;
  }
};

function Failed({ error }: { error: string | null }) {
  return error ? (
    <InlineAlert tone="danger" title="This didn't go through">
      {error}
    </InlineAlert>
  ) : null;
}

/** A drawer with a form: errors show only after Save is pressed (no red while typing). */
export function FormDrawer({ title, subtitle, confirm, errors, onClose, onSave, children }: { title: string; subtitle?: string; confirm: string; errors: FormErrorItem[]; onClose: () => void; onSave: () => Promise<unknown>; children: (errorOf: (id: string) => string | undefined) => ReactNode }) {
  const { busy, error, run } = useRun();
  const save = useSaveErrors(errors);
  return (
    <Drawer
      open
      onOpenChange={(o) => !o && onClose()}
      title={title}
      subtitle={subtitle}
      footer={
        <>
          <Button onClick={onClose}>Cancel</Button>
          <Button
            variant="primary"
            loading={busy === 'save'}
            onClick={() => {
              if (errors.length) return save.reveal();
              void run('save', async () => {
                await onSave();
                onClose();
              });
            }}
          >
            {confirm}
          </Button>
        </>
      }
    >
      <div className="yx-tim-form">
        <ErrorSummary errors={save.shownErrors} />
        <Failed error={error} />
        {children(save.errorOf)}
      </div>
    </Drawer>
  );
}

/** Asks before a step that cannot be undone and has nothing to type (freezing a register). */
function ConfirmDrawer({ title, children, confirm, onClose, onConfirm }: { title: string; children: ReactNode; confirm: string; onClose: () => void; onConfirm: () => Promise<unknown> }) {
  const { busy, error, run } = useRun();
  return (
    <Drawer
      open
      onOpenChange={(o) => !o && onClose()}
      title={title}
      footer={
        <>
          <Button onClick={onClose}>Cancel</Button>
          <Button variant="primary" loading={busy === 'go'} onClick={() => void run('go', async () => (await onConfirm(), onClose()))}>
            {confirm}
          </Button>
        </>
      }
    >
      <div className="yx-tim-stack">
        <Failed error={error} />
        {children}
      </div>
    </Drawer>
  );
}

const PAYMENT: Record<string, { label: string; tone: BadgeTone }> = {
  pending: { label: 'Not paid yet', tone: 'neutral' },
  sent: { label: 'Sent to the bank', tone: 'info' },
  held: { label: 'Held', tone: 'warning' },
  cash: { label: 'Cash or cheque', tone: 'neutral' },
  paid: { label: 'Paid', tone: 'success' },
  failed: { label: 'Failed', tone: 'danger' },
  returned: { label: 'Came back', tone: 'danger' },
};
const paymentBadge = (s: string) => <Badge tone={PAYMENT[s]?.tone ?? 'neutral'}>{PAYMENT[s]?.label ?? s}</Badge>;

// ------------------------------------------------------------------------------------------ payments (PAY-10, PAY-08)

export interface RunPaymentsScreenProps {
  state: LoadState;
  onRetry?: () => void;
  run: PayRun | null;
  payslips: RunPayslip[] | null;
  disbursements: Disbursement[] | null;
  nameOf: (employeeId: string) => string;
  can: { record: boolean };
  onBack: () => void;
  onResults: (rows: PaymentResultRow[]) => Promise<unknown>;
  onUploadResults: (file: File) => Promise<{ recorded: number }>;
  onDisburse: (d: DisbursementInput) => Promise<unknown>;
}

/** One run's payments: the bank's results person by person (or its file) and the cash and cheque register. */
export function RunPaymentsScreen(p: RunPaymentsScreenProps) {
  const [result, setResult] = useState<RunPayslip | null>(null);
  const [paying, setPaying] = useState<Disbursement | null>(null);
  const [uploaded, setUploaded] = useState<number | null>(null);
  const { busy, error, run } = useRun();
  const paid = p.run && ['approved', 'paid'].includes(p.run.status);
  const cashIds = new Set((p.disbursements ?? []).filter((d) => d.mode !== 'bank').map((d) => d.payslipId));
  const bank = (p.payslips ?? []).filter((s) => !cashIds.has(s.id));
  return (
    <LivePage
      title={p.run ? `Payments · ${monthText(p.run.month)}` : 'Payments'}
      description="What the bank paid, failed or sent back, and who was paid by cash or cheque. A failed payment is paid again from the run once the bank details are fixed."
      state={p.state}
      onRetry={p.onRetry}
      what="payments"
      grantedBy="your payroll admin"
      actions={<Button onClick={p.onBack}>Back to the run</Button>}
    >
      {!paid && <InlineAlert tone="info" title="Payments are recorded once the run is approved." />}
      <Failed error={error} />
      {uploaded !== null && (
        <InlineAlert tone="success" title="Bank results recorded">
          {uploaded} {uploaded === 1 ? 'payment' : 'payments'} updated.
        </InlineAlert>
      )}
      <Tabs defaultValue="bank">
        <TabsList aria-label="Payments">
          <TabsTrigger value="bank">Bank</TabsTrigger>
          <TabsTrigger value="cash">Cash and cheque</TabsTrigger>
        </TabsList>
        <TabsContent value="bank">
          {paid && p.can.record && (
            <div className="yx-tim-row">
              <FileButton label="Upload the bank's results" accept=".csv,text/csv" ariaLabel="Upload the bank's results file (CSV)" loading={busy === 'up'} onFile={(f) => void run('up', async () => setUploaded((await withProblems(() => p.onUploadResults(f))).recorded))} />
              <p className="yx-tim-note">A CSV with the columns employee_code, status (paid, failed or returned), reference and reason.</p>
            </div>
          )}
          {!bank.length ? (
            <EmptyState title="No bank payments" description="People paid into a bank account appear here once the run is calculated." compact />
          ) : (
            <table className="yx-tim-table" aria-label="Bank payments">
              <thead>
                <tr>
                  <th scope="col">Person</th>
                  <th scope="col">Net pay</th>
                  <th scope="col">Payment</th>
                  <th scope="col">
                    <span className="yx-visually-hidden">Record</span>
                  </th>
                </tr>
              </thead>
              <tbody>
                {bank.map((s) => (
                  <tr key={s.id}>
                    <th scope="row">{p.nameOf(s.employeeId)}</th>
                    <td>{rupees(s.net)}</td>
                    <td>
                      {paymentBadge(s.paymentStatus)} {s.held && <Badge tone="warning">Held</Badge>}
                    </td>
                    <td>
                      {paid && p.can.record && !s.held && s.paymentStatus !== 'paid' && (
                        <Button size="sm" onClick={() => setResult(s)} aria-label={`Record the bank result for ${p.nameOf(s.employeeId)}`}>
                          Record result
                        </Button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </TabsContent>
        <TabsContent value="cash">
          {!p.disbursements?.length ? (
            <EmptyState title="Nobody is paid by cash or cheque" description="People whose approved payment mode is cash or cheque appear here." compact />
          ) : (
            <table className="yx-tim-table" aria-label="Cash and cheque register">
              <thead>
                <tr>
                  <th scope="col">Person</th>
                  <th scope="col">Net pay</th>
                  <th scope="col">Mode</th>
                  <th scope="col">Paid</th>
                  <th scope="col">
                    <span className="yx-visually-hidden">Record</span>
                  </th>
                </tr>
              </thead>
              <tbody>
                {p.disbursements.map((d) => (
                  <tr key={d.payslipId}>
                    <th scope="row">{p.nameOf(d.employeeId)}</th>
                    <td>{rupees(d.net)}</td>
                    <td>{d.mode === 'cheque' ? `Cheque${d.chequeNo ? ` ${d.chequeNo}` : ''}` : 'Cash'}</td>
                    <td>{d.paidOn ? dateText(d.paidOn) : paymentBadge(d.paymentStatus)}</td>
                    <td>
                      {paid && p.can.record && !d.paidOn && !d.held && (
                        <Button size="sm" onClick={() => setPaying(d)} aria-label={`Record the payment to ${p.nameOf(d.employeeId)}`}>
                          Record payment
                        </Button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </TabsContent>
      </Tabs>
      {result && <ResultDrawer who={p.nameOf(result.employeeId)} onClose={() => setResult(null)} onSave={(r) => withProblems(() => p.onResults([{ payslipId: result.id, ...r }]))} />}
      {paying && <DisburseDrawer d={paying} who={p.nameOf(paying.employeeId)} onClose={() => setPaying(null)} onSave={p.onDisburse} />}
    </LivePage>
  );
}

function ResultDrawer({ who, onClose, onSave }: { who: string; onClose: () => void; onSave: (r: Omit<PaymentResultRow, 'payslipId'>) => Promise<unknown> }) {
  const [status, setStatus] = useState<PaymentResultRow['status']>('paid');
  const [ref, setRef] = useState('');
  const [reason, setReason] = useState('');
  const errors: FormErrorItem[] = [
    ...(ref.trim() && !/^[A-Za-z0-9/-]{1,60}$/.test(ref.trim()) ? [{ fieldId: 'pr-ref', message: 'A bank reference is letters, digits, / and -.' }] : []),
    ...(reason.trim().length < 3 ? [{ fieldId: 'pr-why', message: status === 'paid' ? 'Say how you know it was paid.' : 'Say what the bank gave as the reason.' }] : []),
  ];
  return (
    <FormDrawer title={`Bank result for ${who}`} confirm="Record" errors={errors} onClose={onClose} onSave={() => onSave({ status, ...(ref.trim() ? { bankReference: ref.trim() } : {}), reason: reason.trim() })}>
      {(errorOf) => (
        <>
          <FormField id="pr-status" label="Result">
            <Segment
              label="Result"
              value={status}
              onChange={setStatus}
              options={[
                { value: 'paid', label: 'Paid' },
                { value: 'failed', label: 'Failed' },
                { value: 'returned', label: 'Came back' },
              ]}
            />
          </FormField>
          <FormField id="pr-ref" label="Bank reference" optional error={errorOf('pr-ref')}>
            <TextField value={ref} onChange={setRef} maxLength={60} />
          </FormField>
          <FormField id="pr-why" label={status === 'paid' ? 'How you know' : 'Reason from the bank'} required helper={status === 'paid' ? 'For example, seen on the bank statement of 3 October.' : undefined} error={errorOf('pr-why')}>
            <TextArea value={reason} onChange={setReason} rows={2} maxLength={300} />
          </FormField>
        </>
      )}
    </FormDrawer>
  );
}

function DisburseDrawer({ d, who, onClose, onSave }: { d: Disbursement; who: string; onClose: () => void; onSave: (x: DisbursementInput) => Promise<unknown> }) {
  const [mode, setMode] = useState<'cash' | 'cheque'>(d.mode === 'cheque' ? 'cheque' : 'cash');
  const [cheque, setCheque] = useState('');
  const [paidOn, setPaidOn] = useState('');
  const [ack, setAck] = useState('');
  const errors: FormErrorItem[] = [
    ...(mode === 'cheque' && !/^\d{6,10}$/.test(cheque.trim()) ? [{ fieldId: 'ds-cheque', message: 'A cheque number is 6 to 10 digits.' }] : []),
    ...(!DAY.test(paidOn) ? [{ fieldId: 'ds-on', message: 'Give the day it was paid.' }] : []),
  ];
  return (
    <FormDrawer
      title={`Pay ${who}`}
      subtitle={rupees(d.net)}
      confirm="Record payment"
      errors={errors}
      onClose={onClose}
      onSave={() => onSave({ payslipId: d.payslipId, mode, paidOn, ...(mode === 'cheque' ? { chequeNo: cheque.trim() } : {}), ...(ack.trim() ? { acknowledgement: ack.trim() } : {}) })}
    >
      {(errorOf) => (
        <>
          <FormField id="ds-mode" label="Paid by">
            <Segment
              label="Paid by"
              value={mode}
              onChange={setMode}
              options={[
                { value: 'cash', label: 'Cash' },
                { value: 'cheque', label: 'Cheque' },
              ]}
            />
          </FormField>
          {mode === 'cheque' && (
            <FormField id="ds-cheque" label="Cheque number" required error={errorOf('ds-cheque')}>
              <TextField value={cheque} onChange={setCheque} inputMode="numeric" maxLength={10} />
            </FormField>
          )}
          <FormField id="ds-on" label="Paid on" required error={errorOf('ds-on')}>
            <TextField type="date" value={paidOn} onChange={setPaidOn} />
          </FormField>
          <FormField id="ds-ack" label="Acknowledgement" optional helper="For example, who signed for the cash.">
            <TextField value={ack} onChange={setAck} maxLength={300} />
          </FormField>
        </>
      )}
    </FormDrawer>
  );
}

// ------------------------------------------------------------------------------------------ payment modes

const MODE: Record<string, string> = { bank: 'Bank transfer', cash: 'Cash', cheque: 'Cheque' };

export interface PaymentModesScreenProps {
  state: LoadState;
  onRetry?: () => void;
  modes: PaymentModeRow[] | null;
  nameOf: (employeeId: string) => string;
  can: { request: boolean };
  onSearch: (q: string) => Promise<PersonHit[]>;
  onRequest: (x: { employeeId: string; mode: 'bank' | 'cash' | 'cheque'; validFrom: string; reason: string }) => Promise<unknown>;
}

/** Who is paid by cash or cheque instead of the bank: asked for here, approved by someone else in Approvals. */
export function PaymentModesScreen(p: PaymentModesScreenProps) {
  const [asking, setAsking] = useState(false);
  return (
    <LivePage
      title="Payment modes"
      description="Everyone is paid into their bank account unless a cash or cheque mode is approved. A change is approved by someone else in Approvals."
      state={p.state}
      onRetry={p.onRetry}
      what="payment modes"
      grantedBy="your payroll admin"
      actions={p.can.request ? <Button variant="primary" onClick={() => setAsking(true)}>Ask for a payment mode</Button> : undefined}
    >
      {p.modes && !p.modes.length && <EmptyState title="Everyone is paid by bank transfer" description="No cash or cheque payment mode has been asked for." />}
      {p.modes && p.modes.length > 0 && (
        <table className="yx-tim-table" aria-label="Payment modes">
          <thead>
            <tr>
              <th scope="col">Person</th>
              <th scope="col">Mode</th>
              <th scope="col">From</th>
              <th scope="col">Why</th>
              <th scope="col">Status</th>
            </tr>
          </thead>
          <tbody>
            {p.modes.map((m) => (
              <tr key={m.id}>
                <th scope="row">{p.nameOf(m.employeeId)}</th>
                <td>{MODE[m.mode] ?? m.mode}</td>
                <td>{dateText(m.validFrom)}</td>
                <td>{m.reason}</td>
                <td>
                  <Badge tone={m.status === 'approved' ? 'success' : m.status === 'rejected' ? 'danger' : 'warning'}>{m.status === 'approved' ? 'Approved' : m.status === 'rejected' ? 'Turned down' : 'Waiting for approval'}</Badge>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
      {asking && <ModeDrawer onSearch={p.onSearch} onClose={() => setAsking(false)} onSave={p.onRequest} />}
    </LivePage>
  );
}

function ModeDrawer({ onSearch, onClose, onSave }: { onSearch: PaymentModesScreenProps['onSearch']; onClose: () => void; onSave: PaymentModesScreenProps['onRequest'] }) {
  const [who, setWho] = useState<PersonHit | null>(null);
  const [mode, setMode] = useState<'bank' | 'cash' | 'cheque'>('cash');
  const [from, setFrom] = useState('');
  const [reason, setReason] = useState('');
  const errors: FormErrorItem[] = [
    ...(!who ? [{ fieldId: 'pm-who', message: 'Choose the person.' }] : []),
    ...(!DAY.test(from) ? [{ fieldId: 'pm-from', message: 'Give the day it starts.' }] : []),
    ...(reason.trim().length < 5 ? [{ fieldId: 'pm-why', message: 'Why: at least 5 letters.' }] : []),
  ];
  return (
    <FormDrawer title="Ask for a payment mode" confirm="Send for approval" errors={errors} onClose={onClose} onSave={() => onSave({ employeeId: who!.id, mode, validFrom: from, reason: reason.trim() })}>
      {(errorOf) => (
        <>
          <PersonPicker id="pm-who" label="Person" value={who} onChange={setWho} onSearch={onSearch} error={errorOf('pm-who')} />
          <FormField id="pm-mode" label="Pay by">
            <Segment
              label="Pay by"
              value={mode}
              onChange={setMode}
              options={[
                { value: 'cash', label: 'Cash' },
                { value: 'cheque', label: 'Cheque' },
                { value: 'bank', label: 'Bank transfer' },
              ]}
            />
          </FormField>
          <FormField id="pm-from" label="From" required error={errorOf('pm-from')}>
            <TextField type="date" value={from} onChange={setFrom} />
          </FormField>
          <FormField id="pm-why" label="Why" required error={errorOf('pm-why')}>
            <TextArea value={reason} onChange={setReason} rows={2} maxLength={300} />
          </FormField>
        </>
      )}
    </FormDrawer>
  );
}

// ------------------------------------------------------------------------------------------ loans (PAY-17, PAY-18)

// An 'expense' loan recovers an overdue expense advance from salary (M05 §11.3), never a salary advance.
export const LOAN_TYPE: Record<string, string> = { advance: 'Salary advance', loan: 'Loan', expense: 'Expense advance recovery' };

const LOAN_STATUS: Record<string, { label: string; tone: BadgeTone }> = {
  requested: { label: 'Waiting for approval', tone: 'warning' },
  active: { label: 'Being repaid', tone: 'info' },
  paused: { label: 'Paused', tone: 'warning' },
  closed: { label: 'Closed', tone: 'success' },
  rejected: { label: 'Turned down', tone: 'neutral' },
};

export interface LoansScreenProps {
  state: LoadState;
  onRetry?: () => void;
  loans: LoanView[] | null;
  nameOf: (employeeId: string) => string;
  /** The employee's own page shows only their loans and asks only for themselves. */
  mine?: boolean;
  can: { manage: boolean };
  onSearch?: (q: string) => Promise<PersonHit[]>;
  onRequest: (x: LoanRequestInput) => Promise<unknown>;
  onChange: (loan: LoanView, x: LoanChangeInput) => Promise<unknown>;
}

/** Salary advances and loans: asked for, approved in Approvals, recovered from pay; payroll pauses, reschedules or closes. */
export function LoansScreen(p: LoansScreenProps) {
  const [asking, setAsking] = useState(false);
  const [changing, setChanging] = useState<LoanView | null>(null);
  const rows = (p.loans ?? []).filter((l) => (p.mine ? l.mine : true));
  return (
    <LivePage
      title={p.mine ? 'My loans and advances' : 'Loans and advances'}
      description="An advance or loan is approved by payroll and recovered in instalments from pay. On exit, what is left is recovered in the final settlement."
      state={p.state}
      onRetry={p.onRetry}
      what="loans"
      grantedBy="your payroll admin"
      actions={<Button variant="primary" onClick={() => setAsking(true)}>{p.mine ? 'Ask for an advance or loan' : 'New advance or loan'}</Button>}
    >
      {p.loans && !rows.length && <EmptyState title="No loans or advances" description={p.mine ? 'Ask for one and payroll approves it.' : 'Requests appear here, and in Approvals for the approver.'} />}
      {rows.length > 0 && (
        <table className="yx-tim-table" aria-label="Loans and advances">
          <thead>
            <tr>
              {!p.mine && <th scope="col">Person</th>}
              <th scope="col">Type</th>
              <th scope="col">Amount</th>
              <th scope="col">Instalment</th>
              <th scope="col">Left to repay</th>
              <th scope="col">From</th>
              <th scope="col">Status</th>
              {!p.mine && (
                <th scope="col">
                  <span className="yx-visually-hidden">Change</span>
                </th>
              )}
            </tr>
          </thead>
          <tbody>
            {rows.map((l) => (
              <tr key={l.id}>
                {!p.mine && <th scope="row">{p.nameOf(l.employeeId)}</th>}
                <td>{LOAN_TYPE[l.loanType] ?? l.loanType}</td>
                <td>{rupees(l.principal)}</td>
                <td>{rupees(l.emi)}</td>
                <td>{rupees(l.outstanding)}</td>
                <td>{monthText(l.firstMonth)}</td>
                <td>
                  <Badge tone={LOAN_STATUS[l.status]?.tone ?? 'neutral'}>{LOAN_STATUS[l.status]?.label ?? l.status}</Badge>
                  {l.pausedUntil && <span className="yx-tim-note"> until {monthText(l.pausedUntil)}</span>}
                </td>
                {!p.mine && (
                  <td>
                    {p.can.manage && !l.mine && ['active', 'paused'].includes(l.status) && (
                      <Button size="sm" onClick={() => setChanging(l)} aria-label={`Change the loan of ${p.nameOf(l.employeeId)}`}>
                        Change
                      </Button>
                    )}
                  </td>
                )}
              </tr>
            ))}
          </tbody>
        </table>
      )}
      {asking && <LoanDrawer forOthers={!p.mine && p.can.manage} onSearch={p.onSearch} onClose={() => setAsking(false)} onSave={p.onRequest} />}
      {changing && <LoanChangeDrawer loan={changing} who={p.nameOf(changing.employeeId)} onClose={() => setChanging(null)} onSave={(x) => p.onChange(changing, x)} />}
    </LivePage>
  );
}

function LoanDrawer({ forOthers, onSearch, onClose, onSave }: { forOthers: boolean; onSearch?: LoansScreenProps['onSearch']; onClose: () => void; onSave: LoansScreenProps['onRequest'] }) {
  const [whose, setWhose] = useState<'me' | 'other'>(forOthers ? 'other' : 'me');
  const [who, setWho] = useState<PersonHit | null>(null);
  const [type, setType] = useState<'advance' | 'loan'>('advance');
  const [amount, setAmount] = useState('');
  const [count, setCount] = useState('');
  const [rate, setRate] = useState('');
  const [first, setFirst] = useState('');
  const [reason, setReason] = useState('');
  const n = Number(count);
  const errors: FormErrorItem[] = [
    ...(whose === 'other' && !who ? [{ fieldId: 'ln-who', message: 'Choose the person.' }] : []),
    ...(!MONEY.test(amount.trim()) || Number(amount) <= 0 ? [{ fieldId: 'ln-amount', message: 'Give the amount in rupees.' }] : []),
    ...(!Number.isInteger(n) || n < 1 || n > 120 ? [{ fieldId: 'ln-count', message: 'Instalments: 1 to 120.' }] : []),
    ...(type === 'loan' && rate.trim() && !/^\d{1,2}(\.\d{1,2})?$/.test(rate.trim()) ? [{ fieldId: 'ln-rate', message: 'Interest is a yearly percentage, like 8.5.' }] : []),
    ...(!MONTH.test(first) ? [{ fieldId: 'ln-first', message: 'Choose the month of the first instalment.' }] : []),
    ...(reason.trim().length < 5 ? [{ fieldId: 'ln-why', message: 'Why: at least 5 letters.' }] : []),
  ];
  return (
    <FormDrawer
      title="Advance or loan"
      subtitle="Sent to payroll's approver; recovered from pay once approved."
      confirm="Send for approval"
      errors={errors}
      onClose={onClose}
      onSave={() =>
        onSave({
          ...(whose === 'other' ? { employeeId: who!.id } : {}),
          loanType: type,
          principal: amount.trim(),
          instalments: n,
          ...(type === 'loan' && rate.trim() ? { interestRate: rate.trim() } : {}),
          firstMonth: first,
          reason: reason.trim(),
        })
      }
    >
      {(errorOf) => (
        <>
          {forOthers && (
            <FormField id="ln-whose" label="For">
              <Segment
                label="For"
                value={whose}
                onChange={setWhose}
                options={[
                  { value: 'other', label: 'Someone else' },
                  { value: 'me', label: 'Myself' },
                ]}
              />
            </FormField>
          )}
          {whose === 'other' && onSearch && <PersonPicker id="ln-who" label="Person" value={who} onChange={setWho} onSearch={onSearch} error={errorOf('ln-who')} />}
          <FormField id="ln-type" label="Type">
            <Segment
              label="Type"
              value={type}
              onChange={setType}
              options={[
                { value: 'advance', label: 'Salary advance' },
                { value: 'loan', label: 'Loan' },
              ]}
            />
          </FormField>
          <FormField id="ln-amount" label="Amount" required error={errorOf('ln-amount')}>
            <TextField value={amount} onChange={setAmount} prefix="₹" inputMode="decimal" maxLength={13} />
          </FormField>
          <FormField id="ln-count" label="Instalments" required error={errorOf('ln-count')}>
            <TextField value={count} onChange={setCount} inputMode="numeric" maxLength={3} />
          </FormField>
          {type === 'loan' && (
            <FormField id="ln-rate" label="Interest a year" optional error={errorOf('ln-rate')} helper="Leave empty for an interest-free loan.">
              <TextField value={rate} onChange={setRate} suffix="%" inputMode="decimal" maxLength={5} />
            </FormField>
          )}
          <FormField id="ln-first" label="First instalment in" required error={errorOf('ln-first')}>
            <TextField type="month" value={first} onChange={setFirst} />
          </FormField>
          <FormField id="ln-why" label="Why" required error={errorOf('ln-why')}>
            <TextArea value={reason} onChange={setReason} rows={2} maxLength={300} />
          </FormField>
        </>
      )}
    </FormDrawer>
  );
}

function LoanChangeDrawer({ loan, who, onClose, onSave }: { loan: LoanView; who: string; onClose: () => void; onSave: (x: LoanChangeInput) => Promise<unknown> }) {
  const [kind, setKind] = useState<LoanChangeInput['kind']>('pause');
  const [until, setUntil] = useState('');
  const [emi, setEmi] = useState('');
  const [reason, setReason] = useState('');
  const errors: FormErrorItem[] = [
    ...(kind === 'pause' && !MONTH.test(until) ? [{ fieldId: 'lc-until', message: 'Choose the month instalments start again.' }] : []),
    ...(kind === 'reschedule' && (!MONEY.test(emi.trim()) || Number(emi) <= 0 || Number(emi) > Number(loan.outstanding)) ? [{ fieldId: 'lc-emi', message: 'A new instalment above zero and not more than what is left.' }] : []),
    ...(reason.trim().length < 5 ? [{ fieldId: 'lc-why', message: 'Why: at least 5 letters.' }] : []),
  ];
  return (
    <FormDrawer
      title={`Change ${who}'s ${(LOAN_TYPE[loan.loanType] ?? 'loan').toLowerCase()}`}
      subtitle={`${rupees(loan.outstanding)} left, ${rupees(loan.emi)} a month`}
      confirm="Save change"
      errors={errors}
      onClose={onClose}
      onSave={() => onSave({ kind, reason: reason.trim(), ...(kind === 'pause' ? { pauseUntil: until } : {}), ...(kind === 'reschedule' ? { emi: emi.trim() } : {}) })}
    >
      {(errorOf) => (
        <>
          <FormField id="lc-kind" label="Change">
            <Segment
              label="Change"
              value={kind}
              onChange={setKind}
              options={[
                { value: 'pause', label: 'Pause' },
                { value: 'reschedule', label: 'New instalment' },
                { value: 'preclose', label: 'Close now' },
              ]}
            />
          </FormField>
          {kind === 'pause' && (
            <FormField id="lc-until" label="Paused until" required error={errorOf('lc-until')}>
              <TextField type="month" value={until} onChange={setUntil} />
            </FormField>
          )}
          {kind === 'reschedule' && (
            <FormField id="lc-emi" label="New instalment" required error={errorOf('lc-emi')}>
              <TextField value={emi} onChange={setEmi} prefix="₹" inputMode="decimal" maxLength={13} />
            </FormField>
          )}
          {kind === 'preclose' && <InlineAlert tone="warning" title="Closing writes off nothing">The balance is marked repaid now; collect it outside payroll first.</InlineAlert>}
          <FormField id="lc-why" label="Why" required error={errorOf('lc-why')}>
            <TextArea value={reason} onChange={setReason} rows={2} maxLength={300} />
          </FormField>
        </>
      )}
    </FormDrawer>
  );
}

// ------------------------------------------------------------------------------------------ payslip queries (PAY-20)

const QUERY: Record<string, { label: string; tone: BadgeTone }> = {
  open: { label: 'Waiting for payroll', tone: 'warning' },
  answered: { label: 'Answered', tone: 'info' },
  closed: { label: 'Closed', tone: 'success' },
};

export interface PayslipQueriesScreenProps {
  state: LoadState;
  onRetry?: () => void;
  queries: PayslipQueryView[] | null;
  nameOf: (employeeId: string) => string;
  status: 'open' | 'answered' | 'closed';
  onStatus: (s: 'open' | 'answered' | 'closed') => void;
  onReply: (q: PayslipQueryView, text: string) => Promise<unknown>;
  onClose: (q: PayslipQueryView) => Promise<unknown>;
}

/** Questions employees asked about a payslip line, answered by payroll (never one's own). */
export function PayslipQueriesScreen(p: PayslipQueriesScreenProps) {
  const [open, setOpen] = useState<string | null>(null);
  const rows = (p.queries ?? []).filter((q) => !q.mine);
  const q = rows.find((x) => x.id === open) ?? null;
  return (
    <LivePage title="Payslip queries" description="Questions employees asked about their payslip. A reply tells them; they can answer back or close it." state={p.state} onRetry={p.onRetry} what="payslip queries" grantedBy="your payroll admin">
      <Segment
        label="Show"
        value={p.status}
        onChange={p.onStatus}
        options={[
          { value: 'open', label: 'Waiting' },
          { value: 'answered', label: 'Answered' },
          { value: 'closed', label: 'Closed' },
        ]}
      />
      {p.queries && !rows.length && <EmptyState title="Nothing here" description="Queries appear when employees ask about their payslip." compact />}
      {rows.length > 0 && (
        <table className="yx-tim-table" aria-label="Payslip queries">
          <thead>
            <tr>
              <th scope="col">Person</th>
              <th scope="col">About</th>
              <th scope="col">Question</th>
              <th scope="col">Last change</th>
              <th scope="col">
                <span className="yx-visually-hidden">Open</span>
              </th>
            </tr>
          </thead>
          <tbody>
            {rows.map((x) => (
              <tr key={x.id}>
                <th scope="row">{p.nameOf(x.employeeId)}</th>
                <td>{x.lineCode ?? 'The whole payslip'}</td>
                <td>{x.text.length > 80 ? `${x.text.slice(0, 80)}…` : x.text}</td>
                <td>{dateText(x.updatedAt.slice(0, 10))}</td>
                <td>
                  <Button size="sm" onClick={() => setOpen(x.id)} aria-label={`Open the query from ${p.nameOf(x.employeeId)}`}>
                    Open
                  </Button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
      {q && <QueryDrawer q={q} who={p.nameOf(q.employeeId)} onReply={(t) => p.onReply(q, t)} onCloseQuery={() => p.onClose(q)} onClose={() => setOpen(null)} />}
    </LivePage>
  );
}

function QueryDrawer({ q, who, onReply, onCloseQuery, onClose }: { q: PayslipQueryView; who: string; onReply: (t: string) => Promise<unknown>; onCloseQuery: () => Promise<unknown>; onClose: () => void }) {
  const [text, setText] = useState('');
  const { busy, error, run } = useRun();
  const errors = !text.trim() ? [{ fieldId: 'q-reply', message: 'Write the reply.' }] : [];
  const save = useSaveErrors(errors);
  const closed = q.status === 'closed';
  return (
    <Drawer
      open
      onOpenChange={(o) => !o && onClose()}
      title={`${who}'s query`}
      subtitle={<Badge tone={QUERY[q.status]?.tone ?? 'neutral'}>{QUERY[q.status]?.label ?? q.status}</Badge>}
      size="lg"
      footer={
        <>
          {!closed && (
            <Button loading={busy === 'close'} onClick={() => void run('close', async () => (await onCloseQuery(), onClose()))}>
              Close query
            </Button>
          )}
          {!closed && (
            <Button
              variant="primary"
              loading={busy === 'reply'}
              onClick={() => {
                if (errors.length) return save.reveal();
                void run('reply', async () => (await onReply(text.trim()), setText('')));
              }}
            >
              Send reply
            </Button>
          )}
          {closed && <Button onClick={onClose}>Close</Button>}
        </>
      }
    >
      <div className="yx-tim-stack">
        <Failed error={error} />
        <ErrorSummary errors={save.shownErrors} />
        <section aria-label="Conversation">
          <p>
            <strong>{who}</strong> · {dateText(q.createdAt.slice(0, 10))}
            {q.lineCode ? ` · about ${q.lineCode}` : ''}
          </p>
          <p>{q.text}</p>
          {(q.replies ?? []).map((r, i) => (
            <div key={i} className="yx-tim-note">
              <p>
                <strong>{r.byName || (r.side === 'payroll' ? 'Payroll' : who)}</strong> · {r.side === 'payroll' ? 'payroll' : 'employee'} · {dateText(r.at.slice(0, 10))}
              </p>
              <p>{r.text}</p>
            </div>
          ))}
        </section>
        {!closed && (
          <FormField id="q-reply" label="Reply" error={save.errorOf('q-reply')}>
            <TextArea value={text} onChange={setText} rows={4} maxLength={1000} />
          </FormField>
        )}
      </div>
    </Drawer>
  );
}

// ------------------------------------------------------------------------------------------ tax declarations and proofs (PAY-22, PAY-23)

const SUBJECT: Record<string, string> = {
  hra: 'Rent paid (HRA)',
  sec80c: 'Investments and payments (80C)',
  sec80ccd1b: 'Own NPS contribution (80CCD(1B))',
  sec80ccd2: "Employer's NPS contribution (80CCD(2))",
  sec80d_self: 'Health insurance, self and family (80D)',
  sec80d_self_senior: 'Health insurance, self and family, senior citizen (80D)',
  sec80d_parents: 'Health insurance, parents (80D)',
  sec80d_parents_senior: 'Health insurance, senior citizen parents (80D)',
  sec80e: 'Education loan interest (80E)',
  sec24b: 'Home loan interest (24(b))',
};
export const subjectText = (key: string, section?: string | null) => SUBJECT[key] ?? (section ? `${key} (${section})` : key);

const PROOF: Record<string, { label: string; tone: BadgeTone }> = {
  none: { label: 'No proof yet', tone: 'neutral' },
  pending: { label: 'Proof being checked', tone: 'warning' },
  approved: { label: 'Accepted', tone: 'success' },
  partly: { label: 'Partly accepted', tone: 'info' },
  rejected: { label: 'Not accepted', tone: 'danger' },
};
const proofBadge = (s: string) => <Badge tone={PROOF[s]?.tone ?? 'neutral'}>{PROOF[s]?.label ?? s}</Badge>;

export interface MyDeclarationsScreenProps {
  state: LoadState;
  onRetry?: () => void;
  data: MyDeclarations | null;
  certificates: MyCertificate[] | null;
  onDeclare: (line: DeclarationInput) => Promise<unknown>;
  onProof: (lineId: string, file: File) => Promise<unknown>;
  onPartA: (c: MyCertificate) => Promise<unknown>;
}

/** The employee's tax declarations and proofs for the year, and their year-end certificates. */
export function MyDeclarationsScreen(p: MyDeclarationsScreenProps) {
  const [editing, setEditing] = useState<DeclarationLine | 'new' | null>(null);
  const { busy, error, run } = useRun();
  const d = p.data;
  const today = new Date().toISOString().slice(0, 10);
  const open = d ? today <= d.proofCutoff : false;
  const proofs = d ? today >= d.proofWindowOpens && open : false;
  const locked = (l: DeclarationLine) => ['approved', 'partly'].includes(l.proofStatus);
  return (
    <LivePage
      title="My tax declarations"
      description={d ? `Tax year ${d.taxYear} · ${d.form}. What you declare lowers the tax taken each month; add proofs before ${dateText(d.proofCutoff)} or the full tax is taken.` : undefined}
      state={p.state}
      onRetry={p.onRetry}
      what="your tax declarations"
      actions={open ? <Button variant="primary" onClick={() => setEditing('new')}>Declare</Button> : undefined}
    >
      <Failed error={error} />
      {d && open && !proofs && <InlineAlert tone="info" title={`Proofs open on ${dateText(d.proofWindowOpens)}`}>Declare now; send the proofs from then until {dateText(d.proofCutoff)}.</InlineAlert>}
      {d && !open && <InlineAlert tone="info" title="Declarations are closed">They closed on {dateText(d.proofCutoff)}. Anything else is claimed in your own tax return.</InlineAlert>}
      {d && !d.lines.length && <EmptyState title="Nothing declared" description="Declare rent, investments and insurance to lower the tax taken from your pay." compact />}
      {d && d.lines.length > 0 && (
        <table className="yx-tim-table" aria-label="Declarations">
          <thead>
            <tr>
              <th scope="col">What</th>
              <th scope="col">Declared</th>
              <th scope="col">Proof</th>
              <th scope="col">
                <span className="yx-visually-hidden">Actions</span>
              </th>
            </tr>
          </thead>
          <tbody>
            {d.lines.map((l) => (
              <tr key={l.id}>
                <th scope="row">{subjectText(l.subjectKey, l.section)}</th>
                <td>
                  {rupees(l.amount)}
                  {l.approvedAmount && l.proofStatus === 'partly' ? ` (${rupees(l.approvedAmount)} accepted)` : ''}
                </td>
                <td>
                  {proofBadge(l.proofs.length || l.proofStatus !== 'none' ? l.proofStatus : 'none')}
                  {l.proofs.length > 0 && <span className="yx-tim-note"> {l.proofs.length} {l.proofs.length === 1 ? 'file' : 'files'}</span>}
                  {l.comment && <p className="yx-tim-note">{l.comment}</p>}
                </td>
                <td>
                  {open && !locked(l) && (
                    <div className="yx-tim-row">
                      {proofs && (
                        <FileButton label="Add proof" accept=".pdf,.jpg,.jpeg,.png" ariaLabel={`Add a proof for ${subjectText(l.subjectKey, l.section)}`} loading={busy === `p-${l.id}`} onFile={(f) => void run(`p-${l.id}`, () => p.onProof(l.id, f))} />
                      )}
                      <Button size="sm" onClick={() => setEditing(l)} aria-label={`Change ${subjectText(l.subjectKey, l.section)}`}>
                        Change
                      </Button>
                    </div>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
      <section aria-label="Tax certificates">
        <h3 className="yx-pay-section-title">Tax certificates</h3>
        {!p.certificates?.length ? (
          <p className="yx-tim-note">Your Form 16 (or Form 130) appears here after the tax year ends. Part B is also in My pay documents.</p>
        ) : (
          <ul className="yx-tim-list">
            {p.certificates.map((c) => (
              <li key={c.id}>
                {c.form === 'form130' ? 'Form 130' : 'Form 16'} · {c.taxYear}{' '}
                <Button size="sm" loading={busy === `a-${c.id}`} onClick={() => void run(`a-${c.id}`, () => p.onPartA(c))} aria-label={`Download Part A for ${c.taxYear}`}>
                  Download Part A
                </Button>
              </li>
            ))}
          </ul>
        )}
      </section>
      {editing && d && (
        <DeclareDrawer
          line={editing === 'new' ? null : editing}
          subjects={d.subjects.filter((s) => editing !== 'new' || !d.lines.some((l) => l.subjectKey === s.key))}
          taxYear={d.taxYear}
          onClose={() => setEditing(null)}
          onSave={p.onDeclare}
        />
      )}
    </LivePage>
  );
}

function DeclareDrawer({ line, subjects, taxYear, onClose, onSave }: { line: DeclarationLine | null; subjects: MyDeclarations['subjects']; taxYear: string; onClose: () => void; onSave: (x: DeclarationInput) => Promise<unknown> }) {
  const [key, setKey] = useState<string | null>(line?.subjectKey ?? null);
  const [amount, setAmount] = useState(line?.amount ?? '');
  const [from, setFrom] = useState(line?.rentFrom ?? '');
  const [to, setTo] = useState(line?.rentTo ?? '');
  const [metro, setMetro] = useState<'yes' | 'no'>(line?.metro ? 'yes' : 'no');
  const [landlord, setLandlord] = useState(line?.landlordName ?? '');
  const [pan, setPan] = useState('');
  const y = Number(taxYear.slice(0, 4));
  const hra = key === 'hra';
  const errors: FormErrorItem[] = [
    ...(!key ? [{ fieldId: 'dc-what', message: 'Choose what you are declaring.' }] : []),
    ...(!MONEY.test(amount.trim()) ? [{ fieldId: 'dc-amount', message: 'Give the yearly amount in rupees.' }] : []),
    ...(hra && (!MONTH.test(from) || from < `${y}-04` || from > `${y + 1}-03`) ? [{ fieldId: 'dc-from', message: `A month from April ${y} to March ${y + 1}.` }] : []),
    ...(hra && (!MONTH.test(to) || to < from || to > `${y + 1}-03`) ? [{ fieldId: 'dc-to', message: 'A month after the first, up to March.' }] : []),
    ...(hra && pan.trim() && !/^[A-Z]{5}\d{4}[A-Z]$/.test(pan.trim().toUpperCase()) ? [{ fieldId: 'dc-pan', message: "The landlord's PAN is 10 letters and digits, like ABCDE1234F." }] : []),
  ];
  return (
    <FormDrawer
      title={line ? `Change ${subjectText(line.subjectKey, line.section)}` : 'Declare'}
      subtitle="The yearly amount. Enter 0 to remove it."
      confirm="Save"
      errors={errors}
      onClose={onClose}
      onSave={() =>
        onSave({
          subjectKey: key!,
          amount: amount.trim(),
          ...(hra ? { rentFrom: from, rentTo: to, metro: metro === 'yes', ...(landlord.trim() ? { landlordName: landlord.trim() } : {}), ...(pan.trim() ? { landlordPan: pan.trim().toUpperCase() } : {}) } : {}),
        })
      }
    >
      {(errorOf) => (
        <>
          {!line && (
            <FormField id="dc-what" label="What" required error={errorOf('dc-what')}>
              <Select value={key} onChange={setKey} placeholder="Choose" options={subjects.map((s) => ({ value: s.key, label: subjectText(s.key, s.section) }))} />
            </FormField>
          )}
          <FormField id="dc-amount" label={hra ? 'Rent for the year' : 'Amount for the year'} required error={errorOf('dc-amount')}>
            <TextField value={amount} onChange={setAmount} prefix="₹" inputMode="decimal" maxLength={13} />
          </FormField>
          {hra && (
            <>
              <FormField id="dc-from" label="Rent paid from" required error={errorOf('dc-from')}>
                <TextField type="month" value={from} onChange={setFrom} />
              </FormField>
              <FormField id="dc-to" label="Rent paid to" required error={errorOf('dc-to')}>
                <TextField type="month" value={to} onChange={setTo} />
              </FormField>
              <FormField id="dc-metro" label="City">
                <Segment
                  label="City"
                  value={metro}
                  onChange={setMetro}
                  options={[
                    { value: 'yes', label: 'Delhi, Mumbai, Kolkata or Chennai' },
                    { value: 'no', label: 'Elsewhere' },
                  ]}
                />
              </FormField>
              <FormField id="dc-landlord" label="Landlord's name" optional>
                <TextField value={landlord} onChange={setLandlord} maxLength={200} />
              </FormField>
              <FormField id="dc-pan" label="Landlord's PAN" optional helper="Needed when the rent is more than ₹1,00,000 a year." error={errorOf('dc-pan')}>
                <TextField value={pan} onChange={setPan} maxLength={10} autoCapitalize="characters" />
              </FormField>
            </>
          )}
        </>
      )}
    </FormDrawer>
  );
}

export interface ProofCheckScreenProps {
  state: LoadState;
  onRetry?: () => void;
  lines: ProofQueueLine[] | null;
  status: 'pending' | 'approved' | 'partly' | 'rejected';
  onStatus: (s: ProofCheckScreenProps['status']) => void;
  onFile: (line: ProofQueueLine, n: number, name: string) => Promise<unknown>;
  onDecide: (line: ProofQueueLine, d: ProofDecision) => Promise<unknown>;
}

/** Checking employees' proofs line by line: accept, accept part, or turn down with a reason (never one's own). */
export function ProofCheckScreen(p: ProofCheckScreenProps) {
  const [deciding, setDeciding] = useState<ProofQueueLine | null>(null);
  const { busy, error, run } = useRun();
  return (
    <LivePage title="Proof checking" description="Proofs employees sent for their tax declarations. What you accept lowers their tax; a line turned down goes back with your reason." state={p.state} onRetry={p.onRetry} what="proofs" grantedBy="your payroll admin">
      <Segment
        label="Show"
        value={p.status}
        onChange={p.onStatus}
        options={[
          { value: 'pending', label: 'To check' },
          { value: 'approved', label: 'Accepted' },
          { value: 'partly', label: 'Partly accepted' },
          { value: 'rejected', label: 'Not accepted' },
        ]}
      />
      <Failed error={error} />
      {p.lines && !p.lines.length && <EmptyState title="Nothing here" description="Proofs appear when employees send them." compact />}
      {p.lines && p.lines.length > 0 && (
        <table className="yx-tim-table" aria-label="Proofs">
          <thead>
            <tr>
              <th scope="col">Person</th>
              <th scope="col">What</th>
              <th scope="col">Declared</th>
              <th scope="col">Files</th>
              <th scope="col">
                <span className="yx-visually-hidden">Decide</span>
              </th>
            </tr>
          </thead>
          <tbody>
            {p.lines.map((l) => (
              <tr key={l.id}>
                <th scope="row">{l.employeeName || 'Someone'}</th>
                <td>{subjectText(l.subjectKey, l.section)}</td>
                <td>
                  {rupees(l.amount)}
                  {l.approvedAmount && l.proofStatus === 'partly' ? ` (${rupees(l.approvedAmount)} accepted)` : ''}
                </td>
                <td>
                  <div className="yx-tim-row">
                    {l.proofs.map((f) => (
                      <Button key={f.n} size="sm" loading={busy === `${l.id}-${f.n}`} onClick={() => void run(`${l.id}-${f.n}`, () => p.onFile(l, f.n, f.name))} aria-label={`Open ${f.name}`}>
                        {f.name}
                      </Button>
                    ))}
                  </div>
                </td>
                <td>
                  {l.proofStatus === 'pending' ? (
                    <Button size="sm" onClick={() => setDeciding(l)} aria-label={`Decide on ${l.employeeName}'s ${subjectText(l.subjectKey)}`}>
                      Decide
                    </Button>
                  ) : (
                    proofBadge(l.proofStatus)
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
      {deciding && <ProofDrawer line={deciding} onClose={() => setDeciding(null)} onSave={(d) => p.onDecide(deciding, d)} />}
    </LivePage>
  );
}

function ProofDrawer({ line, onClose, onSave }: { line: ProofQueueLine; onClose: () => void; onSave: (d: ProofDecision) => Promise<unknown> }) {
  const [decision, setDecision] = useState<ProofDecision['decision']>('approve');
  const [amount, setAmount] = useState('');
  const [comment, setComment] = useState('');
  const errors: FormErrorItem[] = [
    ...(decision === 'partly' && (!MONEY.test(amount.trim()) || Number(amount) <= 0 || Number(amount) >= Number(line.amount)) ? [{ fieldId: 'pf-amount', message: 'An amount above zero and below what was declared.' }] : []),
    ...(decision !== 'approve' && comment.trim().length < 3 ? [{ fieldId: 'pf-why', message: 'Say why, so they can fix it.' }] : []),
  ];
  return (
    <FormDrawer
      title={`${line.employeeName || 'Someone'} · ${subjectText(line.subjectKey, line.section)}`}
      subtitle={`Declared ${rupees(line.amount)}`}
      confirm="Save decision"
      errors={errors}
      onClose={onClose}
      onSave={() => onSave({ decision, ...(decision === 'partly' ? { amount: amount.trim() } : {}), ...(comment.trim() ? { comment: comment.trim() } : {}) })}
    >
      {(errorOf) => (
        <>
          <FormField id="pf-decision" label="Decision">
            <Segment
              label="Decision"
              value={decision}
              onChange={setDecision}
              options={[
                { value: 'approve', label: 'Accept' },
                { value: 'partly', label: 'Accept part' },
                { value: 'reject', label: 'Turn down' },
              ]}
            />
          </FormField>
          {decision === 'partly' && (
            <FormField id="pf-amount" label="Amount accepted" required error={errorOf('pf-amount')}>
              <TextField value={amount} onChange={setAmount} prefix="₹" inputMode="decimal" maxLength={13} />
            </FormField>
          )}
          <FormField id="pf-why" label="Comment for the employee" required={decision !== 'approve'} optional={decision === 'approve'} error={errorOf('pf-why')}>
            <TextArea value={comment} onChange={setComment} rows={3} maxLength={500} />
          </FormField>
        </>
      )}
    </FormDrawer>
  );
}

// ------------------------------------------------------------------------------------------ registers (CMP-09) and advisories (CMP-12)

const REGISTER: Record<string, { label: string; tone: BadgeTone }> = {
  generated: { label: 'Made', tone: 'info' },
  frozen: { label: 'Frozen', tone: 'warning' },
  signed: { label: 'Signed', tone: 'success' },
  superseded: { label: 'Replaced', tone: 'neutral' },
};
const registerName = (key: string) => key.replace(/[_-]+/g, ' ').replace(/^\w/, (c) => c.toUpperCase());

export interface RegistersScreenProps {
  state: LoadState;
  onRetry?: () => void;
  entities: SetupEntity[];
  entityId: string | null;
  onEntity: (id: string | null) => void;
  month: string;
  onMonth: (m: string) => void;
  registers: RegisterRow[] | null;
  can: { generate: boolean; sign: boolean; download: boolean };
  onGenerate: (reason?: string) => Promise<unknown>;
  onDownload: (r: RegisterRow) => Promise<unknown>;
  onFreeze: (r: RegisterRow) => Promise<unknown>;
  onSign: (r: RegisterRow, file: File) => Promise<unknown>;
  onPack: () => Promise<unknown>;
}

/** The month's statutory registers: made once payroll is approved, frozen, signed with the company's token, packed for an inspector. */
export function RegistersScreen(p: RegistersScreenProps) {
  const [remaking, setRemaking] = useState(false);
  const [freezing, setFreezing] = useState<RegisterRow | null>(null);
  const { busy, error, run } = useRun();
  const latest = (p.registers ?? []).filter((r, i, all) => all.findIndex((x) => x.registerType === r.registerType && x.locationId === r.locationId) === i);
  return (
    <LivePage title="Statutory registers" description="Wage, deduction and other registers for a month, made from approved payroll. A frozen register never changes; a fix is a new version." state={p.state} onRetry={p.onRetry} what="registers" grantedBy="your compliance owner">
      <div className="yx-tim-row">
        <EntityPicker entities={p.entities} value={p.entityId} onChange={p.onEntity} id="rg-entity" />
        <FormField id="rg-month" label="Month">
          <TextField type="month" value={p.month} onChange={(m) => MONTH.test(m) && p.onMonth(m)} />
        </FormField>
      </div>
      <Failed error={error} />
      {!p.entityId && <EmptyState title="Choose a legal entity" description="Registers are kept for each legal entity and month." compact />}
      {p.entityId && p.registers && (
        <>
          <div className="yx-tim-row">
            {p.can.generate && (
              <Button variant="primary" loading={busy === 'make'} onClick={() => (latest.length ? setRemaking(true) : void run('make', () => p.onGenerate()))}>
                {latest.length ? 'Make a new version' : 'Make registers'}
              </Button>
            )}
            {p.can.sign && latest.some((r) => r.status !== 'generated') && (
              <Button loading={busy === 'pack'} onClick={() => void run('pack', p.onPack)}>
                Make inspection pack
              </Button>
            )}
          </div>
          {!latest.length ? (
            <EmptyState title={`No registers for ${monthText(p.month)}`} description="Make them once every payroll of the month is approved." compact />
          ) : (
            <table className="yx-tim-table" aria-label="Registers">
              <thead>
                <tr>
                  <th scope="col">Register</th>
                  <th scope="col">Version</th>
                  <th scope="col">Rows</th>
                  <th scope="col">Status</th>
                  <th scope="col">
                    <span className="yx-visually-hidden">Actions</span>
                  </th>
                </tr>
              </thead>
              <tbody>
                {latest.map((r) => (
                  <tr key={r.id}>
                    <th scope="row">{registerName(r.registerType)}</th>
                    <td>v{r.version}</td>
                    <td>{r.rows}</td>
                    <td>
                      <Badge tone={REGISTER[r.status]?.tone ?? 'neutral'}>{REGISTER[r.status]?.label ?? r.status}</Badge>
                    </td>
                    <td>
                      <div className="yx-tim-row">
                        {p.can.download && (
                          <Button size="sm" loading={busy === `d-${r.id}`} onClick={() => void run(`d-${r.id}`, () => p.onDownload(r))} aria-label={`Download the ${registerName(r.registerType)} register`}>
                            Download
                          </Button>
                        )}
                        {p.can.sign && r.status === 'generated' && (
                          <Button size="sm" onClick={() => setFreezing(r)} aria-label={`Freeze the ${registerName(r.registerType)} register`}>
                            Freeze
                          </Button>
                        )}
                        {p.can.sign && r.status === 'frozen' && (
                          <FileButton label="Upload signed PDF" accept=".pdf,application/pdf" ariaLabel={`Upload the signed ${registerName(r.registerType)} register`} loading={busy === `s-${r.id}`} onFile={(f) => void run(`s-${r.id}`, () => p.onSign(r, f))} />
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </>
      )}
      {remaking && <ReasonDrawer title="Make a new version?" subtitle="The earlier version stays as it is; the new one replaces it for signing." label="Why" confirm="Make new version" onClose={() => setRemaking(false)} onSave={(why) => p.onGenerate(why)} />}
      {freezing && (
        <ConfirmDrawer title={`Freeze the ${registerName(freezing.registerType)} register?`} confirm="Freeze" onClose={() => setFreezing(null)} onConfirm={() => p.onFreeze(freezing)}>
          <p>A frozen register never changes again. Download it, sign it with the company&apos;s token, and upload the signed PDF.</p>
        </ConfirmDrawer>
      )}
    </LivePage>
  );
}

export interface AdvisoriesScreenProps {
  state: LoadState;
  onRetry?: () => void;
  entities: SetupEntity[];
  entityId: string | null;
  onEntity: (id: string | null) => void;
  advisories: AdvisoryView[] | null;
  onReview: (a: AdvisoryView, note: string) => Promise<unknown>;
}

/** Changes in labour and tax law that apply to the entity's states, each marked reviewed with what was done. */
export function AdvisoriesScreen(p: AdvisoriesScreenProps) {
  const [reviewing, setReviewing] = useState<AdvisoryView | null>(null);
  return (
    <LivePage title="Compliance advisories" description="Law changes that apply where this legal entity has people. Read each one, act on it, and mark it reviewed with what you did." state={p.state} onRetry={p.onRetry} what="advisories" grantedBy="your compliance owner">
      <EntityPicker entities={p.entities} value={p.entityId} onChange={p.onEntity} id="ad-entity" />
      {!p.entityId && <EmptyState title="Choose a legal entity" description="Advisories follow the states the entity has people in." compact />}
      {p.entityId && p.advisories && !p.advisories.length && <EmptyState title="No advisories" description="Nothing new applies to this legal entity." compact />}
      {p.entityId &&
        p.advisories?.map((a) => (
          <Card key={`${a.code}-${a.version}`} title={a.title} actions={<>{a.reviewed ? <Badge tone="success">Reviewed</Badge> : <Badge tone="warning">To review</Badge>} {a.verify && <Badge tone="info">Check the source</Badge>}</>}>
            <p className="yx-tim-note">
              {a.jurisdiction === 'IN' ? 'All India' : a.jurisdiction} · from {dateText(a.effectiveFrom)}
            </p>
            <p>{a.summary}</p>
            <p>
              <strong>What to do:</strong> {a.action}
            </p>
            {a.link && /^https:\/\//i.test(a.link) && (
              <p>
                <a href={a.link} target="_blank" rel="noopener noreferrer">
                  Read the source
                </a>
              </p>
            )}
            {a.reviewed ? (
              <p className="yx-tim-note">
                Reviewed {dateText(a.reviewed.at.slice(0, 10))}: {a.reviewed.note}
              </p>
            ) : (
              <Button onClick={() => setReviewing(a)} aria-label={`Mark "${a.title}" reviewed`}>
                Mark reviewed
              </Button>
            )}
          </Card>
        ))}
      {reviewing && <ReasonDrawer title="Mark reviewed" subtitle={reviewing.title} label="What you did" confirm="Mark reviewed" onClose={() => setReviewing(null)} onSave={(note) => p.onReview(reviewing, note)} />}
    </LivePage>
  );
}

// ------------------------------------------------------------------------------------------ Part A and certificates (PAY-5.08, CMP-07)

const taxYears = () => {
  const now = new Date();
  const y = now.getMonth() >= 3 ? now.getFullYear() : now.getFullYear() - 1;
  return [y - 2, y - 1, y].map((s) => `${s}-${String((s + 1) % 100).padStart(2, '0')}`);
};
const formText = (f: string) => (f === 'form130' ? 'Form 130' : 'Form 16');

export interface TaxCertificatesScreenProps {
  state: LoadState;
  onRetry?: () => void;
  entities: SetupEntity[];
  entityId: string | null;
  onEntity: (id: string | null) => void;
  taxYear: string;
  onTaxYear: (y: string) => void;
  certificates: CertificateRow[] | null;
  nameOf: (employeeId: string) => string;
  can: { importZip: boolean; issueAll: boolean };
  onImportZip: (file: File) => Promise<PartAImport>;
  onPartA: (c: CertificateRow, file: File) => Promise<unknown>;
  onIssue: (c: CertificateRow, confirmation: Confirmation) => Promise<unknown>;
  onIssueAll: (confirmation: Confirmation) => Promise<{ issued: number; failed: { id: string; reason: string }[] }>;
}

/** Year-end certificates: Part A from TRACES (one ZIP for everyone, or one PDF), then Part B issued with Part A. */
export function TaxCertificatesScreen(p: TaxCertificatesScreenProps) {
  const [imported, setImported] = useState<PartAImport | null>(null);
  const [issuing, setIssuing] = useState<CertificateRow | 'all' | null>(null);
  const [issuedAll, setIssuedAll] = useState<{ issued: number; failed: { id: string; reason: string }[] } | null>(null);
  const { busy, error, run } = useRun();
  const ready = (p.certificates ?? []).filter((c) => c.partA && !c.issued);
  const form = (p.certificates ?? [])[0]?.form ?? (Number(p.taxYear.slice(0, 4)) >= 2026 ? 'form130' : 'form16');
  const phrase = `ISSUE ${form.toUpperCase()} ${p.taxYear}`;
  return (
    <LivePage title="Tax certificates" description="Part A comes from TRACES; Part B is worked out from the year's payroll. Issued certificates reach employees in My pay documents." state={p.state} onRetry={p.onRetry} what="tax certificates" grantedBy="your payroll admin">
      <div className="yx-tim-row">
        <EntityPicker entities={p.entities} value={p.entityId} onChange={p.onEntity} id="tc-entity" />
        <FormField id="tc-year" label="Tax year">
          <Segment label="Tax year" value={p.taxYear} onChange={p.onTaxYear} options={taxYears().map((y) => ({ value: y, label: y }))} />
        </FormField>
      </div>
      <Failed error={error} />
      {!p.entityId && <EmptyState title="Choose a legal entity" description="Certificates are issued by each legal entity (its TAN)." compact />}
      {p.entityId && p.certificates && (
        <>
          <div className="yx-tim-row">
            {p.can.importZip && <FileButton label="Upload Part A ZIP from TRACES" accept=".zip,application/zip" ariaLabel="Upload the Part A ZIP downloaded from TRACES" loading={busy === 'zip'} onFile={(f) => void run('zip', async () => setImported(await p.onImportZip(f)))} />}
            {p.can.issueAll && ready.length > 0 && (
              <Button variant="primary" onClick={() => setIssuing('all')}>
                Issue {ready.length} ready
              </Button>
            )}
          </div>
          {imported && (
            <InlineAlert tone={imported.unmatched.length ? 'warning' : 'success'} title={`${imported.matched} of ${imported.files} Part A files matched`}>
              {imported.unmatched.length > 0 && (
                <ul className="yx-tim-list">
                  {imported.unmatched.slice(0, 20).map((u) => (
                    <li key={u}>{u}</li>
                  ))}
                </ul>
              )}
            </InlineAlert>
          )}
          {issuedAll && (
            <InlineAlert tone={issuedAll.failed.length ? 'warning' : 'success'} title={`${issuedAll.issued} issued`}>
              {issuedAll.failed.length > 0 && `${issuedAll.failed.length} could not be issued: ${issuedAll.failed[0].reason}`}
            </InlineAlert>
          )}
          {!p.certificates.length ? (
            <EmptyState title="No certificates yet" description="Upload the Part A ZIP from TRACES; each file is matched to the person by PAN." compact />
          ) : (
            <table className="yx-tim-table" aria-label="Tax certificates">
              <thead>
                <tr>
                  <th scope="col">Person</th>
                  <th scope="col">Form</th>
                  <th scope="col">Part A</th>
                  <th scope="col">Status</th>
                  <th scope="col">
                    <span className="yx-visually-hidden">Actions</span>
                  </th>
                </tr>
              </thead>
              <tbody>
                {p.certificates.map((c) => (
                  <tr key={c.id}>
                    <th scope="row">{p.nameOf(c.employeeId)}</th>
                    <td>{formText(c.form)}</td>
                    <td>{c.partA ? <Badge tone="success">Attached</Badge> : <Badge tone="warning">Missing</Badge>}</td>
                    <td>{c.issued ? <Badge tone="success">Issued</Badge> : <Badge tone="neutral">Not issued</Badge>}</td>
                    <td>
                      {!c.issued && (
                        <div className="yx-tim-row">
                          <FileButton label={c.partA ? 'Replace Part A' : 'Attach Part A'} accept=".pdf,application/pdf" ariaLabel={`Attach Part A for ${p.nameOf(c.employeeId)}`} loading={busy === `a-${c.id}`} onFile={(f) => void run(`a-${c.id}`, () => p.onPartA(c, f))} />
                          {c.partA && (
                            <Button size="sm" onClick={() => setIssuing(c)} aria-label={`Issue the certificate of ${p.nameOf(c.employeeId)}`}>
                              Issue
                            </Button>
                          )}
                        </div>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </>
      )}
      {issuing && (
        <IrreversibleSheet
          open
          onOpenChange={(o) => !o && setIssuing(null)}
          title={issuing === 'all' ? `Issue ${ready.length} certificates for ${p.taxYear}` : `Issue ${p.nameOf(issuing.employeeId)}'s certificate`}
          impact={[
            { label: 'Form', value: formText(form) },
            { label: 'Tax year', value: p.taxYear },
            { label: 'People', value: issuing === 'all' ? String(ready.length) : '1' },
          ]}
          cannotUndo="An issued certificate is published to the employee and never changes."
          correction="A correction return issues a revised certificate that supersedes it."
          phrase={phrase}
          maker="preparer"
          checker="you"
          confirmLabel="Issue"
          confirmVariant="primary"
          error={error}
          onConfirm={() =>
            void run('issue', async () => {
              const confirmation = { phrase, impact: [{ label: 'Tax year', value: p.taxYear }] };
              if (issuing === 'all') setIssuedAll(await p.onIssueAll(confirmation));
              else await p.onIssue(issuing, confirmation);
              setIssuing(null);
            })
          }
        />
      )}
    </LivePage>
  );
}

// ------------------------------------------------------------------------------------------ nominees for the pay portal (YX-DOC-19)

export interface NomineeInput {
  employeeId: string;
  name: string;
  email: string;
  validUntil: string;
}

/** HR adds a nominee who may sign in to the pay portal with a code sent by email and read the person's pay documents. */
export function NomineeDrawer({ onSearch, onClose, onSave }: { onSearch: (q: string) => Promise<PersonHit[]>; onClose: () => void; onSave: (x: NomineeInput) => Promise<unknown> }) {
  const [who, setWho] = useState<PersonHit | null>(null);
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [until, setUntil] = useState('');
  const today = new Date().toISOString().slice(0, 10);
  const errors: FormErrorItem[] = [
    ...(!who ? [{ fieldId: 'nm-who', message: 'Choose whose documents.' }] : []),
    ...(name.trim().length < 2 ? [{ fieldId: 'nm-name', message: "Give the nominee's name." }] : []),
    ...(!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim()) ? [{ fieldId: 'nm-email', message: 'Give an email address like name@example.com.' }] : []),
    ...(!DAY.test(until) || until <= today ? [{ fieldId: 'nm-until', message: 'A day after today.' }] : []),
  ];
  return (
    <FormDrawer title="Add a nominee" subtitle="They sign in to the pay portal with a code sent to this email, and can only read." confirm="Add nominee" errors={errors} onClose={onClose} onSave={() => onSave({ employeeId: who!.id, name: name.trim(), email: email.trim(), validUntil: until })}>
      {(errorOf) => (
        <>
          <PersonPicker id="nm-who" label="Whose documents" value={who} onChange={setWho} onSearch={onSearch} error={errorOf('nm-who')} />
          <FormField id="nm-name" label="Nominee's name" required error={errorOf('nm-name')}>
            <TextField value={name} onChange={setName} maxLength={200} />
          </FormField>
          <FormField id="nm-email" label="Nominee's email" required error={errorOf('nm-email')}>
            <TextField type="email" value={email} onChange={setEmail} maxLength={200} />
          </FormField>
          <FormField id="nm-until" label="Access until" required error={errorOf('nm-until')}>
            <TextField type="date" value={until} onChange={setUntil} />
          </FormField>
        </>
      )}
    </FormDrawer>
  );
}
