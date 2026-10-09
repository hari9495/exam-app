// DSAR, AI governance, chat apps, partners, policies page, rule builder (PLT-27…32).
import { useState, type ReactNode } from 'react';
import { CheckCircle2, Handshake, Scale, ShieldCheck } from 'lucide-react';
import { PageHeader, ObjectHeader, Card, Tabs, TabsContent, TabsList, TabsTrigger, DescriptionList } from '../../components/shell';
import { Button, Link } from '../../components/button';
import { AiBadge, Avatar, Badge } from '../../components/display';
import { EmptyState, InlineAlert, Meter } from '../../components/feedback';
import { ConfirmDialog, Dialog, TypeToConfirmDialog } from '../../components/overlay';
import { FormField, FieldRow } from '../../components/field';
import { TextArea, TextField, NumberField } from '../../components/inputs';
import { Select, MultiSelect } from '../../components/select';
import { Checkbox, Switch } from '../../components/choice';
import { DatePicker } from '../../components/date';
import { DataTable, type TableColumn } from '../../components/table';
import { ConditionBuilder } from '../../components/condition';
import { Timeline } from '../../components/timeline';
import { LineChart } from '../../components/charts';
import { SetupChecklist } from '../../components/stepper';
import { Icon } from '../../components/foundations';
import { emptyGroup, summariseRule, type Rule, type RuleSchema } from '../../lib/rules';
import { formatDate } from '../../lib/format';
import { DesktopFrame } from '../_kit/frames';
import { ENTITIES, TODAY } from '../_kit/data';
import { DiffTable, ListPage, Tile, Workspace, ruleWarnings, settingsPanel, slaText, toneFor, type ScopedRule } from './platform-kit';
import { at, d } from './platform-data';

/* ================================================================ PLT-27 DSAR tracker */

export interface DsarRow {
  id: string;
  ref: string;
  type: 'Access' | 'Correction' | 'Erasure' | 'Nomination' | 'Consent withdrawal' | 'Grievance';
  principal: string;
  relation: 'Employee' | 'Ex-employee' | 'Candidate';
  channel: 'Me › My data' | 'Candidate privacy centre' | 'Public form' | 'Email to officer';
  received: Date;
  due: Date;
  assignee: string;
  status: 'Verifying identity' | 'Collecting data' | 'Response ready' | 'Closed';
}

const dsarColumns: TableColumn<DsarRow>[] = [
  { key: 'ref', header: 'Reference', type: 'id', value: (r) => r.ref },
  { key: 'type', header: 'Request', value: (r) => r.type },
  { key: 'principal', header: 'Data principal', type: 'person', value: (r) => r.principal, person: (r) => ({ name: r.principal, secondary: r.relation }) },
  { key: 'channel', header: 'Channel', value: (r) => r.channel },
  { key: 'received', header: 'Received', type: 'date', value: (r) => r.received },
  { key: 'due', header: 'SLA', value: (r) => r.due, render: (r) => (r.status === 'Closed' ? <Badge tone="success">Closed in time</Badge> : <Badge tone={slaText(r.due, TODAY).tone}>{slaText(r.due, TODAY).text}</Badge>) },
  { key: 'assignee', header: 'Assigned to', value: (r) => r.assignee },
  { key: 'status', header: 'Status', type: 'status', value: (r) => r.status, statusTone: (v) => (v === 'Closed' ? 'success' : v === 'Response ready' ? 'info' : 'warning') },
];

