import { useEffect, useState } from 'react';
import { Button } from '../../../components/button';
import { Checkbox } from '../../../components/choice';
import { DatePicker } from '../../../components/date';
import { Badge, type BadgeTone } from '../../../components/display';
import { Drawer } from '../../../components/drawer';
import { EmptyState, InlineAlert } from '../../../components/feedback';
import { FormField } from '../../../components/field';
import { Text } from '../../../components/foundations';
import { TextArea, TextField } from '../../../components/inputs';
import { ConfirmDialog } from '../../../components/overlay';
import { Segment } from '../../../components/segment';
import { Select } from '../../../components/select';
import { Card } from '../../../components/shell';
import { DataTable, type TableColumn } from '../../../components/table';
import { dayKey } from '../../../lib/dates';
import { LivePage, dateText } from '../../time/live/kit';
import { TaskForm } from './lifecycle';
import type { AlumniMe, ExitStep, Handoff, Letter, MyDocuments, MyVrsScheme, Payee, Payees, QueueDocument } from './types';
import { VrsCard } from './special';
import type { AssetRow, Choice, ClearanceItem, ExitRow, ExitStatus, ExitType, ExitWorkspace, InterviewAnswers, InterviewForm, LoadState, MyAsset, MyResignation } from './types';

// Lifecycle batch 6c, wired (design §10, §14): Me › Resign (PPL-18), the exit interview (PPL-21), my assets (PPL-25
// acknowledge), HR's exit cases and the exit workspace (PPL-19, with "Start exit"), clearance sign-offs (PPL-20) and the
// asset list (PPL-25). Plain words; single choices are Segments; buttons stay off until a form is complete, so no
// error shows while typing; the server's answer shows after the action.

const fromKey = (iso: string) => new Date(`${iso}T00:00:00`);
const MONEY = /^\d{1,12}(\.\d{1,2})?$/;
const STATUS: Record<ExitStatus, { label: string; tone: BadgeTone }> = {
  submitted: { label: 'Waiting for acceptance', tone: 'warning' },
  accepted: { label: 'Serving notice', tone: 'info' },
  rejected: { label: 'Not accepted', tone: 'neutral' },
  withdrawn: { label: 'Withdrawn', tone: 'neutral' },
  cleared: { label: 'Cleared', tone: 'success' },
  exited: { label: 'Left', tone: 'neutral' },
  closed: { label: 'Closed', tone: 'neutral' },
};
const REASONS: Record<string, string> = {
  better_opportunity: 'A better opportunity',
  higher_studies: 'Higher studies',
  relocation: 'Moving to another city',
  family: 'Family reasons',
  health: 'Health',
  career_change: 'A change of career',
  manager: 'My manager',
  work_environment: 'The work or the team',
  compensation: 'Pay and benefits',
  other: 'Something else',
};
const COMPANY_TYPES: { value: Exclude<ExitType, 'resignation' | 'vrs'>; label: string }[] = [
  { value: 'retrenchment', label: 'Retrenchment' },
  { value: 'termination', label: 'Termination' },
  { value: 'probation_termination', label: 'Probation not confirmed' },
  { value: 'end_of_contract', label: 'End of contract' },
  { value: 'retirement', label: 'Retirement' },
  { value: 'death', label: 'Death in service' },
  { value: 'absconding', label: 'Absconding' },
];
const rupees = (s: string) => `₹${Number(s).toLocaleString('en-IN', { minimumFractionDigits: 2 })}`;

function StatusBadge({ status }: { status: ExitStatus }) {
  return <Badge tone={STATUS[status].tone}>{STATUS[status].label}</Badge>;
}

function Facts({ rows }: { rows: [string, string | null | undefined][] }) {
  return (
    <dl className="yx-lif-facts">
      {rows
        .filter(([, v]) => v)
        .map(([k, v]) => (
          <div key={k}>
            <dt>
              <Text tone="secondary" size="sm">
                {k}
              </Text>
            </dt>
            <dd>
              <Text>{v}</Text>
            </dd>
          </div>
        ))}
    </dl>
  );
}

// ------------------------------------------------------------------------------------------ Me › Resign (PPL-18)

export interface ResignationScreenProps {
  state: LoadState;
  onRetry?: () => void;
  data: MyResignation | null;
  onResign: (input: { reasonCode: string; reasonText: string; requestedLwd: string | null }) => Promise<unknown>;
  onWithdraw: (reason: string) => Promise<unknown>;
  interviewHref: string;
  /** 6e: voluntary retirement schemes open to me. */
  vrs?: { schemes: MyVrsScheme[]; onApply: (s: MyVrsScheme, input: { requestedLwd: string; reasonText: string | null }) => Promise<unknown> };
}

