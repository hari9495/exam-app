// PPL-03 Person record workspace (DESIGN-SYSTEM §13, M01 §3.1, P06 §7, P05 §7) with
// PPL-34 Identity panel · PPL-35 Person roles panel · PPL-45 Work authorisations tab · PPL-46 International bank details.
import { useMemo, useState, type ReactNode } from 'react';
import { AlertTriangle, Download, FileText, History, IdCard, Mail, MessageSquare, Phone, Plus, ShieldCheck, Upload } from 'lucide-react';
import { PhoneFrame } from '../_kit/frames';
import { Button, IconButton } from '../../components/button';
import { Breadcrumbs, Card, ObjectHeader, Tabs, TabsContent, TabsList, TabsTrigger } from '../../components/shell';
import { Badge, type BadgeTone } from '../../components/display';
import { EmptyState, ErrorState, InlineAlert, Meter, NoAccessState, Skeleton } from '../../components/feedback';
import { MenuItem } from '../../components/menu';
import { DataTable, type TableColumn } from '../../components/table';
import { DatePicker } from '../../components/date';
import { Select } from '../../components/select';
import { FormField } from '../../components/field';
import { TextField, NumberField } from '../../components/inputs';
import { ActivityFeed, type ActivityEntry } from '../../components/timeline';
import { Icon, Text } from '../../components/foundations';
import { formatDate, formatINR, formatMoney, formatPhone } from '../../lib/format';
import { canSeePay, daysBetween, fieldVisibility, isBic, isIban, splitNetPay, type FieldClass, type PaySplit, type Persona, type Relation } from './people-logic';
import { SPLITS, ARJUN, ARJUN_ASSETS, ARJUN_DOCS, ARJUN_HISTORY, ARJUN_ROLES, ARJUN_WORK_AUTH, IDENTITY, type FieldRow, type JobChange } from './people-data';
import { ClassBadge, FactRail, FieldList, PeopleFrame, SplitLayout, StatusBadge } from './people-kit';
import { FamilyCards, type RecordFamily } from './family';

export type RecordTab = 'overview' | 'job' | 'pay' | 'time' | 'documents' | 'performance' | 'learning' | 'assets' | 'history' | 'work-auth';
export type RecordPanel = 'activity' | 'identity' | 'roles';

/** A document on the person's checklist (Documents tab). */
export interface RecordDoc {
  /** Live document id; the sample uses the type. */
  id?: string;
  type: string;
  cls: FieldClass;
  status: string;
  on: Date | null;
  versions: number;
  by?: string;
  expires?: Date | null;
}
export interface RecordAsset {
  tag: string;
  name: string;
  issued: Date;
  condition: string;
  ack: string;
}
export interface RecordRole {
  role: string;
  from: Date;
  to: Date | null;
  link: string;
}
export interface RecordFact {
  label: string;
  value: ReactNode;
}
export interface RecordEvent {
  label: string;
  date?: Date;
  tone?: BadgeTone;
  note?: string;
}

/** Pay tab, live: no pay access; pay access but not yet asked ("Show pay", founder rule R1); or shown. */
export type LiveRecordPay =
  | { kind: 'none'; grantedBy: string }
  | { kind: 'ask'; onShow: () => void; busy?: boolean; error?: string | null }
  | {
      kind: 'shown';
      ctc: number;
      currency: string;
      from: Date;
      /** e.g. "₹7,80,000 from 1 Oct 2026 (scheduled)". */
      next?: string;
      /** The lines the CTC counts: the table's total is `ctc`, so the header and the table always agree. */
      lines: { label: string; monthly: number }[];
      /** Employer costs outside the CTC (e.g. a gratuity provision the template keeps out), shown under the total. */
      outside?: { label: string; monthly: number }[];
      banks: FieldRow[];
      /** null: no payslip yet. */
      lastNet?: { amount: number; note: string } | null;
      /** null: no regime chosen for the tax year yet. */
      taxRegime?: { label: string; note: string } | null;
    };

/** The Performance tab: the current goal period's goals, the last shared review and the next 1:1. */
export interface RecordPerformance {
  period: string | null;
  goals: { id: string; title: string; status: string; tone: BadgeTone }[];
  lastReview: string | null;
  nextOneOnOne: string | null;
  /** "3 received · 1 given" this quarter; null while unknown (the line is then left out). */
  feedback?: string | null;
  onOpenGoals?: () => void;
}

/** The live app's data and actions for PPL-03 (design audit step 3). Stories leave it out and keep the sample record. */
export interface LiveRecord {
  directoryHref: string;
  name: string;
  role: string;
  department: string;
  location: string;
  code: string;
  manager: string;
  joined: Date | null;
  grade: string | null;
  badges: { label: string; tone: BadgeTone }[];
  facts: RecordFact[];
  events: RecordEvent[];
  /** Personal fields (null: the viewer may not see them). */
  personal: FieldRow[] | null;
  identity: FieldRow[] | null;
  /** Identity and bank changes waiting for approval. */
  pending: { id: string; label: string; detail: string; onWithdraw?: () => void }[];
  onEditPersonal?: () => void;
  onRequestChange?: () => void;
  /** Family, nominees and emergency contacts (Personal; null: the viewer may not see them). */
  family?: RecordFamily | null;
  /** Additional details: the company's own fields the viewer may see (none: no card); onEdit when one is theirs to change. */
  custom?: { rows: CustomField[]; onEdit?: () => void } | null;
  job: [string, string][] | null;
  scheduled: { title: string; body: string }[];
  pastChanges: number;
  pay: LiveRecordPay;
  /** null: no Time tab (no leave access). */
  time: { balances: { type: string; used: number; total: number }[]; unpaid: number | null; attendance?: { title: string; rows: [string, string][] } | null } | null;
  documents: { rows: RecordDoc[]; hidden: number; onUpload?: () => void; onRequest?: () => void; onVerify?: (d: RecordDoc) => void; onReject?: (d: RecordDoc) => void; onDownload?: (d: RecordDoc) => void } | null;
  assets: { rows: RecordAsset[]; onIssue?: () => void } | null;
  history: { rows: JobChange[]; roles: RecordRole[] } | null;
  asOf: Date | null;
  onAsOf: (d: Date | null) => void;
  onStartChange?: () => void;
  /** Header "Message": writes to the person (their work email). Not on one's own record. */
  onMessage?: () => void;
  /** HR menu: change the work phone (Internal). */
  onEditWorkPhone?: () => void;
  /** Rail "Activity": who did what on the record (null: none the viewer may see yet). */
  activity?: ActivityEntry[] | null;
  /** Performance tab (only for viewers who may see this person's goals or reviews). */
  performance?: RecordPerformance | null;
  onIssueLetter?: () => void;
  onRetry?: () => void;
  /** Dialogs and drawers the page opens. */
  children?: ReactNode;
}

export interface PersonWorkspaceProps {
  persona: Persona;
  relation: Relation;
  today: Date;
  defaultTab?: RecordTab;
  /** Manager holds the P02 Q3 salary grant. */
  payGrant?: boolean;
  defaultAsOf?: Date | null;
  panel?: RecordPanel;
  /** Person works abroad: shows the Work authorisations tab and international bank details (P21). */
  international?: boolean;
  identityState?: 'consented' | 'refused' | 'mismatch';
  state?: 'ready' | 'loading' | 'error' | 'not-found';
  live?: LiveRecord;
}

/** Role as it was (or will be) on a date, from the dated history (P06 §4.7). */
export function roleAsOf(asOf: Date): string {
  if (asOf >= new Date(2026, 9, 1)) return 'Quality Lead';
  if (asOf >= new Date(2024, 7, 1)) return 'Senior Quality Inspector';
  return 'Quality Inspector';
}