export function DsarScreen({ view, rows, state = 'ready' }: { view: 'list' | 'record'; rows: DsarRow[]; state?: 'ready' | 'loading' | 'error' }) {
  const r = rows.find((x) => x.type === 'Erasure') ?? rows[0];
  const [confirm, setConfirm] = useState(false);
  return (
    <DesktopFrame area="settings" panelTitle="Settings" panel={settingsPanel('2.4 Privacy programme')}>
      {view === 'list' ? (
        <ListPage
          title="Data requests"
          description="Requests from employees, ex-employees and candidates about their personal data. The SLA follows the law, or your shorter company target."
          facts={`${rows.filter((x) => x.status !== 'Closed').length} open · ${rows.filter((x) => x.status !== 'Closed' && x.due < TODAY).length} overdue · SLA met this year: 96%`}
          actions={<Button variant="primary">Log a request</Button>}
          label="Data requests"
          columns={dsarColumns}
          rows={rows}
          getRowId={(x) => x.id}
          filters={[
            { key: 'type', label: 'Request', type: 'multi', options: ['Access', 'Correction', 'Erasure', 'Nomination', 'Consent withdrawal', 'Grievance'].map((v) => ({ value: v, label: v })) },
            { key: 'status', label: 'Status', type: 'multi', options: ['Verifying identity', 'Collecting data', 'Response ready', 'Closed'].map((v) => ({ value: v, label: v })) },
            { key: 'received', label: 'Received', type: 'date' },
          ]}
          searchPlaceholder="Search reference or name"
          state={state}
          empty={<EmptyState title="No data requests yet." description="Requests from Me › My data, the candidate privacy centre and your public privacy page arrive here." />}
        />
      ) : (
        <>
          <ObjectHeader
            name={`${r.ref} · ${r.type} request`}
            icon={ShieldCheck}
            secondary={`${r.principal} · ${r.relation} · via ${r.channel}`}
            status={<Badge tone={slaText(r.due, TODAY).tone}>{slaText(r.due, TODAY).text}</Badge>}
            facts={[
              { label: 'Received', value: formatDate(r.received) },
              { label: 'Due', value: formatDate(r.due) },
              { label: 'Identity', value: 'Verified by OTP to registered mobile' },
              { label: 'Assigned to', value: r.assignee },
            ]}
            actions={
              <>
                <Button>Download response pack</Button>
                <Button variant="primary" onClick={() => setConfirm(true)}>
                  Run erasure
                </Button>
              </>
            }
          />
          <Workspace
            aside={
              <>
                <h2 className="yx-plt-h">Activity</h2>
                <Timeline
                  today={TODAY}
                  items={[
                    { id: 'x1', actor: { name: 'Lakshmi Venkatesan' }, action: 'marked Learning data as pulled', at: at(28, 15, 0) },
                    { id: 'x2', actor: { name: r.principal }, action: 'verified identity with OTP', at: at(24, 11, 2) },
                    { id: 'x3', actor: { name: r.principal }, action: 'asked to erase personal data', at: at(24, 11, 0) },
                  ]}
                />
              </>
            }
          >
            <SetupChecklist
              title="Data pull by module"
              defaultShowDone
              sections={[
                {
                  id: 'pull',
                  title: 'Modules',
                  tasks: [
                    { id: 'm1', title: 'People: profile, family, documents', status: 'done' },
                    { id: 'm2', title: 'Time: attendance and leave', status: 'done' },
                    { id: 'm3', title: 'Learning: courses and results', status: 'done' },
                    { id: 'm4', title: 'Engage: survey responses (anonymous responses are not linked)', status: 'in-progress' },
                    { id: 'm5', title: 'Pay: payslips, tax, bank', status: 'blocked', blockedReason: 'Kept by law: payroll and tax records for 8 years' },
                  ],
                },
              ]}
            />
            <Card title="Erasure log">
              <DataTable
                label="Erasure log"
                columns={[
                  { key: 'data', header: 'Data', value: (x: { data: string; action: string; why: string }) => x.data },
                  { key: 'action', header: 'Action', type: 'status', value: (x) => x.action, statusTone: (v) => (v === 'Kept' ? 'warning' : 'success') },
                  { key: 'why', header: 'Why', value: (x) => x.why, width: 360 },
                ]}
                rows={[
                  { data: 'Photos, personal email, emergency contacts', action: 'Deleted', why: 'No legal reason to keep' },
                  { data: 'Survey comments', action: 'Anonymised', why: 'Kept in totals without the name' },
                  { data: 'Payslips, Form 16, PF records', action: 'Kept', why: 'Income-tax and PF law: 8 years from the end of the tax year' },
                  { data: 'POSH case CASE-26-004', action: 'Kept', why: 'Open case under legal hold' },
                ]}
                getRowId={(x) => x.data}
              />
            </Card>
          </Workspace>
          <TypeToConfirmDialog
            open={confirm}
            onOpenChange={setConfirm}
            objectName={r.ref}
            title={`Erase data for ${r.principal}?`}
            consequence="Deletes or anonymises 3 data groups. Records kept by law stay and are listed in the response. You can't undo this."
            confirmLabel="Erase data"
            onConfirm={() => setConfirm(false)}
          />
        </>
      )}
    </DesktopFrame>
  );
}

/* ================================================================ PLT-28 AI quality & governance */

export interface AiFeature {
  key: string;
  name: string;
  on: boolean;
  model: string;
  prompt: string;
  region: string;
  evalScore: number;
  threshold: number;
  lastEval: Date;
  euClass: 'Yes' | 'Depends' | 'No';
  accept: number;
  edit: number;
  dismiss: number;
}

