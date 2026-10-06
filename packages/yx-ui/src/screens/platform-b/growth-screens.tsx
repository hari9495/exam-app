// PLT-38 Jobs & errors; P20 / P14 growth and account screens: PLT-39…43, PLT-50…54.
import { useState, type ReactNode } from 'react';
import { AlertTriangle, CheckCircle2, Circle, Clock, Copy, ExternalLink, Lock, RotateCcw, ThumbsUp, XCircle } from 'lucide-react';
import { Button, Link } from '../../components/button';
import { Icon } from '../../components/foundations';
import { Badge, type BadgeTone } from '../../components/display';
import { EmptyState, InlineAlert, Meter } from '../../components/feedback';
import { Drawer } from '../../components/drawer';
import { DataTable, type TableColumn } from '../../components/table';
import { FilterBar, SavedViewMenu } from '../../components/filters';
import { Card, DescriptionList, PageHeader, Tabs, TabsContent, TabsList, TabsTrigger } from '../../components/shell';
import { FormField } from '../../components/field';
import { Checkbox, RadioGroup, Switch } from '../../components/choice';
import { TextArea, TextField } from '../../components/inputs';
import { BottomSheet, ConfirmDialog, Dialog, TypeToConfirmDialog } from '../../components/overlay';
import { PageBanner } from '../../components/notify';
import { QuickStartLane, Stepper } from '../../components/stepper';
import { MenuItem } from '../../components/menu';
import { formatDate, formatINR } from '../../lib/format';
import type { FilterValue } from '../../lib/table';
import { DesktopFrame, PhoneFrame } from '../_kit/frames';
import { TODAY } from '../_kit/data';
import { SettingsFrame, payoutReadiness, readOnlyStatus, referralStatus, trialExtension, type PayoutChecks, type Referral, type ReferralStatus } from './platform-b-kit';

/* ================================================================== PLT-38 Jobs & errors */

export type JobKind = 'Import' | 'Integration delivery' | 'Notification' | 'Scheduled job' | 'Automation';
export interface JobError {
  id: string;
  kind: JobKind;
  source: string;
  record: string;
  error: string;
  attempts: number;
  nextRetry: Date | null;
  owner: string | null;
  /** Hours since first failure. */
  ageHours: number;
  /** Which persona owns this kind (for role filtering). */
  area: 'people' | 'payroll' | 'platform';
}

const fmtWhen = (dt: Date | null) => (dt ? `${formatDate(dt)}, ${dt.toLocaleTimeString('en-IN', { hour: 'numeric', minute: '2-digit' })}` : 'No retry: needs a person');

/** Only failures the viewer's role owns: HR sees people data, PA payroll, SA everything. */
export function jobsForPersona(jobs: JobError[], persona: 'SA' | 'HR' | 'PA'): JobError[] {
  if (persona === 'SA') return jobs;
  return jobs.filter((j) => j.area === (persona === 'HR' ? 'people' : 'payroll'));
}

