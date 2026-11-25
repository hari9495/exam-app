// PAY-02 / 03 / 07 / 08 / 09 · Run workspace, live: the designed RunWorkspaceScreen (payroll-run.tsx) with one real run.
// Same header, stage track, tabs, tables and sheets as the stories: checks and waivers (Validations), calculation
// progress, payslips with "why this number", pay changes to acknowledge (Variance), sending for approval, the approver's
// typed phrase, the bank file (made by one person, released by another) and publishing. The API checks every action
// again (keys, entities, maker ≠ checker, step-up).
import { SpecialDaysCard, type RunSpecialDays, type SpecialDaysInput } from './special-days-card';
import { useEffect, useMemo, useState } from 'react';
import { AlertCircle, AlertTriangle, CheckCircle2, Download, FileText, Landmark, Lock, Play, Send } from 'lucide-react';
import { Button } from '../../components/button';
import { Badge, type BadgeTone } from '../../components/display';
import { Drawer } from '../../components/drawer';
import { EmptyState, InlineAlert, NoAccessState } from '../../components/feedback';
import { FormField, useTooEarly } from '../../components/field';
import { Icon } from '../../components/foundations';
import { TextArea, TextField } from '../../components/inputs';
import { MenuItem } from '../../components/menu';
import { useToast } from '../../components/notify';
import { Dialog } from '../../components/overlay';
import { Segment } from '../../components/segment';
import { DescriptionList, ObjectHeader, Tabs, TabsContent, TabsList, TabsTrigger } from '../../components/shell';
import { PlainTable } from '../../components/plain-table';
import { DataTable, type TableColumn } from '../../components/table';
import { FilterBar } from '../../components/filters';
import { ApprovalTimeline, type ApprovalStep } from '../../components/timeline';
import { formatDate, formatINR } from '../../lib/format';
import type { FilterValue } from '../../lib/table';
import { useRun } from '../org/org-kit';
import { AttendanceGroupsPanel, FrequencyRunSteps, type AttendanceGroup } from './payroll-run';
import { FactRow, RunProgress, RunStageTrack, SectionTitle, StateBlock, WhyThisNumber, type ExplainedLine, type RunStage } from './pay-kit';
import { IrreversibleSheet } from '../../components/irreversible';
import { RunStatusBadge, rupees, runName } from './live/runs';
import type { Confirmation, LoadState } from './live/types';
import type { BankFileMade, BankFileRow, FilingRow, PayRun, PayslipDetail, PayslipLine, RunCheck, RunPayslip, RunPerson, RunProgressData, RunReadiness, RunVariance } from './live/types-5j';

/** What /yx/payroll/runs/[id] passes to the designed run workspace. */
export interface LiveRunWorkspaceData {
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
  /** selfApprovalReason: only when the viewer is the sole payroll admin (run.publishAlone, PAY-09). */
  onPublish: (confirmation: Confirmation, selfApprovalReason?: string) => Promise<unknown>;
  /** Off-cycle runs: add an item for a person (search by name). */
  onSearchPeople?: (q: string) => Promise<{ id: string; name: string; employeeCode?: string }[]>;
  /** Opens the run's payments (bank results, cash and cheque, journal) once it is approved. */
  onPayments?: () => void;
  onAddItem?: (item: { employeeId: string; componentCode: string; amount: string; reason: string; label?: string }) => Promise<unknown>;
  /** PAY-03 Inputs tab: what feeds the run, per source (GET runs/:id/input-sources). */
  inputSources?: RunInputSources | null;
  /** HLP-12 answers 92, 93: special days per person with their source, and late injury leave to review. */
  specialDays?: RunSpecialDays | null;
  /** Saves payroll's own value for a person's special days in the run's month (payroll.input.manage). */
  onSaveSpecialDays?: (input: SpecialDaysInput) => Promise<unknown>;
  /** Answer 121: late injury leave not paid in this run (reason required), and its undo while the run is open. */
  onNotPaid?: (correctionId: string, reason: string) => Promise<unknown>;
  onUndoNotPaid?: (correctionId: string) => Promise<unknown>;
  /** PAY-03 "Failed": calculates again only the people whose last calculation failed (payroll.run.prepare). */
  onRetryFailed?: () => Promise<unknown>;
  /** PAY-11 off-cycle run: the design's own title, line and badge in place of the run's. */
  heading?: { name: string; secondary: string; status?: React.ReactNode };
  /** PAY-11: the off-cycle run's own part (settlement lines, deadline, payees), above the tabs. */
  lead?: React.ReactNode;
  /** PAY-03 Files tab: the run's journal (GET runs/:id/journal; null without payroll.journal.export). */
  journal?: { lines: unknown[]; postedAt: string | null; canPost: boolean } | null;
  /** PAY-03 Files tab: the month's statutory files of the run's entity (GET statutory/filings; null without statutory.filing.view). */
  filings?: FilingRow[] | null;
  /** Opens the journal export (the payments page, Journal tab). */
  onJournal?: () => void;
  /** Opens the statutory hub for the run's month. */
  onStatutory?: () => void;
  /** PAY-02: opens the manual LOP input for assumed-present groups. */
  onLopInput?: () => void;
}

/** GET /payroll/runs/:id/input-sources: per source, the people it touches and its days or amount. */
export interface RunInputSources {
  runId: string;
  people: number;
  sources: { key: string; label: string; people: number; days: string | null; amount: string | null; note: string | null }[];
}

type Tab = 'inputs' | 'payslips' | 'variance' | 'validations' | 'approvals' | 'files';
const EDITABLE = ['draft', 'calculated', 'in_review', 'reopened'];
const LOCKED = ['approved', 'paid'];
const monthLong = (m: string) => new Date(`${m}-01T00:00:00Z`).toLocaleDateString('en-GB', { month: 'long', year: 'numeric', timeZone: 'UTC' });
const money = (v: string | null | undefined) => (v == null ? '—' : formatINR(Number(v)));
const count = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;
const stageOf = (s: PayRun['status'], published: boolean): RunStage =>
  published ? 'Published' : s === 'paid' ? 'Paid' : s === 'approved' ? 'Approved and locked' : s === 'submitted' || s === 'in_review' ? 'In review' : s === 'calculated' ? 'Calculated' : 'Draft';
const errText = (e: unknown) => (e instanceof Error && e.message ? e.message : 'That did not go through. Nothing has changed.');

/** A payslip line as the design's "why this number" line; notes (info lines) are listed apart. */
export const explained = (l: PayslipLine, i: number): ExplainedLine => ({
  id: `${l.code}-${i}`,
  label: l.name,
  amount: Number(l.amount),
  kind: l.kind === 'deduction' ? 'deduction' : l.kind === 'employer' ? 'employer' : 'earning',
  formula: l.quantity && l.rate ? `${l.quantity} × ${rupees(l.rate)}` : undefined,
  inputs: l.explanation,
  rule: l.rule ? `${l.rule.statute} ${l.rule.jurisdiction} ${l.rule.version}${l.rule.verify || l.verify ? ', verify' : ''}` : undefined,
});