export function AiGovernanceScreen({ features, eu, cardKey }: { features: AiFeature[]; eu?: boolean; cardKey?: string }) {
  const [notice, setNotice] = useState(false);
  const [cardOpen, setCardOpen] = useState(cardKey ?? null);
  const card = features.find((f) => f.key === cardOpen);
  return (
    <DesktopFrame area="settings" panelTitle="Settings" panel={settingsPanel('7.4 AI')}>
      <PageHeader
        title={<>AI quality & governance <AiBadge /></>}
        description="Which AI features are on, the model and prompt version behind each, how they score against YukthiX's thresholds, and how people use the suggestions. AI only suggests; a person decides."
        facts={`${features.filter((f) => f.on).length} of ${features.length} features on · AI credits 8,600 of 10,000 this month`}
      />
      {eu && (
        <InlineAlert tone="warning" title="EU company: high-risk employment AI stays off">
          Features used to evaluate candidates or workers are off until YukthiX completes EU conformity (target 2 Dec 2027). Before switching on any AI feature, people see the AI literacy guidance.
        </InlineAlert>
      )}
      <div className="yx-plt-grid" data-cols="3">
        {features.map((f) => {
          const blocked = eu && f.euClass !== 'No';
          const passing = f.evalScore >= f.threshold;
          return (
            <Tile
              key={f.key}
              title={f.name}
              selected={f.key === cardKey}
              tone={!passing ? 'danger' : undefined}
              badge={<Badge tone={blocked ? 'neutral' : f.on ? 'success' : 'neutral'}>{blocked ? 'Off in EU' : f.on ? 'On' : 'Off'}</Badge>}
              actions={
                <>
                  <Switch label="Switch on" checked={f.on && !blocked} disabled={blocked} onChange={() => f.euClass === 'Depends' && setNotice(true)} />
                  <Button size="sm" onClick={() => setCardOpen(f.key)}>Model card</Button>
                </>
              }
            >
              <p className="yx-plt-muted">
                {f.model} · prompt {f.prompt} · {f.region}
              </p>
              <Meter value={f.evalScore} max={100} label={`${f.name} eval score`} warnAt={101} dangerAt={101} valueText={`${f.evalScore}% · needs ${f.threshold}% · ${passing ? 'passing' : 'below threshold'}`} />
              <p className="yx-plt-muted">
                Suggestions: {f.accept}% accepted · {f.edit}% edited · {f.dismiss}% dismissed
              </p>
              <p className="yx-plt-muted">EU high-risk: {f.euClass}</p>
            </Tile>
          );
        })}
      </div>
      <LineChart title="Suggestion acceptance by week" categories={['W35', 'W36', 'W37', 'W38', 'W39']} series={[{ name: 'Receipt reading', values: [91, 92, 90, 93, 94] }, { name: 'Helpdesk answers', values: [72, 75, 74, 78, 77] }]} xLabel="Week" />
      {card && (
        <Dialog open onOpenChange={(o) => !o && setCardOpen(null)} title={`Model card · ${card.name}`} size="md" footer={<Button onClick={() => setCardOpen(null)}>Close</Button>}>
          <DescriptionList
            items={[
              { label: 'Model', value: card.model },
              { label: 'Prompt version', value: card.prompt, mono: true },
              { label: 'Region', value: card.region },
              { label: 'Last evaluation', value: `${formatDate(card.lastEval)} · ${card.evalScore}%` },
              { label: 'Bias test', value: 'No group below 4/5ths ratio' },
              { label: 'EU AI Act', value: card.euClass === 'No' ? 'Not high-risk' : 'High-risk when used in employment decisions' },
            ]}
          />
        </Dialog>
      )}
      <Dialog open={notice} onOpenChange={setNotice} title="Record the worker notice first" description="This feature can evaluate workers. Record that you gave the worker notice before switching it on." size="md" footer={<><Button onClick={() => setNotice(false)}>Cancel</Button><Button variant="primary" onClick={() => setNotice(false)}>Record notice and switch on</Button></>}>
        <FormField label="Notice given on" required>
          <DatePicker value={TODAY} onChange={() => {}} />
        </FormField>
      </Dialog>
    </DesktopFrame>
  );
}

/* ================================================================ PLT-29 Slack / Teams app */

export type ChatApp = 'Slack' | 'Teams';

function ChatMessage({ app, children }: { app: ChatApp; children: ReactNode }) {
  return (
    <div className="yx-plt-chat__msg">
      <Avatar name="YukthiX" size={32} />
      <div className="yx-plt-chat__body">
        <span className="yx-plt-chat__who">
          YukthiX <span className="yx-plt-chat__app">app · {app}</span>
        </span>
        {children}
      </div>
    </div>
  );
}

export interface ChatAppViewProps {
  app: ChatApp;
  view: 'approval' | 'approved' | 'checkin' | 'balance' | 'unlinked' | 'sensitive' | 'home';
}

