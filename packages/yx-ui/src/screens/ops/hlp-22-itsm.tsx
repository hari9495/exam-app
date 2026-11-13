// Helpdesk HLP-22 · Changes and problems (plan item 5, ITSM change and problem management): a DRAFT design for the
// founder's questions 1931 to 1943 (docs/yukthix/helpdesk-itsm-plan.md). Nothing is live yet. Change requests and
// problems are two ticket kinds on IT desks: kind, risk from five questions, approval by risk (the approvals engine),
// a window inside the company's change windows and never in a freeze, the implementation checklist, outcome and review;
// problems link many incidents, record the root cause, become a known error with a workaround for the knowledge base,
// and close through the change that fixes them.
import { useState } from 'react';
import { AlertTriangle, BookOpen, CalendarClock, Link2, Megaphone, Plus } from 'lucide-react';
import { Button } from '../../components/button';
import { Badge, type BadgeTone } from '../../components/display';
import { EmptyState, InlineAlert, NoAccessState } from '../../components/feedback';
import { Card, DescriptionList, PageHeader } from '../../components/shell';
import { DataTable, type TableColumn } from '../../components/table';
import { ApprovalTimeline, type ApprovalStep } from '../../components/timeline';
import { Drawer } from '../../components/drawer';
import { FieldRow, FormField, useTooEarly } from '../../components/field';
import { TextArea, TextField } from '../../components/inputs';
import { Select } from '../../components/select';
import { Checkbox, RadioGroup } from '../../components/choice';
import { Segment } from '../../components/segment';
import { DatePicker } from '../../components/date';
import { Text } from '../../components/foundations';
import { useToast } from '../../components/notify';
import { formatDate } from '../../lib/format';
import { OpsDesk } from './ops-kit';

/* ------------------------------------------------------------------ data shapes (draft) */

export type ChangeKind = 'standard' | 'normal' | 'emergency';
export type Risk = 'low' | 'medium' | 'high';
export type ChangeState = 'draft' | 'approval' | 'scheduled' | 'in_progress' | 'review' | 'closed' | 'backed_out';
export interface ChangeRow {
  id: string;
  number: string;
  title: string;
  kind: ChangeKind;
  risk: Risk;
  state: ChangeState;
  service: string;
  owner: string;
  from: Date;
  to: Date;
  incidents: number;
  clash?: string;
}
export interface ProblemRow {
  id: string;
  number: string;
  title: string;
  state: 'open' | 'investigating' | 'known_error' | 'fixed';
  incidents: number;
  owner: string;
  openedOn: Date;
  cause: string | null;
}
export interface FreezeDay {
  on: Date;
  why: string;
}

const KIND_LABEL: Record<ChangeKind, string> = { standard: 'Standard', normal: 'Normal', emergency: 'Emergency' };
const RISK: Record<Risk, { label: string; tone: BadgeTone }> = { low: { label: 'Low risk', tone: 'neutral' }, medium: { label: 'Medium risk', tone: 'warning' }, high: { label: 'High risk', tone: 'danger' } };
const STATE: Record<ChangeState, { label: string; tone: BadgeTone }> = {
  draft: { label: 'Draft', tone: 'neutral' },
  approval: { label: 'Waiting for approval', tone: 'warning' },
  scheduled: { label: 'Scheduled', tone: 'info' },
  in_progress: { label: 'In progress', tone: 'info' },
  review: { label: 'Review due', tone: 'warning' },
  closed: { label: 'Closed', tone: 'success' },
  backed_out: { label: 'Backed out', tone: 'danger' },
};
const PROBLEM_STATE: Record<ProblemRow['state'], { label: string; tone: BadgeTone }> = { open: { label: 'Open', tone: 'neutral' }, investigating: { label: 'Investigating', tone: 'info' }, known_error: { label: 'Known error', tone: 'warning' }, fixed: { label: 'Fixed', tone: 'success' } };
const time = (d: Date) => d.toLocaleTimeString('en-IN', { hour: 'numeric', minute: '2-digit' });
const windowText = (r: { from: Date; to: Date }) => `${formatDate(r.from)}, ${time(r.from)} to ${time(r.to)}`;