const ACTIVITY: ActivityEntry[] = [
  { id: 'ac1', kind: 'approval', actor: { name: 'Karthik Subramanian' }, at: new Date(2026, 8, 24, 11, 5), text: 'Approved the promotion to Quality Lead from 1 Oct 2026' },
  { id: 'ac2', kind: 'change', actor: { name: 'Divya Raghunathan' }, at: new Date(2026, 8, 22, 15, 40), text: 'Proposed a promotion', changes: [{ field: 'Designation', from: 'Senior Quality Inspector', to: 'Quality Lead' }, { field: 'Grade', from: 'G5', to: 'G6' }] },
  { id: 'ac3', kind: 'comment', actor: { name: 'Lakshmi Venkatesan' }, at: new Date(2026, 8, 21, 10, 12), text: 'Experience letter uploaded; verification pending with the previous employer.' },
  { id: 'ac4', kind: 'change', actor: { name: 'Arjun Kulkarni' }, at: new Date(2026, 8, 12, 18, 2), text: 'Updated emergency contact', changes: [{ field: 'Emergency contact 2', from: 'Suman Kulkarni', to: 'Vinod Kulkarni' }] },
];

const SAMPLE_JOB: [string, string][] = [
  ['Designation', ARJUN.role],
  ['Grade', ARJUN.grade],
  ['Department', ARJUN.department],
  ['Location', ARJUN.location],
  ['Manager', ARJUN.manager],
  ['Secondary manager', ARJUN.dottedManager],
  ['Employment type', ARJUN.type],
  ['Probation', 'Confirmed on 12 Sep 2021'],
  ['Holiday calendar', 'Tamil Nadu 2026'],
  ['Shift pattern', 'Rotational (A / B / C)'],
  ['Cost centre', 'QA-HSR-01'],
  ['Notice period', '60 days'],
];

