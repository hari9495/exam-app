// PAY-10 · Payments and files, live: the designed PaymentsScreen (payroll-inputs.tsx) with the API's data on three
// pages: a run's payments (/yx/payroll/runs/[id]/payments), every payroll file (/yx/payroll/files) and the payment
// modes (/yx/payroll/payment-modes). Same header, tabs, tables, texts and drawers as the design stories. The API checks
// every call; `can` only hides what the person may not do.
import { useState, type ReactNode } from 'react';
import { ArrowLeft, Download, Eye, EyeOff, Plus, Upload } from 'lucide-react';
import { Button } from '../../components/button';
import { Badge, type BadgeTone } from '../../components/display';
import { Drawer } from '../../components/drawer';
import { EmptyState, ErrorState, InlineAlert, NoAccessState } from '../../components/feedback';
import { FormField, useSaveErrors, type FormErrorItem } from '../../components/field';
import { TextArea, TextField } from '../../components/inputs';
import { RadioGroup } from '../../components/choice';
import { Segment } from '../../components/segment';
import { FileUpload } from '../../components/upload';
import { useToast } from '../../components/notify';
import { PageHeader, Tabs, TabsContent, TabsList, TabsTrigger } from '../../components/shell';
import { DataTable, type TableColumn } from '../../components/table';
import { formatDate, formatINR } from '../../lib/format';
import { useRun } from '../org/org-kit';
import { FactRow, IrreversibleSheet, StateBlock } from './pay-kit';
import { PersonPicker, type PersonHit } from './live/inputs';
import type { Confirmation, ExchangeFile, ExchangeFiles, LoadState } from './live/types';
import type { BankFileRow, PayRun, RunPayslip } from './live/types-5j';
import type { Disbursement, DisbursementInput, PaymentModeRow, PaymentResultRow } from './live/types-ops';
import { RUN_ROWS } from './pay-data';

/* ------------------------------------------------------------------ shared bits */

const DAY = /^\d{4}-\d{2}-\d{2}$/;
const money = (v: string | null | undefined) => (v ? formatINR(Number(v)) : '—');
const day = (iso: string) => formatDate(new Date(`${iso.slice(0, 10)}T00:00:00`));
const monthLong = (m: string) => new Date(`${m}-01T00:00:00`).toLocaleDateString('en-GB', { month: 'long', year: 'numeric' });
const short = (h: string) => `${h.slice(0, 8)}…${h.slice(-6)}`;

/** Bank results are all or nothing: the API's row problems are shown with its message. */
export const withProblems = async <T,>(fn: () => Promise<T>): Promise<T> => {
  try {
    return await fn();
  } catch (e) {
    const problems = (e as { body?: { problems?: unknown } }).body?.problems;
    if (e instanceof Error && Array.isArray(problems) && problems.length) throw new Error(`${e.message} ${problems.slice(0, 10).join(' ')}`);
    throw e;
  }
};

/** Loading, error (retry), no access; the content when ready. */
function LiveStates({ state, onRetry, what, children }: { state: LoadState; onRetry?: () => void; what: string; children: ReactNode }) {
  if (state === 'loading') return <StateBlock state="loading" rows={8}>{null}</StateBlock>;
  if (state === 'error') return <ErrorState title={`We couldn't load ${what}.`} description="Nothing has changed. Try again in a moment." onRetry={onRetry} />;
  if (state === 'no-access') return <NoAccessState grantedBy="your payroll admin" what={what} />;
  return <>{children}</>;
}

/** A drawer with a form: errors show only after the button is pressed, and the first bad field takes focus. */
function FormDrawer({ title, subtitle, confirm, errors, onClose, onSave, children }: { title: string; subtitle?: string; confirm: string; errors: FormErrorItem[]; onClose: () => void; onSave: () => Promise<unknown>; children: (errorOf: (id: string) => string | undefined) => ReactNode }) {
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
              if (errors.length) {
                save.reveal();
                document.getElementById(errors[0]!.fieldId)?.focus();
                return;
              }
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
      <div className="yx-pay-stack">
        {error && (
          <InlineAlert tone="danger" title="This didn't go through">
            {error}
          </InlineAlert>
        )}
        {children(save.errorOf)}
      </div>
    </Drawer>
  );
}

