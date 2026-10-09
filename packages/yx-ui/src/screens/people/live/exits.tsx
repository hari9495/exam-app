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
import type { AssetRow, Choice, ClearanceItem, ExitRow, ExitStatus, ExitType, ExitWorkspace, InterviewAnswers, InterviewForm, LoadState, MyAsset, MyClearanceItem, MyResignation } from './types';

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
const DEPT: Record<ClearanceItem['department'], string> = { manager_handover: 'Handover', it: 'IT', admin: 'Admin', finance: 'Finance', hr: 'HR', asset: 'Asset', custom: 'Other' };
const ITEM: Record<ClearanceItem['status'], { label: string; tone: BadgeTone }> = { open: { label: 'To do', tone: 'warning' }, cleared: { label: 'Cleared', tone: 'success' }, waived: { label: 'Waived', tone: 'neutral' } };
const COMPANY_TYPES: { value: Exclude<ExitType, 'resignation'>; label: string }[] = [
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
}

export function ResignationScreen(p: ResignationScreenProps) {
  const [withdrawing, setWithdrawing] = useState(false);
  const d = p.data;
  const k = d?.current ?? null;
  return (
    <LivePage title="Resign" description="Your notice comes from the company policy. Your manager, then HR, accept your resignation." state={p.state} onRetry={p.onRetry} what="your resignation">
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
    { key: 'ack', header: 'Received', value: (r) => r.acknowledgedAt ?? '', render: (r) => (r.acknowledgedAt ? <Badge tone="success">Confirmed</Badge> : <Badge tone="warning">Not confirmed</Badge>), width: 140 },
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
  onStart: (input: { employeeId: string; exitType: Exclude<ExitType, 'resignation'>; lwd: string; reasonText: string }) => Promise<{ id: string }>;
  onOpen: (id: string) => void;
}

export function ExitCasesScreen(p: ExitCasesScreenProps) {
  const [starting, setStarting] = useState(false);
  const [show, setShow] = useState<'open' | 'all'>('open');
  const rows = (p.rows ?? []).filter((r) => show === 'all' || ['submitted', 'accepted', 'cleared'].includes(r.status));
  const columns: TableColumn<ExitRow>[] = [
    { key: 'name', header: 'Person', type: 'person', value: (r) => r.name, person: (r) => ({ name: r.name, secondary: r.employeeCode ?? undefined }), width: 220, hideable: false },
    { key: 'type', header: 'Exit', value: (r) => r.typeLabel, width: 170 },
    { key: 'status', header: 'Where it stands', value: (r) => r.status, render: (r) => <StatusBadge status={r.status} />, width: 180 },
    { key: 'lwd', header: 'Last working day', value: (r) => r.lastDay, render: (r) => dateText(r.lastDay), width: 150 },
    { key: 'clearance', header: 'Clearance', value: (r) => r.clearance.open, render: (r) => (r.clearance.total ? <Text>{r.clearance.open ? `${r.clearance.open} of ${r.clearance.total} to do` : 'All done'}</Text> : <Text tone="secondary">Not started</Text>), width: 140, optional: true },
    { key: 'interview', header: 'Exit interview', value: (r) => r.interview ?? '', render: (r) => <Text tone={r.interview === 'submitted' ? undefined : 'secondary'}>{r.interview === 'submitted' ? 'Done' : r.interview === 'sent' ? 'Not done' : 'None'}</Text>, width: 130, optional: true },
  ];
  return (
    <LivePage
      title="Exits"
      description="Resignations and company exits of the people you look after. Open items in clearance never stop someone leaving: they go to payroll as recoveries."
      state={p.state}
      onRetry={p.onRetry}
      what="exits"
      actions={
        p.canStart ? (
          <Button variant="primary" onClick={() => setStarting(true)}>
            Start exit
          </Button>
        ) : undefined
      }
    >
      <Segment label="Show" value={show} onChange={setShow} options={[{ value: 'open', label: 'In progress' }, { value: 'all', label: 'All' }]} />
      {p.rows && (
        <DataTable
          label="Exits"
          columns={columns}
          rows={rows}
          getRowId={(r) => r.id}
          rowNoun={['exit', 'exits']}
          cardSummary
          empty={<EmptyState compact title="No exits in progress." />}
          rowButtons={(r) => (
            <Button size="sm" onClick={() => p.onOpen(r.id)}>
              Open
            </Button>
          )}
        />
      )}
      {starting && <StartExitDialog people={p.people} today={p.today} onClose={() => setStarting(false)} onStart={async (x) => {
        const k = await p.onStart(x);
        p.onOpen(k.id);
        return k;
      }} />}
    </LivePage>
  );
}

function StartExitDialog({ people, today, onClose, onStart }: { people: Choice[]; today: string; onClose: () => void; onStart: ExitCasesScreenProps['onStart'] }) {
  const [who, setWho] = useState<string | null>(null);
  const [type, setType] = useState<Exclude<ExitType, 'resignation'> | null>(null);
  const [lwd, setLwd] = useState<Date | null>(null);
  const [reason, setReason] = useState('');
  const past = type === 'death' || type === 'absconding';
  const ready = Boolean(who && type && lwd) && reason.trim().length >= 3;
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
        await onStart({ employeeId: who!, exitType: type!, lwd: dayKey(lwd!), reasonText: reason.trim() });
        onClose();
      }}
    >
      <FormField id="se-who" label="Person" required>
        <Select aria-label="Person" value={who} onChange={setWho} options={people} searchable />
      </FormField>
      <FormField id="se-type" label="Kind of exit" required>
        <Select aria-label="Kind of exit" value={type} onChange={(x) => { setType(x as Exclude<ExitType, 'resignation'>); setLwd(null); }} options={COMPANY_TYPES} />
      </FormField>
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
}
type SignOffHandler = (item: ClearanceItem, input: { action: 'clear' | 'waive'; note: string | null; recoveryAmount: string | null; recoveryReason: string | null }) => Promise<unknown>;