// PPL-03
export function PersonWorkspace({ persona, relation, today, defaultTab = 'overview', payGrant = false, defaultAsOf = null, panel = 'activity', international = false, identityState = 'consented', state = 'ready', live }: PersonWorkspaceProps) {
  const [tab, setTab] = useState<RecordTab>(defaultTab);
  const [ownAsOf, setOwnAsOf] = useState<Date | null>(defaultAsOf);
  const asOf = live ? live.asOf : ownAsOf;
  const setAsOf = live ? live.onAsOf : setOwnAsOf;
  const [revealed, setRevealed] = useState<string[]>([]);
  // Live: Activity once it has loaded (when the viewer may see any), else the person's roles; the menu switches.
  const [chosenSide, setSide] = useState<RecordPanel | null>(live ? null : panel);
  const side: RecordPanel = chosenSide ?? (live?.activity ? 'activity' : 'roles');
  const self = relation === 'self';
  const name = live?.name ?? ARJUN.name;
  const first = name.split(' ')[0];
  const role = live ? live.role : asOf ? roleAsOf(asOf) : ARJUN.role;
  const probationDone = true;

  if (state === 'not-found')
    return (
      <PeopleFrame active="Directory" persona={persona}>
        <EmptyState title="Not found" description="This record doesn't exist or you can't open it. Check the link or search the directory." action={<Button onClick={live ? () => window.location.assign(live.directoryHref) : undefined}>Back to directory</Button>} />
      </PeopleFrame>
    );
  if (state === 'error')
    return (
      <PeopleFrame active="Directory" persona={persona}>
        <ErrorState title={live ? "We couldn't load this record" : "We couldn't load Arjun Kulkarni's record"} description="Retry in a moment. Nothing you entered was lost." onRetry={live?.onRetry ?? (() => {})} reference={live ? undefined : 'REF-PPL03-19C4'} />
      </PeopleFrame>
    );

  const changeButton = live ? (
    persona === 'hr' && live.onStartChange ? (
      <Button variant="primary" onClick={live.onStartChange}>Start change</Button>
    ) : persona === 'mgr' && live.onStartChange ? (
      <Button variant="primary" onClick={live.onStartChange}>Propose a change</Button>
    ) : self && live.onRequestChange ? (
      <Button variant="primary" onClick={live.onRequestChange}>Request a change</Button>
    ) : null
  ) : null;
  // Message writes to the person at their work email (there is no in-app chat).
  const actions = live ? (
    <>
      {live.onMessage && (
        <Button icon={MessageSquare} onClick={live.onMessage}>
          Message
        </Button>
      )}
      {changeButton}
    </>
  ) : persona === 'hr' ? (
    <>
      <Button icon={MessageSquare}>Message</Button>
      <Button variant="primary">Start change</Button>
    </>
  ) : persona === 'mgr' ? (
    <>
      <Button icon={MessageSquare}>Message</Button>
      <Button variant="primary">Propose a change</Button>
    </>
  ) : (
    <Button variant="primary">Request a change</Button>
  );

  const docCount = live ? live.documents?.rows.length || undefined : ARJUN_DOCS.length;
  const assetCount = live ? live.assets?.rows.length || undefined : ARJUN_ASSETS.length;
  const tabs: { id: RecordTab; label: string; count?: number }[] = [
    { id: 'overview', label: 'Overview' },
    ...(!live || live.job ? [{ id: 'job' as const, label: 'Job' }] : []),
    { id: 'pay', label: 'Pay' },
    ...(!live || live.time ? [{ id: 'time' as const, label: 'Time' }] : []),
    ...(!live || live.documents ? [{ id: 'documents' as const, label: 'Documents', count: docCount }] : []),
    ...(!live || live.performance ? [{ id: 'performance' as const, label: 'Performance' }] : []),
    // Learning: there is no learning module in the live app yet (left out).
    ...(!live ? [{ id: 'learning' as const, label: 'Learning' }] : []),
    ...(!live || live.assets ? [{ id: 'assets' as const, label: 'Assets', count: assetCount }] : []),
    ...(!live || live.history ? [{ id: 'history' as const, label: 'History' }] : []),
    ...(!live && international && persona === 'hr' ? [{ id: 'work-auth' as const, label: 'Work authorisations', count: ARJUN_WORK_AUTH.length }] : []),
  ];

  const header = live ? (
    <ObjectHeader
      breadcrumbs={<Breadcrumbs items={[{ label: 'People', href: live.directoryHref }, { label: 'Directory', href: live.directoryHref }, { label: name }]} />}
      name={name}
      person
      secondary={[role, live.department, live.location].filter(Boolean).join(' · ')}
      status={
        <span className="yx-ppl__header-extra">
          {live.badges.map((b) => (
            <Badge key={b.label} tone={b.tone}>
              {b.label}
            </Badge>
          ))}
          {asOf && <Badge tone="neutral">As on {formatDate(asOf)}</Badge>}
        </span>
      }
      facts={[
        { label: 'Employee ID', value: <span className="yx-mono">{live.code}</span> },
        ...(live.manager ? [{ label: 'Manager', value: live.manager }] : []),
        ...(live.joined ? [{ label: 'Joined', value: formatDate(live.joined) }] : []),
        ...(live.grade ? [{ label: 'Grade', value: live.grade }] : []),
      ]}
      actions={actions}
      menu={
        persona === 'hr' ? (
          <>
            {live.onIssueLetter && (
              <MenuItem icon={FileText} onSelect={live.onIssueLetter}>
                Issue letter
              </MenuItem>
            )}
            {live.onEditWorkPhone && (
              <MenuItem icon={Phone} onSelect={live.onEditWorkPhone}>
                Change work phone
              </MenuItem>
            )}
            {live.history && (
              <MenuItem icon={History} onSelect={() => setTab('history')}>
                View as on a date
              </MenuItem>
            )}
            {live.history && (
              <MenuItem icon={ShieldCheck} onSelect={() => setSide('roles')}>
                All roles of this person
              </MenuItem>
            )}
          </>
        ) : undefined
      }
    />
  ) : (
    <ObjectHeader
      breadcrumbs={<Breadcrumbs items={[{ label: 'People', href: '#' }, { label: 'Directory', href: '#' }, { label: ARJUN.name }]} />}
      name={ARJUN.name}
      person
      secondary={`${role} · ${ARJUN.department} · ${ARJUN.location}`}
      status={
        <span className="yx-ppl__header-extra">
          <Badge tone="success">Active</Badge>
          {!asOf && <Badge tone="info">Promotion from 1 Oct 2026</Badge>}
          {international && <Badge tone="warning">Deputation · Dubai to 31 Oct 2026</Badge>}
          {asOf && <Badge tone="neutral">As on {formatDate(asOf)}</Badge>}
        </span>
      }
      facts={[
        { label: 'Employee ID', value: <span className="yx-mono">{ARJUN.code}</span> },
        { label: 'Manager', value: ARJUN.manager },
        { label: 'Joined', value: formatDate(ARJUN.joined) },
        ...(persona !== 'emp' || self ? [{ label: 'Grade', value: asOf && asOf >= new Date(2026, 9, 1) ? 'G6' : ARJUN.grade }] : []),
      ]}
      actions={actions}
      menu={
        persona === 'hr' ? (
          <>
            <MenuItem icon={FileText}>Issue letter</MenuItem>
            <MenuItem icon={Phone}>Change work phone</MenuItem>
            <MenuItem icon={History} onSelect={() => setTab('history')}>
              View as on a date
            </MenuItem>
            <MenuItem icon={IdCard} onSelect={() => setSide('identity')}>
              Identity panel
            </MenuItem>
            <MenuItem icon={ShieldCheck} onSelect={() => setSide('roles')}>
              All roles of this person
            </MenuItem>
          </>
        ) : undefined
      }
    />
  );

  const rail = live ? (
    <div className="yx-ppl__stack">
      <FactRail facts={live.facts} events={live.events} />
      {side === 'activity' && live.activity && (
        <Card title="Activity">
          {live.activity.length ? <ActivityFeed entries={live.activity} today={today} /> : <Text size="sm" tone="secondary" as="p">Nothing yet.</Text>}
        </Card>
      )}
      {side === 'roles' && live.history && live.history.roles.length > 0 && <PersonRolesPanel roles={live.history.roles} onClose={live.activity ? () => setSide('activity') : undefined} />}
    </div>
  ) : (
    <div className="yx-ppl__stack">
      <FactRail
        facts={[
          { label: 'Work email', value: ARJUN.workEmail },
          { label: 'Work phone', value: formatPhone(ARJUN.workPhone) },
          { label: 'Secondary manager', value: ARJUN.dottedManager },
          { label: 'Employment type', value: ARJUN.type },
          { label: 'Legal entity', value: ARJUN.entity },
        ]}
        events={[
          { label: 'Promotion effective', date: new Date(2026, 9, 1), tone: 'info' },
          { label: 'Forklift licence expires', date: new Date(2026, 9, 24), tone: 'warning' },
          { label: 'Re-verification due', date: new Date(2026, 9, 20), tone: 'warning' },
          { label: 'Work anniversary (6 years)', date: new Date(2027, 2, 12) },
          ...(probationDone ? [] : [{ label: 'Probation ends', date: new Date(2026, 9, 5), tone: 'warning' as const }]),
          { label: '1 pending request', note: 'Profile change: bank account' },
        ]}
      />
      {side === 'activity' && (
        <Card title="Activity">
          <ActivityFeed entries={ACTIVITY} today={today} />
        </Card>
      )}
      {side === 'identity' && <IdentityPanel state={identityState} onClose={() => setSide('activity')} />}
      {side === 'roles' && <PersonRolesPanel onClose={() => setSide('activity')} />}
    </div>
  );

  const payVisible = live ? live.pay.kind !== 'none' : canSeePay(persona, relation, payGrant);

  return (
    <PeopleFrame active="Directory" persona={persona}>
      {header}
      {asOf && (
        <InlineAlert tone="info" title={`You're viewing this profile as on ${formatDate(asOf)}`} actions={<Button size="sm" onClick={() => setAsOf(null)}>Back to today</Button>}>
          {daysBetween(today, asOf) > 0 ? 'Scheduled changes up to that date are shown as if they were effective.' : 'Values are as the record held them on that date, including later corrections.'}
        </InlineAlert>
      )}
      {revealed.length > 0 && (
        <InlineAlert tone="warning">
          You viewed {revealed.join(', ')}. This view is recorded and {first} can see it in "Who accessed my data".
        </InlineAlert>
      )}
      <SplitLayout aside={rail}>
        <Tabs value={tab} onValueChange={(v) => setTab(v as RecordTab)}>
          <TabsList aria-label="Record sections">
            {tabs.map((t) => (
              <TabsTrigger key={t.id} value={t.id} count={t.count}>
                {t.label}
              </TabsTrigger>
            ))}
          </TabsList>
          {state === 'loading' ? (
            tabs.map((t) => (
              <TabsContent key={t.id} value={t.id}>
                <div className="yx-ppl__stack" role="status" aria-label={`Loading ${t.label}`}>
                  <Skeleton height={24} width="40%" />
                  <Skeleton height={160} />
                  <Skeleton height={160} />
                </div>
              </TabsContent>
            ))
          ) : (
            <>
              <TabsContent value="overview">
                {live ? (
                  <OverviewTab persona={persona} relation={relation} name={name} today={today} personal={live.personal} identity={live.identity} family={live.family ?? undefined} custom={live.custom?.rows} onEditCustom={live.custom?.onEdit} pending={live.pending} onEdit={live.onEditPersonal} onRequestChange={live.onRequestChange} onReveal={(l) => setRevealed((r) => (r.includes(l) ? r : [...r, l]))} />
                ) : (
                  <OverviewTab persona={persona} relation={relation} name={ARJUN.name} today={today} personal={ARJUN.personal} identity={ARJUN.identity} family={{ members: ARJUN.family, nominations: ARJUN.nominations, expected: ARJUN.expectedSchemes, contacts: ARJUN.emergency, note: ARJUN.familyNote, ...(persona === 'hr' ? { onEdit: () => {} } : {}), ...(self || persona === 'hr' ? { onEditContacts: () => {} } : {}) }} custom={ARJUN.custom} onEditCustom={self || persona === 'hr' ? () => {} : undefined} onEdit={self ? () => {} : undefined} onRequestChange={self ? () => {} : undefined} onReveal={(l) => setRevealed((r) => (r.includes(l) ? r : [...r, l]))} />
                )}
              </TabsContent>
              <TabsContent value="job">
                {live ? (
                  live.job && <JobTab canChange={persona !== 'emp' && !!live.onStartChange} onStartChange={live.onStartChange} rows={live.job} scheduled={live.scheduled} past={live.pastChanges} />
                ) : (
                  <JobTab canChange={persona !== 'emp'} rows={SAMPLE_JOB} scheduled={[{ title: 'Scheduled: promotion to Quality Lead from 1 Oct 2026', body: `Grade G6, CTC ${formatINR(780000)} a year. Approved by Karthik Subramanian on 24 Sep 2026. Letter KF/HR/2026/0418 accepted.` }]} past={ARJUN_HISTORY.filter((h) => h.state !== 'scheduled').length} />
                )}
              </TabsContent>
              <TabsContent value="pay">
                {live ? (
                  <LivePayTab pay={live.pay} name={name} persona={persona} self={self} onRequestChange={live.onRequestChange} />
                ) : payVisible ? (
                  <PayTab persona={persona} self={self} international={international} />
                ) : (
                  <div className="yx-ppl__stack">
                    <NoAccessState what="pay details for Arjun Kulkarni" grantedBy="HR (Lakshmi Venkatesan) can grant a salary grant for your team" />
                    <div>
                      <Button>Request access</Button>
                    </div>
                  </div>
                )}
              </TabsContent>
              <TabsContent value="time">{live ? live.time && <TimeTab balances={live.time.balances} unpaid={live.time.unpaid} attendance={live.time.attendance ?? null} /> : <TimeTab />}</TabsContent>
              <TabsContent value="documents">
                {live ? (
                  live.documents && <DocumentsTab persona={persona} rows={live.documents.rows} hidden={live.documents.hidden} actions={live.documents} />
                ) : (
                  <DocumentsTab persona={persona} rows={ARJUN_DOCS.filter((d) => fieldVisibility(d.cls, persona, relation) !== 'hidden')} hidden={ARJUN_DOCS.filter((d) => fieldVisibility(d.cls, persona, relation) === 'hidden').length} />
                )}
              </TabsContent>
              <TabsContent value="performance">{live ? live.performance && <PerformanceTab persona={persona} data={live.performance} /> : <PerformanceTab persona={persona} />}</TabsContent>
              {!live && (
                <TabsContent value="learning">
                  <LearningTab />
                </TabsContent>
              )}
              <TabsContent value="assets">{live ? live.assets && <AssetsTab name={name} rows={live.assets.rows} onIssue={persona === 'hr' ? live.assets.onIssue : undefined} /> : <AssetsTab name={ARJUN.name} rows={ARJUN_ASSETS} onIssue={persona === 'hr' ? () => {} : undefined} />}</TabsContent>
              <TabsContent value="history">
                {live ? live.history && <HistoryTab asOf={asOf} onAsOf={setAsOf} today={today} rows={live.history.rows} roles={live.history.roles} /> : <HistoryTab asOf={asOf} onAsOf={setAsOf} today={today} rows={ARJUN_HISTORY} roles={ARJUN_ROLES} />}
              </TabsContent>
              {!live && international && persona === 'hr' && (
                <TabsContent value="work-auth">
                  <WorkAuthTab rows={ARJUN_WORK_AUTH} today={today} />
                </TabsContent>
              )}
            </>
          )}
        </Tabs>
      </SplitLayout>
      {live?.children}
    </PeopleFrame>
  );
}

