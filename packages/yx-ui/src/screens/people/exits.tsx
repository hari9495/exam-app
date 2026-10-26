// PPL-18 Resignation · PPL-19 Exit cases · PPL-20 Clearance · PPL-21 Exit interview · PPL-22 F&F calculator
// PPL-23 Death in service · PPL-24 Absconding timeline (M01 §3.7, §3.8; YX-LC-04…23).
import { useState, type ReactNode } from 'react';
import { Mail, MoreHorizontal, Pause, Play, RefreshCw, Upload } from 'lucide-react';
import { PhoneFrame } from '../_kit/frames';
import { Button, IconButton } from '../../components/button';
import { Card, ObjectHeader, PageHeader } from '../../components/shell';
import { DataTable, type TableColumn } from '../../components/table';
import { Badge } from '../../components/display';
import { EmptyState, ErrorState, NoAccessState, InlineAlert } from '../../components/feedback';
import { FormField } from '../../components/field';
import { Select } from '../../components/select';
import { DatePicker } from '../../components/date';
import { TextArea, TextField } from '../../components/inputs';
import { Checkbox, RadioGroup, Switch } from '../../components/choice';
import { ApprovalTimeline } from '../../components/timeline';
import { Stepper, useNarrow } from '../../components/stepper';
import { FileUpload } from '../../components/upload';
import { ConfirmDialog } from '../../components/overlay';
import { Menu, MenuContent, MenuItem, MenuTrigger } from '../../components/menu';
import { Text } from '../../components/foundations';
import { formatDate, formatINR } from '../../lib/format';
import { abscondingState, addWorkingDays, daysBetween, fnfTotals, gratuity, noticeOutcome, splitByShares, type FnfLine, type Persona } from './people-logic';
import { CLEARANCE, DEATH_PAYEES, DEPROVISIONING, EXIT_CASES, HOLIDAYS, ME, MEERA, MEERA_FNF, TODAY } from './people-data';
import { DueCountdown, exportCsv, ExplainedLines, ListSkeleton, MeFrame, PeopleFrame, StatusBadge, StatusChecklist, type ChecklistRow } from './people-kit';
import { HandoffCard, HrFactsDialog, InterviewDialog, NoticeDialog, SignOffDialog, type ExitCaseScreenProps } from './live/exits';
import { PayeesCard } from './live/special';
import type { AbscondingRow, ClearanceItem, ExitStep, ExitWorkspace, MyClearanceItem } from './live/types';
import { Segment } from './people-kit';
import { useRun } from '../org/org-kit';
import type { FnfSettlementView, FnfSlipLine } from '../pay/live/types-5j';

/* ================================================================== PPL-18 resignation */

const REASONS = ['Higher studies', 'Better role elsewhere', 'Relocation', 'Family reasons', 'Health', 'Other'].map((x) => ({ value: x, label: x }));

function ResignationFields({ today, lwd, setLwd }: { today: Date; lwd: Date | null; setLwd: (d: Date | null) => void }) {
  const n = noticeOutcome(today, 60, lwd, 23000);
  return (
    <div className="yx-ppl__stack">
      <div className="yx-ppl__form">
        <FormField label="Reason" required>
          <Select options={REASONS} value="Better role elsewhere" onChange={() => {}} />
        </FormField>
        <FormField label="Proposed last working day" required helper="Your notice is 60 days (confirmed, grade G5), counted from today.">
          <DatePicker value={lwd} onChange={setLwd} min={today} />
        </FormField>
        <FormField label="Anything you want your manager and HR to know" optional>
          <TextArea rows={3} />
        </FormField>
      </div>
      <Card title="What this means">
        <dl className="yx-ppl__rail-facts">
          <div><dt>Standard last working day</dt><dd>{formatDate(n.standardLwd)}</dd></div>
          <div><dt>You asked for</dt><dd>{formatDate(n.requestedLwd)}</dd></div>
          <div>
            <dt>Notice shortfall</dt>
            <dd>{n.shortfallDays ? `${n.shortfallDays} days · about ${formatINR(n.shortfallAmount)} recovered in your F&F unless your manager waives it or you adjust earned leave` : 'None'}</dd>
          </div>
        </dl>
        {n.shortfallDays > 0 && <InlineAlert tone="warning">An early release needs your manager's and HR's approval.</InlineAlert>}
        <Text size="sm" tone="secondary" as="p">
          Leave during notice follows each leave type's notice rule. Sick leave extends your last day; casual leave is allowed.
        </Text>
      </Card>
    </div>
  );
}

// PPL-18
export function ResignationSheet({ today, requested = null, submitted = false, accepted = false }: { today: Date; requested?: Date | null; submitted?: boolean; accepted?: boolean }) {
  const [lwd, setLwd] = useState<Date | null>(requested);
  const [withdrawOpen, setWithdrawOpen] = useState(false);
  if (submitted)
    return (
      <MeFrame active="My exit">
        <PageHeader title="Your resignation" status={<StatusBadge status={accepted ? 'Approved' : 'Pending approval'} />} description={`Submitted ${formatDate(today)} · last working day ${formatDate(lwd ?? noticeOutcome(today, 60, null, 0).standardLwd)}`} actions={<Button onClick={() => setWithdrawOpen(true)}>Withdraw resignation</Button>} />
        <Card title="Approval">
          <ApprovalTimeline
            now={today}
            steps={[
              { id: 's', label: 'Submitted', status: 'done', approver: 'Divya Raghunathan (you)', at: today },
              { id: 'm', label: 'Manager', status: accepted ? 'done' : 'current', approver: 'Karthik Subramanian', at: accepted ? today : undefined },
              { id: 'h', label: 'HR', status: accepted ? 'done' : 'pending', approver: 'Lakshmi Venkatesan', at: accepted ? today : undefined },
            ]}
          />
        </Card>
        <ConfirmDialog
          open={withdrawOpen}
          onOpenChange={setWithdrawOpen}
          title="Withdraw your resignation?"
          consequence={accepted ? 'It has been accepted, so your manager and HR must approve the withdrawal.' : 'It has not been accepted yet, so it is withdrawn now and your manager is told.'}
          confirmLabel={accepted ? 'Ask to withdraw' : 'Withdraw resignation'}
          cancelLabel="Keep resignation"
          onConfirm={() => setWithdrawOpen(false)}
        />
      </MeFrame>
    );
  return (
    <MeFrame active="My exit">
      <PageHeader title="Resign" description="Your manager and HR accept it in the app. You can withdraw it until it is accepted, and after that with approval." />
      <ResignationFields today={today} lwd={lwd} setLwd={setLwd} />
      <div className="yx-ppl__row">
        <Button>Cancel</Button>
        <Button variant="primary">Send resignation</Button>
      </div>
    </MeFrame>
  );
}

// PPL-18 · phone
export function ResignationPhone({ today, requested = null }: { today: Date; requested?: Date | null }) {
  const [lwd, setLwd] = useState<Date | null>(requested);
  return (
    <PhoneFrame tab="me" title="Resign">
      <ResignationFields today={today} lwd={lwd} setLwd={setLwd} />
      <Button variant="primary" fullWidth>
        Send resignation
      </Button>
    </PhoneFrame>
  );
}

/* ================================================================== PPL-19 exit cases */

export type ExitRow = (typeof EXIT_CASES)[number];
const EXIT_STAGES = ['Approval and notice', 'Clearance', 'Exit interview', 'F&F', 'Documents'];

/** F&F is due 2 working days after the last working day; once the case reaches Documents it is paid. */
function fnfState(r: ExitRow, today: Date, holidays: Date[] = HOLIDAYS): { text: string; late: boolean } | null {
  if (EXIT_STAGES.indexOf(r.stage) >= EXIT_STAGES.indexOf('Documents')) return null;
  const due = addWorkingDays(r.lwd, 2, holidays);
  const over = daysBetween(due, today);
  return over > 0 ? { text: `F&F overdue by ${over} ${over === 1 ? 'day' : 'days'}`, late: true } : { text: `F&F due ${formatDate(due)}`, late: false };
}

/** Last working day plus "in 18 days" / "15 days ago". */
function LwdCell({ date, today }: { date: Date; today: Date }) {
  const n = daysBetween(today, date);
  return (
    <span className="yx-ppl__row yx-ppl__row--tight">
      {formatDate(date)}
      <Badge tone="neutral">{n === 0 ? 'today' : n > 0 ? `in ${n} ${n === 1 ? 'day' : 'days'}` : `${-n} ${n === -1 ? 'day' : 'days'} ago`}</Badge>
    </span>
  );
}

function StageCell({ r, today, holidays }: { r: ExitRow; today: Date; holidays?: Date[] }) {
  const fnf = fnfState(r, today, holidays);
  return (
    <span className="yx-ppl__type">
      <Badge tone="info">{r.stage}</Badge>
      {fnf && <Text size="sm" tone={fnf.late ? 'danger' : 'secondary'}>{fnf.text}</Text>}
    </span>
  );
}

// PPL-19
/** The live app's exit cases (design audit step 3). */
export interface LiveExits {
  state: 'ready' | 'loading' | 'error' | 'no-access';
  onRetry: () => void;
  onOpen: (id: string) => void;
  onStart?: () => void;
  children?: ReactNode;
}