export function ExitCaseScreen(p: ExitCaseScreenProps) {
  const [ask, setAsk] = useState<'notice' | 'hr' | 'interview' | null>(null);
  const d = p.data;
  return (
    <LivePage
      title={d ? `${d.name}: ${d.typeLabel.toLowerCase()}` : 'Exit'}
      description={d ? <StatusBadge status={d.status} /> : undefined}
      state={p.state}
      onRetry={p.onRetry}
      what="this exit"
      actions={
        <Button size="sm" onClick={p.onBack}>
          All exits
        </Button>
      }
    >
      {d && (
        <>
          <Card
            title="The exit"
            actions={
              d.can.manage && d.status === 'accepted' && !d.pendingChange ? (
                <Button size="sm" onClick={() => setAsk('notice')}>
                  Change last day
                </Button>
              ) : undefined
            }
          >
            <Facts
              rows={[
                ['Started', dateText(d.submittedOn)],
                ['Notice', d.initiatedBy === 'employee' ? d.noticeLabel : null],
                ['Last working day', dateText(d.lastDay)],
                ['Reason', d.reasonText],
                ['Exit interview', d.interview === 'submitted' ? 'Done' : d.interview === 'sent' ? 'Not done yet' : null],
              ]}
            />
            {d.pendingChange && <InlineAlert tone="info" title={d.pendingChange.kind === 'withdrawal' ? 'Withdrawal waiting for a decision' : 'A new last day is waiting for approval'}>{d.pendingChange.lwd ? `Asked for ${dateText(d.pendingChange.lwd)}.` : 'The manager and HR decide.'}</InlineAlert>}
            {d.noticeArrangement?.map((a, i) => (
              <Text key={i} tone="secondary" size="sm" as="p">{`${a.kind === 'early_release' ? 'Early release' : a.kind === 'buyout' ? `Buy-out (${a.buyoutDays} days, paid by the ${a.buyoutBy})` : 'New last day'}: ${dateText(a.from)} → ${dateText(a.to)}. ${a.reason}`}</Text>
            ))}
            <div className="yx-lif-actions">
              {d.journeyId && (
                <Button size="sm" asChild>
                  <a href={p.checklistHref(d.journeyId)}>Offboarding checklist</a>
                </Button>
              )}
              {d.can.interview && d.interview === 'submitted' && (
                <Button size="sm" onClick={() => setAsk('interview')}>
                  Read exit interview
                </Button>
              )}
            </div>
          </Card>
          {d.hr && (
            <Card
              title="HR only"
              actions={
                d.can.confidential ? (
                  <Button size="sm" onClick={() => setAsk('hr')}>
                    Edit
                  </Button>
                ) : undefined
              }
            >
              <Facts
                rows={[
                  ['Open cases', Object.entries(d.hr.openCaseFlags).map(([k, v]) => `${k.toUpperCase() === 'POSH' ? 'POSH' : k[0].toUpperCase() + k.slice(1)}: ${v.replace(/_/g, ' ')}`).join(' · ')],
                  ['Rehire', d.hr.rehireEligible === null ? 'Not decided' : d.hr.rehireEligible ? 'Eligible' : `Not eligible${d.hr.rehireReason ? ` (${d.hr.rehireReason})` : ''}`],
                  ['Regretted loss', d.hr.regretted === null ? 'Not decided' : d.hr.regretted ? 'Yes' : 'No'],
                  ['Backfill', d.hr.backfillRequested ? 'Asked for' : 'Not asked for'],
                  ['Letters on hold', d.hr.holdReason ? `${d.hr.holdReason}${d.hr.holdReviewOn ? `, review on ${dateText(d.hr.holdReviewOn)}` : ''}` : 'No'],
                ]}
              />
            </Card>
          )}
          <ClearanceTable items={d.clearance} canSign={d.can.manage && ['accepted', 'cleared'].includes(d.status)} onSignOff={p.onSignOff} />
        </>
      )}
      {d && ask === 'notice' && <NoticeDialog d={d} today={p.today} onClose={() => setAsk(null)} onNotice={p.onNotice} />}
      {d && ask === 'hr' && d.hr && <HrFactsDialog d={d} onClose={() => setAsk(null)} onSave={p.onHrFacts} />}
      {d && ask === 'interview' && <InterviewDialog onClose={() => setAsk(null)} load={p.onInterview} onNotes={p.onInterviewNotes} />}
    </LivePage>
  );
}