/* ------------------------------------------------------------------ tabs */

export interface CustomField {
  label: string;
  /** null: "Not set". */
  value: string | null;
  cls: FieldClass;
  selfEdit: boolean;
}

function OverviewTab({ persona, relation, name, today, personal, identity, family, custom: allCustom = [], pending = [], onEdit, onEditCustom, onRequestChange, onReveal }: { persona: Persona; relation: Relation; name: string; today: Date; personal: FieldRow[] | null; identity: FieldRow[] | null; family?: RecordFamily; custom?: CustomField[]; pending?: LiveRecord['pending']; onEdit?: () => void; onEditCustom?: () => void; onRequestChange?: () => void; onReveal: (label: string) => void }) {
  const familyVis = fieldVisibility('Personal', persona, relation);
  const custom = allCustom.filter((c) => fieldVisibility(c.cls, persona, relation) !== 'hidden');
  const first = name.split(' ')[0];
  return (
    <div className="yx-ppl__stack">
      {personal && (
        <Card title="Personal" actions={onEdit ? <Button size="sm" onClick={onEdit}>Edit</Button> : undefined}>
          <FieldList rows={personal} persona={persona} relation={relation} onReveal={onReveal} />
        </Card>
      )}
      {identity && (
        <Card title="Identity and bank" actions={onRequestChange ? <Button size="sm" onClick={onRequestChange}>Request a change</Button> : undefined}>
          <FieldList rows={identity} persona={persona} relation={relation} onReveal={onReveal} />
          {relation === 'self' && (
            <Text size="sm" tone="secondary" as="p">
              Changes to PAN, bank account and legal name need HR approval. We tell your old contact when the bank account changes.
            </Text>
          )}
          {pending.map((p) => (
            <InlineAlert key={p.id} tone="info" title={`Waiting for approval: ${p.label}`} actions={p.onWithdraw ? <Button size="sm" onClick={p.onWithdraw}>Withdraw</Button> : undefined}>
              {p.detail}
            </InlineAlert>
          ))}
        </Card>
      )}
      {family && familyVis !== 'hidden' ? (
        <FamilyCards family={family} today={today} />
      ) : family ? (
        <Text size="sm" tone="secondary" as="p">
          Family, nominees and emergency contacts are Personal fields. Only {first} and HR see them.
        </Text>
      ) : null}
      {!personal && !identity && (
        <Text size="sm" tone="secondary" as="p">
          Personal, identity and bank details are for {first}, HR and payroll.
        </Text>
      )}
      {custom.length > 0 && (
        <Card title="Additional details" actions={onEditCustom ? <Button size="sm" onClick={onEditCustom}>Edit</Button> : undefined}>
          <dl className="yx-ppl__dl">
            {custom.map((c) => (
              <div key={c.label} className="yx-ppl__dl-row">
                <dt>
                  {c.label} <ClassBadge cls={c.cls} />
                  {relation === 'self' && !c.selfEdit && <Badge tone="neutral">HR edits</Badge>}
                </dt>
                <dd>{c.value ?? <Text tone="secondary">Not set</Text>}</dd>
              </div>
            ))}
          </dl>
        </Card>
      )}
    </div>
  );
}

function JobTab({ canChange, onStartChange, rows, scheduled, past }: { canChange: boolean; onStartChange?: () => void; rows: [string, string][]; scheduled: { title: string; body: string }[]; past: number }) {
  return (
    <div className="yx-ppl__stack">
      <Card title="Current assignment" actions={canChange ? <Button size="sm" onClick={onStartChange}>Start change</Button> : undefined}>
        <dl className="yx-ppl__dl">
          {rows.map(([l, v]) => (
            <div key={l} className="yx-ppl__dl-row">
              <dt>{l}</dt>
              <dd>{v}</dd>
            </div>
          ))}
        </dl>
      </Card>
      {scheduled.map((s) => (
        <InlineAlert key={s.title} tone="info" title={s.title}>
          {s.body}
        </InlineAlert>
      ))}
      <Text size="sm" tone="secondary" as="p">
        {past} past change{past === 1 ? '' : 's'}. See History for the full dated timeline.
      </Text>
    </div>
  );
}

const PAY_LINES = [
  { label: 'Basic', monthly: 23000 },
  { label: 'House rent allowance', monthly: 11500 },
  { label: 'Special allowance', monthly: 20094 },
  { label: 'Employer PF (12% of ₹15,000)', monthly: 1800 },
  { label: 'Gratuity provision (4.81% of basic)', monthly: 1106 },
];