/** Chat-app surfaces (P04 §4.9). Rendered as they look inside the chat client. */
export function ChatAppView({ app, view }: ChatAppViewProps) {
  const [done, setDone] = useState(view === 'approved');
  const [rejecting, setRejecting] = useState(false);
  return (
    <div className="yx-screen">
      <div className="yx-plt-chat" role="region" aria-label={`${app} conversation with YukthiX`}>
        {view === 'home' && (
          <ChatMessage app={app}>
            <div className="yx-plt-chat__card">
              <strong>Your YukthiX home</strong>
              <span>Checked in 9:04 am · Chennai office</span>
              <span>2 approvals waiting · Casual leave left: 4 days</span>
              <div className="yx-plt-row">
                <Button size="sm">Check out</Button>
                <Button size="sm">Apply leave</Button>
                <Button size="sm">Open in YukthiX</Button>
              </div>
            </div>
          </ChatMessage>
        )}
        {(view === 'approval' || view === 'approved') && (
          <ChatMessage app={app}>
            <div className="yx-plt-chat__card">
              <strong>Leave request · Arjun Mehta</strong>
              <span>Casual leave · 1–2 Oct 2026 (2 days) · balance after 6 of 12</span>
              <span className="yx-plt-muted">2 others off on 1 Oct</span>
              {done ? (
                <Badge tone="success">
                  <Icon icon={CheckCircle2} /> Approved by you at 9:44 am
                </Badge>
              ) : rejecting ? (
                <div className="yx-plt-stack" data-gap="sm">
                  <FormField label="Reason for rejecting" required>
                    <TextArea rows={2} />
                  </FormField>
                  <div className="yx-plt-row">
                    <Button size="sm" onClick={() => setRejecting(false)}>Cancel</Button>
                    <Button size="sm" variant="danger">Reject</Button>
                  </div>
                </div>
              ) : (
                <div className="yx-plt-row">
                  <Button variant="approve" size="sm" onClick={() => setDone(true)}>
                    Approve
                  </Button>
                  <Button size="sm" onClick={() => setRejecting(true)}>
                    Reject
                  </Button>
                  <Button size="sm">Open in YukthiX</Button>
                </div>
              )}
            </div>
          </ChatMessage>
        )}
        {view === 'checkin' && (
          <>
            <p className="yx-plt-muted">You: /yukthix in</p>
            <ChatMessage app={app}>
              <div className="yx-plt-chat__card">
                <strong>Checked in at 9:42 am</strong>
                <span>General shift · Chennai office network · source: {app}</span>
              </div>
            </ChatMessage>
          </>
        )}
        {view === 'balance' && (
          <>
            <p className="yx-plt-muted">You: What’s my leave balance?</p>
            <ChatMessage app={app}>
              <div className="yx-plt-chat__card">
                <span>Casual leave 4 days · Sick leave 5 days · Earned leave 9 days</span>
                <Button size="sm">Apply leave</Button>
              </div>
            </ChatMessage>
          </>
        )}
        {view === 'unlinked' && (
          <ChatMessage app={app}>
            <div className="yx-plt-chat__card">
              <span>Connect your YukthiX account to see your requests, balances and approvals here.</span>
              <Button size="sm" variant="primary">Connect account</Button>
            </div>
          </ChatMessage>
        )}
        {view === 'sensitive' && (
          <>
            <p className="yx-plt-muted">You: Show my September payslip</p>
            <ChatMessage app={app}>
              <div className="yx-plt-chat__card">
                <span>Payslips are private, so they open only in YukthiX after you sign in.</span>
                <Button size="sm">Open payslip in YukthiX</Button>
              </div>
            </ChatMessage>
          </>
        )}
      </div>
    </div>
  );
}

// PLT-29 · Chat app admin (Settings › Integrations › chat apps): install, linked users, chat-safe types, chat punch.
export function ChatAppSettingsScreen({ connected = true }: { connected?: boolean }) {
  return (
    <DesktopFrame area="settings" panelTitle="Settings" panel={settingsPanel('7.3 Chat apps')}>
      <PageHeader title="Chat apps" description="Approvals, check-in, balances and notifications in Slack or Teams. Sensitive data never appears in chat." />
      <div className="yx-plt-grid" data-cols="2">
        <Tile title="Slack" badge={<Badge tone={connected ? 'success' : 'neutral'}>{connected ? 'Connected' : 'Not connected'}</Badge>} actions={connected ? <Button size="sm">Disconnect</Button> : <Button size="sm" variant="primary">Install to workspace</Button>}>
          {connected ? <Meter value={164} max={248} label="People linked" warnAt={101} dangerAt={101} valueText="164 of 248 people linked" /> : <p className="yx-plt-muted">Install once; each person links their own account.</p>}
        </Tile>
        <Tile title="Teams" badge={<Badge>Not connected</Badge>} actions={<Button size="sm">Install to tenant</Button>}>
          <p className="yx-plt-muted">Same features as Slack.</p>
        </Tile>
      </div>
      <Card title="Chat-safe request types">
        <div className="yx-plt-stack">
          <Checkbox label="Leave" defaultChecked />
          <Checkbox label="Attendance regularisation" defaultChecked />
          <Checkbox label="Timesheets" defaultChecked />
          <Checkbox label="Expense claims up to ₹5,000" />
          <Checkbox label="Payroll, bank file, compensation and cases" disabled description="Never approvable from chat; they show Open in YukthiX only." />
        </div>
      </Card>
      <Card title="Check-in from chat">
        <Switch label="Allow chat check-in" description="Off by default. Office network and geofence rules still apply." />
      </Card>
    </DesktopFrame>
  );
}