function NoticeDialog({ d, today, onClose, onNotice }: { d: ExitWorkspace; today: string; onClose: () => void; onNotice: ExitCaseScreenProps['onNotice'] }) {
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

function HrFactsDialog({ d, onClose, onSave }: { d: ExitWorkspace; onClose: () => void; onSave: ExitCaseScreenProps['onHrFacts'] }) {
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

function InterviewDialog({ onClose, load, onNotes }: { onClose: () => void; load: () => Promise<InterviewAnswers>; onNotes: (notes: string) => Promise<unknown> }) {
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

function ClearanceTable({ items, canSign, onSignOff, showPerson }: { items: (ClearanceItem | MyClearanceItem)[]; canSign: boolean; onSignOff: SignOffHandler; showPerson?: boolean }) {
  const [item, setItem] = useState<ClearanceItem | null>(null);
  const columns: TableColumn<ClearanceItem | MyClearanceItem>[] = [
    ...(showPerson ? [{ key: 'person', header: 'Leaver', type: 'person' as const, value: (r: ClearanceItem | MyClearanceItem) => ('person' in r ? r.person : ''), person: (r: ClearanceItem | MyClearanceItem) => ({ name: 'person' in r ? r.person : '', secondary: 'lastDay' in r ? `Last day ${dateText(r.lastDay)}` : undefined }), width: 220, hideable: false }] : []),
    { key: 'title', header: 'Item', value: (r) => r.title, render: (r) => <span className="yx-auth__item-main"><Text>{r.title}</Text><Text tone="secondary" size="sm">{`${DEPT[r.department]} · ${r.owner}`}</Text></span>, width: 300, hideable: !showPerson },
    { key: 'status', header: 'Status', value: (r) => r.status, render: (r) => <Badge tone={ITEM[r.status].tone}>{ITEM[r.status].label}</Badge>, width: 110 },
    { key: 'recovery', header: 'Recovery', value: (r) => r.recoveryAmount ?? '', render: (r) => (r.recoveryAmount ? <Text>{rupees(r.recoveryAmount)}</Text> : <Text tone="secondary">None</Text>), width: 120, optional: true },
    { key: 'note', header: 'Note', value: (r) => r.note ?? r.recoveryReason ?? '', width: 220, optional: true },
  ];
  return (
    <Card title="Clearance">
      <DataTable
        label="Clearance"
        columns={columns}
        rows={items}
        getRowId={(r) => r.id}
        rowNoun={['item', 'items']}
        cardSummary
        empty={<EmptyState compact title={showPerson ? 'No clearance sign-offs for you.' : 'Clearance starts when the exit is accepted.'} />}
        rowButtons={(r) =>
          canSign && r.status === 'open' ? (
            <Button size="sm" onClick={() => setItem(r)}>
              Sign off
            </Button>
          ) : null
        }
      />
      {item && <SignOffDialog item={item} onClose={() => setItem(null)} onSignOff={onSignOff} />}
    </Card>
  );
}

function SignOffDialog({ item, onClose, onSignOff }: { item: ClearanceItem; onClose: () => void; onSignOff: SignOffHandler }) {
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

export interface ClearanceScreenProps {
  state: LoadState;
  onRetry?: () => void;
  rows: MyClearanceItem[] | null;
  onSignOff: SignOffHandler;
}

export function ClearanceScreen(p: ClearanceScreenProps) {
  const [show, setShow] = useState<'open' | 'all'>('open');
  const rows = (p.rows ?? []).filter((r) => show === 'all' || r.status === 'open');
  return (
    <LivePage title="Clearance" description="Sign-offs for people leaving that you or your team look after." state={p.state} onRetry={p.onRetry} what="clearance">
      <Segment label="Show" value={show} onChange={setShow} options={[{ value: 'open', label: 'To do' }, { value: 'all', label: 'All' }]} />
      {p.rows && <ClearanceTable items={rows} canSign onSignOff={p.onSignOff} showPerson />}
    </LivePage>
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

const ASSET_STATUS: Record<AssetRow['status'], { label: string; tone: BadgeTone }> = { in_stock: { label: 'In stock', tone: 'success' }, assigned: { label: 'With someone', tone: 'info' }, in_repair: { label: 'In repair', tone: 'warning' }, retired: { label: 'Retired', tone: 'neutral' }, lost: { label: 'Lost', tone: 'danger' } };

export function AssetsScreen(p: AssetsScreenProps) {
  const [adding, setAdding] = useState(false);
  const [issue, setIssue] = useState<AssetRow | null>(null);
  const [back, setBack] = useState<AssetRow | null>(null);
  const columns: TableColumn<AssetRow>[] = [
    { key: 'name', header: 'Asset', value: (r) => r.name, render: (r) => <span className="yx-auth__item-main"><Text>{r.name}</Text><Text tone="secondary" size="sm">{`${r.category} · ${r.tag}`}</Text></span>, width: 260, hideable: false },
    { key: 'status', header: 'Status', value: (r) => r.status, render: (r) => <Badge tone={ASSET_STATUS[r.status].tone}>{ASSET_STATUS[r.status].label}</Badge>, width: 130 },
    { key: 'holder', header: 'With', value: (r) => r.holder?.name ?? '', render: (r) => (r.holder ? <span className="yx-auth__item-main"><Text>{r.holder.name}</Text><Text tone="secondary" size="sm">{`Since ${dateText(r.holder.issuedOn)}${r.holder.acknowledged ? ' · confirmed' : ''}`}</Text></span> : <Text tone="secondary">Nobody</Text>), width: 220 },
    { key: 'cost', header: 'Cost', value: (r) => r.cost ?? '', render: (r) => (r.cost ? rupees(r.cost) : ''), width: 120, optional: true },
  ];
  return (
    <LivePage
      title="Assets"
      description="Laptops, phones, cards and other company things, and who holds them. One list for HR and IT."
      state={p.state}
      onRetry={p.onRetry}
      what="assets"
      grantedBy="your IT or HR admin"
      actions={
        p.canAdd ? (
          <Button variant="primary" onClick={() => setAdding(true)}>
            Add asset
          </Button>
        ) : undefined
      }
    >
      {p.rows && (
        <DataTable
          label="Assets"
          columns={columns}
          rows={p.rows}
          getRowId={(r) => r.id}
          rowNoun={['asset', 'assets']}
          cardSummary
          empty={<EmptyState compact title="No assets yet." />}
          rowButtons={(r) =>
            !r.canManage ? null : r.status === 'in_stock' ? (
              <Button size="sm" onClick={() => setIssue(r)}>
                Issue
              </Button>
            ) : r.status === 'assigned' ? (
              <Button size="sm" onClick={() => setBack(r)}>
                Take back
              </Button>
            ) : null
          }
        />
      )}
      {adding && <AddAssetDrawer entities={p.entities} locations={p.locations} onClose={() => setAdding(false)} onAdd={p.onAdd} />}
      {issue && <IssueDialog asset={issue} people={p.people} today={p.today} onClose={() => setIssue(null)} onIssue={p.onIssue} />}
      {back && <ReturnDialog asset={back} today={p.today} onClose={() => setBack(null)} onReturn={p.onReturn} />}
    </LivePage>
  );
}

function AddAssetDrawer({ entities, locations, onClose, onAdd }: { entities: Choice[]; locations: (Choice & { entityId: string })[]; onClose: () => void; onAdd: AssetsScreenProps['onAdd'] }) {
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

function IssueDialog({ asset, people, today, onClose, onIssue }: { asset: AssetRow; people: Choice[]; today: string; onClose: () => void; onIssue: AssetsScreenProps['onIssue'] }) {
  const [who, setWho] = useState<string | null>(null);
  const [on, setOn] = useState<Date | null>(fromKey(today));
  const [condition, setCondition] = useState('New');
  const ready = Boolean(who && on) && condition.trim().length >= 2;
  return (
    <ConfirmDialog open onOpenChange={(o) => !o && onClose()} size="md" title={`Issue ${asset.name}`} consequence="The person is asked to confirm they received it." confirmLabel="Issue" confirmDisabled={!ready} onConfirm={async () => { await onIssue(asset, { employeeId: who!, issuedOn: dayKey(on!), condition: condition.trim() }); onClose(); }}>
      <FormField id="is-who" label="To" required>
        <Select aria-label="To" value={who} onChange={setWho} options={people} searchable />
      </FormField>
      <FormField id="is-on" label="Issued on" required>
        <DatePicker value={on} onChange={setOn} max={fromKey(today)} aria-label="Issued on" />
      </FormField>
      <FormField id="is-cond" label="Condition" required>
        <TextField value={condition} onChange={setCondition} maxLength={200} />
      </FormField>
    </ConfirmDialog>
  );
}

function ReturnDialog({ asset, today, onClose, onReturn }: { asset: AssetRow; today: string; onClose: () => void; onReturn: AssetsScreenProps['onReturn'] }) {
  const [status, setStatus] = useState<'in_stock' | 'in_repair' | 'lost'>('in_stock');
  const [on, setOn] = useState<Date | null>(fromKey(today));
  const [condition, setCondition] = useState('');
  const ready = Boolean(on) && condition.trim().length >= 2;
  return (
    <ConfirmDialog
      open
      onOpenChange={(o) => !o && onClose()}
      size="md"
      title={`Take back ${asset.name}`}
      consequence={status === 'lost' ? `The leaver's clearance item stays open, for a recovery${asset.cost ? ` (cost ${rupees(asset.cost)})` : ''}.` : 'A leaver’s clearance item for it is signed off.'}
      confirmLabel={status === 'lost' ? 'Mark not returned' : 'Take back'}
      confirmDisabled={!ready}
      onConfirm={async () => {
        await onReturn(asset, { returnedOn: dayKey(on!), condition: condition.trim(), status });
        onClose();
      }}
    >
      <Segment label="Outcome" value={status} onChange={setStatus} options={[{ value: 'in_stock', label: 'Back in stock' }, { value: 'in_repair', label: 'Needs repair' }, { value: 'lost', label: 'Not returned' }]} />
      <FormField id="rt-on" label={status === 'lost' ? 'Recorded on' : 'Returned on'} required>
        <DatePicker value={on} onChange={setOn} max={fromKey(today)} aria-label="Returned on" />
      </FormField>
      <FormField id="rt-cond" label={status === 'lost' ? 'What happened' : 'Condition'} required>
        <TextField value={condition} onChange={setCondition} maxLength={200} />
      </FormField>
    </ConfirmDialog>
  );
}