function SalaryTable({ lines, money, ctc, outside = [] }: { lines: { label: string; monthly: number }[]; money: (n: number) => string; ctc?: number; outside?: { label: string; monthly: number }[] }) {
  const monthly = ctc !== undefined ? ctc / 12 : lines.reduce((s, l) => s + l.monthly, 0);
  return (
    <Card title="Salary structure (monthly)">
      <div className="yx-scroll-x" tabIndex={0} role="region" aria-label="Table, scrolls sideways on small screens">
      <table className="yx-ppl__impact">
        <thead>
          <tr>
            <th scope="col">Component</th>
            <th scope="col">Monthly</th>
            <th scope="col">Annual</th>
          </tr>
        </thead>
        <tbody>
          {lines.map((l) => (
            <tr key={l.label}>
              <td>{l.label}</td>
              <td className="yx-ppl__num">{money(l.monthly)}</td>
              <td className="yx-ppl__num">{money(l.monthly * 12)}</td>
            </tr>
          ))}
          <tr>
            <th scope="row">Total CTC</th>
            <td className="yx-ppl__num">{money(monthly)}</td>
            <td className="yx-ppl__num">{money(monthly * 12)}</td>
          </tr>
          {outside.map((l) => (
            <tr key={l.label}>
              <td>
                {l.label} <Text size="sm" tone="secondary">(not in CTC)</Text>
              </td>
              <td className="yx-ppl__num">{money(l.monthly)}</td>
              <td className="yx-ppl__num">{money(l.monthly * 12)}</td>
            </tr>
          ))}
        </tbody>
      </table>
      </div>
    </Card>
  );
}

function PayTab({ persona, self, international }: { persona: Persona; self: boolean; international: boolean }) {
  const monthly = PAY_LINES.reduce((s, l) => s + l.monthly, 0);
  return (
    <div className="yx-ppl__stack">
      <div className="yx-ppl__grid3">
        <Card title="Annual CTC">
          <span className="yx-ppl__num yx-figure" data-size="lg">{formatINR(monthly * 12)}</span>
          <Text size="sm" tone="secondary" as="p">From 1 Apr 2025 · {formatINR(780000)} from 1 Oct 2026 (scheduled)</Text>
        </Card>
        <Card title="Last net pay">
          <span className="yx-ppl__num yx-figure" data-size="lg">{formatINR(49812)}</span>
          <Text size="sm" tone="secondary" as="p">August 2026 · paid 31 Aug 2026</Text>
        </Card>
        <Card title="Tax regime">
          <span className="yx-figure" data-size="lg">New</span>
          <Text size="sm" tone="secondary" as="p">FY 2026–27 · 2 proofs pending</Text>
        </Card>
      </div>
      <SalaryTable lines={PAY_LINES} money={formatINR} />
      {international ? (
        <InternationalBankTab persona={persona} splits={SPLITS} net={49812} embedded />
      ) : (
        <Card title="Bank accounts" actions={self ? <Button size="sm">Request a change</Button> : undefined}>
          <dl className="yx-ppl__dl">
            <div className="yx-ppl__dl-row">
              <dt>Salary account <ClassBadge cls="Confidential" /></dt>
              <dd className="yx-mono">Canara Bank · XXXX XXXX 6789 · penny drop verified</dd>
            </div>
            <div className="yx-ppl__dl-row">
              <dt>Reimbursement account <ClassBadge cls="Confidential" /></dt>
              <dd>Same as salary account</dd>
            </div>
          </dl>
        </Card>
      )}
      {persona === 'mgr' && <Text size="sm" tone="secondary" as="p">You see pay because HR gave you a salary grant for your team. Each view is recorded.</Text>}
    </div>
  );
}

/** Pay tab, live: the same cards, from the person's current pay, last approved payslip and tax regime. */
function LivePayTab({ pay, name, persona, self, onRequestChange }: { pay: LiveRecordPay; name: string; persona: Persona; self: boolean; onRequestChange?: () => void }) {
  if (pay.kind === 'none') return <NoAccessState what={`pay details for ${name}`} grantedBy={pay.grantedBy} />;
  if (pay.kind === 'ask')
    return (
      <Card title="Pay">
        <div className="yx-ppl__stack">
          <Text as="p" tone="secondary">
            {self ? 'Your pay is shown when you ask.' : `${name.split(' ')[0]} can see each time someone else looks at their pay.`}
          </Text>
          <div>
            <Button onClick={pay.onShow} loading={pay.busy}>
              Show pay
            </Button>
          </div>
          {pay.error && <InlineAlert tone="danger" title={pay.error} />}
        </div>
      </Card>
    );
  // Whole rupees on screen, as the design (stored amounts keep their paise).
  const money = (n: number) => formatMoney(Math.round(n), pay.currency);
  return (
    <div className="yx-ppl__stack">
      <div className="yx-ppl__grid3">
        <Card title="Annual CTC">
          <span className="yx-ppl__num yx-figure" data-size="lg">{money(pay.ctc)}</span>
          <Text size="sm" tone="secondary" as="p">
            From {formatDate(pay.from)}
            {pay.next ? ` · ${pay.next}` : ''}
          </Text>
        </Card>
        <Card title="Last net pay">
          {pay.lastNet ? (
            <>
              <span className="yx-ppl__num yx-figure" data-size="lg">{money(pay.lastNet.amount)}</span>
              <Text size="sm" tone="secondary" as="p">{pay.lastNet.note}</Text>
            </>
          ) : (
            <Text size="sm" tone="secondary" as="p">No payslip yet.</Text>
          )}
        </Card>
        <Card title="Tax regime">
          {pay.taxRegime ? (
            <>
              <span className="yx-figure" data-size="lg">{pay.taxRegime.label}</span>
              <Text size="sm" tone="secondary" as="p">{pay.taxRegime.note}</Text>
            </>
          ) : (
            <Text size="sm" tone="secondary" as="p">Not chosen for this tax year yet.</Text>
          )}
        </Card>
      </div>
      {pay.lines.length > 0 && <SalaryTable lines={pay.lines} money={money} ctc={pay.ctc} outside={pay.outside} />}
      {pay.banks.length > 0 && (
        <Card title="Bank accounts" actions={self && onRequestChange ? <Button size="sm" onClick={onRequestChange}>Request a change</Button> : undefined}>
          <FieldList rows={pay.banks} persona={persona} relation={self ? 'self' : 'other'} />
        </Card>
      )}
      {persona === 'mgr' && <Text size="sm" tone="secondary" as="p">You see pay because HR gave you a salary grant for your team. Each view is recorded.</Text>}
    </div>
  );
}

const SAMPLE_BALANCES = [
  { type: 'Casual leave', used: 5, total: 8 },
  { type: 'Sick leave', used: 2, total: 8 },
  { type: 'Earned leave', used: 6.5, total: 15 },
];

const SAMPLE_ATTENDANCE = {
  title: 'Attendance, September 2026',
  rows: [
    ['Present', '20 days'],
    ['Late marks', '2 (7 Sep, 18 Sep)'],
    ['Missing punch', '1 (23 Sep, regularisation pending)'],
    ['Shift', 'Rotational · week of 28 Sep: B shift, 2 pm to 10 pm'],
  ] as [string, string][],
};

function AttendanceCard({ attendance }: { attendance: { title: string; rows: [string, string][] } }) {
  return (
    <Card title={attendance.title}>
      <dl className="yx-ppl__dl">
        {attendance.rows.map(([l, v]) => (
          <div key={l} className="yx-ppl__dl-row">
            <dt>{l}</dt>
            <dd>{v}</dd>
          </div>
        ))}
      </dl>
    </Card>
  );
}