// PLT-38
export function JobsErrorsScreen({ jobs, persona = 'SA', state = 'ready', skipOpen }: { jobs: JobError[]; persona?: 'SA' | 'HR' | 'PA'; state?: 'ready' | 'loading' | 'error'; skipOpen?: string }) {
  const [filters, setFilters] = useState<FilterValue[]>([]);
  const [skipping, setSkipping] = useState<string | null>(skipOpen ?? null);
  const [reason, setReason] = useState('');
  const [tried, setTried] = useState(false);
  const mine = jobsForPersona(jobs, persona);
  const rows = mine.filter((j) =>
    filters.every((f) => {
      if (f.type === 'multi' && f.values.length) return f.values.includes(f.key === 'kind' ? j.kind : f.key === 'source' ? j.source : j.ageHours > 24 ? 'old' : 'new');
      return true;
    }),
  );
  const unowned = mine.filter((j) => !j.owner).length;
  const cols: TableColumn<JobError>[] = [
    { key: 'kind', header: 'Kind', type: 'status', value: (j) => j.kind, statusTone: () => 'neutral', groupable: true },
    { key: 'source', header: 'Source', value: (j) => j.source, groupable: true },
    { key: 'record', header: 'Record', type: 'id', value: (j) => j.record },
    { key: 'error', header: 'Error', value: (j) => j.error, width: 360 },
    { key: 'attempts', header: 'Attempts', type: 'number', value: (j) => j.attempts },
    { key: 'next', header: 'Next retry', value: (j) => j.nextRetry, render: (j) => fmtWhen(j.nextRetry) },
    {
      key: 'owner',
      header: 'Owner',
      value: (j) => j.owner ?? '',
      render: (j) => (j.owner ? j.owner : <Badge tone="warning">No owner · sent to System Admin</Badge>),
    },
  ];
  const job = jobs.find((j) => j.id === skipping);
  return (
    <SettingsFrame active="Jobs & errors">
      <PageHeader
        title="Jobs & errors"
        description="Every failed import, delivery, notification, scheduled job and automation in one place. Nothing fails silently."
        facts={`${mine.length} open · ${unowned} without an owner${persona === 'SA' ? '' : ' · showing only your area'}`}
        actions={<Button icon={RotateCcw}>Retry all retryable</Button>}
      />
      {unowned > 0 && persona === 'SA' && (
        <InlineAlert tone="warning" title={`${unowned} failures have no owner and are escalated to you`}>
          Assign an owner so the right team sees the next failure first.
        </InlineAlert>
      )}
      <DataTable
        label="Jobs and errors"
        columns={cols}
        rows={state === 'ready' ? rows : []}
        getRowId={(j) => j.id}
        state={state}
        errorTitle="We couldn't load jobs and errors."
        errorReference="JOB-40219"
        onRetry={() => {}}
        selectable
        bulkActions={(ids) => <Button size="sm" icon={RotateCcw}>{`Retry ${ids.length}`}</Button>}
        rowButtons={(j) => (
          <>
            <Button size="sm" disabled={!j.nextRetry && j.kind === 'Import'}>
              Retry
            </Button>
            <Button size="sm" onClick={() => setSkipping(j.id)}>
              Skip
            </Button>
          </>
        )}
        rowActions={() => (
          <>
            <MenuItem icon={ExternalLink}>Open record</MenuItem>
            <MenuItem>Assign owner</MenuItem>
          </>
        )}
        filtered={filters.length > 0}
        onClearFilters={() => setFilters([])}
        empty={<EmptyState title="No failures. Everything ran." description="Failed jobs appear here with a plain reason and a Retry button." />}
        toolbar={
          <FilterBar
            fields={[
              { key: 'kind', label: 'Kind', type: 'multi', options: ['Import', 'Integration delivery', 'Notification', 'Scheduled job', 'Automation'].map((v) => ({ value: v, label: v })) },
              { key: 'source', label: 'Source', type: 'multi', options: [...new Set(jobs.map((j) => j.source))].map((v) => ({ value: v, label: v })) },
              { key: 'age', label: 'Age', type: 'multi', options: [{ value: 'new', label: 'Last 24 hours' }, { value: 'old', label: 'Older than 24 hours' }] },
            ]}
            value={filters}
            onChange={setFilters}
          />
        }
        views={<SavedViewMenu views={[{ id: 'open', name: 'All open' }, { id: 'mine', name: 'Owned by me' }, { id: 'esc', name: 'Escalated', shared: true }]} currentId="open" onSelect={() => {}} />}
      />
      <Dialog
        open={job != null}
        onOpenChange={(o) => !o && setSkipping(null)}
        title={`Skip ${job?.record ?? ''}?`}
        description="It leaves the queue and won't be retried. The reason is saved in the audit log."
        footer={
          <>
            <Button onClick={() => setSkipping(null)}>Cancel</Button>
            <Button variant="primary" onClick={() => setTried(true)}>
              Skip with reason
            </Button>
          </>
        }
      >
        <FormField label="Reason" required error={tried && !reason.trim() ? 'Enter why you are skipping this, for example “Duplicate row, fixed in the next import”' : null}>
          <TextArea value={reason} onChange={setReason} rows={3} />
        </FormField>
      </Dialog>
    </SettingsFrame>
  );
}

/* ================================================================== PLT-39 Quick-start lane */

export interface Lane {
  product: string;
  steps: { id: string; title: string; description: string; estimate: string }[];
  current: string | null;
  skipped?: boolean;
  sampleData?: boolean;
}