export function ExitCasesList({ rows, persona = 'hr', state: ownState = 'ready', today = TODAY, live }: { rows: ExitRow[]; persona?: Persona; state?: 'ready' | 'loading'; today?: Date; live?: LiveExits }) {
  const hr = persona === 'hr';
  // Live: the API already limits the list to the cases the viewer may see.
  const shown = hr || live ? rows : rows.filter((r) => r.manager === ME.name);
  const state = live ? (live.state === 'error' ? 'ready' : live.state) : ownState;
  const narrow = useNarrow();
  const flag = (r: ExitRow) => (r.flags ? <Badge tone={r.flagTone ?? 'warning'}>{r.flags}</Badge> : null);
  const open = (r: ExitRow) => (
    <Button size="sm" onClick={() => live?.onOpen(r.id)} aria-label={`Open case for ${r.name}`}>
      Open case
    </Button>
  );
  const cols: TableColumn<ExitRow>[] = [
    { key: 'name', header: 'Leaver', type: 'person', value: (r) => r.name, person: (r) => ({ name: r.name, secondary: `${r.code} · ${r.type}` }), width: 210 },
    { key: 'lwd', header: 'Last working day', type: 'date', value: (r) => r.lwd, render: (r) => <LwdCell date={r.lwd} today={today} />, width: 160 },
    // shortcut: live F&F due counts working days without the company's holidays; pass them if a holiday falls in the 2 days.
    { key: 'stage', header: 'Stage', value: (r) => EXIT_STAGES.indexOf(r.stage), render: (r) => <StageCell r={r} today={today} holidays={live ? [] : undefined} />, width: 170 },
    ...(hr ? [{ key: 'manager', header: 'Manager', value: (r: ExitRow) => r.manager, width: 160, optional: true } as TableColumn<ExitRow>] : []),
    ...(hr ? [{ key: 'flags', header: 'Flags', value: (r: ExitRow) => r.flags, render: flag, width: 170 } as TableColumn<ExitRow>] : []),
  ];
  const empty = <EmptyState title="No open exits" description="Resignations and other exits appear here once raised." />;
  return (
    <PeopleFrame active="Exit cases" persona={persona}>
      <PageHeader title="Exit cases" description="From approval and notice to clearance, exit interview, F&F and documents." actions={live ? (live.onStart ? <Button variant="primary" onClick={live.onStart}>Start exit</Button> : undefined) : hr ? <Button variant="primary">Start exit</Button> : undefined} />
      {live?.state === 'no-access' ? (
        <NoAccessState what="the exit cases" grantedBy="your HR admin" />
      ) : live?.state === 'error' ? (
        <ErrorState title="We couldn't load the exit cases" description="Check your connection and try again." onRetry={live.onRetry} />
      ) : narrow && state === 'ready' ? (
        shown.length === 0 ? (
          empty
        ) : (
          <ul className="yx-ppl__cards" aria-label="Exit cases">
            {shown.map((r) => (
              <li key={r.id} className="yx-ppl__rcard">
                <span className="yx-ppl__rcard-name">{r.name}</span>
                <span className="yx-ppl__sub">
                  {r.type} · {r.code}
                </span>
                <LwdCell date={r.lwd} today={today} />
                <StageCell r={r} today={today} holidays={live ? [] : undefined} />
                {hr && flag(r)}
                {open(r)}
              </li>
            ))}
          </ul>
        )
      ) : (
        <DataTable
          label="Exit cases"
          columns={cols}
          rows={shown}
          getRowId={(r) => r.id}
          state={state === 'loading' ? 'loading' : 'ready'}
          defaultSort={{ key: 'lwd', dir: 'asc' }}
          onRowClick={(r) => live?.onOpen(r.id)}
          rowButtons={open}
          // Live: F&F opens inside the case.
          rowActions={live ? undefined : () => <MenuItem>Open F&F</MenuItem>}
          {...(live && hr ? { onExport: exportCsv('exit-cases', shown, cols) } : {})}
          empty={empty}
          onExport={hr && !live ? () => {} : undefined}
        />
      )}
      {live?.children}
    </PeopleFrame>
  );
}

/** Facts per case; Neha's termination is not Meera's resignation (founder review 1 Oct 2026). */
const CASE_FACTS = {
  standard: {
    status: 'Serving notice',
    notice: '60 days, no shortfall',
    backfill: 'Requested · REQ-2026-0319',
    rehire: 'Yes',
    regretted: 'Yes (HR only)',
  },
  held: {
    status: 'Exited',
    notice: 'Paid in lieu (30 days)',
    backfill: 'Not requested',
    rehire: 'No',
    regretted: 'No (HR only)',
  },
};

/* ------------------------------------------------------------------ PPL-19 case workspace, live (design audit step 3) */

const LIVE_STATUS: Record<ExitWorkspace['status'], { label: string; tone: 'warning' | 'info' | 'success' | 'neutral' }> = {
  submitted: { label: 'Waiting for acceptance', tone: 'warning' },
  accepted: { label: 'Serving notice', tone: 'warning' },
  rejected: { label: 'Not accepted', tone: 'neutral' },
  withdrawn: { label: 'Withdrawn', tone: 'neutral' },
  cleared: { label: 'Cleared', tone: 'info' },
  exited: { label: 'Exited', tone: 'neutral' },
  closed: { label: 'Closed', tone: 'neutral' },
};
const LIVE_DEPT: Record<ClearanceItem['department'], string> = { manager_handover: 'Handover', it: 'IT', admin: 'Admin', finance: 'Finance', hr: 'HR', asset: 'Asset', custom: 'Other' };
const LIVE_STEP: Record<ExitStep['status'], string> = { pending: 'Pending', held: 'Held', done: 'Done', failed: 'Failed', manual: 'Done' };
const LIVE_WHEN: Record<ExitStep['timing'], string> = { at_lwd: 'On the last day', t0: 'After the last day', cleared: 'When cleared' };
const isoDay = (iso: string) => new Date(`${iso.slice(0, 10)}T00:00:00`);