function TimeTab({ balances = SAMPLE_BALANCES, unpaid, attendance }: { balances?: { type: string; used: number; total: number }[]; unpaid?: number | null; attendance?: { title: string; rows: [string, string][] } | null }) {
  const live = unpaid !== undefined;
  return (
    <div className="yx-ppl__stack">
      <div className="yx-ppl__grid3">
        {balances.map((b) => (
          <Card key={b.type} title={b.type}>
            <Meter value={b.used} max={b.total} label={`${b.type} used`} valueText={`${b.total - b.used} of ${b.total} days left`} />
          </Card>
        ))}
      </div>
      {live ? (
        <>
          {unpaid !== null && (
            <Card title="Unpaid leave">
              <Text as="p">{unpaid === 0 ? 'None taken this year.' : `${unpaid} day${unpaid === 1 ? '' : 's'} taken this year.`}</Text>
            </Card>
          )}
          {attendance && <AttendanceCard attendance={attendance} />}
        </>
      ) : (
        <>
          <Card title="Unpaid leave">
            <Text as="p">2 days taken this year (11 and 12 Jun 2026).</Text>
          </Card>
          <AttendanceCard attendance={SAMPLE_ATTENDANCE} />
        </>
      )}
    </div>
  );
}

function DocumentsTab({ persona, rows: docs, hidden, actions }: { persona: Persona; rows: RecordDoc[]; hidden: number; actions?: NonNullable<LiveRecord['documents']> }) {
  const done = docs.filter((d) => d.status === 'Verified').length;
  const total = docs.length + hidden;
  // The sample record shows every button; live, only the ones the server allows.
  const upload = actions ? actions.onUpload : () => {};
  const request = actions ? actions.onRequest : () => {};
  return (
    <div className="yx-ppl__stack">
      <div className="yx-ppl__row yx-ppl__row--between">
        <Meter value={done} max={Math.max(total, 1)} label="Checklist complete" valueText={`${done} of ${total} verified`} warnAt={101} />
        <div className="yx-ppl__row">
          {persona === 'hr' && request && (
            <Button icon={Mail} onClick={request}>
              Request upload
            </Button>
          )}
          {upload && (
            <Button icon={Upload} onClick={upload}>
              Upload
            </Button>
          )}
        </div>
      </div>
      {docs.length === 0 ? (
        <EmptyState title="No documents yet" description="Uploaded and requested documents appear here." />
      ) : (
        <ul className="yx-ppl__checklist" aria-label="Document checklist">
          {docs.map((d) => (
            <li key={d.id ?? d.type} className="yx-ppl__check-row">
              <div className="yx-ppl__check-main">
                <span className="yx-ppl__check-title">
                  {d.type} <ClassBadge cls={d.cls} />
                </span>
                <Text size="sm" tone="secondary">
                  {d.on ? `Uploaded ${formatDate(d.on)} · ${d.versions} version${d.versions > 1 ? 's' : ''}` : 'Not uploaded'}
                  {d.by ? ` · verified by ${d.by}` : ''}
                  {d.expires ? ` · expires ${formatDate(d.expires)}` : ''}
                </Text>
              </div>
              <StatusBadge status={d.status} />
              {persona === 'hr' && d.status === 'Pending verification' && (!actions || actions.onVerify) && (
                <div className="yx-ppl__check-action">
                  <Button size="sm" onClick={() => actions?.onReject?.(d)}>
                    Reject
                  </Button>
                  <Button size="sm" onClick={() => actions?.onVerify?.(d)}>
                    Verify
                  </Button>
                </div>
              )}
              {d.on && (!actions || actions.onDownload) && <IconButton icon={Download} label={`Download ${d.type}`} size="sm" onClick={() => actions?.onDownload?.(d)} />}
            </li>
          ))}
        </ul>
      )}
      {hidden > 0 && (
        <Text size="sm" tone="secondary" as="p">
          {hidden} documents are Confidential or Special and not shown to you.
        </Text>
      )}
    </div>
  );
}

export function PerformanceTab({ persona, data }: { persona: Persona; data?: RecordPerformance }) {
  if (data)
    return (
      <div className="yx-ppl__grid2">
        <Card title={data.period ? `Goals, ${data.period}` : 'Goals'} actions={data.onOpenGoals ? <Button size="sm" onClick={data.onOpenGoals}>Open goals</Button> : undefined}>
          {data.goals.length ? (
            <ul className="yx-ppl__successors">
              {data.goals.map((g) => (
                <li key={g.id}>
                  <span>{g.title}</span>
                  <Badge tone={g.tone}>{g.status}</Badge>
                </li>
              ))}
            </ul>
          ) : (
            <Text size="sm" tone="secondary" as="p">No goals in this period yet.</Text>
          )}
        </Card>
        <Card title="Reviews">
          <dl className="yx-ppl__rail-facts">
            <div><dt>Last review</dt><dd>{data.lastReview ?? 'None shared yet'}</dd></div>
            <div><dt>Next 1:1</dt><dd>{data.nextOneOnOne ?? 'None scheduled'}</dd></div>
            {data.feedback != null && <div><dt>Feedback this quarter</dt><dd>{data.feedback}</dd></div>}
          </dl>
        </Card>
      </div>
    );
  return (
    <div className="yx-ppl__grid2">
      <Card title="Goals, 2026–27" actions={<Button size="sm">Open goals</Button>}>
        <ul className="yx-ppl__successors">
          <li><span>Cut line rejection rate to 1.2%</span><Badge tone="success">On track</Badge></li>
          <li><span>Certify 4 inspectors on the new tablet flow</span><Badge tone="warning">At risk</Badge></li>
          <li><span>Close 90% of CAPAs within 14 days</span><Badge tone="success">On track</Badge></li>
        </ul>
      </Card>
      <Card title="Reviews">
        <dl className="yx-ppl__rail-facts">
          <div><dt>Last review (2025–26)</dt><dd>{persona === 'emp' ? 'Meets expectations (shared on 20 Apr 2026)' : 'Meets expectations · calibrated'}</dd></div>
          <div><dt>Next 1:1</dt><dd>Thu 1 Oct 2026, 4:00 pm with Divya Raghunathan</dd></div>
          <div><dt>Feedback this quarter</dt><dd>3 received · 1 given</dd></div>
        </dl>
      </Card>
    </div>
  );
}

function LearningTab() {
  return (
    <Card title="Learning">
      <ul className="yx-ppl__successors">
        <li><span>Food safety (FSSC 22000) basics</span><Badge tone="success">Valid to 10 Mar 2027</Badge></li>
        <li><span>Forklift refresher</span><Badge tone="warning">Due by 24 Oct 2026</Badge></li>
        <li><span>Tablet inspection app</span><Badge tone="info">In progress · 60%</Badge></li>
        <li><span>POSH awareness 2026</span><Badge tone="success">Completed 4 Apr 2026</Badge></li>
      </ul>
    </Card>
  );
}