/* ------------------------------------------------------------------ Payment modes (PAY-10 "Payment modes" tab) */

const MODE: Record<PaymentModeRow['mode'], string> = { bank: 'Bank transfer', cash: 'Cash', cheque: 'Cheque' };
const MODE_STATUS = (s: string): { label: string; tone: BadgeTone } => (s === 'approved' ? { label: 'Approved', tone: 'success' } : s === 'rejected' ? { label: 'Turned down', tone: 'danger' } : { label: 'Waiting for approval', tone: 'warning' });
export type PaymentModeRequest = { employeeId: string; mode: PaymentModeRow['mode']; validFrom: string; reason: string };

/** The "Payment modes" tab: who is paid by cash or cheque instead of the bank. Asked for here, approved by someone else
 * in Approvals. The design story and the live page render this same panel. */
export function PaymentModesPanel({ modes, nameOf, can, onSearch, onRequest, defaultAsking = false }: { modes: PaymentModeRow[]; nameOf: (employeeId: string) => string; can: { request: boolean }; onSearch: (q: string) => Promise<PersonHit[]>; onRequest: (x: PaymentModeRequest) => Promise<unknown>; defaultAsking?: boolean }) {
  const [asking, setAsking] = useState(defaultAsking);
  const { toast } = useToast();
  const cols: TableColumn<PaymentModeRow>[] = [
    { key: 'who', header: 'Employee', type: 'person', value: (r) => nameOf(r.employeeId), person: (r) => ({ name: nameOf(r.employeeId) }), width: 220 },
    { key: 'mode', header: 'Paid by', value: (r) => MODE[r.mode] ?? r.mode, width: 140 },
    { key: 'from', header: 'From', value: (r) => day(r.validFrom), width: 130 },
    { key: 'why', header: 'Why', value: (r) => r.reason, width: 300 },
    { key: 'status', header: 'Status', value: (r) => MODE_STATUS(r.status).label, render: (r) => <Badge tone={MODE_STATUS(r.status).tone}>{MODE_STATUS(r.status).label}</Badge>, width: 180 },
  ];
  return (
    <div className="yx-pay-stack">
      <InlineAlert tone="info" actions={can.request ? <Button size="sm" variant="primary" icon={Plus} onClick={() => setAsking(true)}>Ask for a payment mode</Button> : undefined}>
        Everyone is paid into their bank account unless a cash or cheque mode is approved. Someone else approves each change in Approvals.
      </InlineAlert>
      {modes.length ? (
        <DataTable label="Payment modes" columns={cols} rows={modes} getRowId={(r) => r.id} pageSize={25} />
      ) : (
        <EmptyState title="Everyone is paid by bank transfer" description="No cash or cheque payment mode has been asked for." />
      )}
      {asking && (
        <PaymentModeDrawer
          onSearch={onSearch}
          onClose={() => setAsking(false)}
          onSave={async (x) => {
            await onRequest(x);
            toast({ tone: 'success', title: 'Sent for approval', description: 'Someone else approves it in Approvals.' });
          }}
        />
      )}
    </div>
  );
}