/* ------------------------------------------------------------------ the five risk questions (1933) */

export const RISK_QUESTIONS = [
  { id: 'people', label: 'How many people does it affect?', options: [{ value: '0', label: 'Fewer than 10' }, { value: '1', label: '10 to 100' }, { value: '2', label: 'More than 100, or a whole location' }] },
  { id: 'undo', label: 'Can it be undone?', options: [{ value: '0', label: 'Yes, in minutes' }, { value: '1', label: 'Yes, in hours' }, { value: '2', label: 'No, or not fully' }] },
  { id: 'tested', label: 'Was it tested?', options: [{ value: '0', label: 'Yes, in a test system' }, { value: '1', label: 'Partly' }, { value: '2', label: 'No' }] },
  { id: 'before', label: 'Has the team done this before?', options: [{ value: '0', label: 'Yes, often' }, { value: '1', label: 'Once or twice' }, { value: '2', label: 'Never' }] },
  { id: 'money', label: 'Does it touch payroll, attendance or payments?', options: [{ value: '0', label: 'No' }, { value: '2', label: 'Yes' }] },
] as const;
/** Low under 3 points, Medium 3 to 5, High 6 or more, or any answer of "touches payroll" with "cannot be undone". */
export function riskOf(answers: Record<string, string>): Risk | null {
  if (RISK_QUESTIONS.some((q) => answers[q.id] == null)) return null;
  const sum = RISK_QUESTIONS.reduce((t, q) => t + Number(answers[q.id]), 0);
  if (sum >= 6 || (answers.money === '2' && answers.undo === '2')) return 'high';
  return sum >= 3 ? 'medium' : 'low';
}

/* ------------------------------------------------------------------ Changes list and calendar */

export interface ChangesProps {
  rows: ChangeRow[];
  freezes: FreezeDay[];
  today: Date;
  newOpen?: boolean;
  access?: boolean;
}

export function ChangesScreen({ rows, freezes, today, newOpen = false, access = true }: ChangesProps) {
  const [creating, setCreating] = useState(newOpen);
  if (!access)
    return (
      <OpsDesk area="helpdesk" active="Tickets">
        <NoAccessState what="IT changes" grantedBy="your IT desk lead" />
      </OpsDesk>
    );
  const cols: TableColumn<ChangeRow>[] = [
    { key: 'number', header: 'Change', type: 'id', value: (r) => r.number, width: 110 },
    { key: 'title', header: 'What changes', value: (r) => r.title },
    { key: 'kind', header: 'Kind', value: (r) => KIND_LABEL[r.kind], groupable: true },
    { key: 'risk', header: 'Risk', type: 'status', value: (r) => RISK[r.risk].label, statusTone: (v) => Object.values(RISK).find((x) => x.label === v)?.tone ?? 'neutral' },
    { key: 'state', header: 'Status', type: 'status', value: (r) => STATE[r.state].label, statusTone: (v) => Object.values(STATE).find((x) => x.label === v)?.tone ?? 'neutral' },
    { key: 'when', header: 'Window', value: (r) => r.from.getTime(), render: (r) => windowText(r) },
    { key: 'incidents', header: 'Incidents', type: 'number', value: (r) => r.incidents, width: 100 },
  ];
  const fortnight = rows.filter((r) => r.from >= today && r.from.getTime() - today.getTime() < 14 * 86_400_000).sort((a, b) => a.from.getTime() - b.from.getTime());
  const clashes = rows.filter((r) => r.clash);
  return (
    <OpsDesk area="helpdesk" active="Tickets">
      <PageHeader
        title="Changes"
        description="Changes to IT systems and services: the risk, who approved it, when it happens and how it went. Requesters never see this list."
        actions={
          <Button variant="primary" icon={Plus} onClick={() => setCreating(true)}>
            New change
          </Button>
        }
      />
      {clashes.length > 0 && (
        <InlineAlert tone="warning" title="Two changes at the same time">
          {clashes.map((r) => `${r.number}: ${r.clash}`).join(' ')}
        </InlineAlert>
      )}
      <DataTable
        label="Changes"
        columns={cols}
        rows={rows}
        getRowId={(r) => r.id}
        empty={<EmptyState title="No changes yet." description="Raise a change before you touch a system people use: what changes, the risk, the plan and the way back." />}
      />
      <Card title="Change calendar · the next two weeks">
        {fortnight.length === 0 && freezes.length === 0 ? (
          <Text tone="secondary">Nothing scheduled.</Text>
        ) : (
          <DescriptionList
            items={[
              ...freezes.map((f) => ({ label: formatDate(f.on), value: `Freeze: ${f.why}. Changes wait, except an emergency with a reason.` })),
              ...fortnight.map((r) => ({ label: `${formatDate(r.from)}, ${time(r.from)}`, value: `${r.number} · ${r.title} (${KIND_LABEL[r.kind]}, ${RISK[r.risk].label.toLowerCase()}) · ${r.service}` })),
            ]}
          />
        )}
      </Card>
      {creating && <NewChangeDrawer onClose={() => setCreating(false)} />}
    </OpsDesk>
  );
}