// PLT-39
export function QuickStartPanel({ lanes, defaultProduct }: { lanes: Lane[]; defaultProduct?: string }) {
  return (
    <SettingsFrame active="Set-up hub">
      <PageHeader title="Set-up hub" description="Reach first value in minutes with the quick start, then finish every go-live check." facts="Setup 18% · 4 of 22 cards done" />
      <Card title="Quick start">
        <Tabs defaultValue={defaultProduct ?? lanes[0].product}>
          <TabsList aria-label="Products">
            {lanes.map((l) => (
              <TabsTrigger key={l.product} value={l.product}>
                {l.product}
              </TabsTrigger>
            ))}
          </TabsList>
          {lanes.map((l) => {
            const done = l.current == null;
            const idx = done ? l.steps.length : l.steps.findIndex((s) => s.id === l.current);
            return (
              <TabsContent key={l.product} value={l.product}>
                <div className="yxp-stack">
                  {l.sampleData && <Badge tone="warning">Sample data: labelled on every screen, removed in one click</Badge>}
                  {done ? (
                    <InlineAlert tone="success" title={`First value reached for ${l.product}`}>
                      The quick start is done. Your go-live checks below are still open; the quick start never marks a module live.
                    </InlineAlert>
                  ) : l.skipped ? (
                    <InlineAlert tone="info" title="You skipped the quick start" actions={<Button size="sm">Resume quick start</Button>}>
                      You can come back to it any time from Help.
                    </InlineAlert>
                  ) : (
                    <>
                      <p className="yxp-muted">
                        Step {idx + 1} of {l.steps.length} · starter templates are applied for you
                      </p>
                      <QuickStartLane title={`${l.product} quick start`} steps={l.steps} current={l.current!} actionLabel="Start" />
                      <div className="yxp-row">
                        <Button>Skip for now</Button>
                      </div>
                    </>
                  )}
                </div>
              </TabsContent>
            );
          })}
        </Tabs>
      </Card>
      <Card title="Go-live checks">
        <p className="yxp-muted">Statutory set-up, bank account, payroll parallel run and 19 more cards. Open the checklist to continue.</p>
      </Card>
    </SettingsFrame>
  );
}

/* ================================================================== PLT-40 Switch on card */

export type SwitchOnReason = 'not-on' | 'limit' | 'first-value';

// PLT-40
export function SwitchOnCard({ product, reason, price, canBill, limitText }: { product: string; reason: SwitchOnReason; price: string; canBill: boolean; limitText?: string }) {
  const heading = reason === 'not-on' ? `${product} is not switched on` : reason === 'limit' ? 'This needs a paid plan' : `You've reached first value with ${product}`;
  return (
    <section className="yxp-tile yxp-narrow" aria-label={heading}>
      <h2 className="yxp-tile__title">{heading}</h2>
      {reason === 'limit' && limitText && <InlineAlert tone="info" title={limitText}>Your data and previews stay open; only this action waits.</InlineAlert>}
      <p>
        {product === 'Payroll'
          ? 'Run payroll with PF, ESI, PT and TDS, bank files and payslips for every entity.'
          : `${product} adds its screens, reports and mobile flows for your team.`}
      </p>
      <DescriptionList
        items={[
          { label: 'Price', value: price },
          { label: 'Billing starts', value: 'On the day you mark it live, not today' },
        ]}
      />
      {canBill ? (
        <div className="yxp-tile__foot">
          <Button>Not now</Button>
          <Button>Talk to us</Button>
          <Button variant="primary">Switch on</Button>
        </div>
      ) : (
        <InlineAlert tone="info" title="Ask your System Admin">
          Only people with billing permission can switch products on. Anand Krishnan is your System Admin.
        </InlineAlert>
      )}
      <p className="yxp-muted">Not now hides this card for 14 days.</p>
    </section>
  );
}

// PLT-40 in context
export function SwitchOnScreen(props: Parameters<typeof SwitchOnCard>[0]) {
  return (
    <DesktopFrame area="pay" panelTitle="Pay" panel={[{ items: ['Payroll', 'Compensation', 'Tax centre', 'Payments & files', 'Reports'].map((l) => ({ label: l, active: l === 'Payments & files' })) }]}>
      <PageHeader title={props.reason === 'limit' ? 'Bank file · September 2026' : 'Payroll'} />
      <SwitchOnCard {...props} />
    </DesktopFrame>
  );
}

/* ================================================================== PLT-41 Talk to us */

// PLT-41
export function TalkToUsDialog({ trigger, booked }: { trigger: string; booked?: boolean }) {
  const [slot, setSlot] = useState('30-11');
  return (
    <SettingsFrame active="Set-up hub">
      <PageHeader title="Set-up hub" />
      <Dialog
        defaultOpen
        size="md"
        title={booked ? 'Your call is booked' : 'Talk to us'}
        description={booked ? undefined : `${trigger} Our team can help with migration and a parallel run. The self-serve path stays open and the price stays the published price.`}
        footer={
          booked ? (
            <Button variant="primary">Done</Button>
          ) : (
            <>
              <Button>Not now</Button>
              <Button variant="primary">Book call</Button>
            </>
          )
        }
      >
        {booked ? (
          <p>
            Ritu from YukthiX will call you on Wed 30 Sep 2026 at 11:00 am. You'll get an email with the details. This message won't show again for this reason.
          </p>
        ) : (
          <div className="yxp-stack">
            <FormField label="Pick a time">
              <RadioGroup
                value={slot}
                onChange={setSlot}
                options={[
                  { value: '30-11', label: 'Wed 30 Sep 2026, 11:00 am' },
                  { value: '30-16', label: 'Wed 30 Sep 2026, 4:00 pm' },
                  { value: '01-10', label: 'Thu 1 Oct 2026, 10:00 am' },
                  { value: 'cb', label: 'Call me back within one business day' },
                ]}
              />
            </FormField>
            <FormField label="Phone" required>
              <TextField defaultValue="98450 12345" prefix="+91" />
            </FormField>
            <fieldset className="yxp-stack yxp-stack--tight yxp-fieldset">
              <legend className="yxp-sub">What would you like to discuss?</legend>
              <Checkbox label="Moving data from our current system" defaultChecked />
              <Checkbox label="Payroll parallel run" defaultChecked />
              <Checkbox label="Several legal entities" />
              <Checkbox label="Pricing for our size" />
            </fieldset>
          </div>
        )}
      </Dialog>
    </SettingsFrame>
  );
}

