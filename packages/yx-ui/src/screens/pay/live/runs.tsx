import { useEffect, useMemo, useState } from 'react';
import { Button } from '../../../components/button';
import { Badge, type BadgeTone } from '../../../components/display';
import { Drawer } from '../../../components/drawer';
import { EmptyState, InlineAlert, Skeleton } from '../../../components/feedback';
import { ErrorSummary, FormField, useSaveErrors } from '../../../components/field';
import { TextArea, TextField } from '../../../components/inputs';
import { Segment } from '../../../components/segment';
import { Select } from '../../../components/select';
import { Card, Tabs, TabsContent, TabsList, TabsTrigger } from '../../../components/shell';
import { useRun } from '../../org/org-kit';
import { LivePage } from '../../time/live/kit';
import { IrreversibleSheet, RunStageTrack, type RunStage } from '../pay-kit';
import { monthText } from './periods';
import type { Confirmation, LoadState } from './types';
import type { BankFileMade, BankFileRow, OffcycleKind, PayGroupRef, PayRun, PayslipDetail, PayslipLine, RunCheck, RunPayslip, RunPerson, RunProgressData, RunReadiness, RunStatus, RunVariance } from './types-5j';

// Payroll runs, wired (M03 §9, §15; PAY-10.01 for PAY-01 … PAY-11): the runs of each month, and one run from its checks to
// the published payslips: readiness and waivers, calculation progress, payslips with "why this number", pay changes to
// confirm, sending for approval, the approver's decision with the typed phrase, the bank file (made by one person,
// released by another) and publishing. Every action is checked again by the API (keys, entities, maker ≠ checker, step-up).

/** "₹1,23,456.00" from the API's decimal string. */
export const rupees = (v: string | null | undefined) => {
  if (v == null) return '';
  const [i, f = '00'] = v.split('.');
  const neg = i.startsWith('-');
  const n = neg ? i.slice(1) : i;
  const head = n.slice(0, -3);
  return `${neg ? '−' : ''}₹${head ? `${head.replace(/\B(?=(\d{2})+(?!\d))/g, ',')},` : ''}${n.slice(-3)}.${f.padEnd(2, '0').slice(0, 2)}`;
};

const STATUS: Record<RunStatus, { label: string; tone: BadgeTone }> = {
  draft: { label: 'Draft', tone: 'neutral' },
  calculating: { label: 'Calculating', tone: 'info' },
  calculated: { label: 'Calculated', tone: 'info' },
  in_review: { label: 'In review', tone: 'warning' },
  submitted: { label: 'Waiting for approval', tone: 'warning' },
  approved: { label: 'Approved and locked', tone: 'success' },
  reopened: { label: 'Reopened', tone: 'warning' },
  paid: { label: 'Paid', tone: 'success' },
  void: { label: 'Void', tone: 'neutral' },
};
export const RunStatusBadge = ({ status }: { status: RunStatus }) => <Badge tone={STATUS[status].tone}>{STATUS[status].label}</Badge>;
const KIND: Record<OffcycleKind, string> = { bonus: 'Bonus', arrears: 'Arrears', correction: 'Correction', payment: 'Payment', fnf: 'Full and final' };
export const runName = (r: Pick<PayRun, 'runType' | 'offcycleKind' | 'month'>) => `${r.runType === 'regular' ? 'Payroll' : `Off-cycle · ${KIND[r.offcycleKind ?? 'payment']}`} · ${monthText(r.month)}`;
const stageOf = (s: RunStatus, published: boolean): RunStage =>
  published ? 'Published' : s === 'paid' ? 'Paid' : s === 'approved' ? 'Approved and locked' : s === 'submitted' || s === 'in_review' ? 'In review' : s === 'calculated' ? 'Calculated' : 'Draft';

// ------------------------------------------------------------------------------------------ the runs (PAY-01)

export interface PayRunsScreenProps {
  state: LoadState;
  onRetry?: () => void;
  runs: PayRun[] | null;
  groups: PayGroupRef[];
  /** "2026-10" */
  thisMonth: string;
  canPrepare: boolean;
  canOffcycle: boolean;
  onCreate: (payGroupId: string, month: string, offcycleKind: Exclude<OffcycleKind, 'fnf'> | null) => Promise<{ id: string }>;
  onOpen: (id: string) => void;
}

