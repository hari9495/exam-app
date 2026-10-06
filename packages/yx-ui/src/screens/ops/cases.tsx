// Case screens (M08): HLP-06 speak-up filing, HLP-07 my cases + show-cause reply, HLP-08 case list + workspace (case team),
// HLP-09 ethics desk. Cases are visible to case members only (YX-CASE-02); non-members see Not found (APX-D §6.3).
import { useState, type ReactNode } from 'react';
import { ArrowLeft, Briefcase, FileText, Lock, Megaphone, Send, ShieldAlert } from 'lucide-react';
import { PhoneFrame, PortalFrame } from '../_kit/frames';
import { Button, IconButton } from '../../components/button';
import { Badge } from '../../components/display';
import { EmptyState, ErrorState, InlineAlert, Skeleton } from '../../components/feedback';
import { Drawer } from '../../components/drawer';
import { FieldRow, FormField } from '../../components/field';
import { TextArea, TextField } from '../../components/inputs';
import { Checkbox, RadioGroup, Switch } from '../../components/choice';
import { Select } from '../../components/select';
import { DatePicker } from '../../components/date';
import { FileUpload } from '../../components/upload';
import { DataTable, type TableColumn } from '../../components/table';
import { FilterBar, type FilterFieldDef } from '../../components/filters';
import { Card, DescriptionList, ObjectHeader, PageHeader, Tabs, TabsContent, TabsList, TabsTrigger } from '../../components/shell';
import { MenuItem } from '../../components/menu';
import { ConfirmDialog, Dialog } from '../../components/overlay';
import { PageBanner } from '../../components/notify';
import { formatDate } from '../../lib/format';
import type { FilterValue } from '../../lib/table';
import { AccessCodeCard, Actions, ClockPanel, Confidential, MembersList, OpsDesk, StatusTrail, Workspace, type CaseMember } from './ops-kit';
import { addDays, formatAccessCode, showCauseDue, type ClockItem } from './ops-rules';
import type { AnonMessage, CaseRow, CaseType } from './helpdesk-data';
import type { Device, ListState } from './helpdesk';

const LOCATIONS = [
  { value: 'blr', label: 'Bengaluru head office' },
  { value: 'maa', label: 'Chennai office' },
  { value: 'hsr', label: 'Hosur plant' },
];

/** APX-D §6.3: a restricted record (case, POSH, ethics, accident, dispute) seen by a non-member is identical to a missing record:
 * "Not found", no owner named, no Request access. */
export function RestrictedNotFound({ area = 'helpdesk' }: { area?: 'helpdesk' | 'compliance' }) {
  return (
    <OpsDesk area={area} active={area === 'helpdesk' ? 'Help centre' : 'Statutory hub'} member={false}>
      <EmptyState title="Not found" description="This page doesn't exist, or the link is out of date. Check the address, or go back to where you came from." action={<Button>Go back</Button>} />
    </OpsDesk>
  );
}

/* =========================================================================================
 * HLP-06 · Speak-up: grievance / whistleblower (T4, D+M, Emp)
 * ======================================================================================= */