/* ================================================================== PLT-42 Trial extension */

// PLT-42
export function TrialExtensionDialog({ extensionsUsed, firstValue }: { extensionsUsed: number; firstValue: boolean }) {
  const ext = trialExtension({ extensionsUsed, firstValue });
  const [reason, setReason] = useState('');
  const [tried, setTried] = useState(false);
  return (
    <SettingsFrame active="Plan & add-ons">
      <PageHeader title="Plan & add-ons" facts="Trial · ends 1 Oct 2026" />
      <Dialog
        defaultOpen
        title={!ext.allowed ? 'Your trial was already extended' : ext.automatic ? 'We extended your trial by 14 days' : 'Extend your trial'}
        footer={
          !ext.allowed ? (
            <>
              <Button>Talk to us</Button>
              <Button variant="primary">Switch on</Button>
            </>
          ) : ext.automatic ? (
            <Button variant="primary">Continue set-up</Button>
          ) : (
            <>
              <Button>Cancel</Button>
              <Button variant="primary" onClick={() => setTried(true)}>
                Extend by 14 days
              </Button>
            </>
          )
        }
      >
        {!ext.allowed ? (
          <p>{ext.reason} Your trial ends on 15 Oct 2026. After that the account is read-only for 30 days, with full export.</p>
        ) : ext.automatic ? (
          <p>You reached first value, so your trial now ends on 15 Oct 2026 instead of 1 Oct 2026. Billing still starts only when you mark a product live. This is the only extension.</p>
        ) : (
          <div className="yxp-stack">
            <p>You can extend once, by 14 days, to 15 Oct 2026. Billing still starts only when you mark a product live.</p>
            <FormField label="What do you need the time for?" required error={tried && !reason.trim() ? 'Tell us what you need the extra time for' : null}>
              <TextArea value={reason} onChange={setReason} rows={3} />
            </FormField>
          </div>
        )}
      </Dialog>
    </SettingsFrame>
  );
}

/* ================================================================== PLT-43 Trial read-only banner */

function ReadOnlyBody({ trialEnd }: { trialEnd: Date }) {
  const s = readOnlyStatus(trialEnd, TODAY);
  return (
    <>
      <PageBanner tone={s.daysLeft <= 5 ? 'danger' : 'warning'} action={<Button size="sm">Switch on</Button>}>
        Your trial ended on {formatDate(trialEnd)}. The account is read-only; your data will be deleted on {formatDate(s.deletion)} ({s.daysLeft} days) unless you switch on.
      </PageBanner>
      <Card title="What still works">
        <ul className="yxp-plain">
          <li className="yxp-row">
            <Icon icon={CheckCircle2} /> View every record and report
          </li>
          <li className="yxp-row">
            <Icon icon={CheckCircle2} /> Full export of all data (Settings › Data export)
          </li>
          <li className="yxp-row">
            <Icon icon={XCircle} /> No payroll runs, tests sent, jobs published or messages to employees or candidates
          </li>
        </ul>
        <div className="yxp-row">
          <Button>Export all data</Button>
        </div>
      </Card>
    </>
  );
}

// PLT-43 desktop
export function TrialReadOnlyScreen({ trialEnd }: { trialEnd: Date }) {
  return (
    <DesktopFrame area="home" panelTitle="Home" panel={[{ items: [{ label: 'Home', active: true }, { label: 'Approvals' }, { label: 'Notifications' }] }]}>
      <ReadOnlyBody trialEnd={trialEnd} />
    </DesktopFrame>
  );
}

// PLT-43 phone
export function TrialReadOnlyPhone({ trialEnd }: { trialEnd: Date }) {
  return (
    <PhoneFrame tab="home" title="Home">
      <ReadOnlyBody trialEnd={trialEnd} />
    </PhoneFrame>
  );
}