export function ResignationScreen(p: ResignationScreenProps) {
  const [withdrawing, setWithdrawing] = useState(false);
  const d = p.data;
  const k = d?.current ?? null;
  return (
    <LivePage title="Resign" description="Your notice comes from the company policy. Your manager, then HR, accept your resignation." state={p.state} onRetry={p.onRetry} what="your resignation">
      {d && !k && p.vrs && <VrsCard schemes={p.vrs.schemes} today={d.today} onApply={p.vrs.onApply} />}
      {d && !k && <ResignForm data={d} onResign={p.onResign} />}
      {d && k && (
        <Card
          title="Your resignation"
          actions={
            (k.status === 'submitted' || k.status === 'accepted') && !k.pendingChange && k.initiatedBy === 'employee' ? (
              <Button size="sm" onClick={() => setWithdrawing(true)}>
                Withdraw
              </Button>
            ) : undefined
          }
        >
          <StatusBadge status={k.status} />
          <Facts
            rows={[
              ['Given on', dateText(k.submittedOn)],
              ['Notice', k.noticeLabel],
              [k.status === 'submitted' ? 'Last working day (by notice)' : 'Last working day', dateText(k.lastDay)],
              ['You asked to leave on', k.requestedLwd ? dateText(k.requestedLwd) : null],
            ]}
          />
          {k.pendingChange?.kind === 'withdrawal' && <InlineAlert tone="info" title="Withdrawal asked for">Your manager and HR decide on it.</InlineAlert>}
          {k.lettersHeld && <InlineAlert tone="warning" title="Your relieving letter is on hold">HR will contact you.</InlineAlert>}
          {k.interview === 'sent' && (
            <InlineAlert tone="info" title="Your exit interview is ready">
              <a href={p.interviewHref}>Answer it</a> before your last day. Only HR reads your answers.
            </InlineAlert>
          )}
        </Card>
      )}
      {withdrawing && k && <WithdrawDialog accepted={k.status === 'accepted'} onClose={() => setWithdrawing(false)} onWithdraw={p.onWithdraw} />}
    </LivePage>
  );
}

function ResignForm({ data, onResign }: { data: MyResignation; onResign: ResignationScreenProps['onResign'] }) {
  const [reason, setReason] = useState<string | null>(null);
  const [text, setText] = useState('');
  const [wanted, setWanted] = useState<Date | null>(null);
  const [asking, setAsking] = useState(false);
  const n = data.notice;
  if (!n) return <EmptyState compact title="You have no open employment to resign from." />;
  const ready = Boolean(reason) && text.trim().length >= 3;
  return (
    <Card title="Give your resignation">
      <Facts
        rows={[
          ['Your notice', `${n.label}${n.onProbation ? ' (during probation)' : ''}`],
          ['Last working day if you resign today', dateText(n.standardLwd)],
        ]}
      />
      <div className="yx-lif-grid">
        <FormField id="rs-reason" label="Main reason" required>
          <Select aria-label="Main reason" value={reason} onChange={setReason} options={data.reasons.map((r) => ({ value: r, label: REASONS[r] ?? r }))} />
        </FormField>
        <FormField id="rs-date" label="Day you would like to leave" optional helper="An earlier day than the notice needs the company's agreement.">
          <DatePicker value={wanted} onChange={setWanted} min={fromKey(data.today)} aria-label="Day you would like to leave" />
        </FormField>
      </div>
      <FormField id="rs-text" label="In your own words" required helper="Your manager and HR read this.">
        <TextArea value={text} onChange={setText} rows={3} maxLength={1000} />
      </FormField>
      <Button variant="primary" disabled={!ready} onClick={() => setAsking(true)}>
        Resign
      </Button>
      {asking && (
        <ConfirmDialog
          open
          onOpenChange={(o) => !o && setAsking(false)}
          title="Send your resignation?"
          consequence={`Your manager, then HR, are asked to accept it. Your last working day would be ${dateText(wanted && dayKey(wanted) > n.standardLwd ? dayKey(wanted) : n.standardLwd)}. You can withdraw it until it is accepted.`}
          confirmLabel="Send resignation"
          onConfirm={async () => {
            await onResign({ reasonCode: reason!, reasonText: text.trim(), requestedLwd: wanted ? dayKey(wanted) : null });
            setAsking(false);
          }}
        />
      )}
    </Card>
  );
}

function WithdrawDialog({ accepted, onClose, onWithdraw }: { accepted: boolean; onClose: () => void; onWithdraw: (reason: string) => Promise<unknown> }) {
  const [reason, setReason] = useState('');
  return (
    <ConfirmDialog
      open
      onOpenChange={(o) => !o && onClose()}
      title="Withdraw your resignation?"
      consequence={accepted ? 'It is already accepted, so your manager and HR decide. You keep serving notice until they agree.' : 'It is not accepted yet, so it is withdrawn at once.'}
      confirmLabel={accepted ? 'Ask to withdraw' : 'Withdraw resignation'}
      confirmDisabled={reason.trim().length < 3}
      onConfirm={async () => {
        await onWithdraw(reason.trim());
        onClose();
      }}
    >
      <FormField id="wd-reason" label="Why" required>
        <TextArea value={reason} onChange={setReason} rows={2} maxLength={500} />
      </FormField>
    </ConfirmDialog>
  );
}

// ------------------------------------------------------------------------------------------ exit interview (PPL-21)

export interface ExitInterviewScreenProps {
  state: LoadState;
  onRetry?: () => void;
  data: InterviewForm | null;
  onSubmit: (answers: Record<string, unknown>) => Promise<unknown>;
}