/* ------------------------------------------------------------------ New change (drawer) */

const HOURS = Array.from({ length: 48 }, (_, i) => `${String(Math.floor(i / 2)).padStart(2, '0')}:${i % 2 ? '30' : '00'}`);

export function NewChangeDrawer({ onClose, defaultKind = 'normal' }: { onClose: () => void; defaultKind?: ChangeKind }) {
  const { toast } = useToast();
  const [kind, setKind] = useState<ChangeKind>(defaultKind);
  const [title, setTitle] = useState('');
  const [service, setService] = useState<string | null>(null);
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [on, setOn] = useState<Date | null>(null);
  const [from, setFrom] = useState<string | null>('20:00');
  const [to, setTo] = useState<string | null>('22:00');
  const [plan, setPlan] = useState('');
  const [backout, setBackout] = useState('');
  const [banner, setBanner] = useState(true);
  const risk = riskOf(answers);
  const early = useTooEarly([
    ...(!title.trim() ? [{ fieldId: 'chg-title', message: 'Say what changes.' }] : []),
    ...(!service ? [{ fieldId: 'chg-service', message: 'Choose the service it touches.' }] : []),
    ...(kind !== 'standard' && !risk ? [{ fieldId: 'chg-risk', message: 'Answer the five risk questions.' }] : []),
    ...(!on ? [{ fieldId: 'chg-on', message: 'Choose the day.' }] : []),
    ...(!backout.trim() ? [{ fieldId: 'chg-backout', message: 'Say how to undo it if it goes wrong.' }] : []),
  ]);
  const route = kind === 'standard' ? 'Pre-approved template: no approval, logged and scheduled.' : kind === 'emergency' ? 'An IT lead approves now; the change board reviews it within 2 working days.' : risk === 'high' ? 'The change board approves (a majority of its members).' : risk === 'medium' ? 'The IT lead, then the service owner.' : risk === 'low' ? 'The IT lead.' : 'Answer the risk questions to see who approves.';
  return (
    <Drawer
      open
      onOpenChange={(o) => !o && onClose()}
      size="lg"
      title="New change"
      subtitle="IT help desk"
      dirty={Boolean(title || plan || backout)}
      footer={
        <>
          <Button onClick={onClose}>Cancel</Button>
          <Button
            variant="primary"
            onClick={() => {
              if (early.stop()) return;
              toast({ tone: 'success', title: kind === 'standard' ? 'Change scheduled' : 'Change sent for approval' });
              onClose();
            }}
          >
            {kind === 'standard' ? 'Schedule change' : 'Send for approval'}
          </Button>
        </>
      }
    >
      <FormField id="chg-kind" label="Kind" required helper={kind === 'standard' ? 'From a pre-approved template.' : kind === 'emergency' ? 'Only to stop or prevent an outage now.' : 'Assessed and approved before it is scheduled.'}>
        <Segment label="Kind" value={kind} onChange={setKind} options={(['standard', 'normal', 'emergency'] as const).map((k) => ({ value: k, label: KIND_LABEL[k] }))} />
      </FormField>
      <FormField id="chg-title" label="What changes" required error={early.errorOf('chg-title')}>
        <TextField value={title} onChange={setTitle} maxLength={200} placeholder="Upgrade the attendance devices at the Hosur plant to firmware 4.2" />
      </FormField>
      <FormField id="chg-service" label="Service it touches" required error={early.errorOf('chg-service')}>
        <Select value={service} onChange={setService} placeholder="Choose" options={['Attendance devices', 'Email', 'VPN', 'Payroll system', 'Wi-Fi', 'Laptops'].map((s) => ({ value: s, label: s }))} />
      </FormField>
      {kind !== 'standard' && (
        <FormField id="chg-risk" label="Risk" required error={early.errorOf('chg-risk')} helper={risk ? `${RISK[risk].label}. ${route}` : route}>
          <div className="yx-ops-stack" data-gap="sm">
            {RISK_QUESTIONS.map((q) => (
              <FormField key={q.id} id={`chg-q-${q.id}`} label={q.label}>
                <RadioGroup aria-label={q.label} orientation="horizontal" value={answers[q.id]} onChange={(v) => setAnswers({ ...answers, [q.id]: v })} options={q.options.map((o) => ({ value: o.value, label: o.label }))} />
              </FormField>
            ))}
          </div>
        </FormField>
      )}
      <FieldRow>
        <FormField id="chg-on" label="Day" required error={early.errorOf('chg-on')} helper="Inside the change window (weekdays 8 pm to 6 am, weekends); never in a freeze.">
          <DatePicker value={on} onChange={setOn} />
        </FormField>
        <FormField id="chg-from" label="From">
          <Select value={from} onChange={setFrom} options={HOURS.map((h) => ({ value: h, label: h }))} />
        </FormField>
        <FormField id="chg-to" label="To">
          <Select value={to} onChange={setTo} options={HOURS.map((h) => ({ value: h, label: h }))} />
        </FormField>
      </FieldRow>
      <FormField id="chg-plan" label="Plan and test" optional>
        <TextArea value={plan} onChange={setPlan} rows={3} placeholder="The steps, and how you will check it worked." />
      </FormField>
      <FormField id="chg-backout" label="Way back" required error={early.errorOf('chg-backout')}>
        <TextArea value={backout} onChange={setBackout} rows={2} placeholder="How to undo it if it goes wrong, and how long that takes." />
      </FormField>
      <Checkbox label="Show a known-issue banner to the people affected, from 24 hours before until it ends" checked={banner} onChange={setBanner} />
    </Drawer>
  );
}

