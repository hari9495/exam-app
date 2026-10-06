// PPL-18 Resignation · PPL-19 Exit cases · PPL-20 Clearance · PPL-21 Exit interview · PPL-22 F&F calculator
// PPL-23 Death in service · PPL-24 Absconding timeline (M01 §3.7, §3.8; YX-LC-04…23).
import { useState } from 'react';
import { Mail, Pause, Play, RefreshCw, Upload } from 'lucide-react';
import { PhoneFrame } from '../_kit/frames';
import { Button } from '../../components/button';
import { Card, ObjectHeader, PageHeader } from '../../components/shell';
import { DataTable, type TableColumn } from '../../components/table';
import { Badge } from '../../components/display';
import { EmptyState, InlineAlert } from '../../components/feedback';
import { FormField } from '../../components/field';
import { Select } from '../../components/select';
import { DatePicker } from '../../components/date';
import { TextArea } from '../../components/inputs';
import { Checkbox, RadioGroup, Switch } from '../../components/choice';
import { ApprovalTimeline } from '../../components/timeline';
import { Stepper, useNarrow } from '../../components/stepper';
import { FileUpload } from '../../components/upload';
import { ConfirmDialog } from '../../components/overlay';
import { MenuItem } from '../../components/menu';
import { Text } from '../../components/foundations';
import { formatDate, formatINR } from '../../lib/format';
import { abscondingState, addWorkingDays, daysBetween, fnfTotals, gratuity, noticeOutcome, splitByShares, type FnfLine, type Persona } from './people-logic';
import { CLEARANCE, DEATH_PAYEES, DEPROVISIONING, EXIT_CASES, HOLIDAYS, ME, MEERA, MEERA_FNF, TODAY } from './people-data';
import { DueCountdown, ExplainedLines, MeFrame, PeopleFrame, StatusBadge, StatusChecklist, type ChecklistRow } from './people-kit';

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

type ExitRow = (typeof EXIT_CASES)[number];
const EXIT_STAGES = ['Approval and notice', 'Clearance', 'Exit interview', 'F&F', 'Documents'];