export function ExitInterviewScreen(p: ExitInterviewScreenProps) {
  const [answers, setAnswers] = useState<Record<string, unknown>>({});
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const d = p.data;
  const missing = d ? d.form.sections.flatMap((s) => s.fields).filter((f) => f.required && (answers[f.key] === undefined || answers[f.key] === null || answers[f.key] === '')) : [];
  return (
    <LivePage title="Exit interview" description="Thank you for your time here. Only HR reads your answers; your manager only learns that you answered." state={p.state} onRetry={p.onRetry} what="your exit interview">
      {d && d.status !== 'sent' && <EmptyState compact title={d.status === 'submitted' ? 'Your answers are in. Thank you.' : 'You have no exit interview to answer.'} />}
      {d && d.status === 'sent' && (
        <Card title="Your answers">
          {error && (
            <InlineAlert tone="danger" title="Not sent">
              {error}
            </InlineAlert>
          )}
          <TaskForm form={d.form} answers={answers} onChange={setAnswers} errors={errors} />
          <Button
            variant="primary"
            disabled={missing.length > 0}
            loading={busy}
            onClick={async () => {
              setBusy(true);
              setError(null);
              try {
                await p.onSubmit(answers);
              } catch (e) {
                const body = e as { message?: string; body?: { fieldErrors?: Record<string, string> } };
                setErrors(body.body?.fieldErrors ?? {});
                setError(body.message ?? 'Try again in a moment.');
              } finally {
                setBusy(false);
              }
            }}
          >
            Send answers
          </Button>
        </Card>
      )}
    </LivePage>
  );
}

// ------------------------------------------------------------------------------------------ my assets (PPL-25 acknowledge)

export interface MyAssetsScreenProps {
  state: LoadState;
  onRetry?: () => void;
  rows: MyAsset[] | null;
  onAcknowledge: (a: MyAsset) => Promise<unknown>;
}

export function MyAssetsScreen(p: MyAssetsScreenProps) {
  const [busy, setBusy] = useState<string | null>(null);
  const columns: TableColumn<MyAsset>[] = [
    { key: 'name', header: 'Asset', value: (r) => r.name, render: (r) => <span className="yx-auth__item-main"><Text>{r.name}</Text><Text tone="secondary" size="sm">{`${r.category} · ${r.tag}`}</Text></span>, width: 240, hideable: false },
    { key: 'issued', header: 'Issued on', value: (r) => r.issuedOn, render: (r) => dateText(r.issuedOn), width: 130 },
    { key: 'condition', header: 'Condition when issued', value: (r) => r.condition, width: 220, optional: true },
    { key: 'ack', header: 'Received', value: (r) => r.acknowledgedAt ?? '', render: (r) => (r.acknowledgedAt ? <Badge tone="success">Confirmed</Badge> : <Badge tone="warning">Waiting for confirmation</Badge>), width: 140 },
  ];
  return (
    <LivePage title="My assets" description="Company things you hold. Confirm what you received; hand them back when you leave." state={p.state} onRetry={p.onRetry} what="your assets">
      {p.rows && (
        <DataTable
          label="My assets"
          columns={columns}
          rows={p.rows}
          getRowId={(r) => r.assignmentId}
          rowNoun={['asset', 'assets']}
          cardSummary
          empty={<EmptyState compact title="You hold no company assets." />}
          rowButtons={(r) =>
            r.acknowledgedAt ? null : (
              <Button
                size="sm"
                variant="primary"
                loading={busy === r.assignmentId}
                onClick={async () => {
                  setBusy(r.assignmentId);
                  try {
                    await p.onAcknowledge(r);
                  } finally {
                    setBusy(null);
                  }
                }}
              >
                I have it
              </Button>
            )
          }
        />
      )}
    </LivePage>
  );
}

// ------------------------------------------------------------------------------------------ HR: exit cases (PPL-19)

export interface ExitCasesScreenProps {
  state: LoadState;
  onRetry?: () => void;
  rows: ExitRow[] | null;
  canStart: boolean;
  people: Choice[];
  today: string;
  onStart: (input: { employeeId: string; exitType: Exclude<ExitType, 'resignation' | 'vrs'>; lwd: string; reasonText: string; selectionBasis?: string; noticeMode?: 'notice' | 'pay_in_lieu'; irPermissionId?: string }) => Promise<{ id: string }>;
  /** 6e: government permission requests a retrenchment can name. */
  permissions?: Choice[];
  onOpen: (id: string) => void;
}