/* ------------------------------------------------------------------ A change */

export interface ChangeRecordProps {
  change: ChangeRow;
  stage: 'approval' | 'scheduled' | 'in_progress' | 'review';
  approvals: ApprovalStep[];
  tasks: { id: string; title: string; done: boolean }[];
  causedIncidents?: { number: string; subject: string }[];
  linkedFrom?: { number: string; subject: string; kind: 'incident' | 'problem' }[];
  now: Date;
}

export function ChangeRecordScreen({ change, stage, approvals, tasks, causedIncidents = [], linkedFrom = [], now }: ChangeRecordProps) {
  const { toast } = useToast();
  const [checked, setChecked] = useState(tasks.filter((t) => t.done).map((t) => t.id));
  const [review, setReview] = useState('');
  const reviewEarly = useTooEarly(review.trim().length < 10 ? [{ fieldId: 'chg-review', message: 'Say what happened and what to do differently (at least a sentence).' }] : []);
  return (
    <OpsDesk area="helpdesk" active="Tickets">
      <PageHeader
        title={`${change.number} · ${change.title}`}
        status={<Badge tone={STATE[change.state].tone}>{STATE[change.state].label}</Badge>}
        description={`${KIND_LABEL[change.kind]} change · ${RISK[change.risk].label} · ${change.service} · owner ${change.owner}`}
      />
      {change.clash && (
        <InlineAlert tone="warning" title="Another change at the same time">
          {change.clash} Move one of them, or say why both can go together.
        </InlineAlert>
      )}
      <div className="yx-ops-stack">
        <Card title="Approval">
          <ApprovalTimeline steps={approvals} now={now} />
          {stage === 'approval' && <Text size="sm" tone="secondary">The route follows the risk: the change board approves a high-risk change. Reminders and escalation as for any approval.</Text>}
        </Card>
        <Card title="When" actions={<Badge tone="info"><CalendarClock aria-hidden size={14} /> {windowText(change)}</Badge>}>
          <DescriptionList
            items={[
              { label: 'Window', value: `${windowText(change)} · inside the change window` },
              { label: 'People told', value: 'Known-issue banner for Hosur plant from 24 hours before; email to the service owner' },
              { label: 'Way back', value: 'Re-flash firmware 4.1 from the saved image (20 minutes a device)' },
            ]}
          />
        </Card>
        {(stage === 'in_progress' || stage === 'review') && (
          <Card title="Implementation">
            <div className="yx-ops-stack" data-gap="sm">
              {tasks.map((t) => (
                <Checkbox key={t.id} label={t.title} checked={checked.includes(t.id)} onChange={(on) => setChecked(on ? [...checked, t.id] : checked.filter((x) => x !== t.id))} />
              ))}
            </div>
            {stage === 'in_progress' && (
              <div className="yx-ops-row">
                <Button variant="primary" onClick={() => toast({ tone: 'success', title: `${change.number}: done` })}>
                  Done
                </Button>
                <Button onClick={() => toast({ tone: 'success', title: `${change.number}: done with problems` })}>Done with problems</Button>
                <Button variant="danger" onClick={() => toast({ tone: 'success', title: `${change.number}: backed out` })}>
                  Backed out
                </Button>
              </div>
            )}
          </Card>
        )}
        {stage === 'review' && (
          <Card title="Review" actions={<Badge tone="warning">Due in 5 working days</Badge>}>
            {causedIncidents.length > 0 && (
              <InlineAlert tone="danger" title={`${causedIncidents.length} incidents linked as caused by this change`}>
                {causedIncidents.map((i) => `${i.number} ${i.subject}`).join('; ')}
              </InlineAlert>
            )}
            <FormField id="chg-review" label="What happened, and what to do differently" required error={reviewEarly.errorOf('chg-review')}>
              <TextArea value={review} onChange={setReview} rows={3} />
            </FormField>
            <Button variant="primary" onClick={() => !reviewEarly.stop() && toast({ tone: 'success', title: `${change.number}: review saved and closed` })}>
              Save review and close
            </Button>
          </Card>
        )}
        <Card title="Linked tickets" actions={<Button size="sm" icon={Link2}>Link a ticket</Button>}>
          {linkedFrom.length === 0 ? (
            <Text tone="secondary">No linked tickets.</Text>
          ) : (
            <DescriptionList items={linkedFrom.map((l) => ({ label: l.number, value: `${l.kind === 'problem' ? 'Problem it fixes' : 'Incident that asked for it'} · ${l.subject}` }))} />
          )}
        </Card>
      </div>
    </OpsDesk>
  );
}

