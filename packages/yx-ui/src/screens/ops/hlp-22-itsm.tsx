// Helpdesk HLP-22 · Changes and problems (plan item 5, ITSM change and problem management): a DRAFT design for the
// founder's questions 1931 to 1943 (docs/yukthix/helpdesk-itsm-plan.md), approved as suggested. ITSM-2 made the change
// screens live (the live prop); problems follow in ITSM-3. Change requests and
// problems are two ticket kinds on IT desks: kind, risk from five questions, approval by risk (the approvals engine),
// a window inside the company's change windows and never in a freeze, the implementation checklist, outcome and review;
// problems link many incidents, record the root cause, become a known error with a workaround for the knowledge base,
// and close through the change that fixes them.
import { useState } from 'react';
import { AlertTriangle, BookOpen, CalendarClock, Download, Link2, Megaphone, Plus } from 'lucide-react';
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
import { DatePicker, DateRangePicker, type DateRange } from '../../components/date';
import { Dialog } from '../../components/overlay';
import { useRun } from '../org/org-kit';
import { Text } from '../../components/foundations';
import { useToast } from '../../components/notify';
import { formatDate } from '../../lib/format';
import { OpsDesk } from './ops-kit';

/* ------------------------------------------------------------------ data shapes (draft) */

export type ChangeKind = 'standard' | 'normal' | 'emergency';
export type Risk = 'low' | 'medium' | 'high';
export type ChangeState = 'draft' | 'approval' | 'scheduled' | 'in_progress' | 'review' | 'closed' | 'backed_out' | 'rejected';
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
  clash?: string | null;
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
  rejected: { label: 'Not approved', tone: 'danger' },
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

/** ITSM-2 live: what a new change sends (answers 1932-1936). Times are ISO instants. */
export interface ChangeInput {
  kind: ChangeKind;
  title: string;
  appId?: string;
  service?: string;
  templateId?: string;
  answers?: Record<string, string>;
  risk?: Risk;
  riskReason?: string;
  from: string;
  to: string;
  freezeReason?: string;
  plan?: string;
  backout: string;
  banner: boolean;
  tasks?: string[];
}
export interface ChangeQuestion {
  id: string;
  label: string;
  options: readonly { value: string; label: string }[];
}
/** ITSM-2 live: the desk's set-up the New change drawer needs, and the send. */
export interface LiveChangeSetup {
  deskName: string;
  questions: ChangeQuestion[];
  templates: { id: string; name: string; checklist: string[] }[];
  apps: { id: string; name: string }[];
  routes: { low: string; medium: string; high: string; emergency: string };
  /** Hours before the window the known-issue notice shows; null: the desk shows none. */
  bannerHours: number | null;
  /** "weekdays 21:00 to 06:00, and weekends". */
  windowText: string;
  onSubmit: (input: ChangeInput) => Promise<{ id: string; number: string; stage: string }>;
}
/** ITSM-2 live: the changes page of /yx/desk/changes. */
export interface LiveChanges extends LiveChangeSetup {
  desks: { id: string; name: string }[];
  deskId: string;
  onDesk: (id: string) => void;
  canRaise: boolean;
  onOpen: (id: string) => void;
  /** Answer 1943: the change audit export of a period (India dates). */
  onExport: (format: 'csv' | 'pdf', from: string, to: string) => Promise<unknown>;
}

export interface ChangesProps {
  rows: ChangeRow[];
  freezes: FreezeDay[];
  today: Date;
  newOpen?: boolean;
  exportOpen?: boolean;
  access?: boolean;
  live?: LiveChanges;
}

const ymd = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