/* ================================================================ PLT-30 Partners */

export interface PartnerLink {
  id: string;
  firm: string;
  type: string;
  ownership: 'Client-owned' | 'Partner-owned';
  relationship: 'Operates' | 'Advises' | 'Resold only';
  users: number;
  since: Date;
  status: 'Active' | 'Pending' | 'Ended';
}

const GRANT_MODULES = ['Payroll', 'Statutory filings', 'TDS & Form 16', 'Time & attendance', 'Reports', 'People (no Special data)'];

export function PartnersScreen({ view, links, endOpen, transferOpen }: { view: 'linked' | 'grant' | 'log' | 'directory'; links: PartnerLink[]; endOpen?: boolean; transferOpen?: boolean }) {
  const [mods, setMods] = useState<string[]>(['Payroll', 'Statutory filings', 'TDS & Form 16', 'Reports']);
  const [ents, setEnts] = useState<string[]>(ENTITIES.map((e) => e.id));
  const [end, setEnd] = useState(Boolean(endOpen));
  const [transfer, setTransfer] = useState(Boolean(transferOpen));
  const [requested, setRequested] = useState<string | null>(null);
  const firm = links[0];
  return (
    <DesktopFrame area="settings" panelTitle="Settings" panel={settingsPanel('2.11 Partners')}>
      {view === 'linked' && (
        <ListPage
          title="Partners"
          description="CA firms and payroll bureaus that work in your account. You decide what each can do and can end a link at any time."
          facts="Named client contact: Lakshmi Venkatesan (keeps audit view, full export and ownership transfer)"
          actions={<Button variant="primary" icon={Handshake}>Find a partner</Button>}
          label="Linked partners"
          columns={[
            { key: 'firm', header: 'Partner', value: (r: PartnerLink) => r.firm, render: (r) => <Link href="#">{r.firm}</Link> },
            { key: 'type', header: 'Type', value: (r) => r.type },
            { key: 'relationship', header: 'Relationship', value: (r) => r.relationship },
            { key: 'ownership', header: 'Account owner', type: 'status', value: (r) => r.ownership, statusTone: (v) => (v === 'Partner-owned' ? 'warning' : 'neutral') },
            { key: 'users', header: 'Partner users', type: 'number', value: (r) => r.users },
            { key: 'since', header: 'Since', type: 'date', value: (r) => r.since },
            { key: 'status', header: 'Status', type: 'status', value: (r) => r.status, statusTone: (v) => toneFor(v === 'Pending' ? 'Pending' : v) },
          ]}
          rows={links}
          getRowId={(r) => r.id}
          empty={<EmptyState title="No partners linked." description="Invite your CA firm or payroll bureau, or find a verified partner in the directory." action={<Button variant="primary">Find a partner</Button>} />}
          rowButtons={(r) => (r.status === 'Active' ? <Button size="sm">Edit grant</Button> : r.status === 'Pending' ? <Button size="sm">Review request</Button> : null)}
        />
      )}
      {view !== 'linked' && view !== 'directory' && firm && (
        <>
          <ObjectHeader
            name={firm.firm}
            icon={Handshake}
            secondary={`${firm.type} · ${firm.relationship} · ${firm.ownership}`}
            status={<Badge tone="success">Verified partner</Badge>}
            facts={[
              { label: 'Partner users', value: firm.users },
              { label: 'Approved by', value: 'Lakshmi Venkatesan' },
              { label: 'Since', value: formatDate(firm.since) },
            ]}
            actions={
              <>
                <Button onClick={() => setTransfer(true)}>Transfer ownership</Button>
                <Button variant="danger" onClick={() => setEnd(true)}>
                  End link
                </Button>
              </>
            }
          />
          <Tabs defaultValue={view}>
            <TabsList aria-label="Partner link">
              <TabsTrigger value="grant">Grant</TabsTrigger>
              <TabsTrigger value="log">Access log</TabsTrigger>
            </TabsList>
            <TabsContent value="grant">
              <div className="yx-plt-grid" data-cols="2">
                <Card title="What they can use">
                  <div className="yx-plt-stack">
                    <FormField label="Modules">
                      <MultiSelect options={GRANT_MODULES.map((m) => ({ value: m, label: m }))} value={mods} onChange={setMods} />
                    </FormField>
                    <FormField label="Legal entities">
                      <MultiSelect options={ENTITIES.map((e) => ({ value: e.id, label: e.name }))} value={ents} onChange={setEnts} />
                    </FormField>
                    <InlineAlert tone="info" title="Never included">Medical, POSH and biometric data are never visible to partners.</InlineAlert>
                  </div>
                </Card>
                <Card title="Approvals you delegate">
                  <div className="yx-plt-stack">
                    <Switch label="Partner may approve payroll runs" description="Off: they prepare, you approve." />
                    <Switch label="Partner may release bank files" description="Needs sign-in again with MFA each time." />
                    <Switch label="Partner may file statutory returns" defaultChecked description="Filing uses the partner's DSC where you authorised it." />
                  </div>
                </Card>
              </div>
              <div className="yx-plt-card-actions">
                <Button variant="primary">Save grant</Button>
              </div>
            </TabsContent>
            <TabsContent value="log">
              <Timeline
                today={TODAY}
                aria-label="Partner access log"
                items={[
                  { id: 'l1', actor: { name: 'CA Ramesh Iyer (Iyer & Rao Associates)' }, action: 'prepared the September PF challan', at: at(29, 9, 15) },
                  { id: 'l2', actor: { name: 'Divya Menon (Iyer & Rao Associates)' }, action: 'exported the September payroll register · 248 rows', at: at(28, 17, 20) },
                  { id: 'l3', actor: { name: 'Divya Menon (Iyer & Rao Associates)' }, action: 'signed in with passkey', at: at(28, 16, 58) },
                ]}
              />
            </TabsContent>
          </Tabs>
        </>
      )}
      {view === 'directory' && (
        <>
          <PageHeader title="Partner directory" description="Verified partners. Ranking uses fit and reviews from linked clients, never payment." />
          <div className="yx-plt-grid" data-cols="3">
            {[
              { n: 'Iyer & Rao Associates', t: 'CA firm · Chennai, Bengaluru', s: 'Payroll, PF, ESI, TDS · 50–500 employees · Tamil, English', r: '4.7 from 23 clients' },
              { n: 'Deccan Payroll Services', t: 'Payroll bureau · Hyderabad', s: 'Full payroll and HR operations · up to 300 employees · Telugu, English', r: '4.5 from 11 clients' },
              { n: 'Setu Implementation Partners', t: 'Implementation partner · Pune', s: 'Migration and set-up · manufacturing', r: '4.8 from 9 clients' },
            ].map((p) => (
              <Tile key={p.n} title={p.n} badge={<Badge tone="success">Verified</Badge>} actions={requested === p.n ? <Badge tone="info">Link requested</Badge> : <Button size="sm" onClick={() => setRequested(p.n)}>Request link</Button>}>
                <span className="yx-plt-muted">{p.t}</span>
                <span>{p.s}</span>
                <span className="yx-plt-muted">Rated {p.r}</span>
              </Tile>
            ))}
          </div>
        </>
      )}
      <ConfirmDialog open={end} onOpenChange={setEnd} destructive title={`End the link with ${firm?.firm ?? 'this partner'}?`} consequence="Their access stops at once. Your data stays with you. Open payroll work is handed back to your team." confirmLabel="End link" onConfirm={() => setEnd(false)} />
      <Dialog open={transfer} onOpenChange={setTransfer} title="Transfer account ownership" description="YukthiX verifies your request. Ownership moves to Kaveri Foods after the notice period in the partner agreement (30 days at most). The partner can't block it." size="md" footer={<><Button onClick={() => setTransfer(false)}>Cancel</Button><Button variant="primary" onClick={() => setTransfer(false)}>Request transfer</Button></>}>
        <FormField label="Reason" required>
          <TextArea rows={3} />
        </FormField>
      </Dialog>
    </DesktopFrame>
  );
}