/* ------------------------------------------------------------------ Problems */

export function ProblemsScreen({ rows, access = true }: { rows: ProblemRow[]; access?: boolean }) {
  if (!access)
    return (
      <OpsDesk area="helpdesk" active="Tickets">
        <NoAccessState what="IT problems" grantedBy="your IT desk lead" />
      </OpsDesk>
    );
  const cols: TableColumn<ProblemRow>[] = [
    { key: 'number', header: 'Problem', type: 'id', value: (r) => r.number, width: 110 },
    { key: 'title', header: 'What keeps happening', value: (r) => r.title },
    { key: 'incidents', header: 'Incidents', type: 'number', value: (r) => r.incidents, width: 100 },
    { key: 'state', header: 'Status', type: 'status', value: (r) => PROBLEM_STATE[r.state].label, statusTone: (v) => Object.values(PROBLEM_STATE).find((x) => x.label === v)?.tone ?? 'neutral' },
    { key: 'owner', header: 'Owner', type: 'person', value: (r) => r.owner, person: (r) => ({ name: r.owner }) },
    { key: 'opened', header: 'Open since', value: (r) => r.openedOn.getTime(), render: (r) => formatDate(r.openedOn) },
  ];
  return (
    <OpsDesk area="helpdesk" active="Tickets">
      <PageHeader title="Problems" description="The cause behind incidents that keep coming back: linked incidents, the root cause, a workaround for now and the change that fixes it." actions={<Button variant="primary" icon={Plus}>New problem</Button>} />
      <InlineAlert tone="info" title="Suggested: Wi-Fi drops at Hosur">
        3 incidents in the Wi-Fi category in 7 days. Open a problem to find the cause.
      </InlineAlert>
      <DataTable label="Problems" columns={cols} rows={rows} getRowId={(r) => r.id} empty={<EmptyState title="No problems open." description="Link incidents that share a cause to a problem, from the ticket or from the ticket list." />} />
    </OpsDesk>
  );
}