export function PayRunsScreen(p: PayRunsScreenProps) {
  const [creating, setCreating] = useState(false);
  const months = useMemo(() => [...new Set((p.runs ?? []).map((r) => r.month))].sort().reverse(), [p.runs]);
  const waiting = (p.runs ?? []).filter((r) => r.status === 'submitted');
  return (
    <LivePage
      title="Payroll runs"
      description="Each month's payroll and the off-cycle runs. A run is calculated, checked, approved by someone else, then paid and published."
      state={p.state}
      onRetry={p.onRetry}
      what="payroll runs"
      grantedBy="your payroll admin"
      actions={
        (p.canPrepare || p.canOffcycle) && (
          <Button variant="primary" onClick={() => setCreating(true)}>
            New run
          </Button>
        )
      }
    >
      {waiting.length > 0 && (
        <InlineAlert tone="info" title={`${waiting.length} ${waiting.length === 1 ? 'run is' : 'runs are'} waiting for approval`}>
          Open a run to see who approves it next. Approvers decide on the run's own page.
        </InlineAlert>
      )}
      {p.runs && !p.runs.length && (
        <EmptyState
          title="No payroll runs yet"
          description="Start this month's payroll for a pay group. Its people, salaries and attendance are checked before anything is calculated."
          action={
            p.canPrepare ? (
              <Button variant="primary" onClick={() => setCreating(true)}>
                New run
              </Button>
            ) : undefined
          }
        />
      )}
      {months.map((m) => (
        <Card key={m} title={monthText(m)}>
          <table className="yx-tim-table" aria-label={`Runs for ${monthText(m)}`}>
            <thead>
              <tr>
                <th scope="col">Run</th>
                <th scope="col">Pay group</th>
                <th scope="col">Status</th>
                <th scope="col">People</th>
                <th scope="col">Net pay</th>
                <th scope="col">
                  <span className="yx-visually-hidden">Open</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {(p.runs ?? [])
                .filter((r) => r.month === m)
                .map((r) => (
                  <tr key={r.id}>
                    <th scope="row">{r.runType === 'regular' ? 'Payroll' : `Off-cycle · ${KIND[r.offcycleKind ?? 'payment']}`}</th>
                    <td>{p.groups.find((g) => g.id === r.payGroupId)?.name ?? ''}</td>
                    <td>
                      <RunStatusBadge status={r.status} />
                    </td>
                    <td>{r.totals?.people ?? ''}</td>
                    <td>{r.totals ? rupees(r.totals.net) : ''}</td>
                    <td>
                      <Button size="sm" onClick={() => p.onOpen(r.id)} aria-label={`Open ${runName(r)}`}>
                        Open
                      </Button>
                    </td>
                  </tr>
                ))}
            </tbody>
          </table>
        </Card>
      ))}
      {creating && <NewRunDrawer {...p} onClose={() => setCreating(false)} />}
    </LivePage>
  );
}

function NewRunDrawer(p: PayRunsScreenProps & { onClose: () => void }) {
  const [kind, setKind] = useState<'regular' | 'offcycle'>(p.canPrepare ? 'regular' : 'offcycle');
  const [off, setOff] = useState<Exclude<OffcycleKind, 'fnf'>>('bonus');
  const [group, setGroup] = useState<string | null>(p.groups[0]?.id ?? null);
  const [month, setMonth] = useState(p.thisMonth);
  const { busy, error, run } = useRun();
  const errors = [...(!group ? [{ fieldId: 'nr-group', message: 'Choose a pay group.' }] : []), ...(!/^\d{4}-\d{2}$/.test(month) ? [{ fieldId: 'nr-month', message: 'Choose the month.' }] : [])];
  const save = useSaveErrors(errors);
  return (
    <Drawer
      open
      onOpenChange={(o) => !o && p.onClose()}
      title="New run"
      footer={
        <>
          <Button onClick={p.onClose}>Cancel</Button>
          <Button
            variant="primary"
            loading={busy === 'create'}
            onClick={() => {
              if (errors.length) return save.reveal();
              void run('create', async () => {
                const r = await p.onCreate(group!, month, kind === 'regular' ? null : off);
                p.onOpen(r.id);
              });
            }}
          >
            Create run
          </Button>
        </>
      }
    >
      <div className="yx-tim-form">
        <ErrorSummary errors={save.shownErrors} />
        {error && (
          <InlineAlert tone="danger" title="Not created">
            {error}
          </InlineAlert>
        )}
        {p.canPrepare && p.canOffcycle && (
          <Segment
            label="Kind of run"
            value={kind}
            onChange={setKind}
            options={[
              { value: 'regular', label: 'Monthly payroll' },
              { value: 'offcycle', label: 'Off-cycle' },
            ]}
          />
        )}
        {kind === 'offcycle' && (
          <Segment
            label="Pays"
            value={off}
            onChange={setOff}
            options={[
              { value: 'bonus', label: 'Bonus' },
              { value: 'arrears', label: 'Arrears' },
              { value: 'correction', label: 'Correction' },
              { value: 'payment', label: 'Payment' },
            ]}
          />
        )}
        <FormField id="nr-group" label="Pay group" required error={save.errorOf('nr-group')}>
          <Select value={group} onChange={setGroup} options={p.groups.map((g) => ({ value: g.id, label: g.name }))} placeholder="Choose a pay group" />
        </FormField>
        <FormField id="nr-month" label="Month" required error={save.errorOf('nr-month')} helper="The month the run pays.">
          <TextField type="month" value={month} onChange={setMonth} />
        </FormField>
        {kind === 'offcycle' && (
          <InlineAlert tone="info" title="An off-cycle run pays only what you add to it">
            It never changes the month's regular payslip and can run after the month is locked. Tax on it is the extra tax the payment adds for the year.
          </InlineAlert>
        )}
      </div>
    </Drawer>
  );
}