export function LiveRunWorkspace({ live: p }: { live: LiveRunWorkspaceData }) {
  const r = p.run;
  const { toast } = useToast();
  const say = (title: string, tone: 'success' | 'default' | 'error' = 'success') => toast({ title, tone });
  const [tab, setTab] = useState<Tab>('validations');
  const [sheet, setSheet] = useState<'approve' | 'release' | 'publish' | 'bank' | 'void' | 'reject' | 'self' | null>(null);
  const [releasing, setReleasing] = useState<BankFileRow | null>(null);
  const [made, setMade] = useState<BankFileMade | null>(null);
  const { busy, error, run, clearError } = useRun();
  const nameOf = (id: string | null) => (id ? (p.people.find((x) => x.employeeId === id)?.name ?? 'Someone') : 'Everyone');
  const codeOf = (id: string) => p.people.find((x) => x.employeeId === id)?.employeeCode ?? '';
  // Open the step the run is at: approval while it waits, files once approved, payslips once calculated.
  useEffect(() => {
    if (!r) return;
    if (r.status === 'submitted') setTab('approvals');
    else if (LOCKED.includes(r.status)) setTab('files');
    else if (r.status === 'calculated' || r.status === 'in_review') setTab('payslips');
    else setTab('validations');
  }, [r?.status]); // eslint-disable-line react-hooks/exhaustive-deps

  if (p.state === 'no-access')
    return (
      <div className="yx-auth__page yx-pay-stack">
        <ObjectHeader name="Payroll run" icon={FileText} />
        <NoAccessState grantedBy="your payroll admin" what="this payroll run" />
      </div>
    );

  const checks = p.readiness?.checks ?? [];
  const calcBlocks = checks.filter((c) => c.severity === 'block' && c.blocks === 'calculation' && !c.waived);
  const unacked = (p.variances ?? []).filter((v) => !v.acknowledged);
  const editable = !!r && EDITABLE.includes(r.status);
  const locked = !!r && LOCKED.includes(r.status);
  const held = (p.payslips ?? []).filter((s) => s.held).length;
  const toPublish = (p.payslips ?? []).filter((s) => s.status === 'approved').length;
  const waiting = (p.bankFiles ?? []).find((b) => b.status === 'generated');
  const net = r?.totals ? money(r.totals.net) : '';
  const month = r ? monthLong(r.month) : '';

  const calculate = () => {
    if (calcBlocks.length) {
      setTab('validations');
      return say(`Fix or waive ${count(calcBlocks.length, 'check')} first.`, 'default');
    }
    void run('calc', p.onCalculate).then((ok) => (ok ? say(`Calculating ${month}`) : undefined));
  };
  const retryFailed = () => {
    const n = p.progress?.failed ?? 0;
    void run('retry', async () => {
      try {
        await p.onRetryFailed!();
        say(`Calculating ${count(n, 'failed person', 'failed people')} again`);
      } catch (e) {
        say(errText(e), 'error');
        throw e;
      }
    });
  };
  const submit = (selfApprovalReason?: string) =>
    run('submit', async () => {
      try {
        await p.onSubmit(selfApprovalReason);
        say('Sent for approval');
        setSheet(null);
      } catch (e) {
        if ((e as { code?: string }).code === 'SELF_APPROVAL_REASON') setSheet('self');
        else say(errText(e), 'error');
        throw e;
      }
    });
  const pressSubmit = () => {
    if (unacked.length) {
      setTab('variance');
      return say(`Acknowledge ${count(unacked.length, 'pay change')} first.`, 'default');
    }
    void submit();
  };
  const pressPublish = () => (toPublish ? setSheet('publish') : say('No approved payslips to publish.', 'default'));
  const open = (s: typeof sheet) => {
    clearError();
    setSheet(s);
  };

  const headerAction = !r ? null : (editable && (r.status === 'draft' || r.status === 'reopened') && p.can.prepare) ? (
    <Button variant="primary" icon={Play} loading={busy === 'calc'} onClick={calculate}>
      Calculate
    </Button>
  ) : (r.status === 'calculated' || r.status === 'in_review') && p.can.prepare ? (
    <>
      {unacked.length > 0 && (
        <Button size="sm" onClick={() => setTab('variance')}>
          {count(unacked.length, 'pay change')} to acknowledge
        </Button>
      )}
      <Button variant="primary" icon={Send} loading={busy === 'submit'} onClick={pressSubmit}>
        Submit for approval
      </Button>
    </>
  ) : r.status === 'submitted' && r.approval?.canDecide ? (
    <>
      <Button onClick={() => open('reject')}>Send back</Button>
      <Button variant="approve" icon={Lock} onClick={() => open('approve')}>
        Approve and lock
      </Button>
    </>
  ) : locked ? (
    <>
      {waiting && p.can.bankRelease && !waiting.madeByMe ? (
        <Button variant="primary" icon={Landmark} onClick={() => (clearError(), setReleasing(waiting))}>
          Release bank file
        </Button>
      ) : !p.bankFiles?.length && p.can.bankGenerate ? (
        <Button variant="primary" icon={Landmark} onClick={() => open('bank')}>
          Make bank file
        </Button>
      ) : null}
      {!p.published && p.can.publish && (
        <Button variant="primary" icon={Send} onClick={pressPublish}>
          Publish payslips
        </Button>
      )}
    </>
  ) : null;

  const steps: ApprovalStep[] = r
    ? [
        { id: 'prep', label: 'Prepared', status: r.status === 'submitted' || locked ? 'done' : editable && r.status !== 'draft' ? 'current' : 'pending' },
        { id: 'appr', label: r.approval ? `Approval, step ${r.approval.step} of ${r.approval.steps}` : 'Approval', status: r.status === 'submitted' ? 'current' : locked ? 'done' : 'pending', at: r.approvedAt ? new Date(r.approvedAt) : undefined },
        { id: 'lock', label: 'Period locked', status: locked ? 'done' : 'pending', at: r.approvedAt ? new Date(r.approvedAt) : undefined },
      ]
    : [];

  return (
    <div className="yx-auth__page yx-pay-stack">
      <ObjectHeader
        name={p.heading?.name ?? (r ? runName(r) : 'Payroll run')}
        icon={FileText}
        secondary={p.heading?.secondary ?? (r ? `${r.entityName ?? ''}${r.calcVersion ? ` · Calculation ${r.calcVersion}` : ''}` : undefined)}
        status={
          r ? (
            <>
              <RunStatusBadge status={r.status} />
              {locked && <Badge tone="neutral">Period locked</Badge>}
              {p.heading?.status}
            </>
          ) : undefined
        }
        facts={
          r && p.state === 'ready'
            ? [
                { label: 'Employees', value: r.totals ? String(r.totals.people) : '—' },
                { label: 'Gross', value: money(r.totals?.gross) },
                { label: 'Net pay', value: money(r.totals?.net) },
                { label: 'Cost to company', value: money(r.totals?.employerCost) },
                { label: 'Held', value: count(held, 'payslip') },
              ]
            : undefined
        }
        actions={
          p.state === 'ready' && r ? (
            <>
              <Button size="sm" onClick={p.onBack}>
                All runs
              </Button>
              {headerAction}
            </>
          ) : undefined
        }
        menu={
          p.state === 'ready' && r ? (
            <>
              {locked && p.onPayments && <MenuItem onSelect={p.onPayments}>Payments</MenuItem>}
              {(r.status === 'calculated' || r.status === 'in_review') && p.can.prepare && <MenuItem onSelect={calculate}>Calculate again</MenuItem>}
              {locked && p.can.bankGenerate && !!p.bankFiles?.length && <MenuItem onSelect={() => open('bank')}>Make a new bank file</MenuItem>}
              {editable && p.can.prepare && (
                <MenuItem destructive onSelect={() => open('void')}>
                  Void run
                </MenuItem>
              )}
            </>
          ) : undefined
        }
      />
      <StateBlock state={p.state === 'error' ? 'error' : p.state === 'loading' || !r ? 'loading' : 'ready'} rows={10} errorTitle="We couldn't load this pay run." onRetry={p.onRetry}>
        {r && (
          <>
            <RunStageTrack current={stageOf(r.status, p.published)} complete={p.published} blocked={r.totals?.failed ? `${count(r.totals.failed, 'payslip')} failed` : undefined} />
            {p.lead}
            {r.status === 'void' && (
              <InlineAlert tone="info" title="This run is void">
                {r.voidReason}
              </InlineAlert>
            )}
            {r.status === 'calculating' && p.progress && (
              <RunProgress
                action="Calculating payslips"
                done={p.progress.ok + p.progress.skipped}
                total={p.progress.total}
                failures={p.progress.failures.map((f) => ({ employee: nameOf(f.employeeId), code: codeOf(f.employeeId), record: 'Payslip', field: f.field ? `${f.field}: ${f.message}` : f.message, fix: 'See the check' }))}
                onFix={() => setTab('validations')}
              />
            )}
            {r.status === 'draft' && !!r.totals?.failed && p.progress && p.progress.failed > 0 && (
              <RunProgress
                action="Calculating payslips"
                finished
                done={p.progress.ok + p.progress.skipped}
                total={p.progress.total}
                failures={p.progress.failures.map((f) => ({ employee: nameOf(f.employeeId), code: codeOf(f.employeeId) || f.employeeId, record: 'Payslip', field: f.field ? `${f.field}: ${f.message}` : f.message, fix: 'See the check' }))}
                onFix={() => setTab('validations')}
                onRetryFailed={p.can.prepare && p.onRetryFailed ? retryFailed : undefined}
              />
            )}
            {!!made?.excluded.length && (
              <InlineAlert tone="warning" title="Not in the bank file" actions={<Button size="sm" onClick={() => setMade(null)}>Dismiss</Button>}>
                {made.excluded.map((x) => `${nameOf(x.employeeId)} (${x.reason})`).join('; ')}.
              </InlineAlert>
            )}
            <Tabs value={tab} onValueChange={(v) => setTab(v as Tab)}>
              <TabsList aria-label="Run sections">
                <TabsTrigger value="inputs">Inputs</TabsTrigger>
                <TabsTrigger value="payslips" count={p.payslips?.length || undefined}>
                  Payslips
                </TabsTrigger>
                <TabsTrigger value="variance" count={unacked.length || undefined}>
                  Variance
                </TabsTrigger>
                <TabsTrigger value="validations" count={calcBlocks.length || undefined}>
                  Validations
                </TabsTrigger>
                <TabsTrigger value="approvals">Approvals</TabsTrigger>
                <TabsTrigger value="files">Files</TabsTrigger>
              </TabsList>
              <TabsContent value="inputs">
                <InputsPanel p={p} run={r} editable={editable} />
              </TabsContent>
              <TabsContent value="payslips">
                <PayslipsPanel p={p} nameOf={nameOf} codeOf={codeOf} />
              </TabsContent>
              <TabsContent value="variance">
                <VariancePanel p={p} nameOf={nameOf} />
              </TabsContent>
              <TabsContent value="validations">
                <ValidationsPanel p={p} checks={checks} calcBlocks={calcBlocks} editable={editable} nameOf={nameOf} />
              </TabsContent>
              <TabsContent value="approvals">
                <div className="yx-pay-stack">
                  {r.status === 'draft' && <InlineAlert tone="info" title="Calculate the run first" />}
                  {r.status === 'submitted' && !r.approval?.canDecide && (
                    <InlineAlert tone="info" title="Waiting for approval">
                      {r.preparedByMe ? 'You prepared this run, so someone else approves it.' : 'It is with the next approver.'}
                    </InlineAlert>
                  )}
                  {locked && (
                    <InlineAlert tone="info" title="Approved and locked">
                      The month's attendance and pay are locked. Changes after this are paid in the next payroll.
                    </InlineAlert>
                  )}
                  <div className="yx-pay-split">
                    <ApprovalTimeline steps={steps} />
                    <DescriptionList
                      items={[
                        { label: 'Maker ≠ checker', value: 'Someone other than the preparer approves, with a fresh second sign-in step' },
                        { label: 'Before sending', value: 'Every pay change is acknowledged' },
                        { label: 'Lock on approval', value: `Attendance and pay for ${month} lock with the run` },
                      ]}
                    />
                  </div>
                </div>
              </TabsContent>
              <TabsContent value="files">
                <FilesPanel p={p} run={r} onRelease={(b) => (clearError(), setReleasing(b))} onMake={() => open('bank')} onPublish={pressPublish} />
              </TabsContent>
            </Tabs>
          </>
        )}
      </StateBlock>

      {r && sheet === 'approve' && r.approval && (
        <IrreversibleSheet
          open
          onOpenChange={(o) => !o && setSheet(null)}
          title={`Approve and lock ${month}`}
          subtitle={runName(r)}
          impact={[
            { label: 'Payslips', value: String(r.totals?.people ?? '—') },
            { label: 'Net pay', value: net },
            { label: 'Cost to company', value: money(r.totals?.employerCost) },
            { label: 'Period', value: `${month} locks` },
          ]}
          cannotUndo={`Approving locks the ${month} payroll period. Attendance and pay for ${month} lock with it.`}
          correction="Anything found later is paid as a correction in the next payroll, or the month is reopened with two approvals."
          phrase={r.approval.phrase}
          maker="The preparer"
          checker="You"
          confirmLabel="Approve and lock"
          error={error}
          onConfirm={() =>
            void run('decide', async () => {
              await p.onDecide('approve', null, { phrase: r.approval!.phrase, impact: [{ label: 'Net pay', value: net }] });
              setSheet(null);
              say(`${month} approved and locked`);
            })
          }
        >
          <p className="yx-pay-muted">{unacked.length ? `${count(unacked.length, 'pay change')} still need acknowledgement by payroll.` : 'Every pay change is acknowledged.'}</p>
        </IrreversibleSheet>
      )}
      {releasing && (
        <IrreversibleSheet
          open
          onOpenChange={(o) => !o && setReleasing(null)}
          title={`Release bank file #${releasing.generationNo}`}
          subtitle={`${releasing.format} · debit ${releasing.debitAccount}`}
          impact={[
            { label: 'Payments in file', value: String(releasing.rows) },
            { label: 'Total', value: money(releasing.total) },
            { label: 'Fingerprint (SHA-256)', value: releasing.sha256.slice(0, 16) },
          ]}
          cannotUndo="Once released, the file can be downloaded and sent to the bank, and the period can no longer be reopened. Its fingerprint is checked again first."
          correction="A failed or returned payment is paid again from the payment results; a wrong file is replaced by a new one with a reason."
          phrase={releasing.releasePhrase}
          maker="The person who made it"
          checker="You"
          confirmLabel="Release bank file"
          confirmVariant="primary"
          error={error}
          onConfirm={() =>
            void run('release', async () => {
              await p.onReleaseBank(releasing.id, { phrase: releasing.releasePhrase, impact: [{ label: 'Total', value: money(releasing.total) }] });
              setReleasing(null);
              say('Bank file released');
            })
          }
        />
      )}
      {r && sheet === 'publish' && (
        <IrreversibleSheet
          open
          onOpenChange={(o) => !o && setSheet(null)}
          title={`Publish ${month} payslips`}
          subtitle="Employees see their payslip in the app. Notifications carry a link, never the payslip or amounts."
          impact={[
            { label: 'Payslips published', value: String(toPublish) },
            { label: 'Not published', value: `${held} held` },
            { label: 'Month', value: month },
          ]}
          cannotUndo="Published payslips can't be changed or withdrawn."
          correction="A wrong payslip is corrected by a revised one in an off-cycle or the next payroll."
          phrase={`PUBLISH ${toPublish}`}
          maker="The preparer"
          checker="You"
          selfApproval={!!r.publishAlone}
          confirmLabel="Publish payslips"
          error={error}
          onConfirm={(reason) =>
            void run('publish', async () => {
              const confirmation = { phrase: `PUBLISH ${toPublish}`, impact: [{ label: 'Payslips', value: String(toPublish) }] };
              await (r.publishAlone ? p.onPublish(confirmation, reason.trim()) : p.onPublish(confirmation));
              setSheet(null);
              say(`${count(toPublish, 'payslip')} published`);
            })
          }
        />
      )}
      {sheet === 'bank' && (
        <BankFileDialog
          again={!!p.bankFiles?.length}
          onClose={() => setSheet(null)}
          onSave={async (debit, reason) => {
            const m = await p.onGenerateBank(debit, reason);
            setMade(m);
            setTab('files');
            say(`Bank file made: ${count(m.rows, 'payment')}, ${money(m.total)}. Someone else releases it.`);
          }}
        />
      )}
      {sheet === 'void' && (
        <ReasonDialog title={`Void the ${month} run?`} description="Its draft payslips are kept and marked void. Inputs, holds and one-time pay stay. The audit trail keeps a record." label="Why" confirm="Void run" variant="danger" done="Run voided" onClose={() => setSheet(null)} onSave={p.onVoid} />
      )}
      {sheet === 'reject' && <ReasonDialog title="Send this run back?" description="The preparer sees your reason and calculates again." label="What to change" confirm="Send back" done="Run sent back" onClose={() => setSheet(null)} onSave={(reason) => p.onDecide('reject', reason, { phrase: '', impact: [] })} />}
      {sheet === 'self' && (
        <ReasonDialog
          title="Approve it yourself?"
          description="Nobody else can approve this payroll. The System Admins are told, and your reason is kept with the run."
          label="Why you approve it yourself"
          confirm="Submit for approval"
          onClose={() => setSheet(null)}
          onSave={async (reason) => {
            await p.onSubmit(reason);
            say('Sent for approval');
          }}
        />
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ PAY-29 weekly and fortnightly runs */

const STEP_OF: Record<string, string> = { draft: 'ready', reopened: 'ready', calculating: 'ready', calculated: 'payslips', in_review: 'payslips', submitted: 'approve', approved: 'bank', paid: 'bank' };

/** PAY-29 "Weekly run": the design's step view (frequency on every step) over the run workspace, which keeps every action. */
export function LiveFrequencyRun({ live: p }: { live: LiveRunWorkspaceData }) {
  const r = p.run;
  const [current, setCurrent] = useState<string | undefined>(undefined);
  const frequency = r?.payGroup?.frequency === 'fortnightly' ? 'Fortnightly' : 'Weekly';
  const period = r?.range ? `${formatDate(new Date(`${r.range.from}T00:00:00`))} to ${formatDate(new Date(`${r.range.to}T00:00:00`))}` : r ? monthLong(r.month) : '';
  const nameOf = (id: string) => p.people.find((x) => x.employeeId === id);
  const blocks = (p.readiness?.checks ?? []).filter((c) => c.severity === 'block' && !c.waived).length;
  const slips = p.payslips ?? [];
  const file = (p.bankFiles ?? []).find((b) => b.status !== 'superseded');
  const lead = r && (
    <FrequencyRunSteps
      frequency={frequency}
      period={period}
      current={current ?? STEP_OF[r.status] ?? 'ready'}
      onCurrentChange={setCurrent}
      finishLabel="Open payments"
      onFinish={p.onPayments}
      ready={
        blocks ? (
          <InlineAlert tone="danger" title={`${count(blocks, 'item')} ${blocks === 1 ? 'blocks' : 'block'} this run`}>
            Fix or waive them in Validations below, then calculate.
          </InlineAlert>
        ) : (
          <InlineAlert tone="info" title="Ready">
            {`${count(p.readiness?.people ?? 0, 'person', 'people')} in this ${frequency.toLowerCase()} period. PT and LWF use part-period rules; TDS is projected on the annualised pay.`}
          </InlineAlert>
        )
      }
      payslips={
        slips.length ? (
          <DataTable
            label={`${frequency} payslips`}
            columns={[
              { key: 'name', header: 'Employee', type: 'person', value: (x: RunPayslip) => nameOf(x.employeeId)?.name ?? 'Someone', person: (x) => ({ name: nameOf(x.employeeId)?.name ?? 'Someone', secondary: nameOf(x.employeeId)?.employeeCode ?? undefined }), width: 220 },
              { key: 'gross', header: 'Gross', type: 'money', value: (x) => Number(x.gross), total: 'sum', width: 120 },
              { key: 'net', header: 'Net', type: 'money', value: (x) => Number(x.net), total: 'sum', width: 120 },
            ]}
            rows={slips}
            getRowId={(x) => x.id}
          />
        ) : (
          <EmptyState compact title="No payslips yet" description="Calculate the run to see each person's pay for this period." />
        )
      }
      approve={
        <p className="yx-pay-muted">
          {r.status === 'submitted'
            ? `Waiting for approval${r.approval ? ` (step ${r.approval.step} of ${r.approval.steps})` : ''}.`
            : LOCKED.includes(r.status)
              ? `Approved${r.approvedAt ? ` on ${formatDate(new Date(r.approvedAt))}` : ''}.`
              : 'Finance approves each run with the typed phrase. PF and ESI are worked out per run and added up into the monthly return.'}
        </p>
      }
      bank={
        file ? (
          <FactRow items={[{ label: 'Payments', value: String(file.rows) }, { label: 'Total', value: money(file.total) }, { label: 'Status', value: file.status === 'released' ? 'Released' : 'Waiting for release' }]} />
        ) : (
          <p className="yx-pay-muted">{LOCKED.includes(r.status) ? 'No bank file yet. Make it in Files below.' : 'The bank file is made once the run is approved.'}</p>
        )
      }
    />
  );
  return <LiveRunWorkspace live={{ ...p, heading: r ? { name: period, secondary: r.payGroup?.name ?? runName(r), status: <Badge tone="info">{frequency}</Badge> } : undefined, lead }} />;
}

/* ------------------------------------------------------------------ Validations (PAY-02) */

const MODE_LABEL: Record<NonNullable<RunReadiness['groups']>[number]['mode'], AttendanceGroup['mode']> = { punch_block: 'Punch · block', punch_warn: 'Punch · warn', assumed_present: 'Assumed present', timesheet: 'Timesheet' };
const STAGE_TEXT: Record<string, string> = { open: 'open', frozen: 'frozen for payroll', locked: 'locked' };
/** The API's group as the design's row: the input says where the days come from. */
export const attendanceGroup = (g: NonNullable<RunReadiness['groups']>[number]): AttendanceGroup => ({
  group: g.group,
  mode: MODE_LABEL[g.mode],
  employees: g.employees,
  exceptions: g.exceptions,
  input: g.mode === 'assumed_present' ? `Manual LOP input: ${g.lopEntered} of ${g.employees} entered` : `Attendance feed, ${STAGE_TEXT[g.attendanceStage] ?? g.attendanceStage}`,
});

const SEV: Record<RunCheck['severity'], { label: string; icon: typeof AlertCircle }> = { block: { label: 'Blocking', icon: AlertCircle }, warn: { label: 'Warning', icon: AlertTriangle }, info: { label: 'Note', icon: CheckCircle2 } };

function ValidationsPanel({ p, checks, calcBlocks, editable, nameOf }: { p: LiveRunWorkspaceData; checks: RunCheck[]; calcBlocks: RunCheck[]; editable: boolean; nameOf: (id: string | null) => string }) {
  const [waiving, setWaiving] = useState<RunCheck | null>(null);
  const approvalBlocks = checks.filter((c) => c.severity === 'block' && c.blocks === 'approval' && !c.waived);
  const blocks = calcBlocks.length + approvalBlocks.length;
  if (!p.readiness) return <StateBlock state="loading" rows={6}>{null}</StateBlock>;
  return (
    <div className="yx-pay-stack">
      <FactRow
        items={[
          { label: 'People', value: String(p.readiness.people) },
          { label: 'Month', value: p.readiness.period === 'open' ? 'Open' : p.readiness.period === 'frozen' ? 'Inputs frozen' : p.readiness.period },
          { label: 'Blocking', value: String(blocks) },
        ]}
      />
      {blocks > 0 ? (
        <InlineAlert tone="danger" title={`${count(blocks, 'item')} ${blocks === 1 ? 'blocks' : 'block'} calculation or approval`}>
          You can calculate once waivable items are waived with a reason. Waiving a missing bank account holds that person's net pay until it is added.
        </InlineAlert>
      ) : (
        <InlineAlert tone="info" title="Ready to calculate">
          Every blocking item is resolved or waived with a reason.
        </InlineAlert>
      )}
      {!!p.readiness.groups?.length && (
        <AttendanceGroupsPanel
          groups={p.readiness.groups.map(attendanceGroup)}
          lopAction={
            p.onLopInput && (
              <Button size="sm" onClick={p.onLopInput}>
                Open LOP input
              </Button>
            )
          }
        />
      )}
      {/* Founder 30 Oct 2026 (item 11): the input sources show here too, where the PAY-02 design puts them. */}
      {p.inputSources && (
        <section className="yx-pay-panel" aria-label="Inputs">
          <SectionTitle>Inputs for this period</SectionTitle>
          <InputSourcesTable data={p.inputSources} facts={false} />
        </section>
      )}
      <section className="yx-pay-panel" aria-label="Validations">
        <SectionTitle>Validations</SectionTitle>
        {checks.length ? (
          <ul className="yx-pay-findings">
            {checks.map((c) => (
              <li key={c.id} data-sev={c.waived ? 'ok' : c.severity === 'info' ? 'ok' : c.severity}>
                <Icon icon={c.waived ? CheckCircle2 : SEV[c.severity].icon} label={c.waived ? 'Waived' : SEV[c.severity].label} />
                <div>
                  <p className="yx-pay-findings__title">{c.message}</p>
                  <p className="yx-pay-findings__desc">
                    {nameOf(c.employeeId)}
                    {c.waived ? ` · Waived: ${c.waiverReason ?? ''}` : c.severity === 'block' ? ` · Blocks ${c.blocks}` : ''}
                  </p>
                </div>
                <div className="yx-pay-findings__acts">
                  {c.severity === 'block' && !c.waived && c.waivable && editable && p.can.prepare && (
                    <Button size="sm" onClick={() => setWaiving(c)}>
                      Waive
                    </Button>
                  )}
                  {c.severity === 'block' && !c.waived && !c.waivable && <Badge tone="danger">Can't be waived</Badge>}
                  {c.waived && <Badge tone="neutral">Waived</Badge>}
                </div>
              </li>
            ))}
          </ul>
        ) : (
          <EmptyState compact title="Nothing to fix" description="Everyone has a salary, a bank account and their details." />
        )}
      </section>
      {waiving && (
        <ReasonDialog
          title={`Waive "${waiving.message}"?`}
          description="The check stays on the audit trail with your reason. Waived items don't block calculation."
          label="Reason"
          confirm="Waive with reason"
          done="Check waived"
          onClose={() => setWaiving(null)}
          onSave={(reason) => p.onWaive(waiving.id, reason)}
        />
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ Inputs (off-cycle items) */

/** PAY-03 Inputs (and PAY-02 Validations, without the facts): the design's Source · People · Amount table. */
export function InputSourcesTable({ data, facts = true }: { data: RunInputSources; facts?: boolean }) {
  const oneTime = data.sources.find((x) => x.key === 'one_time')?.amount;
  const recoveries = data.sources.filter((x) => x.key === 'loans' || x.key === 'overpayments').reduce((t, x) => t + Number(x.amount ?? 0), 0);
  return (
    <div className="yx-pay-stack">
      {facts && (
        <FactRow
          items={[
            { label: 'People in the run', value: String(data.people) },
            { label: 'One-time pay', value: money(oneTime) },
            { label: 'Recoveries', value: formatINR(recoveries) },
          ]}
        />
      )}
      <PlainTable
        label="Inputs for this period"
        rows={data.sources}
        getRowId={(x) => x.key}
        columns={[
          {
            key: 'source',
            header: 'Source',
            rowHeader: true,
            cell: (x) => (
              <>
                {x.label}
                {x.note && <span className="yx-pay-note"> · {x.note}</span>}
              </>
            ),
          },
          { key: 'people', header: 'People', num: true, cell: (x) => x.people },
          { key: 'amount', header: 'Days or amount', num: true, cell: (x) => (x.amount != null ? money(x.amount) : x.days != null ? `${Number(x.days)} ${Number(x.days) === 1 ? 'day' : 'days'}` : '—') },
        ]}
      />
    </div>
  );
}

function InputsPanel({ p, run: r, editable }: { p: LiveRunWorkspaceData; run: PayRun; editable: boolean }) {
  const { toast } = useToast();
  const [q, setQ] = useState('');
  const [hits, setHits] = useState<{ id: string; name: string; employeeCode?: string }[]>([]);
  const [who, setWho] = useState('');
  const [code, setCode] = useState<string>(r.offcycleKind === 'bonus' ? 'bonus' : 'arrears');
  const [amount, setAmount] = useState('');
  const [reason, setReason] = useState('');
  const { busy, error, run } = useRun();
  const person = hits.find((h) => h.id === who);
  const early = useTooEarly([
    ...(!person ? [{ fieldId: 'it-find', message: 'Find and choose the person.' }] : []),
    ...(!/^\d{1,9}(\.\d{1,2})?$/.test(amount) || Number(amount) <= 0 ? [{ fieldId: 'it-amount', message: 'Enter an amount in rupees.' }] : []),
    ...(reason.trim().length < 3 ? [{ fieldId: 'it-why', message: 'Say what it is for.' }] : []),
  ]);
  const facts = (
    <FactRow
      items={[
        { label: 'Month', value: monthLong(r.month) },
        { label: 'Kind', value: r.runType === 'regular' ? 'Monthly payroll' : 'Off-cycle' },
        { label: 'People', value: r.totals ? String(r.totals.people) : '—' },
        { label: 'Calculated', value: r.calcVersion ? `Version ${r.calcVersion}` : 'Not yet' },
      ]}
    />
  );
  const sources = p.inputSources ? <InputSourcesTable data={p.inputSources} /> : null;
  if (r.runType !== 'offcycle' || r.offcycleKind === 'fnf')
    return (
      <div className="yx-pay-stack">
        {facts}
        {sources}
        {r.runType === 'regular' && p.specialDays && <SpecialDaysCard data={p.specialDays} onSave={p.onSaveSpecialDays} onNotPaid={p.onNotPaid} onUndoNotPaid={p.onUndoNotPaid} />}
        <p className="yx-pay-muted">Attendance, loss of pay, one-time pay, holds, loans and claims are read when the run is calculated. Change them in Payroll › Inputs before calculating.</p>
      </div>
    );
  if (!editable || !p.can.offcycle || !p.onAddItem || !p.onSearchPeople)
    return (
      <div className="yx-pay-stack">
        {facts}
        {sources}
        <InlineAlert tone="info" title="Items are added while the run is a draft or in review." />
      </div>
    );
  return (
    <div className="yx-pay-stack">
      {facts}
      {sources}
      <section className="yx-pay-panel" aria-label="Add an item to this run">
        <SectionTitle>Add an item to this run</SectionTitle>
        <div className="yx-pay-stack">
          {error && (
            <InlineAlert tone="danger" title="Not added">
              {error}
            </InlineAlert>
          )}
          <FormField id="it-find" label="Person" required error={early.errorOf('it-find')}>
            <div className="yx-pay-row">
              <TextField value={q} onChange={setQ} placeholder="Name or code" aria-label="Find a person" />
              <Button loading={busy === 'find'} onClick={() => void run('find', async () => setHits(await p.onSearchPeople!(q)))}>
                Search
              </Button>
            </div>
          </FormField>
          {hits.length > 0 && <Segment label="People found" options={hits.map((h) => ({ value: h.id, label: `${h.name}${h.employeeCode ? ` · ${h.employeeCode}` : ''}` }))} value={who} onChange={setWho} />}
          <FormField id="it-code" label="Component" helper="An earning or deduction from the component library, e.g. bonus.">
            <TextField value={code} onChange={setCode} />
          </FormField>
          <FormField id="it-amount" label="Amount" required error={early.errorOf('it-amount')}>
            <TextField value={amount} onChange={setAmount} prefix="₹" inputMode="decimal" />
          </FormField>
          <FormField id="it-why" label="What it is for" required error={early.errorOf('it-why')} helper="Shown on the payslip line.">
            <TextField value={reason} onChange={setReason} maxLength={200} />
          </FormField>
          <span className="yx-pay-row">
            <Button
              variant="primary"
              loading={busy === 'add'}
              onClick={() => {
                if (early.stop()) return;
                void run('add', async () => {
                  await p.onAddItem!({ employeeId: person!.id, componentCode: code.trim(), amount, reason: reason.trim(), label: reason.trim() });
                  toast({ title: `Added for ${person!.name}`, description: 'Calculate the run again to include it.', tone: 'success' });
                  early.reset();
                  setAmount('');
                  setReason('');
                });
              }}
            >
              Add item
            </Button>
          </span>
        </div>
      </section>
    </div>
  );
}

/* ------------------------------------------------------------------ Payslips (PAY-03) */

type SlipRow = RunPayslip & { name: string; code: string; label: string };
const SLIP_TONE: Record<string, BadgeTone> = { Calculated: 'success', 'Net pay held': 'neutral', 'Rule to verify': 'warning', Approved: 'success' };
const slipLabel = (s: RunPayslip) => (s.held ? 'Net pay held' : s.verify ? 'Rule to verify' : s.status === 'approved' ? 'Approved' : 'Calculated');

function PayslipsPanel({ p, nameOf, codeOf }: { p: LiveRunWorkspaceData; nameOf: (id: string | null) => string; codeOf: (id: string) => string }) {
  const [open, setOpen] = useState<SlipRow | null>(null);
  const [filters, setFilters] = useState<FilterValue[]>([{ key: 'status', type: 'multi', values: [] }]);
  const rows = useMemo<SlipRow[]>(() => (p.payslips ?? []).map((s) => ({ ...s, name: nameOf(s.employeeId), code: codeOf(s.employeeId), label: slipLabel(s) })), [p.payslips, p.people]); // eslint-disable-line react-hooks/exhaustive-deps
  const f = filters.find((x) => x.key === 'status');
  const values = f && f.type === 'multi' ? f.values : [];
  const shown = values.length ? rows.filter((r) => values.includes(r.label)) : rows;
  if (!p.payslips) return <StateBlock state="loading" rows={8}>{null}</StateBlock>;
  if (!rows.length) return <EmptyState title="No payslips yet" description="Calculate the run to make the draft payslips." />;
  const cols: TableColumn<SlipRow>[] = [
    { key: 'name', header: 'Employee', type: 'person', value: (r) => r.name, person: (r) => ({ name: r.name, secondary: r.code }), width: 220 },
    { key: 'gross', header: 'Gross', type: 'money', value: (r) => Number(r.gross), total: 'sum', width: 130 },
    { key: 'ded', header: 'Deductions', type: 'money', value: (r) => Number(r.deductions), total: 'sum', width: 130 },
    { key: 'net', header: 'Net pay', type: 'money', value: (r) => Number(r.net), total: 'sum', width: 130 },
    { key: 'status', header: 'Status', type: 'status', value: (r) => r.label, statusTone: (v) => SLIP_TONE[String(v)] ?? 'neutral', width: 140 },
  ];
  return (
    <>
      <DataTable
        label="Payslips in this run"
        columns={cols}
        rows={shown}
        getRowId={(r) => r.id}
        onRowClick={setOpen}
        activeRowId={open?.id}
        filtered={shown.length !== rows.length}
        onClearFilters={() => setFilters([{ key: 'status', type: 'multi', values: [] }])}
        pageSize={25}
        toolbar={<FilterBar fields={[{ key: 'status', label: 'Status', type: 'multi', options: ['Calculated', 'Net pay held', 'Rule to verify', 'Approved'].map((v) => ({ value: v, label: v })) }]} value={filters} onChange={setFilters} searchPlaceholder="Search employee or ID" />}
        rowActions={(r) => <MenuItem onSelect={() => setOpen(r)}>Why this number</MenuItem>}
      />
      {open && <PayslipDrawer row={open} onLoad={p.onPayslip} onClose={() => setOpen(null)} />}
    </>
  );
}

function PayslipDrawer({ row, onLoad, onClose }: { row: SlipRow; onLoad: (id: string) => Promise<PayslipDetail>; onClose: () => void }) {
  const [d, setD] = useState<PayslipDetail | null>(null);
  const { error, run } = useRun();
  useEffect(() => {
    setD(null);
    void run('load', async () => setD(await onLoad(row.id)));
  }, [row.id]); // eslint-disable-line react-hooks/exhaustive-deps
  const notes = d?.lines.filter((l) => l.kind === 'info') ?? [];
  return (
    <Drawer open onOpenChange={(o) => !o && onClose()} title={row.name} subtitle={row.code || undefined} meta={<Badge tone={SLIP_TONE[row.label] ?? 'neutral'}>{row.label}</Badge>} size="lg" footer={<Button onClick={onClose}>Close</Button>}>
      <div className="yx-pay-stack">
        <FactRow
          items={[
            { label: 'Net pay', value: money(row.net) },
            { label: 'Gross', value: money(row.gross) },
            { label: 'Deductions', value: money(row.deductions) },
            { label: 'Cost to company', value: money(row.employerCost) },
          ]}
        />
        {row.held && <InlineAlert tone="warning">Net pay is held: it stays out of the bank file until released.</InlineAlert>}
        {error && (
          <InlineAlert tone="danger" title="Not loaded">
            {error}
          </InlineAlert>
        )}
        <h3 className="yx-pay-section-title">Why this number</h3>
        {d ? <WhyThisNumber lines={d.lines.filter((l) => l.kind !== 'info').map(explained)} /> : !error && <StateBlock state="loading" rows={6}>{null}</StateBlock>}
        {notes.length > 0 && (
          <ul className="yx-pay-stack" aria-label="Notes">
            {notes.map((l, i) => (
              <li key={`${l.code}-${i}`} className="yx-pay-muted">
                {l.name}: {l.explanation}
              </li>
            ))}
          </ul>
        )}
      </div>
    </Drawer>
  );
}

/* ------------------------------------------------------------------ Variance */

function VariancePanel({ p, nameOf }: { p: LiveRunWorkspaceData; nameOf: (id: string | null) => string }) {
  const [acking, setAcking] = useState<RunVariance | null>(null);
  if (!p.variances) return <StateBlock state="loading" rows={6}>{null}</StateBlock>;
  const left = p.variances.filter((v) => !v.acknowledged).length;
  if (!p.variances.length) return <EmptyState title="No unusual pay changes" description="Net pay changes above the company's limit, and components added or removed since last month, show here." />;
  return (
    <div className="yx-pay-stack">
      <InlineAlert tone={left ? 'warning' : 'info'} title={left ? `${count(left, 'change')} need acknowledgement before approval` : 'All variance acknowledged'}>
        Net pay changes above the company's limit, and components added or removed since last month.
      </InlineAlert>
      <PlainTable
        label="Pay changes to acknowledge"
        rows={p.variances}
        getRowId={(v) => v.id}
        rowTone={(v) => (v.acknowledged ? undefined : { tone: 'warning', label: 'To acknowledge' })}
        columns={[
          { key: 'who', header: 'Employee', rowHeader: true, cell: (v) => nameOf(v.employeeId) },
          { key: 'change', header: 'Change', cell: (v) => v.detail },
          { key: 'note', header: 'Note', cell: (v) => v.note ?? '—' },
          {
            key: 'act',
            header: <span className="yx-visually-hidden">Action</span>,
            cell: (v) =>
              v.acknowledged ? (
                <Badge tone="success">Acknowledged</Badge>
              ) : p.can.prepare ? (
                <Button size="sm" onClick={() => setAcking(v)} aria-label={`Acknowledge the change for ${nameOf(v.employeeId)}`}>
                  Acknowledge
                </Button>
              ) : (
                <Badge tone="warning">To acknowledge</Badge>
              ),
          },
        ]}
      />
      {acking && <ReasonDialog title="Acknowledge this change?" description={acking.detail} label="Note" optional confirm="Acknowledge" done="Change acknowledged" onClose={() => setAcking(null)} onSave={(note) => p.onAck(acking.id, note)} />}
    </div>
  );
}

/* ------------------------------------------------------------------ Files (bank file PAY-08, publish PAY-09) */

const STATUTE: Record<string, string> = { 'IN.PF': 'PF', 'IN.ESI': 'ESI', 'IN.PT': 'PT', 'IN.LWF': 'LWF', 'IN.TDS': 'TDS' };
const FILING_STATUS: Record<string, string> = { generated: 'Made', uploaded: 'Uploaded', filed: 'Filed', superseded: 'Replaced' };

function FilesPanel({ p, run: r, onRelease, onMake, onPublish }: { p: LiveRunWorkspaceData; run: PayRun; onRelease: (b: BankFileRow) => void; onMake: () => void; onPublish: () => void }) {
  const { busy, run } = useRun();
  const { toast } = useToast();
  const approved = LOCKED.includes(r.status);
  const after = <Badge>Available after approval</Badge>;
  const files = p.bankFiles ?? [];
  return (
    <PlainTable
      label="Run files"
      rows={[
        ...(files.length
          ? files.map((b) => ({
              id: b.id,
              file: `Bank file #${b.generationNo}`,
              holds: (
                <>
                  {b.format} · debit {b.debitAccount} · {count(b.rows, 'payment')} · {money(b.total)}
                  {b.reason ? ` · ${b.reason}` : ''}
                </>
              ),
              status: (
                <Badge tone={b.status === 'released' ? 'success' : b.status === 'superseded' ? 'neutral' : 'warning'}>
                  {b.status === 'released' ? `Released${b.releasedAt ? ` ${formatDate(new Date(b.releasedAt))}` : ''}` : b.status === 'superseded' ? 'Replaced' : 'Waiting for release'}
                </Badge>
              ),
              action:
                b.status === 'generated' && p.can.bankRelease && !b.madeByMe ? (
                  <Button size="sm" onClick={() => onRelease(b)}>
                    Release
                  </Button>
                ) : b.status === 'generated' && b.madeByMe ? (
                  <span className="yx-pay-muted">Someone else releases it</span>
                ) : b.status === 'released' ? (
                  <Button
                    size="sm"
                    icon={Download}
                    loading={busy === `dl-${b.id}`}
                    onClick={() => void run(`dl-${b.id}`, () => p.onDownload(b.fileId, `bank-file-${r.month}-${b.generationNo}`)).then((ok) => (ok ? undefined : toast({ title: 'The file did not download. Try again.', tone: 'error' })))}
                  >
                    Download
                  </Button>
                ) : null,
            }))
          : [
              {
                id: 'bank',
                file: 'Bank file',
                holds: 'Everyone paid by bank; held and cash or cheque payslips are left out',
                status: approved ? <Badge tone="warning">Not made yet</Badge> : after,
                action: approved && p.can.bankGenerate && (
                  <Button size="sm" onClick={onMake}>
                    Make bank file
                  </Button>
                ),
              },
            ]),
        {
          id: 'payslips',
          file: 'Payslips',
          holds: `${count(p.payslips?.length ?? 0, 'payslip')} in this run`,
          status: p.published ? <Badge tone="success">Published</Badge> : approved ? <Badge tone="warning">Not published</Badge> : after,
          action: approved && !p.published && p.can.publish && (
            <Button size="sm" onClick={onPublish}>
              Publish
            </Button>
          ),
        },
        {
          id: 'payments',
          file: 'Disbursement register',
          holds: 'Bank results, and cash and cheque payments with their acknowledgements',
          status: approved ? <Badge tone="info">Ready</Badge> : after,
          action: approved && p.onPayments && (
            <Button size="sm" onClick={p.onPayments}>
              Open payments
            </Button>
          ),
        },
        ...(p.journal !== undefined && p.journal !== null
          ? [
              {
                id: 'journal',
                file: 'Journal',
                holds: `Accounting export (Tally, CSV, Zoho Books) · ${count(p.journal.lines.length, 'line')}${p.journal.canPost ? '' : ' · some pay lines need a ledger account'}`,
                status: p.journal.postedAt ? <Badge tone="success">{`Posted ${formatDate(new Date(p.journal.postedAt))}`}</Badge> : <Badge tone={p.journal.canPost ? 'info' : 'warning'}>{p.journal.canPost ? 'Ready' : 'Ledger accounts missing'}</Badge>,
                action: p.onJournal && (
                  <Button size="sm" icon={Download} onClick={p.onJournal}>
                    Export journal
                  </Button>
                ),
              },
            ]
          : approved || p.journal === null
            ? []
            : [{ id: 'journal', file: 'Journal', holds: 'Accounting export by cost centre', status: after, action: null }]),
        ...(p.filings ?? [])
          .filter((f) => f.fileId)
          .map((f) => ({
            id: `filing-${f.id}`,
            file: `${STATUTE[f.statute] ?? f.statute}${f.state ? ` ${f.state.replace(/^IN-/, '')}` : ''} file`,
            holds: `${f.kind === 'regular' ? 'Return for the month' : 'Correction'}${f.rows != null ? ` · ${count(f.rows, 'row')}` : ''}${f.reference ? ` · reference ${f.reference}` : ''}`,
            status: <Badge tone={f.status === 'filed' ? 'success' : 'info'}>{FILING_STATUS[f.status] ?? f.status}</Badge>,
            action: (
              <Button
                size="sm"
                icon={Download}
                loading={busy === `dl-${f.id}`}
                onClick={() => void run(`dl-${f.id}`, () => p.onDownload(f.fileId!, `${f.statute}-${r.month}`)).then((ok) => (ok ? undefined : toast({ title: 'The file did not download. Try again.', tone: 'error' })))}
              >
                Download
              </Button>
            ),
          })),
        ...(p.filings === undefined
          ? []
          : [
              {
                id: 'statutory',
                file: 'Statutory files',
                holds: p.filings?.length ? `PF, ESI, PT and LWF return files for ${monthLong(r.month)}: ${count(p.filings.length, 'file')} made` : `PF, ESI, PT and LWF return files for ${monthLong(r.month)}: none made yet`,
                status: !approved ? after : p.filings?.length ? <Badge tone="info">Ready</Badge> : <Badge tone="warning">Not made yet</Badge>,
                action: approved && p.onStatutory && (
                  <Button size="sm" onClick={p.onStatutory}>
                    Open statutory hub
                  </Button>
                ),
              },
            ]),
      ]}
      getRowId={(x) => x.id}
      columns={[
        { key: 'file', header: 'File', rowHeader: true, cell: (x) => x.file },
        { key: 'holds', header: 'What it holds', cell: (x) => x.holds },
        { key: 'status', header: 'Status', cell: (x) => x.status },
        { key: 'act', header: <span className="yx-visually-hidden">Action</span>, cell: (x) => x.action },
      ]}
    />
  );
}

/* ------------------------------------------------------------------ Dialogs */

function BankFileDialog({ again, onClose, onSave }: { again: boolean; onClose: () => void; onSave: (debit: string, reason?: string) => Promise<void> }) {
  const [debit, setDebit] = useState('');
  const [reason, setReason] = useState('');
  const { busy, error, run } = useRun();
  const early = useTooEarly([...(!/^\d{6,20}$/.test(debit) ? [{ fieldId: 'bk-debit', message: 'Enter the account the bank debits (6 to 20 digits).' }] : []), ...(again && reason.trim().length < 5 ? [{ fieldId: 'bk-why', message: 'Say why a new file is needed (at least 5 characters).' }] : [])]);
  return (
    <Dialog
      open
      onOpenChange={(o) => !o && onClose()}
      title={again ? 'Make a new bank file?' : 'Make the bank file'}
      description={again ? 'The earlier file is marked replaced. If it was already uploaded to the bank, stop it there first.' : 'Everyone paid by bank goes in it. Someone other than you releases it.'}
      footer={
        <>
          <Button onClick={onClose}>Cancel</Button>
          <Button
            variant="primary"
            loading={busy === 'make'}
            onClick={() => {
              if (early.stop()) return;
              void run('make', async () => {
                await onSave(debit, again ? reason.trim() : undefined);
                onClose();
              });
            }}
          >
            Make bank file
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
        <FormField id="bk-debit" label="Company account the bank debits" required error={early.errorOf('bk-debit')} helper="Only its last four digits are kept outside the file.">
          <TextField value={debit} onChange={setDebit} inputMode="numeric" autoComplete="off" />
        </FormField>
        {again && (
          <FormField id="bk-why" label="Why a new file" required error={early.errorOf('bk-why')}>
            <TextField value={reason} onChange={setReason} />
          </FormField>
        )}
      </div>
    </Dialog>
  );
}

/** A reason (or optional note) in a dialog; pressed too early, the field says why and takes focus. */
function ReasonDialog({ title, description, label, confirm, optional, variant = 'primary', done, onClose, onSave }: { title: string; description?: string; label: string; confirm: string; optional?: boolean; variant?: 'primary' | 'danger'; done?: string; onClose: () => void; onSave: (text: string) => Promise<unknown> }) {
  const [text, setText] = useState('');
  const { busy, error, run } = useRun();
  const { toast } = useToast();
  const early = useTooEarly(!optional && text.trim().length < 5 ? [{ fieldId: 'rw-text', message: `${label}: at least 5 characters.` }] : []);
  return (
    <Dialog
      open
      onOpenChange={(o) => !o && onClose()}
      title={title}
      description={description}
      footer={
        <>
          <Button onClick={onClose}>Cancel</Button>
          <Button
            variant={variant}
            loading={busy === 'save'}
            onClick={() => {
              if (early.stop()) return;
              void run('save', async () => {
                await onSave(text.trim());
                if (done) toast({ title: done, tone: 'success' });
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
        <FormField id="rw-text" label={label} required={!optional} optional={optional} error={early.errorOf('rw-text')}>
          <TextArea value={text} onChange={setText} rows={3} maxLength={500} />
        </FormField>
      </div>
    </Dialog>
  );
}