export interface ProblemRecordProps {
  problem: ProblemRow;
  incidents: { number: string; subject: string; state: string; raisedOn: Date }[];
  workaround: string;
  knownError?: boolean;
  fixChange?: { number: string; title: string; state: ChangeState } | null;
}

export function ProblemRecordScreen({ problem, incidents, workaround: initial, knownError = false, fixChange = null }: ProblemRecordProps) {
  const { toast } = useToast();
  const [cause, setCause] = useState(problem.cause ?? '');
  const [workaround, setWorkaround] = useState(initial);
  return (
    <OpsDesk area="helpdesk" active="Tickets">
      <PageHeader title={`${problem.number} · ${problem.title}`} status={<Badge tone={PROBLEM_STATE[problem.state].tone}>{PROBLEM_STATE[problem.state].label}</Badge>} description={`Owner ${problem.owner} · open since ${formatDate(problem.openedOn)} · ${incidents.length} linked incidents`} />
      <div className="yx-ops-stack">
        <Card title="Linked incidents" actions={<Button size="sm" icon={Link2}>Link incidents</Button>}>
          <DataTable
            label="Linked incidents"
            rows={incidents}
            getRowId={(r) => r.number}
            columns={[
              { key: 'number', header: 'Ticket', type: 'id', value: (r) => r.number, width: 110 },
              { key: 'subject', header: 'Subject', value: (r) => r.subject },
              { key: 'raised', header: 'Raised', value: (r) => r.raisedOn.getTime(), render: (r) => formatDate(r.raisedOn) },
              { key: 'state', header: 'Status', value: (r) => r.state },
            ]}
          />
        </Card>
        <Card title="Root cause">
          <FormField id="prb-cause" label="What causes it" helper="Found by the investigation; the cause category helps the reports.">
            <TextArea value={cause} onChange={setCause} rows={3} placeholder="Not found yet." />
          </FormField>
        </Card>
        <Card title={knownError ? 'Known error · workaround' : 'Workaround'} actions={knownError ? <Badge tone="warning"><AlertTriangle aria-hidden size={14} /> Known error</Badge> : undefined}>
          <FormField id="prb-workaround" label="What people can do until it is fixed">
            <TextArea value={workaround} onChange={setWorkaround} rows={3} />
          </FormField>
          <div className="yx-ops-row">
            {!knownError && <Button onClick={() => toast({ tone: 'success', title: `${problem.number} is now a known error` })}>Mark as known error</Button>}
            <Button icon={BookOpen} onClick={() => toast({ tone: 'success', title: 'Draft article made for agents' })}>
              Draft a knowledge-base article
            </Button>
            <Button icon={Megaphone} onClick={() => toast({ tone: 'success', title: 'Known-issue banner shown, with Me too' })}>
              Show a known-issue banner
            </Button>
          </div>
        </Card>
        <Card title="Permanent fix">
          {fixChange ? (
            <DescriptionList items={[{ label: fixChange.number, value: `${fixChange.title} · ${STATE[fixChange.state].label}. When it is done and reviewed, this problem closes and its open incidents are told.` }]} />
          ) : (
            <div className="yx-ops-row">
              <Text tone="secondary">No change raised yet.</Text>
              <Button variant="primary" icon={Plus}>
                Raise a change to fix it
              </Button>
            </div>
          )}
        </Card>
      </div>
    </OpsDesk>
  );
}