/* ================================================================== PLT-50 What's new */

export interface NewsEntry {
  id: string;
  date: Date;
  product: string;
  title: string;
  body: string;
  roles: string[];
  unread?: boolean;
}

function Feed({ entries }: { entries: NewsEntry[] }) {
  if (!entries.length) return <EmptyState compact title="Nothing new for you yet." description="Updates for the products your company uses appear here." />;
  return (
    <ol className="yxp-feed" aria-label="What's new">
      {entries.map((e) => (
        <li key={e.id} data-unread={e.unread || undefined}>
          <span className="yxp-row">
            <Badge tone="neutral">{e.product}</Badge>
            <span className="yxp-muted">{formatDate(e.date)}</span>
            {e.unread && <Badge tone="info">New</Badge>}
          </span>
          <strong>{e.title}</strong>
          <span>{e.body}</span>
        </li>
      ))}
    </ol>
  );
}

// PLT-50 desktop (Help drawer)
export function WhatsNewDrawer({ entries, role }: { entries: NewsEntry[]; role: string }) {
  const mine = entries.filter((e) => e.roles.includes(role));
  return (
    <DesktopFrame area="home" panelTitle="Home" panel={[{ items: [{ label: 'Home', active: true }, { label: 'Approvals' }, { label: 'Notifications' }] }]}>
      <PageHeader title="Home" />
      <Drawer open onOpenChange={() => {}} title="Help" subtitle={`What's new · for ${role.toLowerCase()}s`} footer={<Button>Mark all read</Button>}>
        <Feed entries={mine} />
        <Link href="#">See all updates</Link>
      </Drawer>
    </DesktopFrame>
  );
}

// PLT-50 phone
export function WhatsNewSheet({ entries, role }: { entries: NewsEntry[]; role: string }) {
  return (
    <PhoneFrame tab="me" title="Help">
      <BottomSheet defaultOpen title="What's new">
        <Feed entries={entries.filter((e) => e.roles.includes(role))} />
      </BottomSheet>
    </PhoneFrame>
  );
}

/* ================================================================== PLT-51 Feature requests & betas */

export type RequestStatus = 'Under review' | 'Planned' | 'In progress' | 'Shipped' | 'Not planned';
export interface FeatureRequest {
  id: string;
  title: string;
  product: string;
  status: RequestStatus;
  votes: number;
  voted: boolean;
  raisedBy: string;
}
const REQ_TONE: Record<RequestStatus, BadgeTone> = { 'Under review': 'neutral', Planned: 'info', 'In progress': 'warning', Shipped: 'success', 'Not planned': 'neutral' };

export interface Beta {
  id: string;
  name: string;
  description: string;
  on: boolean;
}