export function StartExitDialog({ people, permissions, today, onClose, onStart }: { people: Choice[]; permissions: Choice[]; today: string; onClose: () => void; onStart: ExitCasesScreenProps['onStart'] }) {
  const [who, setWho] = useState<string | null>(null);
  const [type, setType] = useState<Exclude<ExitType, 'resignation' | 'vrs'> | null>(null);
  const [basis, setBasis] = useState('');
  const [mode, setMode] = useState<'notice' | 'pay_in_lieu'>('notice');
  const [permission, setPermission] = useState<string | null>(null);
  const [lwd, setLwd] = useState<Date | null>(null);
  const [reason, setReason] = useState('');
  const past = type === 'death' || type === 'absconding';
  const ready = Boolean(who && type && lwd) && reason.trim().length >= 3 && (type !== 'retrenchment' || basis.trim().length >= 3);
  return (
    <ConfirmDialog
      open
      onOpenChange={(o) => !o && onClose()}
      size="md"
      title="Start an exit"
      consequence={type === 'termination' || type === 'probation_termination' ? 'Another HR person approves this before it starts. It is refused while the person is on maternity leave.' : 'The exit starts at once: the offboarding checklist and clearance open.'}
      confirmLabel="Start exit"
      confirmDisabled={!ready}
      onConfirm={async () => {
        await onStart({ employeeId: who!, exitType: type!, lwd: dayKey(lwd!), reasonText: reason.trim(), ...(type === 'retrenchment' ? { selectionBasis: basis.trim(), noticeMode: mode, ...(permission ? { irPermissionId: permission } : {}) } : {}) });
        onClose();
      }}
    >
      <FormField id="se-who" label="Person" required>
        <Select aria-label="Person" value={who} onChange={setWho} options={people} searchable />
      </FormField>
      <FormField id="se-type" label="Kind of exit" required>
        <Select aria-label="Kind of exit" value={type} onChange={(x) => { setType(x as Exclude<ExitType, 'resignation' | 'vrs'>); setLwd(null); }} options={COMPANY_TYPES} />
      </FormField>
      {type === 'retrenchment' && (
        <>
          <FormField id="se-basis" label="How the worker was chosen" required helper="For example: last come, first go in the operator category.">
            <TextField value={basis} onChange={setBasis} maxLength={500} />
          </FormField>
          <FormField id="se-mode" label="Notice">
            <Segment label="Notice" value={mode} onChange={setMode} options={[{ value: 'notice', label: 'Written notice' }, { value: 'pay_in_lieu', label: 'Wages in lieu' }]} />
          </FormField>
          <FormField id="se-perm" label="Government permission" optional helper="Needed at 300 or more workers; the exit cannot be approved without it.">
            <Select aria-label="Government permission" value={permission} onChange={setPermission} options={permissions} clearable />
          </FormField>
        </>
      )}
      <FormField id="se-lwd" label={type === 'death' ? 'Date of death' : type === 'absconding' ? 'Last day present' : 'Last working day'} required>
        <DatePicker value={lwd} onChange={setLwd} {...(past ? { max: fromKey(today) } : { min: fromKey(today) })} aria-label="Last working day" />
      </FormField>
      <FormField id="se-reason" label="Reason" required helper="Kept on the record. The person does not see it here.">
        <TextArea value={reason} onChange={setReason} rows={2} maxLength={1000} />
      </FormField>
    </ConfirmDialog>
  );
}

// ------------------------------------------------------------------------------------------ HR: one exit (PPL-19 workspace)

export interface ExitCaseScreenProps {
  state: LoadState;
  onRetry?: () => void;
  data: ExitWorkspace | null;
  today: string;
  onBack: () => void;
  onNotice: (input: { kind: 'early_release' | 'buyout' | 'lwd_change'; lwd: string; buyoutBy: 'employee' | 'company' | null; buyoutDays: number | null; reason: string; version: number }) => Promise<unknown>;
  onHrFacts: (input: { rehireEligible: boolean | null; rehireReason: string | null; regretted: boolean | null; backfillRequested: boolean; hold: boolean; holdReason: string | null; holdReviewOn: string | null; version: number }) => Promise<unknown>;
  onSignOff: SignOffHandler;
  onInterview: () => Promise<InterviewAnswers>;
  onInterviewNotes: (notes: string) => Promise<unknown>;
  checklistHref: (journeyId: string) => string;
  /** 6d: the steps after the last day (HR) and the payroll hand-off (HR or payroll). */
  steps?: ExitStep[] | null;
  onRetryStep?: (s: ExitStep) => Promise<unknown>;
  onStepDone?: (s: ExitStep, note: string) => Promise<unknown>;
  handoff?: Handoff | null;
  onSettledOutside?: (input: { settledOn: string; reason: string }) => Promise<unknown>;
  /** 6e death in service: the payees, and the succession certificates on the person's record. */
  payees?: Payees | null;
  payeeDocuments?: Choice[];
  onPayees?: (payees: Payee[]) => Promise<unknown>;
}
export type SignOffHandler = (item: ClearanceItem, input: { action: 'clear' | 'waive'; note: string | null; recoveryAmount: string | null; recoveryReason: string | null }) => Promise<unknown>;