export function ChangesScreen({ rows, freezes, today, newOpen = false, exportOpen = false, access = true, live }: ChangesProps) {
  const [creating, setCreating] = useState(newOpen);
  const [exporting, setExporting] = useState(exportOpen);
  if (!access)
    return (
      <OpsDesk area="helpdesk" active="Changes">
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
  const fortnight = rows.filter((r) => r.from >= today && r.from.getTime() - today.getTime() < 14 * 86_400_000 && !['closed', 'backed_out', 'rejected'].includes(r.state)).sort((a, b) => a.from.getTime() - b.from.getTime());
  const clashes = rows.filter((r) => r.clash && ['approval', 'scheduled', 'in_progress'].includes(r.state));
  return (
    <OpsDesk area="helpdesk" active="Changes">
      <PageHeader
        title="Changes"
        description="Changes to IT systems and services: the risk, who approved it, when it happens and how it went. Requesters never see this list."
        actions={
          <>
            {live && live.desks.length > 1 && <Select aria-label="IT desk" value={live.deskId} onChange={(v) => v && live.onDesk(v)} options={live.desks.map((d) => ({ value: d.id, label: d.name }))} />}
            <Button icon={Download} onClick={() => setExporting(true)}>
              Export
            </Button>
            {(!live || live.canRaise) && (
              <Button variant="primary" icon={Plus} onClick={() => setCreating(true)}>
                New change
              </Button>
            )}
          </>
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
        onRowClick={live ? (r) => live.onOpen(r.id) : undefined}
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
      {creating && <NewChangeDrawer onClose={() => setCreating(false)} live={live} />}
      {exporting && <ExportDialog today={today} onClose={() => setExporting(false)} onExport={live?.onExport} />}
    </OpsDesk>
  );
}

/** Answer 1943: every change raised in a period, with its approvals, outcome and review, for an auditor. */
function ExportDialog({ today, onClose, onExport }: { today: Date; onClose: () => void; onExport?: LiveChanges['onExport'] }) {
  const { toast } = useToast();
  const [range, setRange] = useState<DateRange>({ from: new Date(today.getFullYear(), today.getMonth() - 2, 1), to: today });
  const [format, setFormat] = useState<'csv' | 'pdf'>('csv');
  const { busy, error, run } = useRun();
  const early = useTooEarly(range.from && range.to ? [] : [{ fieldId: 'chg-period', message: 'Choose the period.' }]);
  return (
    <Dialog
      open
      onOpenChange={(o) => !o && onClose()}
      title="Export changes"
      description="Every change raised in the period: risk, approvals with who and when, the window, the outcome and the review."
      footer={
        <>
          <Button onClick={onClose}>Cancel</Button>
          <Button
            variant="primary"
            loading={busy === 'export'}
            onClick={() =>
              !early.stop() &&
              void run('export', async () => {
                await onExport?.(format, ymd(range.from!), ymd(range.to!));
                toast({ tone: 'success', title: 'Export downloaded.' });
                onClose();
              })
            }
          >
            Download
          </Button>
        </>
      }
    >
      <div className="yx-ops-stack">
        {error && <InlineAlert tone="danger" title="It was not exported">{error}</InlineAlert>}
        <FormField id="chg-period" label="Period" error={early.errorOf('chg-period')}>
          <DateRangePicker label="Period" hideLabel value={range} onChange={setRange} max={today} />
        </FormField>
        <FormField label="File">
          <Segment label="File" value={format} onChange={setFormat} options={[{ value: 'csv', label: 'CSV (spreadsheet)' }, { value: 'pdf', label: 'PDF' }]} />
        </FormField>
      </div>
    </Dialog>
  );
}

/* ------------------------------------------------------------------ New change (drawer) */

const HOURS = Array.from({ length: 48 }, (_, i) => `${String(Math.floor(i / 2)).padStart(2, '0')}:${i % 2 ? '30' : '00'}`);
const DRAWN_SETUP: Omit<LiveChangeSetup, 'onSubmit'> = {
  deskName: 'IT help desk',
  questions: RISK_QUESTIONS.map((q) => ({ id: q.id, label: q.label, options: q.options })),
  templates: [{ id: 't1', name: 'Monthly laptop patching', checklist: ['Save the images', 'Patch', 'Check a sign-in'] }],
  apps: ['Attendance devices', 'Email', 'VPN', 'Payroll system', 'Wi-Fi', 'Laptops'].map((s) => ({ id: s, name: s })),
  routes: { low: 'The IT lead.', medium: 'The IT lead, then the service owner.', high: 'The change board approves (a majority of its members).', emergency: 'An IT lead approves now; the change board reviews it within 2 working days.' },
  bannerHours: 24,
  windowText: 'weekdays 8 pm to 6 am, weekends',
};
/** Risk from any desk's questions (the five starter ones by default): Low under 3 points, Medium 3 to 5, High 6 or more. */
function riskOfQs(qs: ChangeQuestion[], answers: Record<string, string>): Risk | null {
  if (qs.some((q) => answers[q.id] == null)) return null;
  const sum = qs.reduce((t, q) => t + Number(answers[q.id]), 0);
  if (sum >= 6 || (answers.money === '2' && answers.undo === '2')) return 'high';
  return sum >= 3 ? 'medium' : 'low';
}
const RISKS: Risk[] = ['low', 'medium', 'high'];

export function NewChangeDrawer({ onClose, defaultKind = 'normal', live }: { onClose: () => void; defaultKind?: ChangeKind; live?: LiveChangeSetup }) {
  const { toast } = useToast();
  const setup = live ?? DRAWN_SETUP;
  const [kind, setKind] = useState<ChangeKind>(defaultKind);
  const [title, setTitle] = useState('');
  const [service, setService] = useState<string | null>(null);
  const [serviceText, setServiceText] = useState('');
  const [templateId, setTemplateId] = useState<string | null>(null);
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [chosenRisk, setChosenRisk] = useState<Risk | null>(null);
  const [riskReason, setRiskReason] = useState('');
  const [on, setOn] = useState<Date | null>(null);
  const [from, setFrom] = useState<string | null>('20:00');
  const [to, setTo] = useState<string | null>('22:00');
  const [plan, setPlan] = useState('');
  const [backout, setBackout] = useState('');
  const [freezeReason, setFreezeReason] = useState('');
  const [banner, setBanner] = useState(true);
  const { busy, error, run } = useRun();
  const answered = riskOfQs(setup.questions, answers);
  const risk = chosenRisk ?? answered;
  const lowered = Boolean(answered && risk && RISKS.indexOf(risk) < RISKS.indexOf(answered));
  const noApps = setup.apps.length === 0;
  const early = useTooEarly([
    ...(kind === 'standard' && !templateId ? [{ fieldId: 'chg-template', message: 'Choose a pre-approved template.' }] : []),
    ...(!title.trim() ? [{ fieldId: 'chg-title', message: 'Say what changes.' }] : []),
    ...(noApps ? (!serviceText.trim() ? [{ fieldId: 'chg-service', message: 'Name the service it touches.' }] : []) : !service ? [{ fieldId: 'chg-service', message: 'Choose the service it touches.' }] : []),
    ...(kind !== 'standard' && !answered ? [{ fieldId: 'chg-risk', message: `Answer the ${setup.questions.length} risk questions.` }] : []),
    ...(kind !== 'standard' && lowered && riskReason.trim().length < 10 ? [{ fieldId: 'chg-risk-why', message: 'Say why the risk is lower than the answers give.' }] : []),
    ...(!on ? [{ fieldId: 'chg-on', message: 'Choose the day.' }] : []),
    ...(!backout.trim() ? [{ fieldId: 'chg-backout', message: 'Say how to undo it if it goes wrong.' }] : []),
  ]);
  const route = kind === 'standard' ? 'Pre-approved template: no approval, logged and scheduled.' : kind === 'emergency' ? setup.routes.emergency : risk ? setup.routes[risk] : 'Answer the risk questions to see who approves.';
  const send = () => {
    if (early.stop()) return;
    const day = ymd(on!);
    const start = new Date(`${day}T${from ?? '20:00'}:00+05:30`);
    let end = new Date(`${day}T${to ?? '22:00'}:00+05:30`);
    // A window that ends at or before it starts runs into the next morning.
    if (end <= start) end = new Date(end.getTime() + 86_400_000);
    const input: ChangeInput = {
      kind,
      title: title.trim(),
      ...(noApps ? { service: serviceText.trim() } : { appId: service! }),
      ...(kind === 'standard' ? { templateId: templateId! } : { answers, ...(chosenRisk ? { risk: chosenRisk } : {}), ...(lowered ? { riskReason: riskReason.trim() } : {}) }),
      from: start.toISOString(),
      to: end.toISOString(),
      ...(kind === 'emergency' && freezeReason.trim() ? { freezeReason: freezeReason.trim() } : {}),
      ...(plan.trim() ? { plan: plan.trim() } : {}),
      backout: backout.trim(),
      banner,
    };
    if (!live) {
      toast({ tone: 'success', title: kind === 'standard' ? 'Change scheduled' : 'Change sent for approval' });
      onClose();
      return;
    }
    void run('send', async () => {
      const res = await live.onSubmit(input);
      toast({ tone: 'success', title: res.stage === 'scheduled' ? `${res.number} scheduled` : `${res.number} sent for approval` });
      onClose();
    });
  };
  return (
    <Drawer
      open
      onOpenChange={(o) => !o && onClose()}
      size="lg"
      title="New change"
      subtitle={setup.deskName}
      dirty={Boolean(title || plan || backout)}
      footer={
        <>
          <Button onClick={onClose}>Cancel</Button>
          <Button variant="primary" loading={busy === 'send'} onClick={send}>
            {kind === 'standard' ? 'Schedule change' : 'Send for approval'}
          </Button>
        </>
      }
    >
      {error && <InlineAlert tone="danger" title="It was not sent">{error}</InlineAlert>}
      <FormField id="chg-kind" label="Kind" required helper={kind === 'standard' ? 'From a pre-approved template.' : kind === 'emergency' ? 'Only to stop or prevent an outage now.' : 'Assessed and approved before it is scheduled.'}>
        <Segment label="Kind" value={kind} onChange={setKind} options={(['standard', 'normal', 'emergency'] as const).map((k) => ({ value: k, label: KIND_LABEL[k] }))} />
      </FormField>
      {kind === 'standard' && (
        <FormField id="chg-template" label="Pre-approved template" required error={early.errorOf('chg-template')} helper={setup.templates.length ? 'Its steps become the checklist.' : 'This desk has no pre-approved template yet (Desk set-up › Changes).'}>
          <Select
            value={templateId}
            onChange={(v) => {
              setTemplateId(v);
              const t = setup.templates.find((x) => x.id === v);
              if (t && !title.trim()) setTitle(t.name);
            }}
            placeholder="Choose"
            options={setup.templates.map((t) => ({ value: t.id, label: t.name }))}
          />
        </FormField>
      )}
      <FormField id="chg-title" label="What changes" required error={early.errorOf('chg-title')}>
        <TextField value={title} onChange={setTitle} maxLength={200} placeholder="Upgrade the attendance devices at the Hosur plant to firmware 4.2" />
      </FormField>
      <FormField id="chg-service" label="Service it touches" required error={early.errorOf('chg-service')} helper={noApps ? undefined : 'Its owner approves a medium-risk change and hears when it is scheduled.'}>
        {noApps ? <TextField value={serviceText} onChange={setServiceText} maxLength={100} placeholder="VPN" /> : <Select value={service} onChange={setService} placeholder="Choose" options={setup.apps.map((s) => ({ value: s.id, label: s.name }))} />}
      </FormField>
      {kind !== 'standard' && (
        <FormField id="chg-risk" label="Risk" required error={early.errorOf('chg-risk')} helper={risk ? `${RISK[risk].label}. ${route}` : route}>
          <div className="yx-ops-stack" data-gap="sm">
            {setup.questions.map((q) => (
              <FormField key={q.id} id={`chg-q-${q.id}`} label={q.label}>
                <RadioGroup aria-label={q.label} orientation="horizontal" value={answers[q.id]} onChange={(v) => setAnswers({ ...answers, [q.id]: v })} options={q.options.map((o) => ({ value: o.value, label: o.label }))} />
              </FormField>
            ))}
            {answered && (
              <FormField id="chg-risk-set" label="Risk to use" helper={`The answers give ${RISK[answered].label.toLowerCase()}. A lower risk needs a reason.`}>
                <Segment label="Risk to use" value={risk ?? answered} onChange={setChosenRisk} options={RISKS.map((r) => ({ value: r, label: RISK[r].label }))} />
              </FormField>
            )}
            {lowered && (
              <FormField id="chg-risk-why" label="Why the risk is lower" required error={early.errorOf('chg-risk-why')}>
                <TextArea value={riskReason} onChange={setRiskReason} rows={2} maxLength={500} />
              </FormField>
            )}
          </div>
        </FormField>
      )}
      <FieldRow>
        <FormField id="chg-on" label="Day" required error={early.errorOf('chg-on')} helper={`Inside the change window (${setup.windowText}); never in a freeze.`}>
          <DatePicker value={on} onChange={setOn} />
        </FormField>
        <FormField id="chg-from" label="From">
          <Select value={from} onChange={setFrom} options={HOURS.map((h) => ({ value: h, label: h }))} />
        </FormField>
        <FormField id="chg-to" label="To">
          <Select value={to} onChange={setTo} options={HOURS.map((h) => ({ value: h, label: h }))} />
        </FormField>
      </FieldRow>
      {kind === 'emergency' && (
        <FormField id="chg-freeze" label="Why it cannot wait" optional helper="Needed when the window falls in a freeze (the first and last days of the month and the freeze dates).">
          <TextArea value={freezeReason} onChange={setFreezeReason} rows={2} maxLength={500} />
        </FormField>
      )}
      <FormField id="chg-plan" label="Plan and test" optional>
        <TextArea value={plan} onChange={setPlan} rows={3} placeholder="The steps, and how you will check it worked." />
      </FormField>
      <FormField id="chg-backout" label="Way back" required error={early.errorOf('chg-backout')}>
        <TextArea value={backout} onChange={setBackout} rows={2} placeholder="How to undo it if it goes wrong, and how long that takes." />
      </FormField>
      {setup.bannerHours != null && <Checkbox label={`Show a known-issue notice to the people affected, from ${setup.bannerHours} hours before until it ends`} checked={banner} onChange={setBanner} />}
    </Drawer>
  );
}

/* ------------------------------------------------------------------ A change */

/** ITSM-2 live: one change as /yx/desk/changes/[id] shows it, with what this person may do. */
export interface LiveChangeRecord {
  plan: string | null;
  backout: string;
  bannerText: string;
  riskNote: string | null;
  freezeReason: string | null;
  outcome: { text: string; by: string; at: Date } | null;
  review: { text: string; by: string; at: Date } | null;
  reviewDue: Date | null;
  can: { start: boolean; work: boolean; review: boolean };
  onStart: () => Promise<unknown>;
  onTasks: (done: boolean[]) => Promise<unknown>;
  onOutcome: (outcome: 'done' | 'done_with_problems' | 'backed_out', note: string) => Promise<unknown>;
  onReview: (text: string) => Promise<unknown>;
  onBack: () => void;
}

export interface ChangeRecordProps {
  change: ChangeRow;
  stage: ChangeState;
  approvals: ApprovalStep[];
  tasks: { id: string; title: string; done: boolean }[];
  causedIncidents?: { number: string; subject: string }[];
  linkedFrom?: { number: string; subject: string; kind: 'incident' | 'problem' | string }[];
  now: Date;
  live?: LiveChangeRecord;
}

const OUTCOME_WORD = { done: 'Done', done_with_problems: 'Done with problems', backed_out: 'Backed out' } as const;

export function ChangeRecordScreen({ change, stage, approvals, tasks, causedIncidents = [], linkedFrom = [], now, live }: ChangeRecordProps) {
  const { toast } = useToast();
  const [checked, setChecked] = useState(tasks.filter((t) => t.done).map((t) => t.id));
  const [review, setReview] = useState('');
  const [note, setNote] = useState('');
  const { busy, error, run } = useRun();
  const reviewEarly = useTooEarly(review.trim().length < 10 ? [{ fieldId: 'chg-review', message: 'Say what happened and what to do differently (at least a sentence).' }] : []);
  const noteEarly = useTooEarly(note.trim().length < 10 ? [{ fieldId: 'chg-note', message: 'Say what went wrong (at least 10 characters).' }] : []);
  const working = live ? live.can.work : stage === 'in_progress';
  const tick = (id: string, on: boolean) => {
    const next = on ? [...checked, id] : checked.filter((x) => x !== id);
    setChecked(next);
    if (live) void run(`t-${id}`, () => live.onTasks(tasks.map((t) => next.includes(t.id))));
  };
  const finish = (outcome: 'done' | 'done_with_problems' | 'backed_out') => {
    if (outcome !== 'done' && noteEarly.stop()) return;
    if (!live) return toast({ tone: 'success', title: `${change.number}: ${OUTCOME_WORD[outcome].toLowerCase()}` });
    void run(outcome, async () => (await live.onOutcome(outcome, note.trim()), toast({ tone: 'success', title: `${change.number}: ${OUTCOME_WORD[outcome].toLowerCase()}` })));
  };
  const dueText = live?.reviewDue ? `Due ${formatDate(live.reviewDue)}` : 'Due in 5 working days';
  return (
    <OpsDesk area="helpdesk" active="Changes">
      <PageHeader
        title={`${change.number} · ${change.title}`}
        status={<Badge tone={STATE[change.state].tone}>{STATE[change.state].label}</Badge>}
        description={`${KIND_LABEL[change.kind]} change · ${RISK[change.risk].label} · ${change.service} · raised by ${change.owner}`}
        actions={live ? <Button onClick={live.onBack}>All changes</Button> : undefined}
      />
      {change.clash && (
        <InlineAlert tone="warning" title="Another change at the same time">
          {change.clash} Move one of them, or say why both can go together.
        </InlineAlert>
      )}
      {error && <InlineAlert tone="danger" title="It was not saved">{error}</InlineAlert>}
      <div className="yx-ops-stack">
        <Card title="Approval">
          {approvals.length ? <ApprovalTimeline steps={approvals} now={now} /> : <Text tone="secondary">Pre-approved template: no approval needed.</Text>}
          {stage === 'approval' && <Text size="sm" tone="secondary">The route follows the risk: the change board approves a high-risk change. Reminders and escalation as for any approval. Nobody approves their own change.</Text>}
          {live?.riskNote && <Text size="sm" tone="secondary">{live.riskNote}</Text>}
        </Card>
        <Card
          title="When"
          actions={
            <Badge tone="info">
              <CalendarClock aria-hidden size={14} /> {windowText(change)}
            </Badge>
          }
        >
          <DescriptionList
            items={[
              { label: 'Window', value: live?.freezeReason ? `${windowText(change)} · in a freeze: ${live.freezeReason}` : `${windowText(change)} · inside the change window` },
              { label: 'People told', value: live ? live.bannerText : 'Known-issue banner for Hosur plant from 24 hours before; email to the service owner' },
              ...(live?.plan ? [{ label: 'Plan and test', value: live.plan }] : []),
              { label: 'Way back', value: live ? live.backout : 'Re-flash firmware 4.1 from the saved image (20 minutes a device)' },
            ]}
          />
          {(live ? live.can.start : stage === 'scheduled') && (
            <div className="yx-ops-row">
              <Button variant="primary" loading={busy === 'start'} onClick={() => (live ? void run('start', async () => (await live.onStart(), toast({ tone: 'success', title: `${change.number} started` }))) : toast({ tone: 'success', title: `${change.number} started` }))}>
                Start the change
              </Button>
            </div>
          )}
        </Card>
        {(stage === 'in_progress' || stage === 'review' || (live && tasks.length > 0 && stage !== 'approval' && stage !== 'scheduled')) && (
          <Card title="Implementation">
            <div className="yx-ops-stack" data-gap="sm">
              {tasks.length === 0 && <Text tone="secondary">No checklist for this change.</Text>}
              {tasks.map((t) => (
                <Checkbox key={t.id} label={t.title} checked={checked.includes(t.id)} onChange={(on) => working && tick(t.id, on)} />
              ))}
            </div>
            {working && (
              <div className="yx-ops-stack">
                <FormField id="chg-note" label="What went wrong" optional helper="Needed for done with problems, or backed out." error={noteEarly.errorOf('chg-note')}>
                  <TextArea value={note} onChange={setNote} rows={2} maxLength={2000} />
                </FormField>
                <div className="yx-ops-row">
                  <Button variant="primary" loading={busy === 'done'} onClick={() => finish('done')}>
                    Done
                  </Button>
                  <Button loading={busy === 'done_with_problems'} onClick={() => finish('done_with_problems')}>
                    Done with problems
                  </Button>
                  <Button variant="danger" loading={busy === 'backed_out'} onClick={() => finish('backed_out')}>
                    Backed out
                  </Button>
                </div>
              </div>
            )}
            {live?.outcome && <Text size="sm" tone="secondary">{`${live.outcome.text} · ${live.outcome.by}, ${formatDate(live.outcome.at)}`}</Text>}
          </Card>
        )}
        {(stage === 'review' || live?.review) && (
          <Card title="Review" actions={stage === 'review' ? <Badge tone="warning">{dueText}</Badge> : undefined}>
            {causedIncidents.length > 0 && (
              <InlineAlert tone="danger" title={`${causedIncidents.length} incidents linked as caused by this change`}>
                {causedIncidents.map((i) => `${i.number} ${i.subject}`).join('; ')}
              </InlineAlert>
            )}
            {live?.review ? (
              <DescriptionList items={[{ label: `${live.review.by}, ${formatDate(live.review.at)}`, value: live.review.text }]} />
            ) : !live || live.can.review ? (
              <>
                <FormField id="chg-review" label="What happened, and what to do differently" required error={reviewEarly.errorOf('chg-review')}>
                  <TextArea value={review} onChange={setReview} rows={3} />
                </FormField>
                <Button variant="primary" loading={busy === 'review'} onClick={() => !reviewEarly.stop() && (live ? void run('review', async () => (await live.onReview(review.trim()), toast({ tone: 'success', title: `${change.number}: review saved and closed` }))) : toast({ tone: 'success', title: `${change.number}: review saved and closed` }))}>
                  Save review and close
                </Button>
              </>
            ) : (
              <Text tone="secondary">An IT lead or the change board reviews it, not the person who raised it.</Text>
            )}
          </Card>
        )}
        <Card title="Linked tickets" actions={live ? undefined : <Button size="sm" icon={Link2}>Link a ticket</Button>}>
          {linkedFrom.length === 0 ? (
            <Text tone="secondary">{live ? 'No linked tickets. Link an incident to this change from the incident (Caused by).' : 'No linked tickets.'}</Text>
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