function AssetsTab({ name, rows, onIssue }: { name: string; rows: RecordAsset[]; onIssue?: () => void }) {
  return (
    <div className="yx-ppl__stack">
      {onIssue && (
        <div className="yx-ppl__row">
          <Button icon={Plus} onClick={onIssue}>
            Issue asset
          </Button>
        </div>
      )}
      {rows.length === 0 ? (
        <EmptyState title={`No assets with ${name}`} description="Assets issued to this person appear here." />
      ) : (
        <div className="yx-scroll-x" tabIndex={0} role="region" aria-label={`Assets with ${name}, scrolls sideways on small screens`}>
        <table className="yx-ppl__impact">
          <caption className="yx-visually-hidden">Assets with {name}</caption>
          <thead>
            <tr>
              <th scope="col">Tag</th>
              <th scope="col">Asset</th>
              <th scope="col">Issued</th>
              <th scope="col">Condition</th>
              <th scope="col">Acknowledgement</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((a) => (
              <tr key={a.tag}>
                <td className="yx-mono">{a.tag}</td>
                <td>{a.name}</td>
                <td>{formatDate(a.issued)}</td>
                <td>{a.condition}</td>
                <td>
                  <StatusBadge status={a.ack === 'Waiting' ? 'Waiting for confirmation' : 'Confirmed'} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        </div>
      )}
    </div>
  );
}

const FACT_FILTER = [
  { value: 'all', label: 'All changes' },
  { value: 'Promotion', label: 'Designation and grade' },
  { value: 'Salary revision', label: 'Pay' },
  { value: 'Transfer', label: 'Location' },
  { value: 'Correction', label: 'Corrections' },
];

function HistoryTab({ asOf, onAsOf, today, rows: all, roles }: { asOf: Date | null; onAsOf: (d: Date | null) => void; today: Date; rows: JobChange[]; roles: RecordRole[] }) {
  const [fact, setFact] = useState<string | null>('all');
  const rows = useMemo(() => all.filter((h) => fact === 'all' || h.type === fact || (fact === 'Promotion' && h.type === 'Joining')), [fact, all]);
  return (
    <div className="yx-ppl__stack">
      <div className="yx-ppl__row">
        <FormField label="View as on">
          <DatePicker value={asOf} onChange={onAsOf} max={new Date(today.getFullYear() + 1, 11, 31)} />
        </FormField>
        <FormField label="Show">
          <Select options={FACT_FILTER} value={fact} onChange={setFact} />
        </FormField>
      </div>
      {rows.length === 0 ? (
        <EmptyState title="No changes of this kind" description="Pick All changes to see the whole timeline." />
      ) : (
        <ol className="yx-ppl__history" aria-label="Dated changes, newest first">
          {rows.map((h: JobChange) => (
            <li key={h.id} data-state={h.state} data-after-asof={asOf && h.effective > asOf ? true : undefined}>
              <span className="yx-ppl__history-date">{formatDate(h.effective)}</span>
              <span>
                <strong>{h.type}</strong> · {h.summary}
                {asOf && h.effective > asOf && (
                  <Text size="sm" as="div">
                    Not yet effective on {formatDate(asOf)}
                  </Text>
                )}
                {(h.by || h.letter) && (
                  <Text size="sm" tone="secondary" as="div">
                    {[h.by && `By ${h.by}`, h.letter && `letter ${h.letter}`].filter(Boolean).join(' · ')}
                  </Text>
                )}
              </span>
              <StatusBadge status={h.state === 'scheduled' ? 'Scheduled' : h.state === 'correction' ? 'Correction' : h.state === 'current' ? 'Current' : 'Past'} />
            </li>
          ))}
        </ol>
      )}
      {roles.length > 0 && (
        <Card title="All roles of this person">
          <RolesList roles={roles} />
        </Card>
      )}
    </div>
  );
}

function RolesList({ roles = ARJUN_ROLES }: { roles?: RecordRole[] }) {
  return (
    <ol className="yx-ppl__roles" aria-label="Roles over time">
      {[...roles].sort((a, b) => a.from.getTime() - b.from.getTime()).map((r) => (
        <li key={r.role + r.from.getTime()}>
          <span>
            <strong>{r.role}</strong> · {formatDate(r.from)} to {r.to ? formatDate(r.to) : 'now'}
          </span>
          <Text size="sm" tone="secondary">
            {r.link}
          </Text>
        </li>
      ))}
    </ol>
  );
}

/* ================================================================== PPL-35 roles panel */

// PPL-35
export function PersonRolesPanel({ onClose, roles }: { onClose?: () => void; roles?: RecordRole[] }) {
  return (
    <Card title="Person roles" actions={onClose && <Button size="sm" onClick={onClose}>Close</Button>}>
      <Text size="sm" tone="secondary" as="p">
        {roles ? 'One person record links every role this person has had with the company.' : 'One person record links every role in Kaveri Foods. The contract service before 12 Mar 2021 is history only; it does not count for probation or seniority (company setting).'}
      </Text>
      <RolesList roles={roles} />
    </Card>
  );
}

/* ================================================================== PPL-34 identity panel */

// PPL-34
export function IdentityPanel({ state, onClose }: { state: 'consented' | 'refused' | 'mismatch'; onClose?: () => void }) {
  const checks =
    state === 'refused'
      ? IDENTITY.checks.map((c) => ({ ...c, result: c.point === 'Application verification' ? 'ID check only (face consent refused)' : 'Attested', by: c.by === 'System' ? 'Proctor: Kavitha Rao' : c.by }))
      : state === 'mismatch'
        ? [...IDENTITY.checks.slice(0, 3), { at: new Date(2021, 2, 12), point: 'Day-1 identity check', result: 'Mismatch: HR review', by: 'System' }]
        : IDENTITY.checks;
  return (
    <Card title="Identity" actions={onClose && <Button size="sm" onClick={onClose}>Close</Button>}>
      <div className="yx-ppl__stack">
        <Text size="sm" tone="secondary" as="p">
          Special class. No face image is shown here. Views are recorded.
        </Text>
        <div className="yx-scroll-x" tabIndex={0} role="region" aria-label="Consent by jurisdiction, scrolls sideways on small screens">
        <table className="yx-ppl__impact">
          <caption className="yx-ppl__sub">Consent by jurisdiction</caption>
          <thead>
            <tr>
              <th scope="col">Jurisdiction</th>
              <th scope="col">Status</th>
              <th scope="col">Captured at</th>
            </tr>
          </thead>
          <tbody>
            {IDENTITY.consent.map((c) => (
              <tr key={c.jurisdiction}>
                <td>{c.jurisdiction}</td>
                <td>
                  <StatusBadge status={state === 'refused' && c.jurisdiction.startsWith('India') ? 'Refused' : c.status === 'Given' ? 'Approved' : c.status} />
                </td>
                <td>
                  {c.point}, {formatDate(c.on)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        </div>
        <div className="yx-scroll-x" tabIndex={0} role="region" aria-label="Checks across hiring and joining, scrolls sideways on small screens">
        <table className="yx-ppl__impact">
          <caption className="yx-ppl__sub">Checks across hiring and joining</caption>
          <thead>
            <tr>
              <th scope="col">Date</th>
              <th scope="col">Point</th>
              <th scope="col">Result</th>
            </tr>
          </thead>
          <tbody>
            {checks.map((c) => (
              <tr key={c.point}>
                <td>{formatDate(c.at)}</td>
                <td>
                  {c.point}
                  <Text size="sm" tone="secondary" as="div">{c.by}</Text>
                </td>
                <td>
                  <Badge tone={c.result.startsWith('Mismatch') ? 'danger' : c.result === 'Match' || c.result.startsWith('Captured') ? 'success' : 'neutral'}>{c.result}</Badge>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        </div>
        {state === 'mismatch' && (
          <InlineAlert tone="warning" title="Identity flag for HR review">
            A mismatch never blocks joining. Ask for a fresh ID and selfie, or attest against the original ID.
          </InlineAlert>
        )}
        <div className="yx-ppl__row">
          <Button icon={IdCard}>Request re-verification</Button>
          {state !== 'consented' && <Button>Record HR attestation</Button>}
        </div>
      </div>
    </Card>
  );
}

/* ================================================================== PPL-45 work authorisations */

// PPL-45
export function WorkAuthTab({ rows, today }: { rows: typeof ARJUN_WORK_AUTH; today: Date }) {
  const cols: TableColumn<(typeof ARJUN_WORK_AUTH)[number]>[] = [
    { key: 'type', header: 'Document', value: (r) => r.type, render: (r) => <span>{r.type}<Text size="sm" tone="secondary" as="div">{r.country}</Text></span>, width: 200 },
    { key: 'number', header: 'Number', type: 'id', value: (r) => r.number, width: 170 },
    { key: 'sponsor', header: 'Sponsor', value: (r) => r.sponsor, width: 160 },
    {
      key: 'occupation',
      header: 'Occupation on permit',
      value: (r) => r.occupation,
      render: (r) => (r.occupation !== '—' && r.occupation !== 'Quality Lead' && r.type === 'Employment visa' ? <span>{r.occupation} <Badge tone="warning">Differs from designation</Badge></span> : r.occupation),
      width: 260,
    },
    { key: 'expires', header: 'Expires', type: 'date', value: (r) => r.expires, width: 130 },
    { key: 'left', header: 'Days left', type: 'number', value: (r) => daysBetween(today, r.expires), width: 110 },
    { key: 'status', header: 'Status', type: 'status', value: (r) => r.status, statusTone: (v) => (v === 'Expiring' ? 'warning' : 'success'), width: 120 },
  ];
  return (
    <div className="yx-ppl__stack">
      {rows.some((r) => r.status === 'Expiring') && (
        <InlineAlert tone="warning" title="Employment visa expires on 1 Nov 2026">
          Reminders went at 90 and 60 days. The next goes at 30 days. WPS salary files fail pre-flight once it expires.
        </InlineAlert>
      )}
      <DataTable
        label="Work authorisations"
        columns={cols}
        rows={rows}
        getRowId={(r) => r.type + r.country}
        empty={<EmptyState title="No work authorisations" description="Add visas, permits or national IDs for people who work outside their home country." action={<Button variant="primary">Add document</Button>} />}
        toolbar={<Button icon={Plus} size="sm">Add document</Button>}
      />
    </div>
  );
}

/* ================================================================== PPL-46 international bank details */

const RULES = [
  { value: 'remainder', label: 'Remainder' },
  { value: 'fixed', label: 'Fixed amount' },
  { value: 'percent', label: 'Percentage' },
];

// PPL-46
export function InternationalBankTab({ persona, splits: initial, net, embedded, defaultIban = 'AE07 0331 2345 6789 0123 456', defaultBic = 'ECBKAEAD' }: { persona: Persona; splits: PaySplit[]; net: number; embedded?: boolean; defaultIban?: string; defaultBic?: string }) {
  const [splits, setSplits] = useState(initial);
  const [iban, setIban] = useState(defaultIban);
  const [bic, setBic] = useState(defaultBic);
  const result = splits.length ? splitNetPay(net, splits) : null;
  const ibanOk = isIban(iban);
  const bicOk = isBic(bic);
  const body = (
    <div className="yx-ppl__stack">
      <div className="yx-ppl__form">
        <FormField label="Country of account" required>
          <Select options={[{ value: 'AE', label: 'United Arab Emirates' }, { value: 'IN', label: 'India' }, { value: 'GB', label: 'United Kingdom' }]} value="AE" onChange={() => {}} />
        </FormField>
        <FormField label="IBAN" required error={ibanOk ? null : 'Enter a 23-character UAE IBAN starting with AE, like AE07 0331 2345 6789 0123 456.'} helper={ibanOk ? 'IBAN check passed (country length and check digits).' : undefined}>
          <TextField value={iban} onChange={setIban} className="yx-mono" />
        </FormField>
        <FormField label="BIC / SWIFT" required error={bicOk ? null : 'Enter an 8 or 11 character BIC, like ECBKAEAD.'}>
          <TextField value={bic} onChange={setBic} />
        </FormField>
        <FormField label="Payout currency">
          <Select options={[{ value: 'AED', label: 'AED · UAE dirham' }, { value: 'INR', label: 'INR · Indian rupee' }]} value="AED" onChange={() => {}} />
        </FormField>
      </div>
      {splits.length > 0 && (
        <Card title={`Split net pay (${formatINR(net)} this month)`}>
          <div className="yx-scroll-x" tabIndex={0} role="region" aria-label="Table, scrolls sideways on small screens">
          <table className="yx-ppl__impact">
            <thead>
              <tr>
                <th scope="col">Account</th>
                <th scope="col">Rule</th>
                <th scope="col">Value</th>
                <th scope="col">This month</th>
              </tr>
            </thead>
            <tbody>
              {splits.map((s) => (
                <tr key={s.id}>
                  <td className="yx-mono">{s.label}</td>
                  <td>
                    <Select aria-label={`Rule for ${s.label}`} size="sm" options={RULES} value={s.rule} onChange={(v) => setSplits((xs) => xs.map((x) => (x.id === s.id ? { ...x, rule: v as PaySplit['rule'] } : x)))} />
                  </td>
                  <td>
                    {s.rule === 'remainder' ? (
                      '—'
                    ) : (
                      <NumberField aria-label={`Value for ${s.label}`} size="sm" value={s.value} onChange={(v) => setSplits((xs) => xs.map((x) => (x.id === s.id ? { ...x, value: v ?? 0 } : x)))} />
                    )}
                  </td>
                  <td className="yx-ppl__num">{result?.ok ? formatINR(result.amounts[s.id]) : '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
          </div>
          {result && !result.ok && (
            <InlineAlert tone="danger" title="This split can't be saved">
              {result.error}
            </InlineAlert>
          )}
          <div className="yx-ppl__row">
            <Button
              icon={Plus}
              size="sm"
              onClick={() => setSplits((xs) => [...xs, { id: `n${xs.length}`, label: 'New account', rule: 'fixed', value: 0 }])}
            >
              Add account
            </Button>
            <Text size="sm" tone="secondary">
              Up to 3 accounts: fixed amounts first, then percentages, remainder to the primary. The WPS account must get at least the pack minimum.
            </Text>
          </div>
        </Card>
      )}
      <InlineAlert tone="info">
        Changes need approval and a cooling period before the first payout. {persona === 'emp' ? 'We tell your old contact when your account changes.' : 'The employee and the old contact are notified.'}
      </InlineAlert>
      {!embedded && (
        <div className="yx-ppl__row">
          <Button>Cancel</Button>
          <Button variant="primary" disabled={!ibanOk || !bicOk || (result != null && !result.ok)}>
            Send for approval
          </Button>
        </div>
      )}
    </div>
  );
  if (embedded) return <Card title="Bank accounts (international)">{body}</Card>;
  return (
    <PeopleFrame active="Directory" persona={persona}>
      <ObjectHeader name="Arjun Kulkarni" person secondary="Pay › Bank details · deputation to Dubai" status={<Badge tone="warning">Deputation</Badge>} />
      {body}
    </PeopleFrame>
  );
}

// PPL-46 · phone
export function InternationalBankPhone({ defaultIban }: { defaultIban?: string }) {
  const [iban, setIban] = useState(defaultIban ?? 'AE07 0331 2345 6789 0123 456');
  const ok = isIban(iban);
  return (
    <PhoneFrame tab="pay" title="Bank details">
      <Card title="Salary account">
        <Text as="p" className="yx-mono">Emirates Crescent Bank · AE07 •••• 3456</Text>
        <Badge tone="success">Verified</Badge>
      </Card>
      <FormField label="New IBAN" required error={ok ? null : 'Enter a 23-character UAE IBAN starting with AE.'} helper={ok ? 'IBAN check passed.' : undefined}>
        <TextField value={iban} onChange={setIban} />
      </FormField>
      <InlineAlert tone="info">HR approves bank changes. Your first salary to a new account waits for the cooling period.</InlineAlert>
      <Button variant="primary" fullWidth disabled={!ok}>
        Send for approval
      </Button>
      {!ok && (
        <Text size="sm" tone="danger" as="p">
          <Icon icon={AlertTriangle} size="sm" /> Fix the IBAN to continue.
        </Text>
      )}
    </PhoneFrame>
  );
}