export type SpeakUpKind = 'grievance' | 'whistleblower' | 'posh' | 'accident';
export interface SpeakUpScreenProps {
  device?: Device;
  defaultKind?: SpeakUpKind;
  defaultIdentity?: 'named' | 'anonymous';
  /** Company switched the anonymous option off (Q3). */
  anonymousAllowed?: boolean;
  /** After filing. */
  submitted?: 'named' | 'anonymous' | null;
  today: Date;
  codeSeed?: number;
}
export function SpeakUpForm({ defaultKind = 'grievance', defaultIdentity = 'named', anonymousAllowed = true, today }: Omit<SpeakUpScreenProps, 'device' | 'submitted'>) {
  const [kind, setKind] = useState<string>(defaultKind);
  const [identity, setIdentity] = useState<string>(anonymousAllowed ? defaultIdentity : 'named');
  const [when, setWhen] = useState<Date | null>(null);
  const [where, setWhere] = useState<string | null>(null);
  const [external, setExternal] = useState(false);
  const [alerts, setAlerts] = useState(false);
  return (
    <div className="yx-ops-stack">
      <FormField label="What would you like to report?" required>
        <RadioGroup
          value={kind}
          onChange={setKind}
          options={[
            { value: 'grievance', label: 'A workplace grievance', description: 'Pay, working conditions, a manager, transport, safety' },
            { value: 'whistleblower', label: 'Fraud or an ethics concern', description: 'Goes to the ethics officer, not HR' },
            { value: 'posh', label: 'Sexual harassment', description: 'Filed with the Internal Committee only' },
            { value: 'accident', label: 'A workplace accident or injury', description: 'Goes to the safety officer and HR' },
          ]}
        />
      </FormField>
      {kind === 'posh' || kind === 'accident' ? (
        <InlineAlert tone="info" title={kind === 'posh' ? 'This goes to the Internal Committee' : 'Report the accident'} actions={<Button size="sm">{kind === 'posh' ? 'Continue to the complaint form' : 'Continue to the accident report'}</Button>}>
          {kind === 'posh' ? 'Only the committee members on your case can see it. HR does not.' : 'Near-misses are not recorded here; tell your safety officer.'}
        </InlineAlert>
      ) : (
        <>
          <FormField label="How do you want to report?" required>
            <RadioGroup
              value={identity}
              onChange={setIdentity}
              options={[
                { value: 'named', label: 'With my name, kept confidential', description: 'Only the people handling the case can see your name.' },
                { value: 'anonymous', label: 'Anonymously', description: 'Nobody, including the case team, can see who you are. You get an access code to follow up.', disabled: !anonymousAllowed },
              ]}
            />
          </FormField>
          {!anonymousAllowed && <p className="yx-ops-muted">Your company has switched anonymous grievances off. Fraud and ethics concerns can still be anonymous.</p>}
          <FormField label="What happened?" required helper="Facts, dates and amounts help most. Avoid guesses about motives.">
            <TextArea rows={5} />
          </FormField>
          <FieldRow>
            <FormField label="When did it happen?">
              <DatePicker value={when} onChange={setWhen} max={today} />
            </FormField>
            <FormField label="Where?">
              <Select value={where} onChange={setWhere} options={LOCATIONS} placeholder="Choose a location" />
            </FormField>
          </FieldRow>
          <FormField label="Who was involved?" optional helper="Names or roles. They are not told until the process formally notifies them.">
            <TextField />
          </FormField>
          <Checkbox checked={external} onChange={setExternal} label="Someone outside the company was involved" description="A contractor, vendor staff, client staff or visitor" />
          {external && (
            <FieldRow>
              <FormField label="Their name">
                <TextField />
              </FormField>
              <FormField label="Their employer">
                <TextField />
              </FormField>
            </FieldRow>
          )}
          <FormField label="Witnesses" optional>
            <TextField />
          </FormField>
          <FormField label="Documents or photos" optional>
            <FileUpload multiple accept={['.pdf', '.jpg', '.png', '.xlsx']} upload={async () => {}} />
          </FormField>
          <Checkbox label="I'm worried about retaliation" description="The case owner is alerted and can act at once. You can also raise this later." />
          {identity === 'anonymous' && (
            <div className="yx-ops-stack" data-gap="sm">
              <Switch checked={alerts} onChange={setAlerts} label="Tell me when there's an update" description="Optional. We store your email or phone encrypted; nobody at the company can see it. Alerts say only “You have an update”." />
              {alerts && (
                <FormField label="Email or mobile for alerts">
                  <TextField />
                </FormField>
              )}
            </div>
          )}
        </>
      )}
    </div>
  );
}

export function SpeakUpScreen({ device = 'desk', defaultKind = 'grievance', defaultIdentity = 'named', anonymousAllowed = true, submitted = null, today, codeSeed = 20260929 }: SpeakUpScreenProps) {
  const title = defaultKind === 'whistleblower' ? 'Fraud or ethics report' : 'Speak up';
  const done =
    submitted === 'anonymous' ? (
      <div className="yx-ops-stack">
        <InlineAlert tone="success" title="Your report is filed">
          It went to {defaultKind === 'whistleblower' ? 'the ethics officer' : 'the Grievance Redressal Committee'}. Nobody can see who filed it.
        </InlineAlert>
        <AccessCodeCard code={formatAccessCode(codeSeed)} />
        <InlineAlert tone="warning">If you lose the code we can't recover it. You can file a linked follow-up report instead.</InlineAlert>
      </div>
    ) : submitted === 'named' ? (
      <div className="yx-ops-stack">
        <InlineAlert tone="success" title="Grievance GRV-0146 is filed">
          The Grievance Redressal Committee at Hosur plant will acknowledge it. You can follow it in My cases.
        </InlineAlert>
        <ClockPanel
          title="What happens next"
          today={today}
          source="Disposal period from P07 IN.IR (verify)"
          items={[
            { key: 'ack', label: 'Acknowledgement', due: addDays(today, 2) },
            { key: 'disposal', label: 'Decision by the committee', due: addDays(today, 30) },
            { key: 'appeal', label: 'Appeal, if you disagree', due: null, note: 'Opens after the decision' },
          ]}
        />
      </div>
    ) : null;
  const footer = submitted ? (
    <Button variant="primary">Go to my cases</Button>
  ) : (
    <>
      <Button>Cancel</Button>
      <Button variant="primary" icon={Send}>
        File report
      </Button>
    </>
  );
  const body = done ?? <SpeakUpForm defaultKind={defaultKind} defaultIdentity={defaultIdentity} anonymousAllowed={anonymousAllowed} today={today} />;
  if (device === 'phone')
    return (
      <PhoneFrame tab="me" title={title} back={<IconButton icon={ArrowLeft} label="Back" />} hideTabs>
        <p className="yx-ops-muted">Only the people handling your report can see it. Every view is logged.</p>
        {body}
        <div className="yx-ops-stack" data-gap="sm">
          {submitted ? (
            footer
          ) : (
            <>
              <Button variant="primary" icon={Send} fullWidth>
                File report
              </Button>
              <Button fullWidth>Cancel</Button>
            </>
          )}
        </div>
      </PhoneFrame>
    );
  return (
    <OpsDesk area="helpdesk" active="Speak-up" member={false}>
      <PageHeader title={title} description="Raise a grievance or report a concern. You can do it with your name kept confidential, or anonymously." />
      <Card footer={<Actions end>{footer}</Actions>}>
        <div className="yx-ops-form">{body}</div>
      </Card>
    </OpsDesk>
  );
}