/* ================================================================ PLT-31 Policies page per module */

export interface PolicyPoint {
  id: string;
  point: string;
  rule: string;
  scopes: string[];
  origin: 'Starter' | 'Customised';
  changed: Date;
  by: string;
  pending?: boolean;
}

export function PoliciesPageScreen({ module = 'Time & Leave', rows, state = 'ready' }: { module?: string; rows: PolicyPoint[]; state?: 'ready' | 'loading' | 'error' }) {
  return (
    <DesktopFrame area="time" panelTitle="Time" panel={[{ items: ['Today', 'Muster', 'Roster', 'Leave calendar', 'Requests', 'Year-end', 'Periods', 'Reports'].map((l) => ({ label: l })) }, { label: 'Settings', items: [{ label: 'Policies', active: true }] }]}>
      <ListPage
        title={`${module} policies`}
        description="Every place where your company's rule decides the result. Open one to change it in the rule builder."
        facts={`${rows.length} policy points · ${rows.filter((r) => r.origin === 'Customised').length} customised · ${rows.filter((r) => r.pending).length} waiting for approval`}
        actions={<Button>Lookup tables</Button>}
        label="Policy points"
        columns={[
          { key: 'point', header: 'Policy point', value: (r: PolicyPoint) => r.point, render: (r) => <Link href="#">{r.point}</Link> },
          { key: 'rule', header: 'Active rule', value: (r) => r.rule, width: 320 },
          { key: 'scopes', header: 'Scope', value: (r) => r.scopes.join(', '), render: (r) => <span className="yx-plt-chips">{r.scopes.map((s) => <Badge key={s}>{s}</Badge>)}</span> },
          { key: 'origin', header: 'Source', type: 'status', value: (r) => r.origin, statusTone: (v) => toneFor(v) },
          { key: 'changed', header: 'Last change', type: 'date', value: (r) => r.changed, render: (r) => `${formatDate(r.changed)} · ${r.by}${r.pending ? ' · pending approval' : ''}` },
        ]}
        rows={rows}
        getRowId={(r) => r.id}
        filters={[{ key: 'origin', label: 'Source', type: 'multi', options: [{ value: 'Starter', label: 'Starter' }, { value: 'Customised', label: 'Customised' }] }]}
        searchPlaceholder="Search policy points"
        state={state}
        empty={<EmptyState title="No policy points for this module yet." />}
      />
    </DesktopFrame>
  );
}