export function NoticeDialog({ d, today, onClose, onNotice }: { d: ExitWorkspace; today: string; onClose: () => void; onNotice: ExitCaseScreenProps['onNotice'] }) {
  const [kind, setKind] = useState<'early_release' | 'buyout' | 'lwd_change'>('early_release');
  const [lwd, setLwd] = useState<Date | null>(null);
  const [by, setBy] = useState<'employee' | 'company'>('employee');
  const [days, setDays] = useState('');
  const [reason, setReason] = useState('');
  const day = lwd ? dayKey(lwd) : null;
  const ready = Boolean(day) && day !== d.lastDay && (kind !== 'early_release' || (day ?? '') < d.lastDay) && (kind !== 'buyout' || /^\d{1,3}$/.test(days)) && reason.trim().length >= 3;
  return (
    <ConfirmDialog
      open
      onOpenChange={(o) => !o && onClose()}
      size="md"
      title="Change the last working day?"
      consequence="Another HR person approves it. The offboarding checklist then moves with the new day."
      confirmLabel="Send for approval"
      confirmDisabled={!ready}
      onConfirm={async () => {
        await onNotice({ kind, lwd: day!, buyoutBy: kind === 'buyout' ? by : null, buyoutDays: kind === 'buyout' ? Number(days) : null, reason: reason.trim(), version: d.version });
        onClose();
      }}
    >
      <Segment label="Kind of change" value={kind} onChange={setKind} options={[{ value: 'early_release', label: 'Early release' }, { value: 'buyout', label: 'Notice buy-out' }, { value: 'lwd_change', label: 'Another day' }]} />
      <FormField id="nc-lwd" label="New last working day" required helper={`Now ${dateText(d.lastDay)}.`}>
        <DatePicker value={lwd} onChange={setLwd} min={fromKey(today)} aria-label="New last working day" />
      </FormField>
      {kind === 'buyout' && (
        <div className="yx-lif-grid">
          <FormField id="nc-by" label="Paid by" required>
            <Segment label="Paid by" value={by} onChange={setBy} options={[{ value: 'employee', label: 'The employee' }, { value: 'company', label: 'The company' }]} />
          </FormField>
          <FormField id="nc-days" label="Notice days bought out" required>
            <TextField value={days} onChange={setDays} inputMode="numeric" maxLength={3} />
          </FormField>
        </div>
      )}
      <FormField id="nc-reason" label="Reason" required>
        <TextArea value={reason} onChange={setReason} rows={2} maxLength={500} />
      </FormField>
    </ConfirmDialog>
  );
}

export function HrFactsDialog({ d, onClose, onSave }: { d: ExitWorkspace; onClose: () => void; onSave: ExitCaseScreenProps['onHrFacts'] }) {
  const h = d.hr!;
  const tri = (b: boolean | null) => (b === null ? 'open' : b ? 'yes' : 'no');
  const fromTri = (s: string) => (s === 'open' ? null : s === 'yes');
  const [rehire, setRehire] = useState(tri(h.rehireEligible));
  const [rehireReason, setRehireReason] = useState(h.rehireReason ?? '');
  const [regretted, setRegretted] = useState(tri(h.regretted));
  const [backfill, setBackfill] = useState(h.backfillRequested);
  const [hold, setHold] = useState(Boolean(h.holdReason));
  const [holdReason, setHoldReason] = useState(h.holdReason ?? '');
  const [review, setReview] = useState<Date | null>(h.holdReviewOn ? fromKey(h.holdReviewOn) : null);
  const ready = !hold || holdReason.trim().length >= 3;
  const choices = [{ value: 'yes', label: 'Yes' }, { value: 'no', label: 'No' }, { value: 'open', label: 'Not decided' }];
  return (
    <ConfirmDialog
      open
      onOpenChange={(o) => !o && onClose()}
      size="md"
      title="HR-only facts"
      consequence="Only people with the confidential exit key see these. The leaver sees only that their letters are on hold."
      confirmLabel="Save"
      confirmDisabled={!ready}
      onConfirm={async () => {
        await onSave({ rehireEligible: fromTri(rehire), rehireReason: rehireReason.trim() || null, regretted: fromTri(regretted), backfillRequested: backfill, hold, holdReason: hold ? holdReason.trim() : null, holdReviewOn: hold && review ? dayKey(review) : null, version: d.version });
        onClose();
      }}
    >
      <FormField id="hr-rehire" label="Eligible for rehire">
        <Segment label="Eligible for rehire" value={rehire} onChange={setRehire} options={choices} />
      </FormField>
      {rehire === 'no' && (
        <FormField id="hr-rehire-why" label="Why not" optional>
          <TextField value={rehireReason} onChange={setRehireReason} maxLength={500} />
        </FormField>
      )}
      <FormField id="hr-regret" label="Regretted loss">
        <Segment label="Regretted loss" value={regretted} onChange={setRegretted} options={choices} />
      </FormField>
      <Checkbox checked={backfill} onChange={setBackfill} label="Ask for a backfill" />
      <Checkbox checked={hold} onChange={setHold} label="Hold the relieving and experience letters" />
      {hold && (
        <div className="yx-lif-grid">
          <FormField id="hr-hold" label="Why (HR only)" required>
            <TextField value={holdReason} onChange={setHoldReason} maxLength={500} />
          </FormField>
          <FormField id="hr-review" label="Review on" optional>
            <DatePicker value={review} onChange={setReview} aria-label="Review on" />
          </FormField>
        </div>
      )}
    </ConfirmDialog>
  );
}