// ------------------------------------------------------------------------------------------ one run (PAY-02 … PAY-11)

export interface PayRunScreenProps {
  state: LoadState;
  onRetry?: () => void;
  run: PayRun | null;
  people: RunPerson[];
  readiness: RunReadiness | null;
  progress: RunProgressData | null;
  payslips: RunPayslip[] | null;
  variances: RunVariance[] | null;
  bankFiles: BankFileRow[] | null;
  published: boolean;
  /** What this person may do (from their grants; the API checks again). */
  can: { prepare: boolean; approve: boolean; bankGenerate: boolean; bankRelease: boolean; publish: boolean; offcycle: boolean };
  onBack: () => void;
  onWaive: (checkId: string, reason: string) => Promise<unknown>;
  onCalculate: () => Promise<unknown>;
  onPayslip: (id: string) => Promise<PayslipDetail>;
  onAck: (varianceId: string, note: string) => Promise<unknown>;
  onSubmit: (selfApprovalReason?: string) => Promise<unknown>;
  onDecide: (decision: 'approve' | 'reject', reason: string | null, confirmation: Confirmation) => Promise<unknown>;
  onVoid: (reason: string) => Promise<unknown>;
  onGenerateBank: (debitAccount: string, reason?: string) => Promise<BankFileMade>;
  onReleaseBank: (bankFileId: string, confirmation: Confirmation) => Promise<unknown>;
  onDownload: (fileId: string, name: string) => Promise<unknown>;
  onPublish: (confirmation: Confirmation) => Promise<unknown>;
  /** Off-cycle runs: add an item for a person (search by name). */
  onSearchPeople?: (q: string) => Promise<{ id: string; name: string; employeeCode?: string }[]>;
  /** Opens the run's payments (bank results, cash and cheque) once it is approved. */
  onPayments?: () => void;
  onAddItem?: (item: { employeeId: string; componentCode: string; amount: string; reason: string; label?: string }) => Promise<unknown>;
}

export function PayRunScreen(p: PayRunScreenProps) {
  const r = p.run;
  const [tab, setTab] = useState('checks');
  const nameOf = (id: string | null) => (id ? (p.people.find((x) => x.employeeId === id)?.name ?? 'Someone') : 'Everyone');
  useEffect(() => {
    if (!r) return;
    if (r.status === 'submitted') setTab('approval');
    else if (r.status === 'approved' || r.status === 'paid') setTab('bank');
    else if (r.status === 'calculated' || r.status === 'in_review') setTab('payslips');
  }, [r?.status]); // eslint-disable-line react-hooks/exhaustive-deps
  return (
    <LivePage
      title={r ? runName(r) : 'Payroll run'}
      description={r ? `${r.entityName ?? ''}${r.totals ? ` · ${r.totals.people} people · net ${rupees(r.totals.net)}` : ''}` : undefined}
      state={p.state}
      onRetry={p.onRetry}
      what="this payroll run"
      grantedBy="your payroll admin"
      actions={
        <>
          {p.onPayments && r && ['approved', 'paid'].includes(r.status) && (
            <Button size="sm" onClick={p.onPayments}>
              Payments
            </Button>
          )}
          <Button size="sm" onClick={p.onBack}>
            All runs
          </Button>
        </>
      }
    >
      {r && (
        <>
          <RunStageTrack current={stageOf(r.status, p.published)} complete={p.published} blocked={r.totals?.failed ? `${r.totals.failed} payslips failed to calculate` : undefined} />
          {r.status === 'void' && <InlineAlert tone="info" title="This run is void">{r.voidReason}</InlineAlert>}
          {r.status === 'calculating' && p.progress && <ProgressCard progress={p.progress} nameOf={nameOf} />}
          <Tabs value={tab} onValueChange={setTab}>
            <TabsList aria-label="Run steps">
              <TabsTrigger value="checks" count={p.readiness?.checks.filter((c) => c.severity === 'block' && !c.waived).length || undefined}>
                Checks
              </TabsTrigger>
              {r.runType === 'offcycle' && r.offcycleKind !== 'fnf' && <TabsTrigger value="items">Items</TabsTrigger>}
              <TabsTrigger value="payslips" count={p.payslips?.length || undefined}>
                Payslips
              </TabsTrigger>
              <TabsTrigger value="changes" count={p.variances?.filter((v) => !v.acknowledged).length || undefined}>
                Pay changes
              </TabsTrigger>
              <TabsTrigger value="approval">Approval</TabsTrigger>
              <TabsTrigger value="bank">Bank file</TabsTrigger>
              <TabsTrigger value="publish">Publish</TabsTrigger>
            </TabsList>
            <TabsContent value="checks">
              <ChecksTab {...p} nameOf={nameOf} />
            </TabsContent>
            {r.runType === 'offcycle' && (
              <TabsContent value="items">
                <ItemsTab {...p} nameOf={nameOf} />
              </TabsContent>
            )}
            <TabsContent value="payslips">
              <PayslipsTab {...p} nameOf={nameOf} />
            </TabsContent>
            <TabsContent value="changes">
              <ChangesTab {...p} nameOf={nameOf} />
            </TabsContent>
            <TabsContent value="approval">
              <ApprovalTab {...p} nameOf={nameOf} />
            </TabsContent>
            <TabsContent value="bank">
              <BankTab {...p} nameOf={nameOf} />
            </TabsContent>
            <TabsContent value="publish">
              <PublishTab {...p} nameOf={nameOf} />
            </TabsContent>
          </Tabs>
        </>
      )}
    </LivePage>
  );
}