/* ================================================================ PLT-32 Rule builder */

export const LEAVE_SCHEMA: RuleSchema = {
  triggers: [{ value: 'leave.entitlement', label: 'Leave entitlement is calculated', phrase: 'casual leave entitlement is calculated' }],
  fields: [
    { key: 'location.site_type', label: 'Location › Site type (custom)', type: 'choice', options: [{ value: 'mine', label: 'Mine' }, { value: 'plant', label: 'Plant' }, { value: 'office', label: 'Office' }] },
    { key: 'grade', label: 'Grade', type: 'choice', options: ['G1', 'G2', 'G3', 'G4', 'G5', 'G6'].map((g) => ({ value: g, label: g })) },
    { key: 'tenure_years', label: 'Years of service', type: 'number' },
    { key: 'employment_type', label: 'Employment type', type: 'choice', options: [{ value: 'permanent', label: 'Permanent' }, { value: 'fixed', label: 'Fixed-term' }] },
    { key: 'joined_on', label: 'Joining date', type: 'date' },
  ],
  recipients: [{ value: 'hrbp', label: 'HR Business Partner' }],
};

const LEAVE_RULE: Rule = {
  trigger: 'leave.entitlement',
  conditions: { ...emptyGroup(), join: 'and', items: [{ id: 'rc1', field: 'location.site_type', operator: 'is', value: 'mine' }] },
  actions: [{ id: 'ra1', type: 'set_field', field: 'grade', text: '14 days' }],
};

export const SAMPLE_RULES: ScopedRule[] = [
  { id: 'r1', name: 'Casual leave · Mine sites', point: 'casual_leave', scope: { level: 'location', values: ['Hosur plant', 'Salem mine'] }, priority: 1 },
  { id: 'r2', name: 'Casual leave · Hosur night shift', point: 'casual_leave', scope: { level: 'location', values: ['Hosur plant'] }, priority: 2 },
  { id: 'r3', name: 'Casual leave · company default', point: 'casual_leave', scope: { level: 'tenant', values: ['All'] }, priority: 9 },
];