/** F&F is due 2 working days after the last working day; once the case reaches Documents it is paid. */
function fnfState(r: ExitRow, today: Date): { text: string; late: boolean } | null {
  if (EXIT_STAGES.indexOf(r.stage) >= EXIT_STAGES.indexOf('Documents')) return null;
  const due = addWorkingDays(r.lwd, 2, HOLIDAYS);
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

function StageCell({ r, today }: { r: ExitRow; today: Date }) {
  const fnf = fnfState(r, today);
  return (
    <span className="yx-ppl__type">
      <Badge tone="info">{r.stage}</Badge>
      {fnf && <Text size="sm" tone={fnf.late ? 'danger' : 'secondary'}>{fnf.text}</Text>}
    </span>
  );
}

// PPL-19
export function ExitCasesList({ rows, persona = 'hr', state = 'ready', today = TODAY }: { rows: ExitRow[]; persona?: Persona; state?: 'ready' | 'loading'; today?: Date }) {
  const hr = persona === 'hr';
  const shown = hr ? rows : rows.filter((r) => r.manager === ME.name);
  const narrow = useNarrow();
  const flag = (r: ExitRow) => (r.flags ? <Badge tone={r.flagTone ?? 'warning'}>{r.flags}</Badge> : null);
  const open = (r: ExitRow) => (
    <Button size="sm" onClick={() => {}} aria-label={`Open case for ${r.name}`}>
      Open case
    </Button>
  );
  const cols: TableColumn<ExitRow>[] = [
    { key: 'name', header: 'Leaver', type: 'person', value: (r) => r.name, person: (r) => ({ name: r.name, secondary: `${r.code} · ${r.type}` }), width: 210 },
    { key: 'lwd', header: 'Last working day', type: 'date', value: (r) => r.lwd, render: (r) => <LwdCell date={r.lwd} today={today} />, width: 160 },
    { key: 'stage', header: 'Stage', value: (r) => EXIT_STAGES.indexOf(r.stage), render: (r) => <StageCell r={r} today={today} />, width: 170 },
    ...(hr ? [{ key: 'manager', header: 'Manager', value: (r: ExitRow) => r.manager, width: 160, optional: true } as TableColumn<ExitRow>] : []),
    ...(hr ? [{ key: 'flags', header: 'Flags', value: (r: ExitRow) => r.flags, render: flag, width: 170 } as TableColumn<ExitRow>] : []),
  ];
  const empty = <EmptyState title="No open exits" description="Resignations and other exits appear here once raised." />;
  return (
    <PeopleFrame active="Exit cases" persona={persona}>
      <PageHeader title="Exit cases" description="From approval and notice to clearance, exit interview, F&F and documents." actions={hr ? <Button variant="primary">Start exit</Button> : undefined} />
      {narrow && state === 'ready' ? (
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
                <StageCell r={r} today={today} />
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
          state={state}
          defaultSort={{ key: 'lwd', dir: 'asc' }}
          onRowClick={() => {}}
          rowButtons={open}
          rowActions={() => <MenuItem>Open F&F</MenuItem>}
          empty={empty}
          onExport={hr ? () => {} : undefined}
        />
      )}
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

// PPL-19 · case workspace
export function ExitCaseWorkspace({ persona = 'hr', current = 'clearance', variant = 'standard', today }: { persona?: Persona; current?: string; variant?: 'standard' | 'held'; today: Date }) {
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

// PPL-20
export function ClearanceSignoffs({ owner }: { owner?: string }) {
  const rows = owner ? CLEARANCE.filter((c) => c.owner === owner) : CLEARANCE;
  const cols: TableColumn<Clear>[] = [
    { key: 'dept', header: 'Department', value: (r) => r.dept, width: 190 },
    { key: 'item', header: 'Items', value: (r) => r.item, width: 320 },
    { key: 'owner', header: 'Owner', type: 'person', value: (r) => r.owner, person: (r) => ({ name: r.owner }), width: 200 },
    { key: 'recovery', header: 'Recovery', type: 'money', value: (r) => r.recovery, total: 'sum', width: 130 },
    { key: 'status', header: 'Status', type: 'status', value: (r) => r.status, statusTone: (v) => (v === 'Done' ? 'success' : v === 'Blocked' ? 'danger' : 'warning'), width: 120 },
  ];
  const open = CLEARANCE.filter((c) => c.status !== 'Done').length;
  return (
    <PeopleFrame active="Clearance" persona={owner ? 'mgr' : 'hr'}>
      <PageHeader title={owner ? 'Clearance: your sign-offs' : 'Clearance · Meera Iyer'} description={`Last working day ${formatDate(MEERA.lwd)}. Open items block F&F finalisation, not the exit itself.`} />
      {!owner && <InlineAlert tone="warning">{open} of {CLEARANCE.length} sign-offs open. Finance is blocked on an unclaimed advance of {formatINR(5000)}.</InlineAlert>}
      <DataTable
        label="Clearance sign-offs"
        columns={cols}
        rows={rows}
        getRowId={(r) => r.id}
        rowButtons={(r) => (r.status === 'Done' ? null : <Button size="sm">Sign off</Button>)}
        rowActions={() => (
          <>
            <MenuItem>Add recovery</MenuItem>
            <MenuItem>Add note</MenuItem>
          </>
        )}
        empty={<EmptyState title="Nothing to sign off" description="Clearance items for leavers you own show up here." />}
      />
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

// PPL-22
export function FnfCalculator({ variant = 'standard', today }: { variant?: FnfVariant; today: Date }) {
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

// PPL-24
export function AbscondingTimeline({ today, stopped = false, stopOpen = false }: { today: Date; stopped?: boolean; stopOpen?: boolean }) {
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