// PLT-51
export function FeatureRequestsScreen({ requests, betas, isAdmin, defaultTab = 'requests', raiseOpen }: { requests: FeatureRequest[]; betas: Beta[]; isAdmin: boolean; defaultTab?: string; raiseOpen?: boolean }) {
  const [list, setList] = useState(requests);
  const [raise, setRaise] = useState(Boolean(raiseOpen));
  const vote = (id: string) => setList((l) => l.map((r) => (r.id === id && !r.voted ? { ...r, voted: true, votes: r.votes + 1 } : r)));
  const cols: TableColumn<FeatureRequest>[] = [
    { key: 'title', header: 'Request', value: (r) => r.title, render: (r) => <strong>{r.title}</strong> },
    { key: 'product', header: 'Product', value: (r) => r.product },
    { key: 'status', header: 'Status', type: 'status', value: (r) => r.status, statusTone: (v) => REQ_TONE[v as RequestStatus] },
    { key: 'votes', header: 'Votes', type: 'number', value: (r) => r.votes },
    { key: 'by', header: 'Raised by', type: 'person', value: (r) => r.raisedBy, person: (r) => ({ name: r.raisedBy }) },
  ];
  return (
    <SettingsFrame active="Plan & add-ons">
      <PageHeader title="Feature requests & betas" description="Tell us what you need and vote for others' ideas. One vote per person per request." actions={<Button variant="primary" onClick={() => setRaise(true)}>Raise a request</Button>} />
      <Tabs defaultValue={defaultTab}>
        <TabsList aria-label="Feature requests and betas">
          <TabsTrigger value="requests" count={list.length}>
            Requests
          </TabsTrigger>
          <TabsTrigger value="betas" count={betas.length}>
            Beta programmes
          </TabsTrigger>
        </TabsList>
        <TabsContent value="requests">
          <DataTable
            label="Feature requests"
            columns={cols}
            rows={list}
            getRowId={(r) => r.id}
            rowButtons={(r) => (
              <Button size="sm" icon={ThumbsUp} disabled={r.voted} aria-label={r.voted ? `You voted for ${r.title}` : `Vote for ${r.title}`} onClick={() => vote(r.id)}>
                {r.voted ? 'Voted' : 'Vote'}
              </Button>
            )}
            empty={<EmptyState title="No requests yet." description="Raise the first one; your team can vote on it." action={<Button variant="primary">Raise a request</Button>} />}
          />
        </TabsContent>
        <TabsContent value="betas">
          <div className="yxp-stack">
            {!isAdmin && <InlineAlert tone="info" title="Only your System Admin can join or leave a beta for the company." />}
            {betas.map((b) => (
              <Card key={b.id} title={b.name} actions={<Badge tone={b.on ? 'info' : 'neutral'}>{b.on ? 'Beta on' : 'Off'}</Badge>}>
                <p>{b.description}</p>
                <Switch label={`Use ${b.name} for the company`} defaultChecked={b.on} disabled={!isAdmin} description="Beta features are labelled in the product. You can switch this off any time." />
              </Card>
            ))}
          </div>
        </TabsContent>
      </Tabs>
      <Drawer
        open={raise}
        onOpenChange={setRaise}
        title="Raise a feature request"
        footer={
          <>
            <Button onClick={() => setRaise(false)}>Cancel</Button>
            <Button variant="primary">Raise request</Button>
          </>
        }
      >
        <div className="yxp-stack">
          <FormField label="What do you need?" required>
            <TextField defaultValue="Show comp-off expiry on the mobile balance card" />
          </FormField>
          <FormField label="Why does it matter?" helper="Say who it helps and what they do today instead.">
            <TextArea rows={4} />
          </FormField>
          <InlineAlert tone="info" title="Similar request found">
            “Comp-off expiry reminders” has 41 votes. <Link href="#">Vote for it instead</Link>
          </InlineAlert>
        </div>
      </Drawer>
    </SettingsFrame>
  );
}

/* ================================================================== PLT-52 Cancellation flow */

// PLT-52
export function CancellationFlow({ product, defaultStep = 'reason' }: { product: string; defaultStep?: string }) {
  const [reason, setReason] = useState('price');
  return (
    <SettingsFrame active="Plan & add-ons">
      <Stepper
        title={`Switch off ${product}`}
        defaultCurrent={defaultStep}
        finishLabel={`Switch off ${product}`}
        review={{ title: 'Confirm', description: 'Check what happens before you switch off.' }}
        steps={[
          {
            id: 'reason',
            title: 'Reason',
            description: 'Optional',
            summary: reason === 'price' ? 'Price is too high for us' : 'Other',
            content: (
              <div className="yxp-stack">
                <p>Tell us why. Answering is optional and doesn't change what happens next.</p>
                <RadioGroup
                  aria-label="Reason"
                  value={reason}
                  onChange={setReason}
                  options={[
                    { value: 'price', label: 'Price is too high for us' },
                    { value: 'missing', label: 'A feature we need is missing' },
                    { value: 'hard', label: 'Too hard to set up' },
                    { value: 'other-tool', label: 'Moving to another tool' },
                    { value: 'closing', label: 'Company closing or restructuring' },
                    { value: 'other', label: 'Something else' },
                  ]}
                />
                <FormField label="Anything else?" optional>
                  <TextArea rows={3} />
                </FormField>
              </div>
            ),
          },
          {
            id: 'offers',
            title: 'Before you go',
            description: 'Options, not required',
            content: (
              <div className="yxp-stack">
                <p className="yxp-muted">You can skip these and continue to switch off.</p>
                <div className="yxp-grid">
                  <section className="yxp-tile">
                    <h3 className="yxp-tile__title">Pause for up to 3 months</h3>
                    <p>No bill while paused. Your data and settings stay as they are.</p>
                    <div className="yxp-tile__foot">
                      <Button>Pause instead</Button>
                    </div>
                  </section>
                  <section className="yxp-tile">
                    <h3 className="yxp-tile__title">Keep fewer products</h3>
                    <p>Keep Core HR and Leave, switch off Performance. Saves ₹18,600 a month.</p>
                    <div className="yxp-tile__foot">
                      <Button>Change products</Button>
                    </div>
                  </section>
                  <section className="yxp-tile">
                    <h3 className="yxp-tile__title">Get partner help</h3>
                    <p>A certified implementation partner finishes set-up with you.</p>
                    <div className="yxp-tile__foot">
                      <Button>Find a partner</Button>
                    </div>
                  </section>
                </div>
              </div>
            ),
          },
          {
            id: 'confirm',
            title: 'What happens',
            summary: 'Switch off on 31 Oct 2026; export available until then.',
            content: (
              <DescriptionList
                items={[
                  { label: 'Switch-off date', value: 'End of billing month, 31 Oct 2026' },
                  { label: 'Your data', value: 'Read-only for 30 days, with full export, then deleted with a certificate' },
                  { label: 'Last invoice', value: `${formatINR(42800)} for October 2026` },
                  { label: 'Messages after deletion', value: 'Only if you agreed to marketing emails; unsubscribe any time' },
                ]}
              />
            ),
          },
        ]}
      />
    </SettingsFrame>
  );
}