function LiveExitCaseWorkspace({ live: p, persona }: { live: ExitCaseScreenProps; persona: Persona }) {
  const d = p.data;
  const [ask, setAsk] = useState<'notice' | 'hr' | 'interview' | null>(null);
  const [signing, setSigning] = useState<ClearanceItem | null>(null);
  const [manual, setManual] = useState<ExitStep | null>(null);
  const [note, setNote] = useState('');
  const [retrying, setRetrying] = useState<string | null>(null);
  if (p.state !== 'ready' || !d)
    return (
      <PeopleFrame active="Exit cases" persona={persona}>
        {p.state === 'error' ? (
          <ErrorState title="We couldn't load this exit" description="Check your connection and try again." onRetry={p.onRetry} />
        ) : p.state === 'no-access' ? (
          <EmptyState title="Not found" description="This exit doesn't exist or you can't open it." action={<Button onClick={p.onBack}>All exit cases</Button>} />
        ) : (
          <ListSkeleton label="Loading the exit" />
        )}
      </PeopleFrame>
    );
  const today = isoDay(p.today);
  const first = d.name.split(' ')[0];
  const lwd = isoDay(d.lastDay);
  const steps = p.steps ?? [];
  const letters = steps.filter((s) => /letter/i.test(s.label));
  const deprov = steps.filter((s) => !/letter/i.test(s.label));
  const done = d.clearance.filter((c) => c.status !== 'open').length;
  const fnfDue = p.handoff?.current ? isoDay(p.handoff.current.wagesDueBy) : addWorkingDays(lwd, 2, []);
  const fnfLate = daysBetween(fnfDue, today) > 0 && !p.handoff?.settledOutside;
  const canSign = d.can.manage && ['accepted', 'cleared'].includes(d.status);
  const current = d.status === 'submitted' ? 'approval' : d.status === 'accepted' && d.clearance.some((c) => c.status === 'open') ? 'clearance' : d.status === 'accepted' && d.interview === 'sent' ? 'interview' : d.status === 'exited' || d.status === 'closed' ? 'documents' : 'fnf';
  const stepRow = (s: ExitStep): ChecklistRow => ({
    id: s.handler,
    title: s.label,
    owner: LIVE_WHEN[s.timing],
    status: LIVE_STEP[s.status],
    note: s.status === 'manual' ? 'Done by hand' : (s.lastError ?? undefined),
    action:
      (s.status === 'failed' || s.status === 'pending') && (p.onRetryStep || p.onStepDone) ? (
        <>
          {p.onRetryStep && (
            <Button
              size="sm"
              icon={RefreshCw}
              loading={retrying === s.handler}
              onClick={async () => {
                setRetrying(s.handler);
                try {
                  await p.onRetryStep!(s);
                } finally {
                  setRetrying(null);
                }
              }}
            >
              Retry
            </Button>
          )}
          {p.onStepDone && (
            <Button
              size="sm"
              onClick={() => {
                setNote('');
                setManual(s);
              }}
            >
              Done by hand
            </Button>
          )}
        </>
      ) : undefined,
  });
  const flags = d.hr ? Object.entries(d.hr.openCaseFlags) : [];
  return (
    <PeopleFrame active="Exit cases" persona={persona}>
      <ObjectHeader
        name={`${d.name} · ${d.typeLabel.toLowerCase()}`}
        avatarName={d.name}
        person
        secondary={`${d.employeeCode ? `${d.employeeCode} · ` : ''}submitted ${formatDate(isoDay(d.submittedOn))} · last working day ${formatDate(lwd)}`}
        status={<Badge tone={LIVE_STATUS[d.status].tone}>{LIVE_STATUS[d.status].label}</Badge>}
        facts={[
          ...(d.initiatedBy === 'employee' ? [{ label: 'Notice', value: d.noticeLabel }] : []),
          ...(d.hr ? [{ label: 'Backfill', value: d.hr.backfillRequested ? 'Asked for' : 'Not asked for' }, { label: 'Rehire eligible', value: d.hr.rehireEligible === null ? 'Not decided' : d.hr.rehireEligible ? 'Yes' : 'No' }, { label: 'Regretted exit', value: d.hr.regretted === null ? 'Not decided' : d.hr.regretted ? 'Yes (HR only)' : 'No (HR only)' }] : []),
        ]}
        // Message: no messaging in the live app yet (left out).
        actions={
          <>
            {d.journeyId && (
              <Button asChild>
                <a href={p.checklistHref(d.journeyId)}>Offboarding checklist</a>
              </Button>
            )}
            {d.can.manage && d.status === 'accepted' && !d.pendingChange && <Button onClick={() => setAsk('notice')}>Change last day</Button>}
          </>
        }
      />
      {d.lettersHeld && d.hr && (
        <InlineAlert tone="warning" title="Relieving and experience letters are held">
          {d.hr.holdReason ?? 'HR holds the letters.'} F&F wage lines still go out within 2 working days.
        </InlineAlert>
      )}
      {d.pendingChange && (
        <InlineAlert tone="info" title={d.pendingChange.kind === 'withdrawal' ? 'Withdrawal waiting for a decision' : 'A new last day is waiting for approval'}>
          {d.pendingChange.lwd ? `Asked for ${formatDate(isoDay(d.pendingChange.lwd))}.` : 'The manager and HR decide.'}
        </InlineAlert>
      )}
      <Stepper
        title="Exit case"
        defaultCurrent={current}
        finishLabel="Close exit case"
        finishBlocked="Payroll closes the case once the F&F is settled."
        steps={[
          {
            id: 'approval',
            title: 'Approval and notice',
            summary: d.status === 'submitted' ? 'Waiting for the manager and HR' : `Accepted · last working day ${formatDate(lwd)}`,
            content: (
              <div className="yx-ppl__stack">
                <dl className="yx-ppl__dl">
                  <div className="yx-ppl__dl-row"><dt>Started</dt><dd>{formatDate(isoDay(d.submittedOn))}</dd></div>
                  {d.initiatedBy === 'employee' && <div className="yx-ppl__dl-row"><dt>Notice</dt><dd>{d.noticeLabel}</dd></div>}
                  <div className="yx-ppl__dl-row"><dt>Last working day</dt><dd>{formatDate(lwd)}</dd></div>
                  {d.reasonText && <div className="yx-ppl__dl-row"><dt>Reason</dt><dd>{d.reasonText}</dd></div>}
                </dl>
                {d.noticeArrangement?.map((a, i) => (
                  <Text key={i} tone="secondary" size="sm" as="p">
                    {`${a.kind === 'early_release' ? 'Early release' : a.kind === 'buyout' ? `Buy-out (${a.buyoutDays} days, paid by the ${a.buyoutBy})` : 'New last day'}: ${formatDate(isoDay(a.from))} → ${formatDate(isoDay(a.to))}. ${a.reason}`}
                  </Text>
                ))}
              </div>
            ),
          },
          {
            id: 'clearance',
            title: 'Clearance',
            // Items still open: the step stays "Open · 4 of 6 signed off", never "Done" because it was visited.
            ...(d.clearance.length && done < d.clearance.length ? { status: 'open' as const, statusNote: `${done} of ${d.clearance.length} signed off` } : {}),
            summary: d.clearance.length ? `${done} of ${d.clearance.length} signed off` : 'Starts when the exit is accepted',
            content: d.clearance.length ? (
              <StatusChecklist
                label="Clearance"
                rows={d.clearance.map(
                  (c): ChecklistRow => ({
                    id: c.id,
                    title: `${LIVE_DEPT[c.department]}: ${c.title}`,
                    owner: c.owner,
                    status: c.status === 'cleared' ? 'Done' : c.status === 'waived' ? 'Skipped' : 'Pending',
                    note: c.recoveryAmount ? `Recovery ${formatINR(Number(c.recoveryAmount))} to F&F${c.recoveryReason ? ` · ${c.recoveryReason}` : ''}` : (c.note ?? undefined),
                    action: canSign && c.status === 'open' ? <Button size="sm" onClick={() => setSigning(c)}>Sign off</Button> : undefined,
                  }),
                )}
              />
            ) : (
              <Text as="p">Clearance starts when the exit is accepted.</Text>
            ),
          },
          {
            id: 'interview',
            title: 'Exit interview',
            summary: d.interview === 'submitted' ? 'Done' : d.interview === 'sent' ? `Sent to ${first}, not done yet` : d.interview === 'skipped' ? 'Skipped' : 'Not sent',
            content: (
              <div className="yx-ppl__stack">
                <Text as="p">{d.interview === 'submitted' ? `${first} answered the exit interview.` : d.interview === 'sent' ? `${first} has the exit interview and has not answered yet.` : d.interview === 'skipped' ? 'The exit interview was skipped.' : `No exit interview for this ${d.typeLabel.toLowerCase()}.`}</Text>
                {d.can.interview && d.interview === 'submitted' && (
                  <div>
                    <Button onClick={() => setAsk('interview')}>Open interview</Button>
                  </div>
                )}
              </div>
            ),
          },
          {
            id: 'fnf',
            title: 'F&F',
            summary: p.handoff?.settledOutside ? `Settled outside on ${formatDate(isoDay(p.handoff.settledOutside.on))}` : `Due ${formatDate(fnfDue)}`,
            content: (
              <div className="yx-ppl__stack">
                {p.handoff?.settledOutside ? null : fnfLate ? (
                  <InlineAlert tone="danger" title={`F&F was due ${formatDate(fnfDue)}`}>
                    Pay it now; the law allows 2 working days after the last working day.
                  </InlineAlert>
                ) : (
                  <Text as="p">Due {formatDate(fnfDue)}, 2 working days after the last working day.</Text>
                )}
                {p.handoff && <HandoffCard h={p.handoff} today={p.today} onSettled={p.onSettledOutside} />}
              </div>
            ),
          },
          {
            id: 'documents',
            title: 'Documents',
            summary: d.lettersHeld ? 'Letters held' : 'Relieving and experience letters',
            status: d.lettersHeld ? 'locked' : undefined,
            statusNote: d.lettersHeld ? 'Held by HR' : undefined,
            content: letters.length ? (
              <StatusChecklist label="Exit documents" rows={letters.map(stepRow)} />
            ) : (
              <Text as="p">{d.lettersHeld ? 'The relieving and experience letters are held by HR.' : 'The relieving and experience letters are made after the last working day.'}</Text>
            ),
          },
        ]}
      />
      {d.exitType === 'death' && p.payees && p.onPayees && <PayeesCard data={p.payees} documents={p.payeeDocuments ?? []} onSave={p.onPayees} />}
      <div className="yx-ppl__grid2">
        <Card title="Deprovisioning">
          {deprov.length ? <StatusChecklist label="Deprovisioning" rows={deprov.map(stepRow)} /> : <Text as="p" className="yx-ppl__muted">{p.steps ? 'The steps run on and after the last working day.' : 'HR sees the deprovisioning steps.'}</Text>}
        </Card>
        <Card title="Open cases and holds" actions={d.can.confidential && d.hr ? <Button size="sm" onClick={() => setAsk('hr')}>Edit</Button> : undefined}>
          {d.hr ? (
            flags.length || d.lettersHeld ? (
              <ul className="yx-ppl__successors">
                {flags.map(([k, v]) => (
                  <li key={k}>
                    <span>{k.toUpperCase() === 'POSH' ? 'POSH case' : `${k[0].toUpperCase()}${k.slice(1)}`}</span>
                    <Badge tone="warning">{v.replace(/_/g, ' ')}</Badge>
                  </li>
                ))}
                <li>
                  <span>Letters</span>
                  <Badge tone={d.lettersHeld ? 'warning' : 'success'}>{d.lettersHeld ? 'Held' : 'Not held'}</Badge>
                </li>
              </ul>
            ) : (
              <Text as="p">No open cases or plans. Nothing is held.</Text>
            )
          ) : (
            <Text as="p" className="yx-ppl__muted">HR handles case checks for exits.</Text>
          )}
        </Card>
      </div>
      {ask === 'notice' && <NoticeDialog d={d} today={p.today} onClose={() => setAsk(null)} onNotice={p.onNotice} />}
      {ask === 'hr' && d.hr && <HrFactsDialog d={d} onClose={() => setAsk(null)} onSave={p.onHrFacts} />}
      {ask === 'interview' && <InterviewDialog onClose={() => setAsk(null)} load={p.onInterview} onNotes={p.onInterviewNotes} />}
      {signing && <SignOffDialog item={signing} onClose={() => setSigning(null)} onSignOff={p.onSignOff} />}
      {manual && p.onStepDone && (
        <ConfirmDialog
          open
          onOpenChange={(o) => !o && setManual(null)}
          title={`${manual.label}: done by hand?`}
          consequence="Say what you did. It is kept on the record."
          confirmLabel="Mark done"
          confirmDisabled={note.trim().length < 3}
          onConfirm={async () => {
            await p.onStepDone!(manual, note.trim());
            setManual(null);
          }}
        >
          <FormField id="xs-note" label="What you did" required>
            <TextArea value={note} onChange={setNote} rows={2} maxLength={500} />
          </FormField>
        </ConfirmDialog>
      )}
    </PeopleFrame>
  );
}

// PPL-19 · case workspace
export function ExitCaseWorkspace({ persona = 'hr', current = 'clearance', variant = 'standard', today, live }: { persona?: Persona; current?: string; variant?: 'standard' | 'held'; today: Date; live?: ExitCaseScreenProps }) {
  if (live) return <LiveExitCaseWorkspace live={live} persona={persona} />;
  const hr = persona === 'hr';
  const held = variant === 'held';
  const name = held ? 'Neha Ghosh' : MEERA.name;
  const first = name.split(' ')[0];
  const facts = CASE_FACTS[variant];
  const lwd = held ? new Date(2026, 8, 22) : MEERA.lwd;
  const fnfDue = addWorkingDays(lwd, 2, HOLIDAYS);
  const fnfLate = daysBetween(fnfDue, today) > 0;
  const depRows: ChecklistRow[] = DEPROVISIONING.filter((d) => !(held && d.module === 'Headcount plan')).map((d, i) => ({
    id: String(i),
    title: `${d.module}: ${d.action}`,
    owner: d.timing,
    status: d.status,
    note: d.note,
    action: d.status === 'Failed' ? <Button size="sm" icon={RefreshCw}>Retry</Button> : undefined,
  }));
  const clearanceRows: ChecklistRow[] = CLEARANCE.map((c) => ({ id: c.id, title: `${c.dept}: ${c.item}`, owner: c.owner, status: c.status, note: c.recovery ? `Recovery ${formatINR(c.recovery)} to F&F` : undefined }));
  const letters: ChecklistRow[] = [
    { id: 'l1', title: 'Relieving letter', status: held ? 'Held' : 'Pending', note: held ? 'Held until the open case closes' : 'Issued after F&F approval' },
    { id: 'l2', title: 'Experience letter', status: held ? 'Held' : 'Pending', note: held ? 'Held until the open case closes' : 'Issued after F&F approval' },
    { id: 'l3', title: 'Form 16 (part year)', status: 'Pending', note: 'Issued by 15 Jun 2027' },
  ];
  const blocked = held ? 'Letters are held for an open case' : 'Clearance and F&F are still open';
  return (
    <PeopleFrame active="Exit cases" persona={persona}>
      <ObjectHeader
        name={`${name} · ${held ? 'termination' : 'resignation'}`}
        avatarName={name}
        person
        secondary={held ? `Sales Associate · last working day ${formatDate(lwd)}` : `${MEERA.role} · submitted ${formatDate(MEERA.submitted)} · last working day ${formatDate(MEERA.lwd)}`}
        status={<Badge tone={held ? 'neutral' : 'warning'}>{facts.status}</Badge>}
        facts={[
          { label: 'Notice', value: facts.notice },
          { label: 'Backfill', value: facts.backfill },
          ...(hr ? [{ label: 'Rehire eligible', value: facts.rehire }, { label: 'Regretted exit', value: facts.regretted }] : []),
        ]}
        actions={hr ? <Button icon={Mail}>Message {first}</Button> : <Button>Sign off handover</Button>}
      />
      {held && hr && (
        <InlineAlert tone="warning" title="Open case: relieving and experience letters are held">
          Neha is the respondent in an open case. Company policy holds letters until it closes; F&F wage lines still go out within 2 working days. The case continues after exit.
        </InlineAlert>
      )}
      <Stepper
        title="Exit case"
        defaultCurrent={current}
        finishLabel="Close exit case"
        finishBlocked={blocked}
        steps={[
          {
            id: 'approval',
            title: 'Approval and notice',
            summary: 'Accepted by Divya Raghunathan and HR on 22 Aug 2026',
            content: <ApprovalTimeline now={today} steps={[{ id: 'a', label: 'Manager', status: 'done', approver: 'Divya Raghunathan', at: new Date(2026, 7, 21) }, { id: 'b', label: 'HR', status: 'done', approver: 'Lakshmi Venkatesan', at: new Date(2026, 7, 22) }]} />,
          },
          { id: 'clearance', title: 'Clearance', summary: '1 of 6 signed off', content: <StatusChecklist label="Clearance" rows={clearanceRows} /> },
          {
            id: 'interview',
            title: 'Exit interview',
            summary: held ? 'Not held for a termination' : 'Scheduled 15 Oct 2026',
            content: held ? (
              <Text as="p">No exit interview for a termination.</Text>
            ) : (
              <div className="yx-ppl__stack">
                <Text as="p">Survey sent to Meera on 25 Sep 2026. Interview with Lakshmi Venkatesan on 15 Oct, 3:00 pm.</Text>
                <div>
                  <Button>Open interview</Button>
                </div>
              </div>
            ),
          },
          {
            id: 'fnf',
            title: 'F&F',
            summary: `Due ${formatDate(fnfDue)}`,
            content: (
              <div className="yx-ppl__stack">
                {fnfLate ? (
                  <InlineAlert tone="danger" title={`F&F was due ${formatDate(fnfDue)}`}>Pay it now; the law allows 2 working days after the last working day.</InlineAlert>
                ) : (
                  <Text as="p">Due {formatDate(fnfDue)}, 2 working days after the last working day.</Text>
                )}
                <div>
                  <Button>Open F&F</Button>
                </div>
              </div>
            ),
          },
          {
            id: 'documents',
            title: 'Documents',
            summary: held ? 'Letters held for open case' : 'Relieving and experience letters',
            status: held ? 'locked' : undefined,
            statusNote: held ? 'Held for open case' : undefined,
            content: <StatusChecklist label="Exit documents" rows={letters} />,
          },
        ]}
      />
      <div className="yx-ppl__grid2">
        <Card title="Deprovisioning">
          <StatusChecklist label="Deprovisioning" rows={depRows} />
        </Card>
        <Card title="Open cases and holds">
          {hr ? (
            held ? (
              <ul className="yx-ppl__successors">
                <li><span>Case as respondent (restricted)</span><Badge tone="warning">Open</Badge></li>
                <li><span>Performance improvement plan</span><Badge tone="neutral">None</Badge></li>
                <li><span>Letters</span><Badge tone="warning">Held</Badge></li>
                <li><span>F&F</span><Badge tone="success">Not held</Badge></li>
              </ul>
            ) : (
              <Text as="p">No open cases or plans. Nothing is held.</Text>
            )
          ) : (
            <Text as="p" className="yx-ppl__muted">HR handles case checks for exits.</Text>
          )}
        </Card>
      </div>
    </PeopleFrame>
  );
}