function ProgressCard({ progress: g, nameOf }: { progress: RunProgressData; nameOf: (id: string) => string }) {
  const done = g.ok + g.failed + g.skipped;
  return (
    <Card title="Calculating">
      <p role="status" aria-live="polite">
        {done} of {g.total} people worked out{g.failed ? `, ${g.failed} failed` : ''}.
      </p>
      <progress className="yx-pay-progress" max={g.total || 1} value={done} aria-label="Calculation progress" />
      {g.failures.length > 0 && (
        <ul className="yx-tim-list">
          {g.failures.map((f) => (
            <li key={f.employeeId}>
              {nameOf(f.employeeId)}: {f.message}
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}

type TabProps = PayRunScreenProps & { nameOf: (id: string | null) => string };

function ChecksTab(p: TabProps) {
  const r = p.run!;
  const [waiving, setWaiving] = useState<RunCheck | null>(null);
  const { busy, error, run } = useRun();
  const checks = p.readiness?.checks ?? [];
  const blocking = checks.filter((c) => c.severity === 'block' && c.blocks === 'calculation' && !c.waived);
  const editable = ['draft', 'calculated', 'in_review', 'reopened'].includes(r.status);
  const SEV: Record<RunCheck['severity'], { label: string; tone: BadgeTone }> = { block: { label: 'Must fix', tone: 'danger' }, warn: { label: 'Check', tone: 'warning' }, info: { label: 'Note', tone: 'info' } };
  return (
    <div className="yx-tim-stack">
      {error && (
        <InlineAlert tone="danger" title="Not calculated">
          {error}
        </InlineAlert>
      )}
      {!p.readiness && <Skeleton height={160} />}
      {p.readiness && (
        <Card
          title={`${p.readiness.people} people · month ${p.readiness.period === 'open' ? 'open' : p.readiness.period}`}
          actions={
            editable &&
            p.can.prepare && (
              <Button variant="primary" loading={busy === 'calc'} disabled={blocking.length > 0} onClick={() => void run('calc', p.onCalculate)}>
                {r.calcVersion ? 'Calculate again' : 'Calculate'}
              </Button>
            )
          }
        >
          {blocking.length > 0 && (
            <InlineAlert tone="warning" title={`Fix or waive ${blocking.length} ${blocking.length === 1 ? 'check' : 'checks'} first`}>
              Waiving a missing bank account holds that person's net pay until it is added.
            </InlineAlert>
          )}
          {checks.length ? (
            <table className="yx-tim-table" aria-label="Checks before calculating">
              <thead>
                <tr>
                  <th scope="col">Check</th>
                  <th scope="col">Person</th>
                  <th scope="col">What to do</th>
                  <th scope="col">
                    <span className="yx-visually-hidden">Waive</span>
                  </th>
                </tr>
              </thead>
              <tbody>
                {checks.map((c) => (
                  <tr key={c.id}>
                    <td>
                      <Badge tone={c.waived ? 'neutral' : SEV[c.severity].tone}>{c.waived ? 'Waived' : SEV[c.severity].label}</Badge>
                    </td>
                    <td>{p.nameOf(c.employeeId)}</td>
                    <td className="yx-tim-note">
                      {c.message}
                      {c.waiverReason ? ` Waived: ${c.waiverReason}` : ''}
                    </td>
                    <td>
                      {c.severity === 'block' && c.waivable && !c.waived && editable && p.can.prepare && (
                        <Button size="sm" onClick={() => setWaiving(c)}>
                          Waive
                        </Button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : (
            <EmptyState compact title="Nothing to fix" description="Everyone has a salary, a bank account and their details." />
          )}
        </Card>
      )}
      {waiving && <ReasonDrawer title="Waive this check?" subtitle={waiving.message} label="Why" confirm="Waive" onClose={() => setWaiving(null)} onSave={(reason) => p.onWaive(waiving.id, reason)} />}
    </div>
  );
}

function ItemsTab(p: TabProps) {
  const r = p.run!;
  const [q, setQ] = useState('');
  const [hits, setHits] = useState<{ id: string; name: string; employeeCode?: string }[]>([]);
  const [who, setWho] = useState<{ id: string; name: string } | null>(null);
  const [code, setCode] = useState<string>(r.offcycleKind === 'bonus' ? 'bonus' : 'arrears');
  const [amount, setAmount] = useState('');
  const [reason, setReason] = useState('');
  const { busy, error, run } = useRun();
  const [done, setDone] = useState<string | null>(null);
  const editable = ['draft', 'calculated', 'in_review', 'reopened'].includes(r.status);
  const errors = [
    ...(!who ? [{ fieldId: 'it-who', message: 'Choose the person.' }] : []),
    ...(!/^\d{1,9}(\.\d{1,2})?$/.test(amount) || Number(amount) <= 0 ? [{ fieldId: 'it-amount', message: 'Enter an amount in rupees.' }] : []),
    ...(reason.trim().length < 3 ? [{ fieldId: 'it-why', message: 'Say what it is for.' }] : []),
  ];
  const save = useSaveErrors(errors);
  if (!editable || !p.can.offcycle || !p.onAddItem || !p.onSearchPeople) return <InlineAlert tone="info" title="Items are added while the run is a draft or in review." />;
  return (
    <Card title="Add an item to this run">
      <div className="yx-tim-form">
        <ErrorSummary errors={save.shownErrors} />
        {error && (
          <InlineAlert tone="danger" title="Not added">
            {error}
          </InlineAlert>
        )}
        {done && <InlineAlert tone="success" title={done} />}
        <FormField id="it-who" label="Person" required error={save.errorOf('it-who')} helper={who ? `Chosen: ${who.name}` : undefined}>
          <div className="yx-tim-row">
            <TextField value={q} onChange={setQ} placeholder="Name or code" aria-label="Find a person" />
            <Button onClick={() => void run('find', async () => setHits(await p.onSearchPeople!(q)))}>Search</Button>
          </div>
        </FormField>
        {hits.length > 0 && (
          <div className="yx-tim-row" role="list" aria-label="People found">
            {hits.map((h) => (
              <Button key={h.id} size="sm" variant={who?.id === h.id ? 'primary' : undefined} onClick={() => setWho(h)} role="listitem">
                {h.name}
                {h.employeeCode ? ` · ${h.employeeCode}` : ''}
              </Button>
            ))}
          </div>
        )}
        <FormField id="it-code" label="Component" helper="An earning or deduction from the component library, e.g. bonus.">
          <TextField value={code} onChange={setCode} />
        </FormField>
        <FormField id="it-amount" label="Amount" required error={save.errorOf('it-amount')}>
          <TextField value={amount} onChange={setAmount} prefix="₹" inputMode="decimal" />
        </FormField>
        <FormField id="it-why" label="What it is for" required error={save.errorOf('it-why')} helper="Shown on the payslip line.">
          <TextField value={reason} onChange={setReason} maxLength={200} />
        </FormField>
        <div>
          <Button
            variant="primary"
            loading={busy === 'add'}
            onClick={() => {
              if (errors.length) return save.reveal();
              void run('add', async () => {
                await p.onAddItem!({ employeeId: who!.id, componentCode: code.trim(), amount, reason: reason.trim(), label: reason.trim() });
                setDone(`Added for ${who!.name}. Calculate the run again to include it.`);
                setAmount('');
                setReason('');
              });
            }}
          >
            Add item
          </Button>
        </div>
      </div>
    </Card>
  );
}

function PayslipsTab(p: TabProps) {
  const [open, setOpen] = useState<string | null>(null);
  if (!p.payslips) return <Skeleton height={200} />;
  if (!p.payslips.length) return <EmptyState compact title="No payslips yet" description="Calculate the run to make the draft payslips." />;
  return (
    <>
      <table className="yx-tim-table" aria-label="Payslips">
        <thead>
          <tr>
            <th scope="col">Person</th>
            <th scope="col">Gross</th>
            <th scope="col">Deductions</th>
            <th scope="col">Net pay</th>
            <th scope="col">Notes</th>
            <th scope="col">
              <span className="yx-visually-hidden">Open</span>
            </th>
          </tr>
        </thead>
        <tbody>
          {p.payslips.map((s) => (
            <tr key={s.id}>
              <th scope="row">{p.nameOf(s.employeeId)}</th>
              <td>{rupees(s.gross)}</td>
              <td>{rupees(s.deductions)}</td>
              <td>{rupees(s.net)}</td>
              <td>
                {s.held && <Badge tone="warning">Net pay held</Badge>} {s.verify && <Badge tone="info">Rule marked verify</Badge>}
              </td>
              <td>
                <Button size="sm" onClick={() => setOpen(s.id)} aria-label={`Why these numbers for ${p.nameOf(s.employeeId)}`}>
                  Why these numbers
                </Button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      {open && <PayslipDrawer id={open} name={p.nameOf(p.payslips.find((s) => s.id === open)?.employeeId ?? null)} onLoad={p.onPayslip} onClose={() => setOpen(null)} />}
    </>
  );
}

/** Every line of a payslip with its explanation and the rule it cites (YX-PAY-12). */
export function PayslipLines({ lines }: { lines: PayslipLine[] }) {
  const groups: [PayslipLine['kind'], string][] = [
    ['earning', 'Earnings'],
    ['deduction', 'Deductions'],
    ['reimbursement', 'Reimbursements'],
    ['employer', 'Paid by the company (not in net pay)'],
    ['info', 'Notes'],
  ];
  return (
    <div className="yx-tim-stack">
      {groups.map(([k, title]) => {
        const ls = lines.filter((l) => l.kind === k);
        if (!ls.length) return null;
        return (
          <section key={k} aria-label={title}>
            <h3 className="yx-pay-section-title">{title}</h3>
            <table className="yx-tim-table" aria-label={title}>
              <tbody>
                {ls.map((l, i) => (
                  <tr key={`${l.code}-${i}`}>
                    <th scope="row">{l.name}</th>
                    <td className="yx-tim-note">
                      {l.explanation}
                      {l.rule ? ` (${l.rule.statute} ${l.rule.jurisdiction} ${l.rule.version}${l.verify ? ', verify' : ''})` : ''}
                    </td>
                    <td>{rupees(l.amount)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </section>
        );
      })}
    </div>
  );
}

function PayslipDrawer({ id, name, onLoad, onClose }: { id: string; name: string; onLoad: (id: string) => Promise<PayslipDetail>; onClose: () => void }) {
  const [d, setD] = useState<PayslipDetail | null>(null);
  const { busy, error, run } = useRun();
  useEffect(() => {
    void run('load', async () => setD(await onLoad(id)));
  }, [id]); // eslint-disable-line react-hooks/exhaustive-deps
  return (
    <Drawer open onOpenChange={(o) => !o && onClose()} title={`${name}: why these numbers`} subtitle={d ? `Net pay ${rupees(d.net)}` : undefined} size="lg" footer={<Button onClick={onClose}>Close</Button>}>
      {busy && <Skeleton height={200} />}
      {error && (
        <InlineAlert tone="danger" title="Not loaded">
          {error}
        </InlineAlert>
      )}
      {d && <PayslipLines lines={d.lines} />}
    </Drawer>
  );
}

function ChangesTab(p: TabProps) {
  const [acking, setAcking] = useState<RunVariance | null>(null);
  if (!p.variances) return <Skeleton height={160} />;
  if (!p.variances.length) return <EmptyState compact title="No unusual pay changes" description="Net pay changes above the company's limit, and components added or removed since last month, show here." />;
  return (
    <>
      <table className="yx-tim-table" aria-label="Pay changes to confirm">
        <thead>
          <tr>
            <th scope="col">Person</th>
            <th scope="col">Change</th>
            <th scope="col">Status</th>
            <th scope="col">
              <span className="yx-visually-hidden">Confirm</span>
            </th>
          </tr>
        </thead>
        <tbody>
          {p.variances.map((v) => (
            <tr key={v.id}>
              <th scope="row">{p.nameOf(v.employeeId)}</th>
              <td className="yx-tim-note">{v.detail}</td>
              <td>{v.acknowledged ? <Badge tone="success">Confirmed</Badge> : <Badge tone="warning">To confirm</Badge>}</td>
              <td>
                {!v.acknowledged && p.can.prepare && (
                  <Button size="sm" onClick={() => setAcking(v)}>
                    Confirm
                  </Button>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      {acking && <ReasonDrawer title="Confirm this change?" subtitle={acking.detail} label="Note" optional confirm="Confirm" onClose={() => setAcking(null)} onSave={(note) => p.onAck(acking.id, note)} />}
    </>
  );
}

function ApprovalTab(p: TabProps) {
  const r = p.run!;
  const { busy, error, run } = useRun();
  const [deciding, setDeciding] = useState<'approve' | 'reject' | null>(null);
  const [selfReason, setSelfReason] = useState('');
  const [needSelf, setNeedSelf] = useState(false);
  const [voiding, setVoiding] = useState(false);
  const net = r.totals ? rupees(r.totals.net) : '';
  return (
    <div className="yx-tim-stack">
      {error && (
        <InlineAlert tone="danger" title="This didn't go through">
          {error}
        </InlineAlert>
      )}
      {(r.status === 'calculated' || r.status === 'in_review') && p.can.prepare && (
        <Card title="Send for approval">
          <p className="yx-tim-note">Someone other than you approves it, with a fresh second sign-in step. Pay changes must be confirmed first.</p>
          {needSelf && (
            <FormField id="ap-self" label="Why you approve it yourself" helper="Nobody else can approve this payroll; the System Admins are told.">
              <TextArea value={selfReason} onChange={setSelfReason} rows={2} />
            </FormField>
          )}
          <div className="yx-tim-row">
            <Button
              variant="primary"
              loading={busy === 'submit'}
              onClick={() =>
                void run('submit', async () => {
                  try {
                    await p.onSubmit(needSelf ? selfReason.trim() : undefined);
                  } catch (e) {
                    if ((e as { code?: string }).code === 'SELF_APPROVAL_REASON') setNeedSelf(true);
                    throw e;
                  }
                })
              }
            >
              Send for approval
            </Button>
            <Button onClick={() => setVoiding(true)}>Void run</Button>
          </div>
        </Card>
      )}
      {r.status === 'submitted' && (
        <Card title={`Waiting for approval${r.approval ? ` · step ${r.approval.step} of ${r.approval.steps}` : ''}`}>
          {r.approval?.canDecide ? (
            <div className="yx-tim-row">
              <Button variant="approve" onClick={() => setDeciding('approve')}>
                Approve and lock
              </Button>
              <Button onClick={() => setDeciding('reject')}>Send back</Button>
            </div>
          ) : (
            <p className="yx-tim-note">{r.preparedByMe ? 'You prepared this run, so someone else approves it.' : 'It is with the next approver.'}</p>
          )}
        </Card>
      )}
      {(r.status === 'approved' || r.status === 'paid') && (
        <InlineAlert tone="success" title="Approved and locked">
          The month's attendance and pay are locked. Changes after this are paid in the next payroll.
        </InlineAlert>
      )}
      {r.status === 'draft' && <InlineAlert tone="info" title="Calculate the run first" />}
      {deciding === 'approve' && r.approval && (
        <IrreversibleSheet
          open
          onOpenChange={(o) => !o && setDeciding(null)}
          title={`Approve and lock ${monthText(r.month)}`}
          subtitle={r.entityName}
          impact={[
            { label: 'People', value: String(r.totals?.people ?? '') },
            { label: 'Net pay', value: net },
            { label: 'Month', value: monthText(r.month) },
          ]}
          cannotUndo="The payslips are approved and the month's attendance and pay are locked."
          correction="Anything found later is paid as a correction in the next payroll, or the month is reopened with two approvals."
          phrase={r.approval.phrase}
          maker="preparer"
          checker="you"
          confirmLabel="Approve and lock"
          error={error}
          onConfirm={() =>
            void run('decide', async () => {
              await p.onDecide('approve', null, { phrase: r.approval!.phrase, impact: [{ label: 'Net pay', value: net }] });
              setDeciding(null);
            })
          }
        />
      )}
      {deciding === 'reject' && <ReasonDrawer title="Send this run back?" label="What to change" confirm="Send back" onClose={() => setDeciding(null)} onSave={(reason) => p.onDecide('reject', reason, { phrase: '', impact: [] })} />}
      {voiding && <ReasonDrawer title="Void this run?" subtitle="Its draft payslips are kept and marked void." label="Why" confirm="Void run" onClose={() => setVoiding(false)} onSave={(reason) => p.onVoid(reason)} />}
    </div>
  );
}

function BankTab(p: TabProps) {
  const r = p.run!;
  const [debit, setDebit] = useState('');
  const [reason, setReason] = useState('');
  const [made, setMade] = useState<BankFileMade | null>(null);
  const [releasing, setReleasing] = useState<BankFileRow | null>(null);
  const { busy, error, run } = useRun();
  const again = (p.bankFiles?.length ?? 0) > 0;
  const errors = [...(!/^\d{6,20}$/.test(debit) ? [{ fieldId: 'bk-debit', message: 'Enter the account the bank debits (6 to 20 digits).' }] : []), ...(again && reason.trim().length < 5 ? [{ fieldId: 'bk-why', message: 'Say why a new file is needed.' }] : [])];
  const save = useSaveErrors(errors);
  if (r.status !== 'approved' && r.status !== 'paid') return <InlineAlert tone="info" title="The bank file is made once the run is approved." />;
  return (
    <div className="yx-tim-stack">
      {error && (
        <InlineAlert tone="danger" title="This didn't go through">
          {error}
        </InlineAlert>
      )}
      {p.can.bankGenerate && (
        <Card title={again ? 'Make a new bank file' : 'Make the bank file'}>
          <div className="yx-tim-form">
            <ErrorSummary errors={save.shownErrors} />
            <FormField id="bk-debit" label="Company account the bank debits" required error={save.errorOf('bk-debit')} helper="Only its last four digits are kept outside the file.">
              <TextField value={debit} onChange={setDebit} inputMode="numeric" autoComplete="off" />
            </FormField>
            {again && (
              <FormField id="bk-why" label="Why a new file" required error={save.errorOf('bk-why')}>
                <TextField value={reason} onChange={setReason} />
              </FormField>
            )}
            <div>
              <Button
                variant="primary"
                loading={busy === 'make'}
                onClick={() => {
                  if (errors.length) return save.reveal();
                  void run('make', async () => setMade(await p.onGenerateBank(debit, again ? reason.trim() : undefined)));
                }}
              >
                Make bank file
              </Button>
            </div>
            {made && (
              <InlineAlert tone="success" title={`Bank file made: ${made.rows} payments, ${rupees(made.total)}`}>
                {made.excluded.length ? `Not in the file: ${made.excluded.map((x) => `${p.nameOf(x.employeeId)} (${x.reason})`).join('; ')}` : 'Everyone waiting to be paid by bank is in it.'} Someone else releases it.
              </InlineAlert>
            )}
          </div>
        </Card>
      )}
      {p.bankFiles && p.bankFiles.length > 0 && (
        <Card title="Bank files">
          <table className="yx-tim-table" aria-label="Bank files">
            <thead>
              <tr>
                <th scope="col">File</th>
                <th scope="col">Payments</th>
                <th scope="col">Total</th>
                <th scope="col">Status</th>
                <th scope="col">
                  <span className="yx-visually-hidden">Actions</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {p.bankFiles.map((b) => (
                <tr key={b.id}>
                  <th scope="row">
                    #{b.generationNo} · {b.format} · debit {b.debitAccount}
                  </th>
                  <td>{b.rows}</td>
                  <td>{rupees(b.total)}</td>
                  <td>
                    <Badge tone={b.status === 'released' ? 'success' : b.status === 'superseded' ? 'neutral' : 'warning'}>{b.status === 'released' ? 'Released' : b.status === 'superseded' ? 'Replaced' : 'Waiting for release'}</Badge>
                  </td>
                  <td>
                    <div className="yx-tim-row">
                      {b.status === 'generated' && p.can.bankRelease && !b.madeByMe && (
                        <Button size="sm" variant="primary" onClick={() => setReleasing(b)}>
                          Release
                        </Button>
                      )}
                      {b.status === 'generated' && b.madeByMe && <span className="yx-tim-note">Someone else releases it</span>}
                      {b.status === 'released' && (
                        <Button size="sm" loading={busy === `dl-${b.id}`} onClick={() => void run(`dl-${b.id}`, () => p.onDownload(b.fileId, `bank-file-${r.month}-${b.generationNo}`))}>
                          Download
                        </Button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      )}
      {releasing && (
        <IrreversibleSheet
          open
          onOpenChange={(o) => !o && setReleasing(null)}
          title={`Release bank file #${releasing.generationNo}`}
          subtitle={`${releasing.rows} payments · ${rupees(releasing.total)}`}
          impact={[
            { label: 'Payments', value: String(releasing.rows) },
            { label: 'Total', value: rupees(releasing.total) },
            { label: 'Fingerprint (SHA-256)', value: releasing.sha256.slice(0, 16) },
          ]}
          cannotUndo="The file can be downloaded and sent to the bank. Its fingerprint is checked again first."
          correction="A failed payment is paid again from the payment results; a wrong file is replaced by a new one with a reason."
          phrase={releasing.releasePhrase}
          maker="the person who made it"
          checker="you"
          confirmLabel="Release file"
          confirmVariant="primary"
          error={error}
          onConfirm={() =>
            void run('release', async () => {
              await p.onReleaseBank(releasing.id, { phrase: releasing.releasePhrase, impact: [{ label: 'Total', value: rupees(releasing.total) }] });
              setReleasing(null);
            })
          }
        />
      )}
    </div>
  );
}

function PublishTab(p: TabProps) {
  const r = p.run!;
  const [open, setOpen] = useState(false);
  const { error, run } = useRun();
  const count = p.payslips?.filter((s) => s.status === 'approved').length ?? 0;
  const phrase = `PUBLISH ${count}`;
  if (r.status !== 'approved' && r.status !== 'paid') return <InlineAlert tone="info" title="Payslips are published once the run is approved." />;
  if (p.published) return <InlineAlert tone="success" title="Payslips published">Employees see them under Me › Payslips.</InlineAlert>;
  return (
    <Card title="Publish payslips">
      <p className="yx-tim-note">Employees are told in the app; an email (if the company turned it on) has a link, never the figures.</p>
      {p.can.publish && (
        <Button variant="primary" onClick={() => setOpen(true)} disabled={!count}>
          Publish {count} payslips
        </Button>
      )}
      {open && (
        <IrreversibleSheet
          open
          onOpenChange={setOpen}
          title={`Publish ${count} payslips`}
          subtitle={runName(r)}
          impact={[
            { label: 'Payslips', value: String(count) },
            { label: 'Month', value: monthText(r.month) },
          ]}
          cannotUndo="Employees can see and download their payslips."
          correction="A wrong payslip is corrected by a revised one in an off-cycle or the next payroll."
          phrase={phrase}
          maker="preparer"
          checker="you"
          confirmLabel="Publish payslips"
          error={error}
          onConfirm={() =>
            void run('publish', async () => {
              await p.onPublish({ phrase, impact: [{ label: 'Payslips', value: String(count) }] });
              setOpen(false);
            })
          }
        />
      )}
    </Card>
  );
}

/** A short reason (or note) in a drawer; the save errors show only after trying to save. */
export function ReasonDrawer({ title, subtitle, label, confirm, optional, onClose, onSave }: { title: string; subtitle?: string; label: string; confirm: string; optional?: boolean; onClose: () => void; onSave: (text: string) => Promise<unknown> }) {
  const [text, setText] = useState('');
  const { busy, error, run } = useRun();
  const errors = !optional && text.trim().length < 5 ? [{ fieldId: 'rd-text', message: `${label}: at least 5 letters.` }] : [];
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
                await onSave(text.trim());
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
        {error && (
          <InlineAlert tone="danger" title="This didn't go through">
            {error}
          </InlineAlert>
        )}
        <FormField id="rd-text" label={label} required={!optional} optional={optional} error={save.errorOf('rd-text')}>
          <TextArea value={text} onChange={setText} rows={3} maxLength={500} />
        </FormField>
      </div>
    </Drawer>
  );
}