export function InterviewDialog({ onClose, load, onNotes }: { onClose: () => void; load: () => Promise<InterviewAnswers>; onNotes: (notes: string) => Promise<unknown> }) {
  const [data, setData] = useState<InterviewAnswers | null>(null);
  const [notes, setNotes] = useState('');
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    void load()
      .then((x) => {
        setData(x);
        setNotes(x.hrNotes ?? '');
      })
      .catch((e: Error) => setError(e.message));
    // Load once when the dialog opens.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const fields = data?.form.sections.flatMap((s) => s.fields) ?? [];
  const shown = (key: string, v: unknown) => {
    const f = fields.find((x) => x.key === key);
    return f?.options?.find((o) => o.value === v)?.label ?? (v === undefined || v === null ? '' : String(v));
  };
  return (
    <ConfirmDialog open onOpenChange={(o) => !o && onClose()} size="md" title="Exit interview (HR only)" confirmLabel="Save notes" confirmDisabled={!data} onConfirm={async () => { await onNotes(notes); onClose(); }}>
      {error && (
        <InlineAlert tone="danger" title="Not loaded">
          {error}
        </InlineAlert>
      )}
      {data?.answers && <Facts rows={fields.map((f) => [f.label, shown(f.key, data.answers![f.key])])} />}
      <FormField id="iv-notes" label="HR notes" optional>
        <TextArea value={notes} onChange={setNotes} rows={3} maxLength={2000} />
      </FormField>
    </ConfirmDialog>
  );
}

// ------------------------------------------------------------------------------------------ clearance (PPL-20)

export function SignOffDialog({ item, onClose, onSignOff }: { item: ClearanceItem; onClose: () => void; onSignOff: SignOffHandler }) {
  const [action, setAction] = useState<'clear' | 'waive'>('clear');
  const [note, setNote] = useState('');
  const [recovery, setRecovery] = useState(false);
  const [amount, setAmount] = useState('');
  const [why, setWhy] = useState('');
  const ready = (action === 'clear' ? !recovery || (MONEY.test(amount) && Number(amount) > 0 && why.trim().length >= 3) : note.trim().length >= 3);
  return (
    <ConfirmDialog
      open
      onOpenChange={(o) => !o && onClose()}
      size="md"
      title={item.title}
      consequence="A recovery goes to payroll for the final settlement. Open items never stop the exit."
      confirmLabel={action === 'clear' ? 'Sign off' : 'Waive'}
      confirmDisabled={!ready}
      onConfirm={async () => {
        await onSignOff(item, { action, note: note.trim() || null, recoveryAmount: action === 'clear' && recovery ? amount : null, recoveryReason: action === 'clear' && recovery ? why.trim() : null });
        onClose();
      }}
    >
      <Segment label="Outcome" value={action} onChange={setAction} options={[{ value: 'clear', label: 'Cleared' }, { value: 'waive', label: 'Waive' }]} />
      {action === 'clear' && <Checkbox checked={recovery} onChange={setRecovery} label="Something is owed (a recovery)" />}
      {action === 'clear' && recovery && (
        <div className="yx-lif-grid">
          <FormField id="so-amount" label="Amount (₹)" required>
            <TextField value={amount} onChange={setAmount} inputMode="decimal" maxLength={15} />
          </FormField>
          <FormField id="so-why" label="For" required>
            <TextField value={why} onChange={setWhy} maxLength={300} />
          </FormField>
        </div>
      )}
      <FormField id="so-note" label="Note" required={action === 'waive'} optional={action === 'clear'}>
        <TextArea value={note} onChange={setNote} rows={2} maxLength={1000} />
      </FormField>
    </ConfirmDialog>
  );
}

// ------------------------------------------------------------------------------------------ assets (PPL-25)

export interface AssetsScreenProps {
  state: LoadState;
  onRetry?: () => void;
  rows: AssetRow[] | null;
  canAdd: boolean;
  today: string;
  entities: Choice[];
  locations: (Choice & { entityId: string })[];
  people: Choice[];
  onAdd: (input: { category: string; name: string; tag: string; serial: string | null; legalEntityId: string | null; locationId: string | null; cost: string | null }) => Promise<unknown>;
  onIssue: (a: AssetRow, input: { employeeId: string; issuedOn: string; condition: string }) => Promise<unknown>;
  onReturn: (a: AssetRow, input: { returnedOn: string; condition: string; status: 'in_stock' | 'in_repair' | 'lost' }) => Promise<unknown>;
}