/* ================================================================== PPL-20 clearance */

type Clear = (typeof CLEARANCE)[number];

/** The live app's clearance (design audit step 3): sign-offs for leavers that I or my team own. */
export interface LiveClearance {
  state: 'ready' | 'loading' | 'error' | 'no-access';
  onRetry: () => void;
  rows: MyClearanceItem[];
  onSignOff: ExitCaseScreenProps['onSignOff'];
}

// PPL-20
export function ClearanceSignoffs({ owner, live }: { owner?: string; live?: LiveClearance }) {
  const [signing, setSigning] = useState<MyClearanceItem | null>(null);
  const [all, setAll] = useState(false);
  type Row = Clear & { person?: string; lastDay?: Date };
  const liveRows: Row[] = (live?.rows ?? [])
    .filter((r) => all || r.status === 'open')
    .map((r) => ({ id: r.id, dept: LIVE_DEPT[r.department], owner: r.owner, item: r.title, status: r.status === 'cleared' ? 'Done' : r.status === 'waived' ? 'Waived' : 'Pending', recovery: r.recoveryAmount ? Number(r.recoveryAmount) : 0, person: r.person, lastDay: isoDay(r.lastDay) }));
  const rows: Row[] = live ? liveRows : owner ? CLEARANCE.filter((c) => c.owner === owner) : CLEARANCE;
  const cols: TableColumn<Row>[] = [
    ...(live ? [{ key: 'person', header: 'Leaver', type: 'person', value: (r: Row) => r.person ?? '', person: (r: Row) => ({ name: r.person ?? '', secondary: r.lastDay ? `Last day ${formatDate(r.lastDay)}` : undefined }), width: 210 } as TableColumn<Row>] : []),
    { key: 'dept', header: 'Department', value: (r) => r.dept, width: live ? 130 : 190 },
    { key: 'item', header: 'Items', value: (r) => r.item, ...(live ? { render: (r: Row) => <span className="yx-ppl__type"><span>{r.item}</span><span className="yx-ppl__sub">{r.owner}</span></span> } : {}), width: 320 },
    // Live: the owner is you or your team, shown under the item instead of its own column.
    ...(live ? [] : [{ key: 'owner', header: 'Owner', type: 'person', value: (r: Row) => r.owner, person: (r: Row) => ({ name: r.owner }), width: 200 } as TableColumn<Row>]),
    { key: 'recovery', header: 'Recovery', type: 'money', value: (r) => r.recovery, total: 'sum', width: 130 },
    { key: 'status', header: 'Status', type: 'status', value: (r) => r.status, statusTone: (v) => (v === 'Done' ? 'success' : v === 'Blocked' ? 'danger' : v === 'Waived' ? 'neutral' : 'warning'), width: 120 },
  ];
  const open = CLEARANCE.filter((c) => c.status !== 'Done').length;
  const liveOpen = (live?.rows ?? []).filter((r) => r.status === 'open').length;
  return (
    <PeopleFrame active="Clearance" persona={owner || live ? 'mgr' : 'hr'}>
      <PageHeader
        title={live ? 'Clearance: your sign-offs' : owner ? 'Clearance: your sign-offs' : 'Clearance · Meera Iyer'}
        description={live ? `${liveOpen} ${liveOpen === 1 ? 'sign-off is' : 'sign-offs are'} open for people leaving that you or your team look after. Open items block F&F finalisation, not the exit itself.` : `Last working day ${formatDate(MEERA.lwd)}. Open items block F&F finalisation, not the exit itself.`}
      />
      {!owner && !live && <InlineAlert tone="warning">{open} of {CLEARANCE.length} sign-offs open. Finance is blocked on an unclaimed advance of {formatINR(5000)}.</InlineAlert>}
      {live && (
        <Segment label="Show" value={all ? 'all' : 'open'} onChange={(v) => setAll(v === 'all')} options={[{ value: 'open', label: 'To do' }, { value: 'all', label: 'All' }]} />
      )}
      {live?.state === 'error' ? (
        <ErrorState title="We couldn't load your sign-offs" description="Check your connection and try again." onRetry={live.onRetry} />
      ) : (
        <DataTable
          label="Clearance sign-offs"
          columns={cols}
          rows={rows}
          getRowId={(r) => r.id}
          state={live?.state === 'loading' ? 'loading' : 'ready'}
          rowButtons={(r) => (r.status !== 'Pending' && r.status !== 'Blocked' ? null : <Button size="sm" onClick={live ? () => setSigning(live.rows.find((x) => x.id === r.id) ?? null) : undefined}>Sign off</Button>)}
          // Live: a recovery and a note are part of the sign-off.
          rowActions={
            live
              ? undefined
              : () => (
                  <>
                    <MenuItem>Add recovery</MenuItem>
                    <MenuItem>Add note</MenuItem>
                  </>
                )
          }
          empty={<EmptyState title="Nothing to sign off" description="Clearance items for leavers you own show up here." />}
        />
      )}
      {live && signing && <SignOffDialog item={signing} onClose={() => setSigning(null)} onSignOff={live.onSignOff} />}
    </PeopleFrame>
  );
}

// PPL-20 · phone
export function ClearancePhone() {
  return (
    <PhoneFrame tab="requests" title="Clearance">
      <Text as="p">Meera Iyer · leaves {formatDate(MEERA.lwd)}</Text>
      <ul className="yx-ppl__checklist" aria-label="Your sign-offs">
        {CLEARANCE.filter((c) => c.owner === 'Rohit Bhat' || c.owner === 'Fatima Shaikh').map((c) => (
          <li key={c.id} className="yx-ppl__check-row">
            <div className="yx-ppl__check-main">
              <span className="yx-ppl__check-title">{c.dept}</span>
              <Text size="sm" tone="secondary">{c.item}</Text>
            </div>
            <div className="yx-ppl__check-action">
              <Button size="sm" fullWidth>
                Sign off
              </Button>
            </div>
          </li>
        ))}
      </ul>
    </PhoneFrame>
  );
}

/* ================================================================== PPL-21 exit interview */

const RATING = ['1', '2', '3', '4', '5'].map((x) => ({ value: x, label: x }));

function InterviewFields() {
  return (
    <div className="yx-ppl__form">
      <fieldset className="yx-ppl__stack">
        <legend className="yx-ppl__section-title">Main reasons for leaving</legend>
        {['Career growth', 'Pay', 'Manager', 'Work hours or shifts', 'Commute or relocation', 'Higher studies'].map((r, i) => (
          <Checkbox key={r} label={r} defaultChecked={i === 0 || i === 1} />
        ))}
      </fieldset>
      {['Your manager', 'Growth and learning', 'Pay and benefits', 'Team and culture'].map((q, i) => (
        <FormField key={q} label={`${q} (1 poor, 5 great)`} required>
          <RadioGroup aria-label={q} orientation="horizontal" options={RATING} defaultValue={['4', '2', '3', '4'][i]} />
        </FormField>
      ))}
      <FormField label="Would you work with us again?" required>
        <RadioGroup aria-label="Would you work with us again" orientation="horizontal" options={[{ value: 'yes', label: 'Yes' }, { value: 'maybe', label: 'Maybe' }, { value: 'no', label: 'No' }]} defaultValue="yes" />
      </FormField>
      <FormField label="Anything else" optional>
        <TextArea rows={3} defaultValue="The lab team was great. I wanted a lead role and it wasn't open this year." />
      </FormField>
      <Switch label="Keep my answers confidential" description="Only HR sees confidential answers, never your manager." defaultChecked />
    </div>
  );
}