/** YX-CASE-11 no-login page for anonymous reporters. */
export function CheckReportScreen({ state = 'enter', messages = [] }: { state?: 'enter' | 'open' | 'wrong-code' | 'locked'; messages?: AnonMessage[] }) {
  const [code, setCode] = useState(state === 'wrong-code' ? 'KF7Q-2MXA-99TR-HPL3' : '');
  return (
    <PortalFrame tenant="Kaveri Foods Pvt Ltd" portal="Check my report">
      {state === 'open' ? (
        <>
          <PageHeader title="Report WB-0009" status={<Badge tone="info">Investigation</Badge>} description="Received 3 Sep 2026. Messages here reach the ethics officer only." />
          <Card title="Messages">
            <AnonThread messages={messages} viewer="reporter" />
          </Card>
          <Card>
            <FormField label="Reply">
              <TextArea rows={3} />
            </FormField>
            <Actions end>
              <Button variant="primary" icon={Send}>
                Send reply
              </Button>
            </Actions>
          </Card>
        </>
      ) : (
        <Card>
          <div className="yx-ops-stack yx-ops-form" data-size="sm">
            <PageHeader title="Check my report" description="Enter the access code you got when you filed. We don't ask for your name." />
            {state === 'wrong-code' && <InlineAlert tone="danger">That code doesn't match a report. Check each character and try again. You have 3 tries left in this hour.</InlineAlert>}
            {state === 'locked' && <InlineAlert tone="danger">Too many tries. Try again after 10:45 am. If you lost your code, file a follow-up report and mention the earlier one.</InlineAlert>}
            <FormField label="Access code" helper="16 characters, like ABCD-EFGH-JKLM-NPQR">
              <TextField value={code} onChange={setCode} autoComplete="off" disabled={state === 'locked'} />
            </FormField>
            <Actions>
              <Button variant="primary" disabled={state === 'locked'}>
                Open my report
              </Button>
              <Button>File a follow-up report</Button>
            </Actions>
          </div>
        </Card>
      )}
    </PortalFrame>
  );
}

export function AnonThread({ messages, viewer }: { messages: AnonMessage[]; viewer: 'reporter' | 'team' }) {
  return (
    <ol className="yx-ops-conv" aria-label="Anonymous messages">
      {messages.map((m) => (
        <li key={m.id} className="yx-ops-msg" data-kind={(viewer === 'team') === (m.from === 'team') ? 'mine' : undefined}>
          <span className="yx-ops-msg__meta">
            <span className="yx-ops-msg__who">{m.from === 'reporter' ? (viewer === 'reporter' ? 'You' : 'Anonymous reporter') : viewer === 'reporter' ? 'Case team' : m.who}</span>
            <span>{formatDate(m.at)}</span>
          </span>
          <p className="yx-ops-msg__body">{m.text}</p>
        </li>
      ))}
    </ol>
  );
}

/* =========================================================================================
 * HLP-07 · My cases (complainant / respondent, show-cause reply) (T2 / T4, D+M, Emp)
 * ======================================================================================= */

export interface MyCase {
  id: string;
  type: string;
  role: string;
  stage: string;
  next: string;
  due: Date | null;
  status: 'Open' | 'Action needed' | 'Closed';
}
export interface ShowCause {
  caseId: string;
  issuedOn: Date;
  issuedBy: string;
  misconduct: string;
  clause: string;
  facts: string;
}
export interface MyCasesScreenProps {
  device?: Device;
  cases: MyCase[];
  showCause: ShowCause;
  today: Date;
  state?: ListState;
  replyOpen?: boolean;
  replied?: boolean;
  extensionRequested?: boolean;
}
export function ShowCauseReply({ notice, today, replied, extensionRequested }: { notice: ShowCause; today: Date; replied?: boolean; extensionRequested?: boolean }) {
  const [ext, setExt] = useState(!!extensionRequested);
  const due = showCauseDue(notice.issuedOn, ext ? 7 : 0);
  return (
    <div className="yx-ops-stack">
      <ClockPanel
        title="Your reply"
        today={today}
        items={[{ key: 'reply', label: ext ? 'Reply due (extension requested, waiting for HR)' : 'Reply due', due, doneOn: replied ? today : null }]}
        source="No penalty can be decided before your reply or the due date"
      />
      <Card title="Show-cause notice">
        <DescriptionList
          items={[
            { label: 'Issued', value: `${formatDate(notice.issuedOn)} by ${notice.issuedBy}` },
            { label: 'Alleged misconduct', value: notice.misconduct },
            { label: 'Rule', value: notice.clause },
            { label: 'Facts', value: notice.facts },
          ]}
        />
        <Actions>
          <Button icon={FileText}>Open notice letter</Button>
        </Actions>
      </Card>
      {replied ? (
        <InlineAlert tone="success" title="Reply sent">
          HR received your reply on {formatDate(today)}. You'll be told the next step here; nothing about this case is sent outside the app.
        </InlineAlert>
      ) : (
        <>
          <FormField label="Your reply" required helper="Explain what happened in your own words. You can attach medical or other documents.">
            <TextArea rows={6} defaultValue="I was admitted to hospital in my village from 8 to 11 Sep and could not reach my supervisor." />
          </FormField>
          <FormField label="Documents" optional>
            <FileUpload multiple accept={['.pdf', '.jpg', '.png']} upload={async () => {}} />
          </FormField>
          <Checkbox checked={ext} onChange={setExt} label="Ask for 7 more days to reply" description="HR decides; your current due date applies until then." />
        </>
      )}
    </div>
  );
}
export function MyCasesScreen({ device = 'desk', cases, showCause, today, state = 'ready', replyOpen, replied, extensionRequested }: MyCasesScreenProps) {
  const [open, setOpen] = useState(!!replyOpen || !!replied);
  const columns: TableColumn<MyCase>[] = [
    { key: 'id', header: 'Case', type: 'id', value: (c) => c.id },
    { key: 'type', header: 'Type', value: (c) => c.type },
    { key: 'role', header: 'Your role', value: (c) => c.role },
    { key: 'stage', header: 'Stage', value: (c) => c.stage },
    { key: 'next', header: 'Next', value: (c) => (c.due ? `${c.next}, ${formatDate(c.due)}` : c.next), width: 240 },
    { key: 'status', header: 'Status', type: 'status', value: (c) => c.status, statusTone: (v) => (v === 'Action needed' ? 'warning' : v === 'Closed' ? 'neutral' : 'info') },
  ];
  const footer = replied ? (
    <Button onClick={() => setOpen(false)}>Close</Button>
  ) : (
    <>
      <Button onClick={() => setOpen(false)}>Save draft</Button>
      <Button variant="primary" icon={Send}>
        Send reply
      </Button>
    </>
  );
  const sheet = <ShowCauseReply notice={showCause} today={today} replied={replied} extensionRequested={extensionRequested} />;
  if (device === 'phone')
    return (
      <PhoneFrame tab="me" title={open ? 'Reply to notice' : 'My cases'} back={<IconButton icon={ArrowLeft} label="Back" onClick={() => setOpen(false)} />}>
        {open ? (
          <>
            {sheet}
            {!replied && (
              <Button variant="primary" icon={Send} fullWidth>
                Send reply
              </Button>
            )}
          </>
        ) : state === 'empty' || cases.length === 0 ? (
          <EmptyState compact title="You're not part of any case." />
        ) : (
          <ul className="yx-ops-stack yx-ops-plain" data-gap="sm">
            {cases.map((c) => (
              <li key={c.id} className="yx-ops-tile">
                <div className="yx-ops-tile__row">
                  <span className="yx-ops-tile__title">
                    {c.type} · {c.role}
                  </span>
                  <Badge tone={c.status === 'Action needed' ? 'warning' : c.status === 'Closed' ? 'neutral' : 'info'}>{c.status}</Badge>
                </div>
                <span className="yx-ops-muted">
                  <span className="yx-ops-mono">{c.id}</span> · {c.stage}
                  {c.due ? ` · ${c.next} ${formatDate(c.due)}` : ''}
                </span>
                {c.status === 'Action needed' && (
                  <Button size="sm" onClick={() => setOpen(true)}>
                    Reply to notice
                  </Button>
                )}
              </li>
            ))}
          </ul>
        )}
      </PhoneFrame>
    );
  return (
    <OpsDesk area="helpdesk" active="Speak-up" member={false}>
      <PageHeader title="My cases" description="Cases where you are the complainant, the respondent or a witness. Only people on each case can see it." />
      {cases.some((c) => c.status === 'Action needed') && (
        <PageBanner tone="warning" action={<Button size="sm" onClick={() => setOpen(true)}>Reply to notice</Button>}>
          You have a show-cause notice. Reply by {formatDate(showCauseDue(showCause.issuedOn))}.
        </PageBanner>
      )}
      <DataTable
        label="My cases"
        columns={columns}
        rows={state === 'empty' ? [] : cases}
        getRowId={(c) => c.id}
        state={state === 'empty' ? 'ready' : state}
        errorTitle="We couldn't load your cases."
        onRetry={() => {}}
        empty={<EmptyState title="You're not part of any case." description="If you want to raise something, use Speak up." action={<Button icon={Megaphone}>Speak up</Button>} />}
        rowButtons={(c) => (c.status === 'Action needed' ? <Button size="sm" onClick={() => setOpen(true)}>Reply</Button> : null)}
      />
      <Drawer open={open} onOpenChange={setOpen} size="lg" title={`Reply to show-cause notice · ${showCause.caseId}`} subtitle="Confidential. Only the case team sees your reply." footer={footer}>
        {sheet}
      </Drawer>
    </OpsDesk>
  );
}

/* =========================================================================================
 * HLP-08 · Case list + case workspace (case team) (T3, D)
 * ======================================================================================= */

const CASE_FILTERS: FilterFieldDef[] = [
  { key: 'type', label: 'Type', type: 'multi', options: ['Grievance', 'Disciplinary', 'Whistleblower', 'Workplace accident', 'Collective dispute'].map((v) => ({ value: v, label: v })) },
  { key: 'status', label: 'Status', type: 'multi', options: ['Open', 'On hold', 'Closed'].map((v) => ({ value: v, label: v })) },
  { key: 'location', label: 'Location', type: 'multi', options: LOCATIONS.map((l) => ({ value: l.label, label: l.label })) },
];
export interface CaseListScreenProps {
  cases: CaseRow[];
  today: Date;
  state?: ListState;
  member?: boolean;
  defaultFilters?: FilterValue[];
}
export function CaseListScreen({ cases, today, state = 'ready', member = true, defaultFilters = [] }: CaseListScreenProps) {
  const [filters, setFilters] = useState<FilterValue[]>(defaultFilters);
  if (!member) return <RestrictedNotFound />;
  let rows = cases;
  for (const f of filters) if (f.type === 'multi' && f.values.length) rows = rows.filter((c) => f.values.includes(String((c as unknown as Record<string, unknown>)[f.key])));
  const columns: TableColumn<CaseRow>[] = [
    { key: 'id', header: 'Case', type: 'id', value: (c) => c.id },
    { key: 'type', header: 'Type', value: (c) => c.type, groupable: true },
    { key: 'subject', header: 'Subject', value: (c) => c.subject, width: 300 },
    { key: 'stage', header: 'Stage', value: (c) => c.stage },
    { key: 'raisedBy', header: 'Raised by', value: (c) => c.raisedBy, render: (c) => (c.anonymous ? <Badge tone="neutral">Anonymous</Badge> : c.raisedBy) },
    { key: 'owner', header: 'Owner', value: (c) => c.owner },
    {
      key: 'due',
      header: 'Next due',
      type: 'date',
      value: (c) => c.nextDue,
      render: (c) => {
        const late = c.status !== 'Closed' && c.nextDue < today;
        return (
          <span className="yx-ops-row">
            {formatDate(c.nextDue)}
            {late && <Badge tone="danger">Overdue</Badge>}
          </span>
        );
      },
    },
    { key: 'status', header: 'Status', type: 'status', value: (c) => c.status, statusTone: (v) => (v === 'Closed' ? 'neutral' : 'info') },
  ];
  return (
    <OpsDesk area="helpdesk" active="Cases" counts={{ Cases: cases.filter((c) => c.status === 'Open').length }}>
      <PageHeader title="Cases" description="Only cases you are a member of are listed. Cases can't be deleted; they close with an outcome." actions={<Button icon={Briefcase}>Open a case</Button>} />
      <Confidential>
        <DataTable
          label="Cases"
          columns={columns}
          rows={state === 'empty' ? [] : rows}
          getRowId={(c) => c.id}
          state={state === 'empty' ? 'ready' : state}
          errorTitle="We couldn't load cases."
          onRetry={() => {}}
          empty={<EmptyState title="You're not on any case." description="Case owners add people to each case by name." />}
          filtered={filters.length > 0}
          onClearFilters={() => setFilters([])}
          toolbar={<FilterBar fields={CASE_FILTERS} value={filters} onChange={setFilters} searchPlaceholder="Search case or subject" />}
          onRowClick={() => {}}
        />
      </Confidential>
    </OpsDesk>
  );
}

export type CaseVariant = 'grievance' | 'anonymous' | 'disciplinary';
export interface CaseWorkspaceScreenProps {
  variant: CaseVariant;
  caseRow: CaseRow;
  members: CaseMember[];
  timeline: { id: string; at: Date; who: string; text: string }[];
  documents: { name: string; by: string; at: Date; size: string }[];
  messages?: AnonMessage[];
  today: Date;
  member?: boolean;
  tab?: string;
  /** Opens the add-member dialog showing the conflict-of-interest block (YX-CASE-04). */
  addMemberConflict?: boolean;
  /** Disciplinary: decision form open. */
  decisionOpen?: boolean;
  /** Disciplinary: reply received. */
  replyReceived?: boolean;
}
const CASE_ICON: Record<CaseType, typeof Lock> = { Grievance: Megaphone, Disciplinary: FileText, Whistleblower: ShieldAlert, 'Workplace accident': ShieldAlert, 'Collective dispute': Briefcase, POSH: Lock };

export function CaseWorkspaceScreen({ variant, caseRow, members, timeline, documents, messages = [], today, member = true, tab, addMemberConflict, decisionOpen, replyReceived }: CaseWorkspaceScreenProps) {
  const [current, setCurrent] = useState(tab ?? (variant === 'anonymous' ? 'messages' : 'timeline'));
  const [addOpen, setAddOpen] = useState(!!addMemberConflict);
  const [decision, setDecision] = useState(!!decisionOpen);
  const [penalty, setPenalty] = useState<string>('warning');
  if (!member) return <RestrictedNotFound />;

  const clocks: ClockItem[] =
    variant === 'disciplinary'
      ? [
          { key: 'notice', label: 'Show-cause notice', due: new Date(2026, 8, 23), doneOn: new Date(2026, 8, 23) },
          { key: 'reply', label: 'Employee reply', due: showCauseDue(new Date(2026, 8, 23)), doneOn: replyReceived ? today : null },
          { key: 'inquiry', label: 'Inquiry report', due: null, note: 'Starts if an inquiry is ordered' },
        ]
      : variant === 'anonymous'
        ? [
            { key: 'ack', label: 'Acknowledge to reporter', due: addDays(caseRow.opened, 7), doneOn: addDays(caseRow.opened, 1) },
            { key: 'interim', label: 'Interim report to audit committee', due: caseRow.nextDue },
          ]
        : [
            { key: 'ack', label: 'Acknowledged', due: addDays(caseRow.opened, 2), doneOn: addDays(caseRow.opened, 1) },
            { key: 'disposal', label: 'Committee decision (disposal)', due: addDays(caseRow.opened, 30), escalateOn: addDays(caseRow.opened, 23) },
            { key: 'appeal', label: 'Appeal window for the worker', due: null, note: 'Opens after the decision' },
          ];

  const steps =
    variant === 'disciplinary'
      ? ['Incident raised', 'HR review', 'Show-cause notice', 'Reply', 'Inquiry', 'Decision', 'Letter', 'Appeal']
      : variant === 'anonymous'
        ? ['Received', 'Acknowledged', 'Investigation', 'Outcome to audit committee', 'Closed']
        : ['Filed', 'Acknowledged', 'Committee assigned', 'Investigation', 'Finding', 'Resolution', 'Appeal'];
  const currentStep = variant === 'disciplinary' ? (replyReceived ? 4 : 3) : variant === 'anonymous' ? 2 : 3;

  return (
    <OpsDesk area="helpdesk" active="Cases">
      <Confidential>
        <ObjectHeader
          name={caseRow.subject}
          icon={CASE_ICON[caseRow.type]}
          secondary={
            <span>
              <span className="yx-ops-mono">{caseRow.id}</span> · {caseRow.type} · {caseRow.location} · opened {formatDate(caseRow.opened)}
            </span>
          }
          status={
            <>
              <Badge tone="info">{caseRow.stage}</Badge>
              {caseRow.anonymous && <Badge tone="neutral">Anonymous reporter</Badge>}
              {variant === 'grievance' && <Badge tone="neutral">Grievance Redressal Committee</Badge>}
            </>
          }
          facts={[
            { label: 'Owner', value: caseRow.owner },
            { label: variant === 'disciplinary' ? 'Employee' : 'Raised by', value: variant === 'disciplinary' ? (caseRow.respondent ?? '—') : caseRow.anonymous ? 'Anonymous' : caseRow.raisedBy },
            { label: 'Next due', value: `${caseRow.nextStep}, ${formatDate(caseRow.nextDue)}` },
          ]}
          actions={
            <>
              <Button onClick={() => setAddOpen(true)}>Add member</Button>
              {variant === 'disciplinary' ? (
                <Button variant="primary" onClick={() => setDecision(true)}>
                  Record decision
                </Button>
              ) : (
                <Button variant="primary">Record finding</Button>
              )}
            </>
          }
          menu={
            <>
              <MenuItem>Raise retaliation flag</MenuItem>
              <MenuItem>Put on legal hold</MenuItem>
              <MenuItem>Close with outcome</MenuItem>
            </>
          }
        />
        <StatusTrail steps={steps.map((label) => ({ label }))} current={currentStep} label="Case stages" />
        <ClockPanel title="Due dates" items={clocks} today={today} source={variant === 'grievance' ? 'Disposal period from P07 IN.IR (verify)' : variant === 'anonymous' ? 'Company vigil policy' : 'Company misconduct matrix'} />
        <Workspace
          main={
            <Tabs value={current} onValueChange={setCurrent}>
              <TabsList aria-label="Case sections">
                <TabsTrigger value="timeline">Timeline</TabsTrigger>
                <TabsTrigger value="documents" count={documents.length}>
                  Documents
                </TabsTrigger>
                {variant === 'anonymous' && (
                  <TabsTrigger value="messages" count={messages.length}>
                    Anonymous messages
                  </TabsTrigger>
                )}
                {variant === 'disciplinary' && <TabsTrigger value="misconduct">Misconduct & actions</TabsTrigger>}
              </TabsList>
              <TabsContent value="timeline">
                <ol className="yx-ops-conv" aria-label="Case timeline">
                  {timeline.map((t) => (
                    <li key={t.id} className="yx-ops-msg">
                      <span className="yx-ops-msg__meta">
                        <span className="yx-ops-msg__who">{t.who}</span>
                        <span>{formatDate(t.at)}</span>
                      </span>
                      <p className="yx-ops-msg__body">{t.text}</p>
                    </li>
                  ))}
                </ol>
              </TabsContent>
              <TabsContent value="documents">
                <ul className="yx-ops-list">
                  {documents.map((doc) => (
                    <li key={doc.name} className="yx-ops-list__item">
                      <span className="yx-ops-list__main">
                        <span className="yx-ops-list__title">{doc.name}</span>
                        <span className="yx-ops-list__sub">
                          {doc.by} · {formatDate(doc.at)} · {doc.size} · encrypted, watermarked on download
                        </span>
                      </span>
                      <Button size="sm">Open</Button>
                    </li>
                  ))}
                </ul>
                <FileUpload multiple upload={async () => {}} />
              </TabsContent>
              {variant === 'anonymous' && (
                <TabsContent value="messages">
                  <div className="yx-ops-stack">
                    <InlineAlert tone="info">The reporter reads and replies with their access code. You can't see who they are, and nothing about them is stored.</InlineAlert>
                    <AnonThread messages={messages} viewer="team" />
                    <FormField label="Message to reporter">
                      <TextArea rows={3} />
                    </FormField>
                    <Actions end>
                      <Button icon={Send}>Send message</Button>
                    </Actions>
                  </div>
                </TabsContent>
              )}
              {variant === 'disciplinary' && (
                <TabsContent value="misconduct">
                  <div className="yx-ops-stack">
                    <DescriptionList
                      items={[
                        { label: 'Misconduct', value: 'Absence without leave for more than 4 consecutive days (major)' },
                        { label: 'Standing orders', value: 'Certified, v3 valid on the incident date (8 Sep 2026), clause 14(2)(c)' },
                        { label: 'Suggested actions', value: 'Written warning, or deduction of wages for the days absent' },
                        { label: 'Earlier warnings', value: 'None active (one expired 11 Mar 2026)' },
                      ]}
                    />
                    <Switch label="Suspend pending inquiry" description="Subsistence allowance is paid through payroll at the P07 rate for the period." />
                  </div>
                </TabsContent>
              )}
            </Tabs>
          }
          rail={
            <>
              <Card>
                <MembersList members={members} />
              </Card>
              <Card title="Access log">
                <p className="yx-ops-muted">Every open, download and message is logged. Last 7 days: 14 views by 3 members.</p>
              </Card>
            </>
          }
        />
      </Confidential>
      <Dialog
        open={addOpen}
        onOpenChange={setAddOpen}
        title="Add a case member"
        footer={
          <>
            <Button onClick={() => setAddOpen(false)}>Cancel</Button>
            <Button variant="primary" disabled={addMemberConflict}>
              Add member
            </Button>
          </>
        }
      >
        <div className="yx-ops-stack">
          <FormField label="Person">
            <TextField defaultValue={addMemberConflict ? 'Ravi Shankar' : ''} />
          </FormField>
          <FormField label="Role on the case">
            <Select value="investigator" onChange={() => {}} options={[{ value: 'investigator', label: 'Investigator' }, { value: 'witness', label: 'Witness' }, { value: 'hr', label: 'HR' }]} />
          </FormField>
          {addMemberConflict && (
            <InlineAlert tone="danger" title="Conflict of interest" actions={<Button size="sm">Add with a documented override</Button>}>
              Ravi Shankar is in the respondent's manager chain. He can't join the case unless you record why an override is needed.
            </InlineAlert>
          )}
        </div>
      </Dialog>
      <Drawer
        open={decision}
        onOpenChange={setDecision}
        title="Record decision"
        subtitle={`${caseRow.id} · ${caseRow.respondent ?? ''}`}
        footer={
          <>
            <Button onClick={() => setDecision(false)}>Cancel</Button>
            <Button variant="primary" disabled={!replyReceived}>
              Record decision and draft letter
            </Button>
          </>
        }
      >
        <div className="yx-ops-stack">
          {!replyReceived && <InlineAlert tone="warning">No penalty can be decided before the employee replies or the reply date ({formatDate(showCauseDue(new Date(2026, 8, 23)))}) passes.</InlineAlert>}
          <FormField label="Decision">
            <RadioGroup
              value={penalty}
              onChange={setPenalty}
              options={[
                { value: 'none', label: 'No action' },
                { value: 'warning', label: 'Written warning', description: 'Expires after 12 months; stays on record' },
                { value: 'deduction', label: 'Deduction of wages', description: 'Sent to payroll as a one-time deduction' },
                { value: 'suspension', label: 'Suspension' },
                { value: 'termination', label: 'Termination', description: 'Opens an exit case' },
              ]}
            />
          </FormField>
          <FormField label="Reasons" required>
            <TextArea rows={4} />
          </FormField>
        </div>
      </Drawer>
    </OpsDesk>
  );
}

/* =========================================================================================
 * HLP-09 · Ethics desk (whistleblower queue, routing to the audit committee) (T2, EO)
 * ======================================================================================= */

export interface WbRow {
  id: string;
  subject: string;
  received: Date;
  entity: string;
  anonymous: boolean;
  severity: string;
  routed: boolean;
  stage: string;
  ackBy: Date | null;
  feedbackBy: Date | null;
}
export interface EthicsDeskScreenProps {
  rows: WbRow[];
  today: Date;
  state?: ListState;
  member?: boolean;
  routeId?: string | null;
}
export function EthicsDeskScreen({ rows, today, state = 'ready', member = true, routeId = null }: EthicsDeskScreenProps) {
  const [route, setRoute] = useState<string | null>(routeId);
  if (!member) return <RestrictedNotFound />;
  const columns: TableColumn<WbRow>[] = [
    { key: 'id', header: 'Report', type: 'id', value: (r) => r.id },
    { key: 'subject', header: 'Subject', value: (r) => r.subject, width: 280 },
    { key: 'received', header: 'Received', type: 'date', value: (r) => r.received },
    { key: 'entity', header: 'Entity', value: (r) => r.entity, width: 220 },
    { key: 'by', header: 'Reporter', value: (r) => (r.anonymous ? 'Anonymous' : 'Named, confidential') },
    { key: 'severity', header: 'Severity', type: 'status', value: (r) => r.severity, statusTone: (v) => (v === 'Serious' ? 'danger' : 'neutral') },
    {
      key: 'clock',
      header: 'Statutory clock',
      value: (r) => r.ackBy ?? r.feedbackBy,
      render: (r) => (r.feedbackBy ? `Feedback by ${formatDate(r.feedbackBy)}` : r.ackBy ? `Acknowledge by ${formatDate(r.ackBy)}` : 'None (company policy)'),
      width: 200,
    },
    { key: 'routed', header: 'Audit committee', type: 'status', value: (r) => (r.routed ? 'Routed' : 'Not routed'), statusTone: (v) => (v === 'Routed' ? 'info' : 'neutral') },
    { key: 'stage', header: 'Stage', value: (r) => r.stage },
  ];
  const routing = rows.find((r) => r.id === route);
  return (
    <OpsDesk area="helpdesk" active="Speak-up" counts={{ 'Speak-up': rows.filter((r) => r.stage === 'Received').length }}>
      <PageHeader title="Ethics desk" description="Fraud and ethics reports. HR is not on these cases unless you add them." facts={`${rows.length} open · ${rows.filter((r) => r.routed).length} routed to the audit committee chair`} />
      <Confidential note="Confidential. Visible to the ethics officer and the members of each report. Every view is logged.">
        <DataTable
          label="Whistleblower reports"
          columns={columns}
          rows={state === 'empty' ? [] : rows}
          getRowId={(r) => r.id}
          state={state === 'empty' ? 'ready' : state}
          errorTitle="We couldn't load reports."
          onRetry={() => {}}
          empty={<EmptyState title="No open reports." description="New reports from the web, app or WhatsApp link arrive here." />}
          rowButtons={(r) => (!r.routed ? <Button size="sm" onClick={() => setRoute(r.id)}>Route to chair</Button> : null)}
          onRowClick={() => {}}
        />
      </Confidential>
      <ConfirmDialog
        open={!!routing}
        onOpenChange={(o) => !o && setRoute(null)}
        title={`Route ${routing?.id ?? ''} to the audit committee chair?`}
        consequence="The chair gets a limited external login for this report only: the report, your updates and the outcome. The reporter's identity stays hidden."
        confirmLabel="Route to chair"
        onConfirm={() => setRoute(null)}
      >
        <FormField label="Reason" required>
          <TextArea rows={3} defaultValue="Involves approval of payments above ₹10,00,000 by a senior manager." />
        </FormField>
      </ConfirmDialog>
    </OpsDesk>
  );
}

export function LoadingCase(): ReactNode {
  return (
    <OpsDesk area="helpdesk" active="Cases">
      <div className="yx-ops-stack" role="status" aria-busy="true" aria-label="Loading case">
        <Skeleton height={64} />
        <Skeleton height={120} />
        <Skeleton height={320} />
      </div>
    </OpsDesk>
  );
}
export function ErrorCase(): ReactNode {
  return (
    <OpsDesk area="helpdesk" active="Cases">
      <ErrorState title="We couldn't load this case." description="Try again. If it keeps failing, share the reference with support; they can't see case content." onRetry={() => {}} reference="CASE-7710" />
    </OpsDesk>
  );
}