export function AddAssetDrawer({ entities, locations, onClose, onAdd }: { entities: Choice[]; locations: (Choice & { entityId: string })[]; onClose: () => void; onAdd: AssetsScreenProps['onAdd'] }) {
  const [category, setCategory] = useState('');
  const [name, setName] = useState('');
  const [tag, setTag] = useState('');
  const [serial, setSerial] = useState('');
  const [entity, setEntity] = useState<string | null>(entities.length === 1 ? entities[0].value : null);
  const [location, setLocation] = useState<string | null>(null);
  const [cost, setCost] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const ready = category.trim() && name.trim() && /^[A-Za-z0-9][A-Za-z0-9._/-]{0,59}$/.test(tag.trim()) && (!cost || MONEY.test(cost));
  return (
    <Drawer
      open
      onOpenChange={(o) => !o && onClose()}
      title="Add asset"
      dirty={Boolean(name || tag)}
      footer={
        <>
          <Button onClick={onClose}>Cancel</Button>
          <Button
            variant="primary"
            disabled={!ready}
            loading={busy}
            onClick={async () => {
              setBusy(true);
              setError(null);
              try {
                await onAdd({ category: category.trim(), name: name.trim(), tag: tag.trim(), serial: serial.trim() || null, legalEntityId: entity, locationId: location, cost: cost || null });
                onClose();
              } catch (e) {
                setError((e as Error).message);
              } finally {
                setBusy(false);
              }
            }}
          >
            Add asset
          </Button>
        </>
      }
    >
      {error && (
        <InlineAlert tone="danger" title="Not added">
          {error}
        </InlineAlert>
      )}
      <div className="yx-lif-grid">
        <FormField id="as-cat" label="Kind" required helper="For example Laptop, Phone, Access card.">
          <TextField value={category} onChange={setCategory} maxLength={40} />
        </FormField>
        <FormField id="as-name" label="Name" required>
          <TextField value={name} onChange={setName} maxLength={150} />
        </FormField>
        <FormField id="as-tag" label="Asset tag" required helper="Unique in the company: letters, digits, dot, dash, slash.">
          <TextField value={tag} onChange={setTag} maxLength={60} />
        </FormField>
        <FormField id="as-serial" label="Serial number" optional>
          <TextField value={serial} onChange={setSerial} maxLength={100} />
        </FormField>
        <FormField id="as-entity" label="Legal entity" optional>
          <Select aria-label="Legal entity" value={entity} onChange={(x) => { setEntity(x); setLocation(null); }} options={entities} clearable />
        </FormField>
        <FormField id="as-location" label="Location" optional>
          <Select aria-label="Location" value={location} onChange={setLocation} options={locations.filter((l) => l.entityId === entity)} disabled={!entity} clearable />
        </FormField>
        <FormField id="as-cost" label="Cost (₹)" optional helper="Used as the recovery when it is not returned.">
          <TextField value={cost} onChange={setCost} inputMode="decimal" maxLength={15} />
        </FormField>
      </div>
    </Drawer>
  );
}

// ------------------------------------------------------------------------------------------ 6d: after the last day

export function HandoffCard({ h, today, onSettled }: { h: Handoff; today: string; onSettled?: (input: { settledOn: string; reason: string }) => Promise<unknown> }) {
  const [settling, setSettling] = useState(false);
  const [on, setOn] = useState<Date | null>(fromKey(today));
  const [reason, setReason] = useState('');
  const c = h.current;
  return (
    <Card
      title="Payroll hand-off"
      actions={
        h.canSettle && !h.settledOutside && onSettled ? (
          <Button size="sm" onClick={() => setSettling(true)}>
            Settled outside YukthiX
          </Button>
        ) : undefined
      }
    >
      <Text as="p" tone="secondary" size="sm">
        Payroll calculates the final settlement from this record. Nothing here is an amount to pay.
      </Text>
      {c && (
        <Facts
          rows={[
            ['Final dues by', dateText(c.wagesDueBy)],
            ['Last working day', dateText(c.lwd)],
            ['Notice served', c.noticeServedDays === null ? null : `${c.noticeServedDays} days`],
            ['Letters on hold', c.holds.letters ? 'Yes' : 'No'],
            ['Revision', `${c.revision} (${c.cause.replace(/_/g, ' ')})`],
          ]}
        />
      )}
      {c && c.recoveries.length > 0 ? (
        <ul className="yx-lif-list">
          {c.recoveries.map((x, i) => (
            <li key={i}>
              <Badge tone={x.status === 'open' ? 'warning' : 'neutral'}>{x.status === 'open' ? 'Possible recovery' : 'Recovery'}</Badge> <Text>{`${x.title}${x.amount ? `: ${rupees(x.amount)}` : ''}${x.reason ? ` (${x.reason})` : ''}`}</Text>
            </li>
          ))}
        </ul>
      ) : (
        <Text as="p">No recoveries.</Text>
      )}
      {h.settledOutside && <InlineAlert tone="success" title="Settled outside YukthiX">{`On ${dateText(h.settledOutside.on)}. ${h.settledOutside.reason}`}</InlineAlert>}
      {settling && onSettled && (
        <ConfirmDialog
          open
          onOpenChange={(o) => !o && setSettling(false)}
          title="Settled outside YukthiX?"
          consequence="The exit closes. Use this until payroll's final settlement is in YukthiX."
          confirmLabel="Close the exit"
          confirmDisabled={!on || reason.trim().length < 3}
          onConfirm={async () => {
            await onSettled({ settledOn: dayKey(on!), reason: reason.trim() });
            setSettling(false);
          }}
        >
          <FormField id="so-on" label="Settled on" required>
            <DatePicker value={on} onChange={setOn} max={fromKey(today)} aria-label="Settled on" />
          </FormField>
          <FormField id="so-reason" label="How" required helper="For example: paid by bank transfer.">
            <TextArea value={reason} onChange={setReason} rows={2} maxLength={500} />
          </FormField>
        </ConfirmDialog>
      )}
    </Card>
  );
}

// ------------------------------------------------------------------------------------------ alumni (T9-02)

export interface AlumniScreenProps {
  data: AlumniMe;
  onDownload: (l: Letter) => Promise<unknown>;
  onSignOut: () => void;
}