// PPL-21
export function ExitInterview({ persona = 'emp' }: { persona?: Persona }) {
  if (persona === 'hr')
    return (
      <PeopleFrame active="Exit cases">
        <ObjectHeader name="Exit interview · Meera Iyer" person secondary="Answered 26 Sep 2026 · confidential" status={<Badge tone="warning">Confidential: HR only</Badge>} />
        <div className="yx-ppl__grid2">
          <Card title="Answers">
            <dl className="yx-ppl__rail-facts">
              <div><dt>Reasons</dt><dd>Career growth, Pay</dd></div>
              <div><dt>Manager</dt><dd>4 of 5</dd></div>
              <div><dt>Growth and learning</dt><dd>2 of 5</dd></div>
              <div><dt>Pay and benefits</dt><dd>3 of 5</dd></div>
              <div><dt>Team and culture</dt><dd>4 of 5</dd></div>
              <div><dt>Would rejoin</dt><dd>Yes</dd></div>
            </dl>
          </Card>
          <Card title="Interviewer notes">
            <FormField label="Notes" helper="Visible to HR roles only. Feeds attrition analytics as aggregates.">
              <TextArea rows={6} defaultValue="Wants a lead role; open to returning in 2027 if the Chennai quality manager role is approved. Rehire eligible." />
            </FormField>
            <Button variant="primary">Save notes</Button>
          </Card>
        </div>
      </PeopleFrame>
    );
  return (
    <MeFrame active="My exit">
      <PageHeader title="Exit interview" description="About 5 minutes. Your answers help us improve." />
      <InterviewFields />
      <div className="yx-ppl__row">
        <Button>Save for later</Button>
        <Button variant="primary">Send answers</Button>
      </div>
    </MeFrame>
  );
}

// PPL-21 · phone
export function ExitInterviewPhone() {
  return (
    <PhoneFrame tab="me" title="Exit interview" hideTabs>
      <InterviewFields />
      <Button variant="primary" fullWidth>
        Send answers
      </Button>
    </PhoneFrame>
  );
}

/* ================================================================== PPL-22 F&F */

export type FnfVariant = 'standard' | 'overdue' | 'absconding' | 'held';

export function fnfLinesFor(variant: FnfVariant): FnfLine[] {
  // Part held for an open case: gratuity and reimbursements wait; wage lines never do.
  if (variant === 'held') return MEERA_FNF.map((l) => (l.id === 'f4' || l.id === 'f5' ? { ...l, held: true } : l));
  if (variant !== 'absconding') return MEERA_FNF;
  return [
    { id: 'a1', kind: 'earning', label: 'Salary for 1–19 Sep 2026 (to last day present)', amount: 16467, how: 'Monthly gross ₹26,000 × 19 of 30 days.', wage: true },
    { id: 'a2', kind: 'earning', label: 'Leave encashment: 3 days earned leave', amount: 1800, how: 'Basic ₹18,000 ÷ 30 × 3 days.', wage: true },
    { id: 'a3', kind: 'recovery', label: 'Notice shortfall (60 days)', amount: 36000, how: 'Basic ₹18,000 ÷ 30 × 60 days: no notice given (company policy).' },
    { id: 'a4', kind: 'recovery', label: 'Unreturned safety kit KF-PPE-1422', amount: 2400, how: 'Asset cost less depreciation, from clearance.', auto: true },
  ];
}

const EXIT: Record<string, string> = { resignation: 'Resignation', termination: 'Termination', retrenchment: 'Retrenchment', death: 'Death in service', retirement: 'Retirement', end_of_contract: 'End of contract', absconding: 'Absconding', probation_termination: 'Probation not confirmed', vrs: 'Voluntary retirement' };
const RUN_STATUS: Record<string, string> = { draft: 'Draft', reopened: 'Draft', calculating: 'Calculating', calculated: 'Calculated', submitted: 'Pending approval', in_review: 'Pending approval', approved: 'Approved', paid: 'Paid', void: 'Void' };
// Lines payroll can add on a settlement (FNF_COMPONENTS in the API); the company's other components are added in Pay inputs.
const ADDABLE = [
  { value: 'fnf_recovery', label: 'Settlement recovery' },
  { value: 'notice_pay', label: 'Notice pay' },
  { value: 'leave_encashment', label: 'Leave encashment' },
  { value: 'gratuity', label: 'Gratuity' },
  { value: 'deduction_refund', label: 'Refund of over-deducted contributions' },
];
const MONEY = /^\d{1,10}(\.\d{1,2})?$/;
const amountOf = (s: string | null) => (s === null ? 0 : Number(s));
const plural = (n: number, w: string) => `${n} ${w}${n === 1 ? '' : 's'}`;

/** The live app's F&F settlements (PPL-22): the designed calculator, one settlement at a time, with its real actions. */
export interface LiveFnf {
  state: 'ready' | 'loading' | 'error' | 'no-access';
  onRetry: () => void;
  settlements: FnfSettlementView[];
  nameOf: (employeeId: string) => string;
  /** payroll.fnf.manage edits lines; payroll.notice.waive waives a notice (5j-D2); payroll.run.prepare calculates and submits the run. */
  can: { manage: boolean; waiveNotice: boolean; prepare: boolean };
  onOpenRun: (runId: string) => void;
  onRecalculate: (s: FnfSettlementView) => Promise<unknown>;
  onSubmit: (s: FnfSettlementView) => Promise<unknown>;
  onHold: (s: FnfSettlementView, itemId: string, holdReason: string | null, reason: string) => Promise<unknown>;
  onAdd: (s: FnfSettlementView, line: { componentCode: string; amount: string; label: string }, reason: string) => Promise<unknown>;
  onWaiveNotice: (s: FnfSettlementView, reason: string) => Promise<unknown>;
  onSecondRun: (s: FnfSettlementView) => Promise<{ runId: string }>;
}

/** Settlement lines and the run's payslip lines as the designed explained lines. */
function liveLines(s: FnfSettlementView, lwd: Date) {
  const items = s.items.map((i): FnfLine & { group: string } => ({
    id: i.id,
    group: i.kind === 'deduction' ? 'recovery' : i.kind,
    kind: i.kind === 'deduction' ? 'recovery' : 'earning',
    label: i.title,
    amount: amountOf(i.amount),
    how: i.how,
    auto: i.auto || undefined,
    wage: i.wage || undefined,
    held: !!i.held || undefined,
    heldTag: i.held ? (i.heldTag ? `Held: ${i.heldTag}` : 'Held') : undefined,
    heldReason: i.held ?? undefined,
    byPayroll: i.byPayroll || undefined,
  }));
  const slip = s.salary ?? [];
  const pay = slip.filter((l) => l.group === 'earning');
  // Salary to the last day is one line, explained component by component; until the run is calculated it has no amount.
  const salary: FnfLine = {
    id: 'salary',
    kind: 'earning',
    label: `Salary to the last working day (${formatDate(lwd)})`,
    amount: pay.reduce((t, l) => t + amountOf(l.amount), 0),
    how: s.salary ? pay.map((l) => `${l.name} ${formatINR(amountOf(l.amount))}: ${l.how}`).join(' ') : 'Worked out from attendance to the last day when the F&F run is calculated.',
    wage: true,
  };
  const slipLine = (k: FnfSlipLine['group'], kind: FnfLine['kind']) => slip.filter((l) => l.group === k).map((l, n): FnfLine => ({ id: `${k}-${n}`, kind, label: l.name, amount: amountOf(l.amount), how: l.how }));
  // As the design: only TDS is under Tax; PF, ESI, PT and LWF are statutory deductions of their own.
  const tax: FnfLine[] = s.salary ? slipLine('tds', 'tax') : [{ id: 'tds', kind: 'tax', label: 'TDS on final income', amount: 0, how: 'Worked out on the final income for the year when the F&F run is calculated.' }];
  return {
    earnings: [salary, ...items.filter((l) => l.group === 'earning')],
    recoveries: [...items.filter((l) => l.group === 'recovery'), ...slipLine('recovery', 'recovery')],
    tax,
    statutory: slipLine('statutory', 'tax'),
    employer: items.filter((l) => l.group === 'employer'),
  };
}