function PaymentModeDrawer({ onSearch, onClose, onSave }: { onSearch: (q: string) => Promise<PersonHit[]>; onClose: () => void; onSave: (x: PaymentModeRequest) => Promise<unknown> }) {
  const [who, setWho] = useState<PersonHit | null>(null);
  const [mode, setMode] = useState<PaymentModeRow['mode']>('cash');
  const [from, setFrom] = useState('');
  const [reason, setReason] = useState('');
  const errors: FormErrorItem[] = [
    ...(!who ? [{ fieldId: 'pm-who', message: 'Choose the person.' }] : []),
    ...(!DAY.test(from) ? [{ fieldId: 'pm-from', message: 'Give the day it starts.' }] : []),
    ...(reason.trim().length < 5 ? [{ fieldId: 'pm-why', message: 'Why: at least 5 letters.' }] : []),
  ];
  return (
    <FormDrawer title="Ask for a payment mode" subtitle="Someone else approves it in Approvals." confirm="Send for approval" errors={errors} onClose={onClose} onSave={() => onSave({ employeeId: who!.id, mode, validFrom: from, reason: reason.trim() })}>
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

/* ------------------------------------------------------------------ live data */

/** GET payroll/runs/:id/journal. */
export interface RunJournal {
  runId: string;
  postedAt: string | null;
  canPost: boolean;
  unmapped: { componentCode: string; side: 'expense' | 'payable'; costCentreId: string | null; amount: string }[];
  lines: { accountCode: string; accountName: string; ledger: string; costCentre: string | null; debit: string; credit: string }[];
  exports: { format: string; at: string; by: string }[];
}
export type JournalFormat = 'tally' | 'csv' | 'zoho';

interface LiveBase {
  state: LoadState;
  onRetry?: () => void;
}
/** /yx/payroll/runs/[id]/payments: the run's payment status, cash and cheque, bank files and journal. */
export interface LiveRunPayments extends LiveBase {
  view: 'run';
  run: PayRun | null;
  payslips: RunPayslip[] | null;
  disbursements: Disbursement[] | null;
  bankFiles: BankFileRow[] | null;
  /** null while it loads or when the person may not export it (`can.journal`). */
  journal: RunJournal | null;
  nameOf: (employeeId: string) => string;
  can: { record: boolean; journal: boolean };
  onBack: () => void;
  onResults: (rows: PaymentResultRow[]) => Promise<unknown>;
  onUploadResults: (file: File) => Promise<{ recorded: number }>;
  onDisburse: (d: DisbursementInput) => Promise<unknown>;
  onDownloadBankFile: (fileId: string, name: string) => Promise<unknown>;
  onExportJournal: (format: JournalFormat) => Promise<unknown>;
}
/** /yx/payroll/files: every payroll file, single-use download, released by a second person. */
export interface LivePayrollFiles extends LiveBase {
  view: 'files';
  data: ExchangeFiles | null;
  me: string;
  onDownload: (file: ExchangeFile) => Promise<unknown>;
  onRelease: (file: ExchangeFile, confirmation: Confirmation) => Promise<unknown>;
}
/** /yx/payroll/payment-modes. */
export interface LivePaymentModes extends LiveBase {
  view: 'modes';
  modes: PaymentModeRow[] | null;
  nameOf: (employeeId: string) => string;
  can: { request: boolean };
  onSearch: (q: string) => Promise<PersonHit[]>;
  onRequest: (x: PaymentModeRequest) => Promise<unknown>;
}
export type LivePayments = LiveRunPayments | LivePayrollFiles | LivePaymentModes;

export function LivePaymentsScreen({ live }: { live: LivePayments }) {
  if (live.view === 'files') return <LiveFiles live={live} />;
  if (live.view === 'modes') return <LiveModes live={live} />;
  return <LiveRun live={live} />;
}

/* ------------------------------------------------------------------ payment modes page */

function LiveModes({ live }: { live: LivePaymentModes }) {
  return (
    <div className="yx-pay-stack">
      <PageHeader title="Payment modes" description="Who is paid by cash or cheque instead of the bank" />
      <LiveStates state={live.state} onRetry={live.onRetry} what="payment modes">
        {live.modes && <PaymentModesPanel modes={live.modes} nameOf={live.nameOf} can={live.can} onSearch={live.onSearch} onRequest={live.onRequest} />}
      </LiveStates>
    </div>
  );
}

/* ------------------------------------------------------------------ payroll files page (the "Bank files" tab, every file) */

const FILE_STATUS: Record<ExchangeFile['status'], { label: string; tone: BadgeTone }> = {
  generated: { label: 'Waiting for release', tone: 'info' },
  release_pending: { label: 'Release asked', tone: 'info' },
  released: { label: 'Released', tone: 'success' },
  superseded: { label: 'Replaced', tone: 'neutral' },
};

function LiveFiles({ live }: { live: LivePayrollFiles }) {
  const d = live.data;
  const [releasing, setReleasing] = useState<ExchangeFile | null>(null);
  const { busy, error, run, clearError } = useRun();
  const { toast } = useToast();
  const entity = (id: string) => d?.entities.find((e) => e.id === id)?.name ?? '';
  const cols: TableColumn<ExchangeFile>[] = [
    {
      key: 'file',
      header: 'File',
      value: (f) => `${f.kindLabel} ${f.fileName}`,
      render: (f) => (
        <>
          {f.kindLabel}
          <br />
          <span className="yx-pay-note">
            {f.fileName} · made by {f.generatedBy}
            {f.releasedBy ? ` · released by ${f.releasedBy}` : ''}
          </span>
        </>
      ),
      width: 280,
    },
    { key: 'entity', header: 'Legal entity', value: (f) => entity(f.legalEntityId), width: 200 },
    { key: 'month', header: 'Month', value: (f) => (f.month ? monthLong(f.month) : ''), width: 140 },
    { key: 'rows', header: 'Rows', type: 'number', value: (f) => f.rows, width: 80 },
    { key: 'total', header: 'Total', value: (f) => money(f.totals.amount), width: 140 },
    { key: 'sha', header: 'SHA-256', type: 'id', value: (f) => short(f.sha256), width: 160, optional: true },
    { key: 'status', header: 'Status', value: (f) => FILE_STATUS[f.status].label, render: (f) => <Badge tone={FILE_STATUS[f.status].tone}>{FILE_STATUS[f.status].label}</Badge>, width: 160 },
  ];
  return (
    <div className="yx-pay-stack">
      <PageHeader title="Payroll files" description="Bank, statutory and accounting files as made, with their hash, rows and totals. They never change. Someone other than the person who made a file releases it." />
      <LiveStates state={live.state} onRetry={live.onRetry} what="payroll files">
        {error && !releasing && (
          <InlineAlert tone="danger" title="That didn't work">
            {error}
          </InlineAlert>
        )}
        {d &&
          (d.files.length ? (
            <DataTable
              label="Payroll files"
              columns={cols}
              rows={d.files}
              getRowId={(f) => f.id}
              pageSize={25}
              rowButtons={(f) => (
                <>
                  <Button size="sm" icon={Download} loading={busy === f.id} onClick={() => void run(f.id, () => live.onDownload(f))} aria-label={`Download ${f.fileName}`}>
                    Download
                  </Button>
                  {f.canRelease && (
                    <Button size="sm" variant="primary" onClick={() => setReleasing(f)} aria-label={`Release ${f.fileName}`}>
                      Release
                    </Button>
                  )}
                </>
              )}
            />
          ) : (
            <EmptyState title="No payroll files yet" description="Bank and statutory files appear here when payroll makes them." />
          ))}
      </LiveStates>
      {releasing && (
        <IrreversibleSheet
          open
          onOpenChange={(o) => {
            if (!o) {
              setReleasing(null);
              clearError();
            }
          }}
          title={`Release ${releasing.kindLabel.toLowerCase()}`}
          subtitle={releasing.fileName}
          impact={[
            { label: 'Rows', value: String(releasing.rows) },
            { label: 'Total', value: money(releasing.totals.amount) },
            { label: 'SHA-256', value: short(releasing.sha256) },
            { label: 'Made by', value: releasing.generatedBy },
          ]}
          cannotUndo="A released file is final: the month can no longer be reopened."
          correction="A mistake found later is paid as a correction in the next payroll."
          phrase={`RELEASE ${releasing.rows}`}
          maker={releasing.generatedBy}
          checker={live.me}
          confirmLabel="Release the file"
          confirmVariant="primary"
          error={error}
          onConfirm={() =>
            void run('release', async () => {
              const f = releasing;
              await live.onRelease(f, {
                phrase: `RELEASE ${f.rows}`,
                impact: [
                  { label: 'Rows', value: String(f.rows) },
                  { label: 'Total', value: f.totals.amount ?? '' },
                  { label: 'SHA-256', value: f.sha256 },
                ],
              });
              setReleasing(null);
              toast({ tone: 'success', title: `${f.fileName} is released` });
            })
          }
        />
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ a run's payments page */

const PAYMENT: Record<string, { label: string; tone: BadgeTone }> = {
  pending: { label: 'Pending', tone: 'warning' },
  sent: { label: 'Sent to the bank', tone: 'info' },
  held: { label: 'Held', tone: 'neutral' },
  cash: { label: 'Cash or cheque', tone: 'neutral' },
  paid: { label: 'Paid', tone: 'success' },
  failed: { label: 'Failed', tone: 'danger' },
  returned: { label: 'Returned', tone: 'danger' },
};
const payment = (s: string) => PAYMENT[s] ?? { label: s, tone: 'neutral' as BadgeTone };
const FORMAT_TEXT: Record<JournalFormat, string> = { tally: 'Tally (XML)', csv: 'CSV', zoho: 'Zoho Books (CSV)' };

function LiveRun({ live }: { live: LiveRunPayments }) {
  const [result, setResult] = useState<RunPayslip | null>(null);
  const [paying, setPaying] = useState<Disbursement | null>(null);
  const [uploading, setUploading] = useState(false);
  const [showPay, setShowPay] = useState(false);
  const [format, setFormat] = useState<JournalFormat>('csv');
  const { busy, run } = useRun();
  const { toast } = useToast();
  const say = (title: string) => toast({ tone: 'success', title });
  const pay = (v: string) => (showPay ? money(v) : '₹ •••');
  const r = live.run;
  const approved = !!r && ['approved', 'paid'].includes(r.status);
  const record = approved && live.can.record;
  const cashIds = new Set((live.disbursements ?? []).filter((x) => x.mode !== 'bank').map((x) => x.payslipId));
  const bank = (live.payslips ?? []).filter((s) => !cashIds.has(s.id));
  const register = (live.disbursements ?? []).filter((x) => x.mode !== 'bank');
  const count = (st: string[]) => bank.filter((s) => st.includes(s.paymentStatus)).length;
  const failedOrReturned = count(['failed', 'returned']);
  const held = bank.filter((s) => s.held).length;
  const paidSum = bank.filter((s) => s.paymentStatus === 'paid').reduce((a, s) => a + Number(s.net), 0);
  const allSum = bank.reduce((a, s) => a + Number(s.net), 0);
  const acked = register.filter((x) => x.paidOn).length;
  const j = live.journal;
  const debits = j ? j.lines.reduce((a, l) => a + Number(l.debit), 0) : 0;
  const credits = j ? j.lines.reduce((a, l) => a + Number(l.credit), 0) : 0;
  const balanced = Math.abs(debits - credits) < 0.005;
  const lastExport = j?.exports.length ? j.exports[j.exports.length - 1] : null;
  const cols: TableColumn<RunPayslip>[] = [
    { key: 'employee', header: 'Employee', type: 'person', value: (s) => live.nameOf(s.employeeId), person: (s) => ({ name: live.nameOf(s.employeeId) }), width: 220 },
    { key: 'amount', header: 'Amount', value: (s) => Number(s.net), render: (s) => pay(s.net), width: 120 },
    {
      key: 'status',
      header: 'Status',
      value: (s) => payment(s.paymentStatus).label,
      render: (s) => (
        <>
          <Badge tone={payment(s.paymentStatus).tone}>{payment(s.paymentStatus).label}</Badge>
          {s.held && s.paymentStatus !== 'held' && <Badge tone="neutral">Held</Badge>}
        </>
      ),
      width: 220,
    },
  ];
  const regCols: TableColumn<Disbursement>[] = [
    { key: 'employee', header: 'Employee', type: 'person', value: (x) => live.nameOf(x.employeeId), person: (x) => ({ name: live.nameOf(x.employeeId) }), width: 220 },
    { key: 'mode', header: 'Mode', value: (x) => (x.mode === 'cheque' ? `Cheque${x.chequeNo ? ` ${x.chequeNo}` : ''}` : 'Cash'), width: 140 },
    { key: 'amount', header: 'Amount', value: (x) => Number(x.net), render: (x) => pay(x.net), width: 120 },
    {
      key: 'ack',
      header: 'Receipt',
      value: (x) => (x.paidOn ? `Paid ${day(x.paidOn)}` : 'Waiting for receipt'),
      render: (x) => (x.paidOn ? <Badge tone="success">{`Paid ${day(x.paidOn)}`}</Badge> : <Badge tone="warning">{x.held ? 'Held' : 'Waiting for receipt'}</Badge>),
      width: 180,
    },
    { key: 'note', header: 'Acknowledgement', value: (x) => x.acknowledgement ?? '', width: 240, optional: true },
  ];
  const fileCols: TableColumn<BankFileRow>[] = [
    { key: 'name', header: 'File', value: (f) => `Bank file ${f.generationNo}`, render: (f) => (
      <>
        Bank file {f.generationNo} · {f.format}
        {f.reason && (
          <>
            <br />
            <span className="yx-pay-note">{f.reason}</span>
          </>
        )}
      </>
    ), width: 220 },
    { key: 'payments', header: 'Payments', type: 'number', value: (f) => f.rows, width: 100 },
    { key: 'total', header: 'Total', value: (f) => money(f.total), width: 140 },
    { key: 'sha', header: 'SHA-256', type: 'id', value: (f) => short(f.sha256), width: 160, optional: true },
    { key: 'status', header: 'Status', value: (f) => (f.status === 'superseded' ? 'Replaced' : f.releasedAt ? 'Released' : 'Waiting for release'), render: (f) => <Badge tone={f.status === 'superseded' ? 'neutral' : f.releasedAt ? 'success' : 'info'}>{f.status === 'superseded' ? 'Replaced' : f.releasedAt ? 'Released' : 'Waiting for release'}</Badge>, width: 160 },
  ];
  return (
    <div className="yx-pay-stack">
      <PageHeader
        title="Payments & files"
        description={r ? `${monthLong(r.month)}${r.entityName ? ` · ${r.entityName}` : ''}` : undefined}
        facts={live.state === 'ready' && r ? `${bank.length + register.length} employees · ${count(['paid'])} paid by bank · ${failedOrReturned} failed or returned · ${register.length} cash or cheque · ${held} held` : undefined}
        actions={
          <>
            <Button icon={ArrowLeft} onClick={live.onBack}>
              Back to the run
            </Button>
            {live.state === 'ready' && (
              <Button icon={showPay ? EyeOff : Eye} aria-pressed={showPay} onClick={() => setShowPay(!showPay)}>
                {showPay ? 'Hide pay' : 'Show pay'}
              </Button>
            )}
            {live.state === 'ready' && record && (
              <Button icon={Upload} onClick={() => setUploading(true)}>
                Upload bank response
              </Button>
            )}
          </>
        }
      />
      <LiveStates state={live.state} onRetry={live.onRetry} what="payments">
        {!approved && <InlineAlert tone="info" title="Payments are recorded once the run is approved." />}
        <Tabs defaultValue="status">
          <TabsList aria-label="Payments">
            <TabsTrigger value="status" count={bank.length}>
              Payment status
            </TabsTrigger>
            <TabsTrigger value="register" count={register.length}>
              Cash and cheque
            </TabsTrigger>
            <TabsTrigger value="files" count={live.bankFiles?.length ?? 0}>
              Bank files
            </TabsTrigger>
            {live.can.journal && <TabsTrigger value="journal">Journal export</TabsTrigger>}
          </TabsList>
          <TabsContent value="status">
            {bank.length ? (
              <div className="yx-pay-stack">
                <DataTable
                  label="Payment status"
                  columns={cols}
                  rows={bank}
                  getRowId={(s) => s.id}
                  pageSize={25}
                  rowButtons={(s) =>
                    record && !s.held && s.paymentStatus !== 'paid' ? (
                      <Button size="sm" onClick={() => setResult(s)} aria-label={`Record the bank result for ${live.nameOf(s.employeeId)}`}>
                        Record result
                      </Button>
                    ) : null
                  }
                />
                <p className="yx-pay-muted">
                  Paid {showPay ? formatINR(paidSum) : '₹ •••'} · not paid yet {showPay ? formatINR(allSum - paidSum) : '₹ •••'} (held, failed, returned or not sent yet). A failed payment is paid again from the run once the bank details are fixed.
                </p>
              </div>
            ) : (
              <EmptyState title="No bank payments" description="People paid into a bank account appear here once the run is calculated." />
            )}
          </TabsContent>
          <TabsContent value="register">
            {register.length ? (
              <div className="yx-pay-stack">
                <DataTable
                  label="Cash and cheque register"
                  columns={regCols}
                  rows={register}
                  getRowId={(x) => x.payslipId}
                  rowButtons={(x) =>
                    record && !x.paidOn && !x.held ? (
                      <Button size="sm" onClick={() => setPaying(x)} aria-label={`Record the payment to ${live.nameOf(x.employeeId)}`}>
                        Record payment
                      </Button>
                    ) : null
                  }
                />
                <p className="yx-pay-muted">
                  {acked} of {register.length} paid · {acked === register.length ? 'every line is recorded' : 'record each payment with the day it was paid'}
                </p>
              </div>
            ) : (
              <EmptyState title="Nobody is paid by cash or cheque" description="People whose approved payment mode is cash or cheque appear here." />
            )}
          </TabsContent>
          <TabsContent value="files">
            {live.bankFiles?.length ? (
              <DataTable
                label="Bank files"
                columns={fileCols}
                rows={live.bankFiles}
                getRowId={(f) => f.id}
                rowButtons={(f) => (
                  <Button size="sm" icon={Download} loading={busy === f.id} onClick={() => void run(f.id, () => live.onDownloadBankFile(f.fileId, `bank-file-${f.generationNo}.${f.format === 'csv' ? 'csv' : 'txt'}`))} aria-label={`Download bank file ${f.generationNo}`}>
                    Download
                  </Button>
                )}
              />
            ) : (
              <EmptyState title="No bank file yet" description="The bank file is made on the run once it is approved." />
            )}
          </TabsContent>
          {live.can.journal && (
            <TabsContent value="journal">
              {!j ? (
                <EmptyState title="No journal yet" description="The journal is made once the payroll is approved." />
              ) : (
                <div className="yx-pay-stack">
                  <FactRow
                    items={[
                      { label: 'Journal', value: r ? `${monthLong(r.month)} salary` : 'Salary' },
                      { label: 'Lines', value: `${j.lines.length} ledgers` },
                      { label: 'Debits and credits', value: balanced ? `Both ${formatINR(debits)}` : `Debits ${formatINR(debits)} · credits ${formatINR(credits)}` },
                      { label: 'Last export', value: lastExport ? `${FORMAT_TEXT[lastExport.format as JournalFormat] ?? lastExport.format}, ${day(lastExport.at)}` : 'Not exported' },
                    ]}
                  />
                  {j.unmapped.length > 0 && (
                    <InlineAlert tone="danger" title="Some pay lines have no ledger account">
                      Map these to ledger accounts first: {[...new Set(j.unmapped.map((u) => `${u.componentCode} (${u.side})`))].slice(0, 10).join(', ')}.
                    </InlineAlert>
                  )}
                  <FormField label="Export to">
                    <RadioGroup value={format} onChange={(v) => setFormat(v as JournalFormat)} orientation="horizontal" options={(Object.keys(FORMAT_TEXT) as JournalFormat[]).map((f) => ({ value: f, label: FORMAT_TEXT[f] }))} />
                  </FormField>
                  <div className="yx-scroll-x" tabIndex={0} role="region" aria-label="Table, scrolls sideways on small screens">
                    <table className="yx-pay-table">
                      <thead>
                        <tr>
                          <th scope="col">Ledger</th>
                          <th scope="col">Cost centre</th>
                          <th scope="col" data-num>
                            Debit
                          </th>
                          <th scope="col" data-num>
                            Credit
                          </th>
                        </tr>
                      </thead>
                      <tbody>
                        {j.lines.map((l, i) => (
                          <tr key={`${l.accountCode}-${l.costCentre ?? ''}-${i}`}>
                            <th scope="row">{l.ledger}</th>
                            <td>{l.costCentre ?? ''}</td>
                            <td data-num>{Number(l.debit) ? money(l.debit) : ''}</td>
                            <td data-num>{Number(l.credit) ? money(l.credit) : ''}</td>
                          </tr>
                        ))}
                      </tbody>
                      <tfoot>
                        <tr>
                          <th scope="row">Total</th>
                          <td />
                          <td data-num>{formatINR(debits)}</td>
                          <td data-num>{formatINR(credits)}</td>
                        </tr>
                      </tfoot>
                    </table>
                  </div>
                  <div className="yx-pay-row">
                    <Button
                      variant="primary"
                      icon={Download}
                      loading={busy === 'journal'}
                      onClick={() => {
                        // Never disabled: pressed while lines are unmapped, it says why.
                        if (j.unmapped.length) return void toast({ tone: 'default', title: 'Map every pay line to a ledger account first.' });
                        void run('journal', async () => {
                          await live.onExportJournal(format);
                          say(`Journal exported as ${FORMAT_TEXT[format]} · ${j.lines.length} ledgers`);
                        });
                      }}
                    >
                      Export journal
                    </Button>
                  </div>
                </div>
              )}
            </TabsContent>
          )}
        </Tabs>
      </LiveStates>
      {uploading && (
        <Drawer open onOpenChange={setUploading} title="Upload bank response" subtitle="A CSV with the columns employee_code, status (paid, failed or returned), reference and reason. All rows are recorded, or none." footer={<Button onClick={() => setUploading(false)}>Close</Button>}>
          <FileUpload
            accept={['.csv']}
            multiple={false}
            upload={async (f) => {
              const out = await withProblems(() => live.onUploadResults(f));
              say(`Bank response applied · ${out.recorded} ${out.recorded === 1 ? 'payment' : 'payments'} updated`);
            }}
          />
        </Drawer>
      )}
      {result && (
        <ResultDrawer
          who={live.nameOf(result.employeeId)}
          onClose={() => setResult(null)}
          onSave={async (x) => {
            await withProblems(() => live.onResults([{ payslipId: result.id, ...x }]));
            say(`Bank result recorded for ${live.nameOf(result.employeeId)}`);
          }}
        />
      )}
      {paying && (
        <DisburseDrawer
          d={paying}
          who={live.nameOf(paying.employeeId)}
          onClose={() => setPaying(null)}
          onSave={async (x) => {
            await live.onDisburse(x);
            say(`Payment recorded for ${live.nameOf(paying.employeeId)}`);
          }}
        />
      )}
    </div>
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
                { value: 'returned', label: 'Returned' },
              ]}
            />
          </FormField>
          <FormField id="pr-ref" label="Bank reference" optional error={errorOf('pr-ref')}>
            <TextField value={ref} onChange={setRef} maxLength={60} />
          </FormField>
          <FormField id="pr-why" label={status === 'paid' ? 'How you know' : 'Reason from the bank'} required helper={status === 'paid' ? 'For example, seen on the bank statement of 3 Oct 2026.' : undefined} error={errorOf('pr-why')}>
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
      subtitle={money(d.net)}
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

/* ------------------------------------------------------------------ PAY-10 "Payment modes" sample (design stories) */

const CASH_ROW = RUN_ROWS.find((r) => r.mode === 'Cash')!;
const CHEQUE_ROW = RUN_ROWS.find((r) => r.mode === 'Cheque')!;
const ASKED_ROW = RUN_ROWS.find((r) => r.mode === 'Bank' && r.status === 'Calculated')!;
const SAMPLE_MODES: PaymentModeRow[] = [
  { id: 'pm1', employeeId: CASH_ROW.id, mode: 'cash', validFrom: '2026-09-01', reason: 'Bank account closed, new one not given yet', status: 'approved', requestId: 'w1' },
  { id: 'pm2', employeeId: CHEQUE_ROW.id, mode: 'cheque', validFrom: '2026-09-01', reason: 'Account frozen by the bank', status: 'approved', requestId: 'w2' },
  { id: 'pm3', employeeId: ASKED_ROW.id, mode: 'cash', validFrom: '2026-10-01', reason: 'Works at the plant gate; no bank branch nearby', status: 'pending', requestId: 'w3' },
];
const sampleName = (id: string) => RUN_ROWS.find((r) => r.id === id)?.name ?? 'Someone';
const sampleSearch = async (q: string): Promise<PersonHit[]> => RUN_ROWS.filter((r) => `${r.name} ${r.code}`.toLowerCase().includes(q.trim().toLowerCase())).slice(0, 8).map((r) => ({ id: r.id, name: r.name, employeeCode: r.code }));

/** The design's "Payment modes" tab with sample people: ready, empty, no access, and the ask drawer open. */
export function SamplePaymentModes({ variant = 'ready', asking = false }: { variant?: 'ready' | 'empty' | 'no-access'; asking?: boolean }) {
  if (variant === 'no-access') return <NoAccessState grantedBy="your payroll admin" what="payment modes" />;
  return <PaymentModesPanel modes={variant === 'empty' ? [] : SAMPLE_MODES} nameOf={sampleName} can={{ request: true }} onSearch={sampleSearch} onRequest={async () => {}} defaultAsking={asking} />;
}