/** Formula type check (P19 Q1): balanced brackets and known functions only. */
export function checkFormula(src: string): string | null {
  let depth = 0;
  for (const c of src) {
    if (c === '(') depth++;
    if (c === ')') depth--;
    if (depth < 0) return 'A closing bracket has no opening bracket.';
  }
  if (depth) return `${depth} bracket${depth > 1 ? 's are' : ' is'} not closed.`;
  const fns = Array.from(src.matchAll(/([A-Z_]+)\s*\(/g)).map((m) => m[1]);
  const known = ['IF', 'AND', 'OR', 'CASE', 'DAYS_BETWEEN', 'ROUND', 'LOOKUP', 'COUNT', 'YEARS_SINCE', 'MIN', 'MAX'];
  const bad = fns.find((f) => !known.includes(f));
  return bad ? `${bad} isn't a function. Use one of: ${known.join(', ')}.` : null;
}

export function RuleBuilderScreen({ tab = 'builder', formula = 'IF(location.site_type = "Mine", 14, 12)', submitted, rules = SAMPLE_RULES, lawFloor }: { tab?: 'builder' | 'formula' | 'versions'; formula?: string; submitted?: boolean; rules?: ScopedRule[]; lawFloor?: boolean }) {
  const [rule, setRule] = useState<Rule>(LEAVE_RULE);
  const [src, setSrc] = useState(formula);
  const [from, setFrom] = useState<Date | null>(d(1, 9));
  const [priority, setPriority] = useState<number | null>(1);
  const [sent, setSent] = useState(Boolean(submitted));
  const warn = ruleWarnings(rules);
  const formulaError = checkFormula(src);
  return (
    <DesktopFrame area="settings" panelTitle="Settings" panel={settingsPanel('1.8 Policies, rules & automations')}>
      <ObjectHeader
        name="Casual leave · Mine sites"
        icon={Scale}
        secondary="Policy point: Casual leave entitlement · Time & Leave · version 3 (draft)"
        status={<Badge tone={sent ? 'warning' : 'info'}>{sent ? 'Waiting for approval' : 'Draft'}</Badge>}
        facts={[
          { label: 'Scope', value: 'Location: Hosur plant, Salem mine' },
          { label: 'Priority', value: priority ?? '—' },
          { label: 'Effective from', value: from ? formatDate(from) : '—' },
          { label: 'Policy link', value: 'Leave policy 2026 v3' },
        ]}
        actions={
          <>
            <Button>Run impact preview</Button>
            <Button variant="primary" disabled={sent || Boolean(formulaError)} onClick={() => setSent(true)}>
              Submit for approval
            </Button>
          </>
        }
      />
      {sent && (
        <InlineAlert tone="info" title="Sent to Suresh Pillai for approval">
          Rules that change leave balances need a second person. Impact preview (180 employees, +2 days) is stored with this version.
        </InlineAlert>
      )}
      <Card>
        <p className="yx-plt-p">
          <strong>In plain words:</strong> {summariseRule(rule, LEAVE_SCHEMA)} Everyone else keeps 12 days.
        </p>
      </Card>
      {(warn.overlaps.length > 0 || warn.unreachable.length > 0) && (
        <InlineAlert tone="warning" title="Overlapping rules">
          {warn.overlaps.map(([a, b]) => `${rules.find((r) => r.id === a)?.name} and ${rules.find((r) => r.id === b)?.name} both cover the same location`).join('. ')}.{' '}
          {warn.unreachable.length > 0 && `${warn.unreachable.map((id) => rules.find((r) => r.id === id)?.name).join(', ')} never applies because a higher-priority rule covers all its scope.`}
        </InlineAlert>
      )}
      {lawFloor && (
        <InlineAlert tone="warning" title="The law applies for 23 employees">
          For 23 employees in Karnataka this gives less than the statutory minimum. The law will apply, and their “why” explains it.
        </InlineAlert>
      )}
      <Workspace
        asideLabel="Scope and dates"
        aside={
          <>
            <h2 className="yx-plt-h">Scope and dates</h2>
            <FormField label="Scope">
              <MultiSelect options={['Hosur plant', 'Salem mine', 'Chennai office', 'Bengaluru head office'].map((v) => ({ value: v, label: v }))} value={['Hosur plant', 'Salem mine']} onChange={() => {}} />
            </FormField>
            <FormField label="Priority" helper="Most specific scope wins first, then the lower number.">
              <NumberField value={priority} onChange={setPriority} min={1} />
            </FormField>
            <FormField label="Effective from" helper="Past periods keep the version that applied then.">
              <DatePicker value={from} onChange={setFrom} />
            </FormField>
            <FormField label="Implements policy">
              <Select options={[{ value: 'lp3', label: 'Leave policy 2026 v3' }]} value="lp3" onChange={() => {}} />
            </FormField>
            <Checkbox label="Material change: ask employees to acknowledge again" />
          </>
        }
      >
        <Tabs defaultValue={tab}>
          <TabsList aria-label="Rule editor">
            <TabsTrigger value="builder">Builder</TabsTrigger>
            <TabsTrigger value="formula">Formula</TabsTrigger>
            <TabsTrigger value="versions">Versions</TabsTrigger>
          </TabsList>
          <TabsContent value="builder">
            <ConditionBuilder schema={LEAVE_SCHEMA} value={rule} onChange={setRule} parts={['when', 'if']} showSummary={false} />
            <FieldRow>
              <FormField label="Then casual leave days per year">
                <NumberField value={14} onChange={() => {}} />
              </FormField>
              <FormField label="Otherwise">
                <TextField value="12 days (company default rule)" readOnly />
              </FormField>
            </FieldRow>
          </TabsContent>
          <TabsContent value="formula">
            <FormField label="Formula" error={formulaError} helper={formulaError ? undefined : 'Types checked. Returns a number of days.'}>
              <TextArea value={src} onChange={setSrc} rows={4} className="yx-plt-formula" />
            </FormField>
            <p className="yx-plt-muted">Functions: IF, AND, OR, CASE, DAYS_BETWEEN, YEARS_SINCE, ROUND, LOOKUP, COUNT, MIN, MAX. Fields use API names, e.g. location.site_type.</p>
          </TabsContent>
          <TabsContent value="versions">
            <DiffTable
              caption="Version 2 compared with version 3"
              rows={[
                { field: 'Days per year', before: '13', after: '14' },
                { field: 'Scope', before: 'Salem mine', after: 'Hosur plant, Salem mine' },
                { field: 'Effective from', before: '01 Apr 2026', after: '01 Oct 2026' },
              ]}
            />
          </TabsContent>
        </Tabs>
      </Workspace>
    </DesktopFrame>
  );
}