function LiveFnfCalculator({ today, live }: { today: Date; live: LiveFnf }) {
  const [pick, setPick] = useState<string | null>(null);
  const [dialog, setDialog] = useState<{ kind: 'hold'; itemId: string } | { kind: 'waive' } | { kind: 'add' } | null>(null);
  const [why, setWhy] = useState('');
  const [line, setLine] = useState<{ componentCode: string | null; amount: string; label: string }>({ componentCode: null, amount: '', label: '' });
  const { busy, error, run } = useRun();
  const s = live.settlements.find((x) => x.id === pick) ?? live.settlements[0];
  const frame = (body: ReactNode) => <PeopleFrame active="F&F">{body}</PeopleFrame>;
  if (live.state === 'no-access') return frame(<NoAccessState what="the full and final settlements" grantedBy="your payroll admin" />);
  if (live.state === 'error') return frame(<ErrorState title="We couldn't load the settlements" description="Check your connection and try again." onRetry={live.onRetry} />);
  if (live.state === 'loading') return frame(<ListSkeleton label="Loading settlements" />);
  if (!s)
    return frame(
      <>
        <PageHeader title="Full and final settlements" description="A settlement is made when an exit is accepted, with the deadline of two working days after the last day." />
        <EmptyState title="No settlements" description="A settlement appears here when an exit is accepted." />
      </>,
    );
  const who = live.nameOf(s.employeeId);
  const first = who.split(' ')[0];
  const lwd = isoDay(s.lwd);
  const t = s.totals;
  const lines = liveLines(s, lwd);
  const editable = s.status === 'open' && live.can.manage;
  // As the API: lines change while the run is not submitted for approval; the run is calculated from draft or calculated.
  const runOpen = !s.runStatus || ['draft', 'calculated', 'in_review', 'reopened'].includes(s.runStatus);
  const canCalc = ['draft', 'calculated', 'reopened'].includes(s.runStatus ?? '');
  const firstDone = s.runStatus === 'approved' || s.runStatus === 'paid';
  const held = amountOf(t.held);
  const net = t.net === null ? null : amountOf(t.net);
  const netLabel = net !== null && net < 0 ? 'Net recoverable' : 'Net payable';
  const pending = 'Worked out when the run is calculated';
  const g = s.gratuity;
  const item = (id: string) => s.items.find((i) => i.id === id);
  const lineAction = (l: FnfLine) => {
    const i = item(l.id);
    if (!i || i.claim || !editable) return null;
    if (i.held)
      return (
        <Button size="sm" loading={busy === `release-${i.id}`} onClick={() => void run(`release-${i.id}`, () => live.onHold(s, i.id, null, 'Released for payment'))}>
          Release
        </Button>
      );
    if (firstDone || !runOpen) return null;
    return (
      <Button
        size="sm"
        onClick={() => {
          setWhy('');
          setDialog({ kind: 'hold', itemId: i.id });
        }}
      >
        Hold
      </Button>
    );
  };
  const more = [
    s.runId && live.can.manage && <MenuItem key="run" onSelect={() => live.onOpenRun(s.runId!)}>Open F&F run</MenuItem>,
    s.secondRunId && <MenuItem key="second" onSelect={() => live.onOpenRun(s.secondRunId!)}>Open second run</MenuItem>,
    editable && firstDone && !s.secondRunId && (
      <MenuItem key="make" onSelect={() => void run('second', async () => live.onOpenRun((await live.onSecondRun(s)).runId))}>
        Make second run
      </MenuItem>
    ),
    editable && (runOpen || firstDone) && (
      <MenuItem
        key="add"
        onSelect={() => {
          setWhy('');
          setLine({ componentCode: null, amount: '', label: '' });
          setDialog({ kind: 'add' });
        }}
      >
        Add a line
      </MenuItem>
    ),
    s.status === 'open' && live.can.waiveNotice && s.exitType === 'resignation' && !s.noticeWaived && !firstDone && (
      <MenuItem
        key="waive"
        onSelect={() => {
          setWhy('');
          setDialog({ kind: 'waive' });
        }}
      >
        Waive notice recovery
      </MenuItem>
    ),
  ].filter(Boolean);
  const lineOk = !!line.componentCode && MONEY.test(line.amount) && Number(line.amount) > 0 && line.label.trim().length >= 3 && why.trim().length >= 5;
  return frame(
    <>
      {live.settlements.length > 1 && (
        <div className="yx-ppl__row">
          <span className="yx-ppl__head-select">
            <Select aria-label="Settlement for" size="sm" value={s.id} onChange={(v) => setPick(v)} options={live.settlements.map((x) => ({ value: x.id, label: `${live.nameOf(x.employeeId)} · ${EXIT[x.exitType] ?? x.exitType}` }))} />
          </span>
        </div>
      )}
      <ObjectHeader
        name={`F&F · ${who}`}
        avatarName={who}
        person
        secondary={`${EXIT[s.exitType] ?? s.exitType} · last working day ${formatDate(lwd)}${s.runReference ? ` · off-cycle run ${s.runReference}` : ''}`}
        status={<StatusBadge status={s.status === 'settled' ? 'Settled' : s.overdue ? 'Overdue' : (RUN_STATUS[s.runStatus ?? 'draft'] ?? 'Draft')} />}
        actions={
          <>
            {live.can.prepare && s.runId && (
              <Button icon={RefreshCw} disabled={!canCalc} loading={busy === 'calc'} onClick={() => void run('calc', () => live.onRecalculate(s))}>
                Recalculate
              </Button>
            )}
            {live.can.prepare && s.runId && (
              <Button variant="primary" disabled={s.runStatus !== 'calculated' || !s.salary} loading={busy === 'submit'} onClick={() => void run('submit', () => live.onSubmit(s))}>
                Send for approval
              </Button>
            )}
            {more.length > 0 && (
              <Menu>
                <MenuTrigger asChild>
                  <IconButton icon={MoreHorizontal} label="More settlement actions" />
                </MenuTrigger>
                <MenuContent align="end">{more}</MenuContent>
              </Menu>
            )}
          </>
        }
      />
      {error && <InlineAlert tone="danger" title="This didn't go through">{error}</InlineAlert>}
      <div className="yx-ppl__row">
        {s.status === 'open' && !firstDone && <DueCountdown due={isoDay(s.deadline)} today={today} left={s.workingDaysLeft} label="Wages due on exit by" />}
        {g && (
          <Text size="sm" tone="secondary">
            {s.exitType === 'death'
              ? `Gratuity: due on death in service whatever the length of service. Due within 30 days, by ${formatDate(isoDay(g.dueBy))}.`
              : g.eligible
                ? `Gratuity: ${plural(g.years, 'year')} ${plural(g.months, 'month')} counts as ${plural(g.counted, 'year')}${g.counted > g.years ? ' (6 months or more rounds up)' : ''}. Due within 30 days, by ${formatDate(isoDay(g.dueBy))}.`
                : `Gratuity: not due. ${plural(g.years, 'year')} ${plural(g.months, 'month')} of service; gratuity needs ${plural(g.minYears, 'year')}.`}
          </Text>
        )}
      </div>
      {s.overdue && (
        <InlineAlert tone="danger" title="Wages on exit are overdue" actions={s.runId && live.can.manage ? <Button size="sm" variant="primary" onClick={() => live.onOpenRun(s.runId!)}>Pay wage lines now ({formatINR(amountOf(t.wageLines))})</Button> : undefined}>
          The Code on Wages needs them paid within 2 working days of the last working day. Open clearance items don't move the date. Pay the wage lines now in the F&F run and hold the rest for a second run.
        </InlineAlert>
      )}
      {held > 0 && (
        <InlineAlert tone="warning" title="Part of this F&F is held">
          Wage lines can't be held beyond the legal deadline. Pay them now; the held lines wait until they are released and are paid in a second run.
        </InlineAlert>
      )}
      {s.noticeWaived && <InlineAlert tone="info" title="Notice recovery waived">{s.noticeWaived.reason}</InlineAlert>}
      <div className="yx-ppl__split yx-ppl__split--aside-first">
        <div className="yx-ppl__stack">
          {held > 0 ? (
            <div className="yx-ppl__stack">
              <div className="yx-ppl__total">
                <span>Pay now</span>
                <strong>{net === null ? '—' : formatINR(net)}</strong>
              </div>
              <div className="yx-ppl__total">
                <span>Held back</span>
                <strong>{formatINR(held)}</strong>
              </div>
            </div>
          ) : (
            <div className="yx-ppl__total">
              <span>{netLabel}</span>
              <strong>{net === null ? '—' : formatINR(Math.abs(net))}</strong>
            </div>
          )}
          {net === null && <Text size="sm" tone="secondary" as="p">{`${pending}: salary to the last day, TDS and the net.`}</Text>}
          <Card title="Totals">
            <dl className="yx-ppl__sum-rows">
              <div><dt>Earnings</dt><dd>{formatINR(amountOf(t.earnings))}</dd></div>
              <div data-sub><dt>of which wage lines</dt><dd>{formatINR(amountOf(t.wageLines))}</dd></div>
              <div><dt>Recoveries</dt><dd>{formatINR(amountOf(t.recoveries))}</dd></div>
              <div><dt>TDS</dt><dd>{t.tds === null ? '—' : formatINR(amountOf(t.tds))}</dd></div>
              {amountOf(t.statutory) !== 0 && <div><dt>Statutory deductions</dt><dd>{formatINR(amountOf(t.statutory))}</dd></div>}
              {amountOf(t.rounding) !== 0 && <div><dt>Rounding</dt><dd>{formatINR(amountOf(t.rounding))}</dd></div>}
              <div><dt>{netLabel}</dt><dd><strong>{net === null ? '—' : formatINR(Math.abs(net))}</strong></dd></div>
            </dl>
          </Card>
          {s.payees.length > 0 && (
            <Card title="Paid to">
              <ul className="yx-ppl__stack">
                {s.payees.map((x) => (
                  <li key={`${x.name}-${x.relation}`}>
                    {x.name} ({x.relation}) · {x.sharePercent}%{x.accountLast4 ? ` · account ending ${x.accountLast4}` : ' · no bank account yet'}
                    {x.amount ? ` · ${formatINR(amountOf(x.amount))}` : ''}
                  </li>
                ))}
              </ul>
              {s.taxNote && <Text size="sm" tone="secondary" as="p">{s.taxNote}</Text>}
            </Card>
          )}
          <Card title="After approval">
            <Text as="p">Payment goes in the bank file; the F&F statement letter goes to {first}'s documents. Changes after payment follow corrections.</Text>
          </Card>
        </div>
        <div className="yx-ppl__main">
          <Text size="sm" tone="secondary" as="p">Open a line to see how it's worked out.</Text>
          <ExplainedLines title="Earnings" lines={lines.earnings} action={lineAction} />
          <ExplainedLines title="Recoveries" lines={lines.recoveries} action={lineAction} />
          <ExplainedLines title="Statutory deductions" lines={lines.statutory} />
          <ExplainedLines title="Tax" lines={lines.tax} />
          <ExplainedLines title="Paid by the company" lines={lines.employer} action={lineAction} />
        </div>
      </div>
      {dialog?.kind === 'hold' && (
        <ConfirmDialog
          open
          onOpenChange={(o) => !o && setDialog(null)}
          title={`Hold "${item(dialog.itemId)?.title ?? 'this line'}"?`}
          consequence="It is left out of the F&F run and paid in a second run once released."
          confirmLabel="Hold"
          confirmDisabled={why.trim().length < 5}
          onConfirm={async () => void (await live.onHold(s, dialog.itemId, why.trim(), why.trim()))}
        >
          <FormField id="fnf-why" label="Why" required>
            <TextArea value={why} onChange={setWhy} rows={2} maxLength={300} />
          </FormField>
        </ConfirmDialog>
      )}
      {dialog?.kind === 'waive' && (
        <ConfirmDialog
          open
          onOpenChange={(o) => !o && setDialog(null)}
          title={`Waive the notice recovery for ${who}?`}
          consequence="The notice recovery line goes and is not recovered in this settlement."
          confirmLabel="Waive"
          confirmDisabled={why.trim().length < 5}
          onConfirm={async () => void (await live.onWaiveNotice(s, why.trim()))}
        >
          <FormField id="fnf-waive" label="Why" required>
            <TextArea value={why} onChange={setWhy} rows={2} maxLength={300} />
          </FormField>
        </ConfirmDialog>
      )}
      {dialog?.kind === 'add' && (
        <ConfirmDialog
          open
          onOpenChange={(o) => !o && setDialog(null)}
          size="md"
          title={`Add a line to ${first}'s settlement`}
          consequence={firstDone ? 'The F&F run is approved: the line is paid in a second run.' : 'The line goes in the F&F run. Recalculate the run to update the totals.'}
          confirmLabel="Add line"
          confirmDisabled={!lineOk}
          onConfirm={async () => void (await live.onAdd(s, { componentCode: line.componentCode!, amount: line.amount, label: line.label.trim() }, why.trim()))}
        >
          <FormField id="fnf-code" label="Line" required>
            <Select aria-label="Line" value={line.componentCode} onChange={(v) => setLine({ ...line, componentCode: v })} options={ADDABLE} />
          </FormField>
          <FormField id="fnf-amount" label="Amount" required helper="Rupees, up to 2 decimals.">
            <TextField value={line.amount} onChange={(v) => setLine({ ...line, amount: v.trim() })} prefix="₹" inputMode="decimal" maxLength={13} />
          </FormField>
          <FormField id="fnf-label" label="What it is" required>
            <TextField value={line.label} onChange={(v) => setLine({ ...line, label: v })} maxLength={200} />
          </FormField>
          <FormField id="fnf-reason" label="Why" required>
            <TextArea value={why} onChange={setWhy} rows={2} maxLength={300} />
          </FormField>
        </ConfirmDialog>
      )}
    </>,
  );
}