// PLT-52 final confirmation
export function CancellationConfirm({ product }: { product: string }) {
  return (
    <SettingsFrame active="Plan & add-ons">
      <PageHeader title="Plan & add-ons" />
      <TypeToConfirmDialog
        defaultOpen
        title={`Switch off ${product}?`}
        consequence="From 31 Oct 2026 the product is read-only for 30 days, then deleted with a certificate. You can switch on again before deletion with no data loss."
        objectName={`SWITCH OFF ${product.toUpperCase()}`}
        confirmLabel={`Switch off ${product}`}
        onConfirm={() => {}}
      />
    </SettingsFrame>
  );
}

/* ================================================================== PLT-53 Referral */

const REF_TONE: Record<ReferralStatus, BadgeTone> = { earned: 'success', pending: 'warning', 'not-credited': 'neutral', reversed: 'danger' };
const REF_LABEL: Record<ReferralStatus, string> = { earned: 'Credit earned', pending: 'Pending first paid month', 'not-credited': 'Not credited', reversed: 'Reversed (refund)' };

// PLT-53
export function ReferralScreen({ referrals, code }: { referrals: (Referral & { id: string; signedUp: Date })[]; code: string }) {
  const earned = referrals.filter((r) => referralStatus(r) === 'earned').reduce((s, r) => s + r.creditAmount, 0);
  const pending = referrals.filter((r) => referralStatus(r) === 'pending').reduce((s, r) => s + r.creditAmount, 0);
  const cols: TableColumn<(typeof referrals)[number]>[] = [
    { key: 'company', header: 'Company', value: (r) => r.company, render: (r) => <strong>{r.company}</strong> },
    { key: 'signed', header: 'Signed up', type: 'date', value: (r) => r.signedUp },
    { key: 'status', header: 'Status', type: 'status', value: (r) => REF_LABEL[referralStatus(r)], statusTone: (_, r) => REF_TONE[referralStatus(r)] },
    { key: 'credit', header: 'Your credit', type: 'money', value: (r) => (referralStatus(r) === 'earned' || referralStatus(r) === 'pending' ? r.creditAmount : 0), total: 'sum' },
    { key: 'note', header: 'Note', value: (r) => (r.sameGroup ? 'Same group of companies: not credited' : r.selfReferral ? 'Self-referral: not credited' : '') },
  ];
  return (
    <SettingsFrame active="Referral">
      <PageHeader title="Refer a company" description="When a company you refer completes its first paid month, you both get one month of your own bill as credit." />
      <dl className="yxp-stats">
        <div className="yxp-stat">
          <dt>Credits earned</dt>
          <dd>{formatINR(earned)}</dd>
        </div>
        <div className="yxp-stat">
          <dt>Pending</dt>
          <dd>{formatINR(pending)}</dd>
        </div>
        <div className="yxp-stat">
          <dt>Companies referred</dt>
          <dd>{referrals.length}</dd>
        </div>
      </dl>
      <Card title="Your referral link">
        <div className="yxp-copy">
          <code>https://yukthix.com/r/{code}</code>
          <Button size="sm" icon={Copy}>
            Copy link
          </Button>
          <span className="yxp-muted">Code: {code}</span>
        </div>
        <p className="yxp-muted">Credits apply to your next invoices, expire 12 months after issue, and can't be paid out or transferred.</p>
      </Card>
      <DataTable
        label="Referred companies"
        columns={cols}
        rows={referrals}
        getRowId={(r) => r.id}
        empty={<EmptyState title="No referrals yet." description="Share your link with another company to start." action={<Button variant="primary" icon={Copy}>Copy link</Button>} />}
      />
    </SettingsFrame>
  );
}

/* ================================================================== PLT-54 Payout readiness */

type CheckState = 'ok' | 'warn' | 'blocked';
const CHECK_ICON: Record<CheckState, typeof Circle> = { ok: CheckCircle2, warn: Clock, blocked: AlertTriangle };