export function AlumniScreen({ data, onDownload, onSignOut }: AlumniScreenProps) {
  const [busy, setBusy] = useState<string | null>(null);
  const download = async (l: Letter) => {
    setBusy(l.id);
    try {
      await onDownload(l);
    } finally {
      setBusy(null);
    }
  };
  return (
    <div className="yx-auth__page">
      <Card
        title={`${data.company}: your documents`}
        actions={
          <Button size="sm" onClick={onSignOut}>
            Sign out
          </Button>
        }
      >
        <Text as="p">{`Hello ${data.name}. You can read your letters here until ${dateText(data.accessUntil)}.`}</Text>
        {data.letters.length ? (
          <ul className="yx-lif-list">
            {data.letters.map((l) => (
              <li key={l.id}>
                <Text>{l.title.split(': ')[0]}</Text>
                <Text tone="secondary" size="sm">
                  {l.referenceNo ?? ''}
                </Text>
                <Button size="sm" loading={busy === l.id} onClick={() => void download(l)}>
                  Download
                </Button>
              </li>
            ))}
          </ul>
        ) : (
          <EmptyState compact title="No letters yet." description="Your relieving and experience letters appear here when HR issues them." />
        )}
      </Card>
    </div>
  );
}

// ------------------------------------------------------------------------------------------ Me › My documents (PPL-30, PPL-31)

export interface MyDocumentsScreenProps {
  state: LoadState;
  onRetry?: () => void;
  data: MyDocuments | null;
  onDownload: (d: QueueDocument) => Promise<unknown>;
  onUpload: (d: QueueDocument, file: File) => Promise<unknown>;
  onCertificate: () => Promise<unknown>;
  lettersHref: string;
}

const DOC: Record<QueueDocument['status'], { label: string; tone: BadgeTone }> = {
  requested: { label: 'HR asked for it', tone: 'warning' },
  uploaded: { label: 'Being checked', tone: 'info' },
  verified: { label: 'Verified', tone: 'success' },
  rejected: { label: 'Not accepted', tone: 'danger' },
  expired: { label: 'Expired', tone: 'warning' },
};

export function MyDocumentsScreen(p: MyDocumentsScreenProps) {
  const [busy, setBusy] = useState<string | null>(null);
  const [done, setDone] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [upload, setUpload] = useState<QueueDocument | null>(null);
  const [file, setFile] = useState<File | null>(null);
  const act = async (key: string, fn: () => Promise<unknown>) => {
    setBusy(key);
    setError(null);
    try {
      await fn();
      return true;
    } catch (e) {
      setError((e as Error).message);
      return false;
    } finally {
      setBusy(null);
    }
  };
  const columns: TableColumn<QueueDocument>[] = [
    { key: 'type', header: 'Document', value: (r) => r.typeName, width: 240, hideable: false },
    { key: 'status', header: 'Status', value: (r) => r.status, render: (r) => <span className="yx-auth__item-main"><Badge tone={DOC[r.status].tone}>{DOC[r.status].label}</Badge>{r.rejectReason && <Text tone="secondary" size="sm">{r.rejectReason}</Text>}</span>, width: 220 },
    { key: 'expires', header: 'Expires', value: (r) => r.expiresOn ?? '', render: (r) => (r.expiresOn ? dateText(r.expiresOn) : ''), width: 130, optional: true },
  ];
  return (
    <LivePage
      title="My documents"
      description="Documents the company holds about you. Upload what HR asks for; only people allowed to see each kind can open it."
      state={p.state}
      onRetry={p.onRetry}
      what="your documents"
      actions={
        <Button loading={busy === 'cert'} onClick={async () => setDone(await act('cert', p.onCertificate))}>
          Get an employment certificate
        </Button>
      }
    >
      {done && (
        <InlineAlert tone="success" title="Your certificate is ready">
          It is in <a href={p.lettersHref}>My letters</a>, with a code anyone can check.
        </InlineAlert>
      )}
      {error && (
        <InlineAlert tone="danger" title="That didn't work">
          {error}
        </InlineAlert>
      )}
      {p.data && (
        <DataTable
          label="My documents"
          columns={columns}
          rows={p.data.documents}
          getRowId={(r) => r.id}
          rowNoun={['document', 'documents']}
          cardSummary
          empty={<EmptyState compact title="No documents yet." />}
          rowButtons={(r) => (
            <>
              {r.file && r.file.scanStatus === 'clean' && (
                <Button size="sm" loading={busy === r.id} onClick={() => void act(r.id, () => p.onDownload(r))}>
                  Download
                </Button>
              )}
              {(r.status === 'requested' || r.status === 'rejected' || r.status === 'expired') && (
                <Button
                  size="sm"
                  variant="primary"
                  onClick={() => {
                    setFile(null);
                    setUpload(r);
                  }}
                >
                  Upload
                </Button>
              )}
            </>
          )}
        />
      )}
      {upload && (
        <ConfirmDialog
          open
          onOpenChange={(o) => !o && setUpload(null)}
          title={`Upload ${upload.typeName}`}
          consequence="A PDF or a photo, up to 10 MB. HR checks it."
          confirmLabel="Upload"
          confirmDisabled={!file}
          onConfirm={async () => {
            await p.onUpload(upload, file!);
            setUpload(null);
          }}
        >
          <FormField id="md-file" label="File" required>
            <input id="md-file" className="yx-input" type="file" accept=".pdf,.jpg,.jpeg,.png" onChange={(e) => setFile(e.target.files?.[0] ?? null)} />
          </FormField>
        </ConfirmDialog>
      )}
    </LivePage>
  );
}