// PPL-22
export function FnfCalculator(props: { variant?: FnfVariant; today: Date; live?: LiveFnf }) {
  return props.live ? <LiveFnfCalculator today={props.today} live={props.live} /> : <SampleFnfCalculator today={props.today} variant={props.variant} />;
}

function SampleFnfCalculator({ variant = 'standard', today }: { variant?: FnfVariant; today: Date }) {
  const lines = fnfLinesFor(variant);
  const t = fnfTotals(lines);
  const absconding = variant === 'absconding';
  const lwd = absconding ? new Date(2026, 8, 19) : MEERA.lwd;
  const due = addWorkingDays(lwd, 2, HOLIDAYS);
  const who = absconding ? 'Rohit Das' : MEERA.name;
  const first = who.split(' ')[0];
  const run = absconding ? 'FNF-2026-0038' : 'FNF-2026-0041';
  const wageTotal = lines.filter((l) => l.wage).reduce((s, l) => s + l.amount, 0);
  const heldTotal = lines.filter((l) => l.held).reduce((s, l) => s + l.amount, 0);
  const years = Math.floor(MEERA.serviceMonths / 12);
  const months = MEERA.serviceMonths % 12;
  return (
    <PeopleFrame active="F&F">
      <ObjectHeader
        name={`F&F · ${who}`}
        avatarName={who}
        person
        secondary={`${absconding ? 'Absconding · recovery-only F&F' : 'Resignation'} · last working day ${formatDate(lwd)} · off-cycle run ${run}`}
        status={<StatusBadge status={variant === 'overdue' ? 'Overdue' : 'Draft'} />}
        actions={
          <>
            <Button icon={RefreshCw}>Recalculate</Button>
            <Button variant="primary">Send for approval</Button>
          </>
        }
      />
      <div className="yx-ppl__row">
        {absconding ? (
          <span className="yx-ppl__countdown">
            <Badge tone="neutral">Held until {first} claims it</Badge>
            <Text size="sm" tone="secondary">No payment deadline runs while wages are held for a claim.</Text>
          </span>
        ) : (
          <DueCountdown due={due} today={today} holidays={HOLIDAYS} label="Wages due on exit by" />
        )}
        {variant === 'standard' && (
          <Text size="sm" tone="secondary">
            Gratuity: {years} years {months} months counts as {years + (months >= 6 ? 1 : 0)} years (more than 6 months rounds up). Due within 30 days.
          </Text>
        )}
      </div>
      {variant === 'overdue' && (
        <InlineAlert tone="danger" title="Wages on exit are overdue" actions={<Button size="sm" variant="primary">Pay wage lines now ({formatINR(wageTotal)})</Button>}>
          The Code on Wages needs them paid within 2 working days of the last working day. Open clearance items don't move the date. Pay the wage lines now in a first F&F run and settle the rest later.
        </InlineAlert>
      )}
      {variant === 'held' && (
        <InlineAlert tone="warning" title="Company policy holds part of this F&F for an open case">
          Wage lines can't be held beyond the legal deadline. Pay them now; gratuity and the reimbursement wait for the case outcome.
        </InlineAlert>
      )}
      {absconding && (
        <InlineAlert tone="info" title="Recovery-only F&F">
          Any net payable is held until Rohit claims it; it is never forfeited. Rehire eligibility is set to no (HR can clear it).
        </InlineAlert>
      )}
      <div className="yx-ppl__split yx-ppl__split--aside-first">
        <div className="yx-ppl__stack">
          {variant === 'held' ? (
            <div className="yx-ppl__stack">
              <div className="yx-ppl__total">
                <span>Pay now</span>
                <strong>{formatINR(t.net - heldTotal)}</strong>
              </div>
              <div className="yx-ppl__total">
                <span>Held for the case</span>
                <strong>{formatINR(heldTotal)}</strong>
              </div>
            </div>
          ) : (
            <div className="yx-ppl__total">
              <span>{t.net >= 0 ? 'Net payable' : 'Net recoverable'}</span>
              <strong>{formatINR(Math.abs(t.net))}</strong>
            </div>
          )}
          <Card title="Totals">
            <dl className="yx-ppl__sum-rows">
              <div><dt>Earnings</dt><dd>{formatINR(t.earnings)}</dd></div>
              <div data-sub><dt>of which wage lines</dt><dd>{formatINR(wageTotal)}</dd></div>
              <div><dt>Recoveries</dt><dd>{formatINR(t.recoveries)}</dd></div>
              <div><dt>TDS</dt><dd>{formatINR(t.tax)}</dd></div>
              <div><dt>{t.net >= 0 ? 'Net payable' : 'Net recoverable'}</dt><dd><strong>{formatINR(Math.abs(t.net))}</strong></dd></div>
            </dl>
          </Card>
          <Card title="After approval">
            <Text as="p">Payment goes in the bank file; the F&F statement letter goes to {first}'s documents. Changes after payment follow corrections.</Text>
          </Card>
        </div>
        <div className="yx-ppl__main">
          <Text size="sm" tone="secondary" as="p">Open a line to see how it's worked out.</Text>
          <ExplainedLines title="Earnings" lines={lines.filter((l) => l.kind === 'earning')} />
          <ExplainedLines title="Recoveries" lines={lines.filter((l) => l.kind === 'recovery')} />
          <ExplainedLines title="Tax" lines={lines.filter((l) => l.kind === 'tax')} />
        </div>
      </div>
    </PeopleFrame>
  );
}

/* ================================================================== PPL-23 death in service */