function Check({ state, title, children, action }: { state: CheckState; title: string; children: ReactNode; action?: ReactNode }) {
  return (
    <li className="yxp-check" data-state={state}>
      <span className="yxp-check__icon">
        <Icon icon={CHECK_ICON[state]} />
      </span>
      <div className="yxp-check__body">
        <span className="yxp-row">
          <strong>{title}</strong>
          <Badge tone={state === 'ok' ? 'success' : state === 'warn' ? 'warning' : 'danger'}>{state === 'ok' ? 'Ready' : state === 'warn' ? 'Needs attention' : 'Blocked'}</Badge>
        </span>
        <span>{children}</span>
        {action}
      </div>
    </li>
  );
}

// PLT-54
export function PayoutReadinessScreen({ checks, persona = 'SA' }: { checks: PayoutChecks; persona?: 'SA' | 'PA' }) {
  const r = payoutReadiness(checks);
  const [choice, setChoice] = useState('wait');
  return (
    <SettingsFrame active="Payout readiness">
      <PageHeader
        title="Go-live payout readiness"
        description="Your first payroll can run while the auto-debit mandate is pending. Salary is paid only when every payout check is ready."
        status={<Badge tone={r.ready ? 'success' : 'warning'}>{r.ready ? 'Ready to pay' : 'Not ready to pay'}</Badge>}
        facts="September 2026 payroll · 248 employees"
      />
      <Card title="Checklist">
        <ol className="yxp-plain">
          <Check
            state={checks.mandate === 'active' ? 'ok' : checks.graceRunUsed ? 'blocked' : 'warn'}
            title="Auto-debit mandate"
            action={checks.mandate !== 'active' && persona === 'SA' ? <span><Button size="sm">Check mandate status</Button></span> : undefined}
          >
            {checks.mandate === 'active'
              ? 'Active since 12 Sep 2026.'
              : checks.graceRunUsed
                ? 'Still pending and the one grace run is used. Payroll can’t run until the bank activates the mandate.'
                : 'Pending with the bank. You can run the first payroll now as your one grace run; pay that invoice by bank transfer.'}
          </Check>
          <Check state={checks.kyb === 'approved' ? 'ok' : checks.kyb === 'pending' ? 'warn' : 'blocked'} title="Payout partner KYB">
            {checks.kyb === 'approved' ? 'Approved on 18 Sep 2026.' : checks.kyb === 'pending' ? 'Under review. Usually 2 working days.' : 'Rejected: the board resolution is unsigned. Upload a signed copy.'}
          </Check>
          <Check state={checks.fundingAccount ? 'ok' : 'blocked'} title="Funding account">
            {checks.fundingAccount ? 'Virtual account KAVF 0042 1180 is set up.' : 'Set up the funding account before the first payout.'}
          </Check>
          <Check state={r.short === 0 ? 'ok' : 'blocked'} title="Balance check">
            Balance {formatINR(checks.balance)} · net pay {formatINR(checks.netPay)}
            {r.short > 0 ? ` · short by ${formatINR(r.short)}` : ''}
          </Check>
        </ol>
      </Card>
      {(r.payrollBlocked.length > 0 || r.payoutBlocked.length > 0) && (
        <InlineAlert tone="danger" title="Why salary can't be paid yet">
          <ul className="yxp-list">
            {[...r.payrollBlocked, ...r.payoutBlocked].map((x) => (
              <li key={x}>{x}</li>
            ))}
          </ul>
        </InlineAlert>
      )}
      {r.partialPossible && (
        <Card title="Balance is short">
          <RadioGroup
            aria-label="What to do"
            value={choice}
            onChange={setChoice}
            options={[
              { value: 'wait', label: 'Wait and fund the account', description: `Add ${formatINR(r.short)} and pay everyone together.` },
              { value: 'partial', label: 'Pay some people now', description: 'Choose who to pay. Unpaid lines stay open and are never marked paid.' },
            ]}
          />
          <div className="yxp-row">
            {choice === 'partial' ? (
              <ConfirmDialog trigger={<Button variant="primary">Choose people to pay</Button>} title="Pay part of September payroll?" consequence="You'll pick people next. Everyone else stays unpaid until you release the rest." confirmLabel="Choose people" onConfirm={() => {}} />
            ) : (
              <Button variant="primary">Show funding details</Button>
            )}
          </div>
        </Card>
      )}
      {r.ready && (
        <InlineAlert tone="success" title="Every check is ready">
          The payroll admin can release the bank file from Payments & files.
        </InlineAlert>
      )}
      {persona === 'PA' && (
        <p className="yxp-muted">
          <Icon icon={Lock} /> Mandate and KYB are managed by your System Admin.
        </p>
      )}
    </SettingsFrame>
  );
}