// PPL-23
export function DeathInServiceFlow({ current = 'payees', noNomination = false }: { current?: string; noNomination?: boolean }) {
  const g = gratuity(28000, 50, { death: true });
  const gratuityParts = splitByShares(g.amount, [70, 30]);
  const payees = noNomination
    ? [
        { name: 'Kamala Shankar', relation: 'Wife (legal heir)', scheme: 'All dues', share: 50, bank: 'Indian Bank · XXXX 3321', verified: true },
        { name: 'Divakar Shankar', relation: 'Son (legal heir)', scheme: 'All dues', share: 50, bank: 'Not given yet', verified: false },
      ]
    : DEATH_PAYEES;
  const forms: ChecklistRow[] = [
    { id: 'f1', title: 'EDLI claim (Form 5 IF): company attestation', owner: 'Payroll · Suresh Pillai', due: new Date(2026, 9, 5), status: 'Pending' },
    { id: 'f2', title: 'EPS widow and children pension (Form 10D)', owner: 'Family, with Payroll', due: new Date(2026, 9, 12), status: 'Pending' },
    { id: 'f3', title: 'PF final settlement (Form 20)', owner: 'Family, with Payroll', due: new Date(2026, 9, 12), status: 'Pending' },
    { id: 'f4', title: 'Gratuity: nominee claim (Form J) and company response (Form L)', owner: 'Payroll', due: new Date(2026, 9, 14), status: 'Done' },
    { id: 'f5', title: 'ESI dependant benefit', owner: '—', status: 'Draft', note: 'Not covered: wage above the ESI ceiling' },
    { id: 'f6', title: 'Group term insurance claim hand-off', owner: 'HR · Lakshmi Venkatesan', due: new Date(2026, 9, 7), status: 'In progress' },
  ];
  return (
    <PeopleFrame active="Exit cases">
      <PageHeader title="Death in service · Late Ravi Shankar" description="Maintenance Supervisor, Hosur plant. Access was revoked at once. No exit interview and no employee sign-offs. Compassionate contact: Lakshmi Venkatesan." />
      <Stepper
        title="Death in service"
        defaultCurrent={current}
        finishLabel="Send F&F for approval"
        onSaveAndExit={() => {}}
        steps={[
          {
            id: 'details',
            title: 'Details and certificate',
            summary: 'Date of death 14 Sep 2026 · certificate verified',
            content: (
              <div className="yx-ppl__form">
                <FormField label="Date of death" required>
                  <DatePicker value={new Date(2026, 8, 14)} onChange={() => {}} />
                </FormField>
                <FormField label="Death certificate" required>
                  <FileUpload upload={async () => {}} accept={['.pdf', '.jpg', '.png']} maxSize={10 * 1024 * 1024} />
                </FormField>
                <FormField label="Compassionate contact for the family" required>
                  <Select options={[{ value: 'lv', label: 'Lakshmi Venkatesan, Head of People' }]} value="lv" onChange={() => {}} />
                </FormField>
              </div>
            ),
          },
          {
            id: 'payees',
            title: 'Payees',
            status: payees.some((p) => !p.verified) ? 'error' : undefined,
            statusNote: payees.some((p) => !p.verified) ? 'A bank account is not verified' : undefined,
            summary: noNomination ? '2 legal heirs · succession certificate needed' : '2 nominees per nominations',
            content: (
              <div className="yx-ppl__stack">
                {noNomination && (
                  <InlineAlert tone="warning" title="No valid nomination on file">
                    Pay legal heirs once HR verifies a succession or legal-heir certificate. The deadline doesn't move; the case records why payment is pending.
                  </InlineAlert>
                )}
                <div className="yx-scroll-x" tabIndex={0} role="region" aria-label="Table, scrolls sideways on small screens">
                <table className="yx-ppl__impact">
                  <thead>
                    <tr>
                      <th scope="col">Payee</th>
                      <th scope="col">Scheme</th>
                      <th scope="col">Share</th>
                      <th scope="col">Bank account</th>
                    </tr>
                  </thead>
                  <tbody>
                    {payees.map((p) => (
                      <tr key={p.name + p.scheme}>
                        <td>
                          {p.name}
                          <Text size="sm" tone="secondary" as="div">{p.relation}</Text>
                        </td>
                        <td>{p.scheme}</td>
                        <td className="yx-ppl__num">{p.share}%</td>
                        <td>
                          <span className="yx-mono">{p.bank}</span> <StatusBadge status={p.verified ? 'Verified' : 'Pending verification'} />
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                </div>
                {noNomination && (
                  <FormField label="Succession or legal-heir certificate" required>
                    <FileUpload upload={async () => {}} accept={['.pdf']} maxSize={10 * 1024 * 1024} />
                  </FormField>
                )}
                <div>
                  <Button>Run penny drop</Button>
                </div>
              </div>
            ),
          },
          {
            id: 'dues',
            title: 'Dues and split',
            summary: `Gratuity ${formatINR(g.amount)} (5-year condition waived) split 70 / 30`,
            content: (
              <div className="yx-ppl__stack">
                <div className="yx-scroll-x" tabIndex={0} role="region" aria-label="Table, scrolls sideways on small screens">
                <table className="yx-ppl__impact">
                  <thead>
                    <tr>
                      <th scope="col">Line</th>
                      <th scope="col">Amount</th>
                      <th scope="col">Paid to</th>
                    </tr>
                  </thead>
                  <tbody>
                    <tr><td>Salary 1–14 Sep 2026</td><td className="yx-ppl__num">{formatINR(19600)}</td><td>Kamala Shankar (not salary TDS after date of death)</td></tr>
                    <tr><td>Leave encashment to nominee (14 days)</td><td className="yx-ppl__num">{formatINR(13067)}</td><td>Kamala Shankar</td></tr>
                    <tr><td>Gratuity · {g.basis}</td><td className="yx-ppl__num">{formatINR(g.amount)}</td><td>Kamala {formatINR(gratuityParts[0])} · Divakar {formatINR(gratuityParts[1])}</td></tr>
                    <tr><td>Ex-gratia (company support policy)</td><td className="yx-ppl__num">{formatINR(84000)}</td><td>Kamala Shankar</td></tr>
                  </tbody>
                </table>
                </div>
                <Text size="sm" tone="secondary" as="p">Recoveries only as HR confirms. Form 16 goes to the legal heir.</Text>
              </div>
            ),
          },
          { id: 'forms', title: 'Claim forms', summary: '1 of 6 done', content: <StatusChecklist label="Claim forms" rows={forms} /> },
          {
            id: 'letters',
            title: 'Letters and access',
            summary: 'Condolence, dues statement, claim guidance · nominee logins',
            content: (
              <div className="yx-ppl__stack">
                <StatusChecklist
                  label="Letters to next of kin"
                  rows={[
                    { id: 'l1', title: 'Condolence letter to Kamala Shankar', status: 'Issued' },
                    { id: 'l2', title: 'Dues statement', status: 'Draft' },
                    { id: 'l3', title: 'Claim guidance with cover letters (PF, EDLI, gratuity, insurance)', status: 'Draft' },
                  ]}
                />
                <InlineAlert tone="info">Each nominee gets an OTP login to view and download only the F&F statement, Form 16 and claim documents HR releases.</InlineAlert>
                <div>
                  <Button icon={Mail}>Send nominee access</Button>
                </div>
              </div>
            ),
          },
        ]}
      />
    </PeopleFrame>
  );
}

/* ================================================================== PPL-24 absconding */

/** The live app's absconding timelines (design audit step 3): the designed timeline, one person at a time. */
export interface LiveAbsconding {
  state: 'ready' | 'loading' | 'error' | 'no-access';
  onRetry: () => void;
  rows: AbscondingRow[];
  onStart: () => void;
  onStop: (r: AbscondingRow) => void;
  onResume: (r: AbscondingRow) => void;
  onDispatch: (r: AbscondingRow, key: string) => void;
  onOpenExit: (exitCaseId: string) => void;
  /** Dialogs the page opens. */
  children?: ReactNode;
}

function LiveAbscondingTimeline({ today, live }: { today: Date; live: LiveAbsconding }) {
  const [pick, setPick] = useState<string | null>(null);
  const r = live.rows.find((x) => x.id === pick) ?? live.rows.find((x) => x.status === 'running') ?? live.rows[0];
  const lastPresent = r ? isoDay(r.lastPresentOn) : null;
  const absentDays = lastPresent ? Math.max(0, daysBetween(lastPresent, today)) : 0;
  const steps = r?.steps ?? [];
  const rows: ChecklistRow[] = steps.map((s) => ({
    id: s.key,
    title: `Day ${s.day}: ${s.label}`,
    due: isoDay(s.dueOn),
    status: s.doneAt ? 'Done' : r!.status === 'stopped' ? 'Not needed' : 'Scheduled',
    note: [s.note, s.dispatchRef ? `registered post ${s.dispatchRef}` : null].filter(Boolean).join(' · ') || undefined,
    action:
      s.doneAt && (s.key === 'notice_1' || s.key === 'notice_2') && !s.dispatchRef ? (
        <Button size="sm" icon={Upload} onClick={() => live.onDispatch(r!, s.key)}>
          Add dispatch proof
        </Button>
      ) : undefined,
  }));
  return (
    <PeopleFrame active="Exit cases">
      {live.state === 'no-access' ? (
        <NoAccessState what="the absconding timelines" grantedBy="your HR admin" />
      ) : live.state === 'error' ? (
        <ErrorState title="We couldn't load the absconding timelines" description="Check your connection and try again." onRetry={live.onRetry} />
      ) : live.state === 'loading' ? (
        <ListSkeleton label="Loading absconding timelines" />
      ) : !r ? (
        <>
          <PageHeader title="Absconding" description="Unauthorised absence follows the company's timeline: a salary hold and alert, two notices, then deemed abandonment. Stop it at any step if they come back." />
          <EmptyState title="No absconding timelines" description="Start one when someone stops coming to work without telling anyone." action={<Button variant="primary" onClick={live.onStart}>Start a timeline</Button>} />
        </>
      ) : (
        <>
          {live.rows.length > 1 && (
            <div className="yx-ppl__row">
              <span className="yx-ppl__head-select">
                <Select aria-label="Timeline for" size="sm" value={r.id} onChange={(v) => setPick(v)} options={live.rows.map((x) => ({ value: x.id, label: `${x.name} · ${ABSC[x.status].label.toLowerCase()}` }))} />
              </span>
            </div>
          )}
          <ObjectHeader
            name={`Absconding · ${r.name}`}
            avatarName={r.name}
            person
            secondary={`last present ${formatDate(lastPresent!)}`}
            status={<Badge tone={ABSC[r.status].tone}>{ABSC[r.status].label}</Badge>}
            // Policy name and the salary hold date are not on the timeline record yet (left out).
            facts={[{ label: 'Day of unauthorised absence', value: r.status === 'stopped' ? 'Stopped' : String(absentDays) }]}
            actions={
              <>
                <Button onClick={live.onStart}>Start a timeline</Button>
                {r.status === 'stopped' ? (
                  <Button icon={Play} variant="primary" onClick={() => live.onResume(r)}>
                    Resume timeline
                  </Button>
                ) : r.status === 'running' ? (
                  <Button icon={Pause} onClick={() => live.onStop(r)}>
                    Stop timeline
                  </Button>
                ) : null}
              </>
            }
          />
          {r.status === 'abandoned' && (
            <InlineAlert tone="warning" title="Deemed abandonment" actions={r.exitCaseId ? <Button size="sm" onClick={() => live.onOpenExit(r.exitCaseId!)}>Open exit case</Button> : undefined}>
              An exit case of type absconding opened with the last day present as the last working day.
            </InlineAlert>
          )}
          {r.status === 'stopped' && r.stoppedReason && <InlineAlert tone="success" title="Stopped">{r.stoppedReason}</InlineAlert>}
          <StatusChecklist label="Absconding steps" rows={rows} today={today} />
        </>
      )}
      {live.children}
    </PeopleFrame>
  );
}

const ABSC: Record<AbscondingRow['status'], { label: string; tone: 'info' | 'neutral' | 'danger' }> = { running: { label: 'In progress', tone: 'info' }, stopped: { label: 'Stopped', tone: 'neutral' }, abandoned: { label: 'Deemed abandoned', tone: 'danger' } };

// PPL-24
export function AbscondingTimeline(props: { today: Date; stopped?: boolean; stopOpen?: boolean; live?: LiveAbsconding }) {
  return props.live ? <LiveAbscondingTimeline today={props.today} live={props.live} /> : <SampleAbscondingTimeline {...props} />;
}

function SampleAbscondingTimeline({ today, stopped = false, stopOpen = false }: { today: Date; stopped?: boolean; stopOpen?: boolean }) {
  const first = new Date(2026, 8, 21);
  const s = abscondingState(first, today, undefined, stopped);
  const [open, setOpen] = useState(stopOpen);
  const dispatch: Record<number, string> = { 7: 'Email sent 27 Sep · registered post RK 4471 2291 IN, AD awaited', 14: 'Email sent 4 Oct · registered post RK 4471 2355 IN, AD returned 9 Oct' };
  const rows: ChecklistRow[] = s.rows.map((r) => ({
    id: String(r.day),
    title: `Day ${r.day}: ${r.label}`,
    due: r.on,
    status: r.status === 'done' ? 'Done' : r.status === 'stopped' ? 'Draft' : 'Scheduled',
    note: r.status === 'done' ? dispatch[r.day] : undefined,
  }));
  return (
    <PeopleFrame active="Exit cases">
      <ObjectHeader
        name="Absconding · Rohit Das"
        person
        secondary={`Warehouse Associate · Hosur plant · first absent ${formatDate(first)} · last present 19 Sep 2026`}
        status={<StatusBadge status={s.status === 'running' ? 'In progress' : s.status === 'stopped' ? 'Draft' : 'Escalated'} />}
        facts={[
          { label: 'Day of unauthorised absence', value: stopped ? 'Stopped' : String(s.dayOfAbsence) },
          { label: 'Policy', value: 'Starter template v1 (company-edited)' },
          { label: 'Salary', value: s.dayOfAbsence >= 3 && !stopped ? 'On hold since 23 Sep' : 'Released' },
        ]}
        actions={
          stopped ? (
            <Button icon={Play} variant="primary">
              Resume timeline
            </Button>
          ) : s.status === 'running' ? (
            <Button icon={Pause} onClick={() => setOpen(true)}>
              Stop timeline
            </Button>
          ) : undefined
        }
      />
      {s.status === 'deemed abandoned' && (
        <InlineAlert tone="warning" title="Deemed abandonment on 11 Oct 2026">
          An exit case of type absconding opened with last working day 19 Sep 2026. F&F is recovery-only; any net payable is held, never forfeited. Rehire eligibility is set to no.
        </InlineAlert>
      )}
      {stopped && <InlineAlert tone="success" title="Stopped on 1 Oct 2026 by Lakshmi Venkatesan">Rohit returned with a medical reason. The absence is regularised in Time and his salary is released.</InlineAlert>}
      <StatusChecklist label="Absconding steps" rows={rows} today={today} />
      <div className="yx-ppl__row">
        <Button icon={Upload}>Add dispatch proof</Button>
      </div>
      <ConfirmDialog
        open={open}
        onOpenChange={setOpen}
        title="Stop the absconding timeline for Rohit Das?"
        consequence="No further notices go out. Regularise the absence in Time to release the salary hold."
        confirmLabel="Stop timeline"
        onConfirm={() => setOpen(false)}
      >
        <FormField label="Reason" required>
          <TextArea rows={2} defaultValue="Returned on 1 Oct with a hospital discharge summary." />
        </FormField>
      </ConfirmDialog>
    </PeopleFrame>
  );
}
