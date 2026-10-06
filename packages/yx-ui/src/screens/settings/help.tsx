// Help & onboarding UX patterns (APX-D §6, GAP H7): first-run tours, contextual help drawer, what's new,
// permission denied vs not found with Request access, irreversible-action dialog, availability states, empty states.
import { useState, type ReactNode } from 'react';
import { ArrowUpRight, Construction, FileQuestion, KeyRound, Lock, PlayCircle, Wrench } from 'lucide-react';
import { Badge } from '../../components/display';
import { Button } from '../../components/button';
import { Checkbox } from '../../components/choice';
import { Dialog } from '../../components/overlay';
import { Drawer } from '../../components/drawer';
import { EmptyState, InlineAlert } from '../../components/feedback';
import { FormField } from '../../components/field';
import { Icon } from '../../components/foundations';
import { TextArea, TextField } from '../../components/inputs';
import { PageBanner } from '../../components/notify';
import { Select } from '../../components/select';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '../../components/shell';
import { formatDate } from '../../lib/format';
import './settings.css';

/* ============================== 6.1 First-run tours ============================== */

export interface TourStep {
  title: string;
  body: string;
}
export interface TourDef {
  id: 'employee' | 'manager' | 'payroll' | 'admin';
  name: string;
  version: number;
  /** The event that starts it (never a date). */
  trigger: string;
  steps: TourStep[];
}

/** Calm tours: at most 3 steps (the product rule is ≤ 5; we keep 3), skippable, resumable from Help. */
export const TOURS: TourDef[] = [
  {
    id: 'employee',
    name: 'Your first day in the app',
    version: 2,
    trigger: 'First sign-in',
    steps: [
      { title: 'Check in from Home', body: 'Tap Check in when you reach work. We only check your location at that moment.' },
      { title: 'Balances and requests', body: 'Leave balances are on Time. Every request you raise shows its status under Requests.' },
      { title: 'Your payslip and language', body: 'Payslips are on Pay the day they are published. Change the language any time in Me › Settings.' },
    ],
  },
  {
    id: 'manager',
    name: 'Your first approval',
    version: 1,
    trigger: 'First item in your approvals inbox',
    steps: [
      { title: 'Read the card', body: 'Each card shows the request, its effect on balances or cost, and what policy says.' },
      { title: 'Approve, reject or send back', body: 'Send back asks for a change without closing the request. Low-risk types can be approved in bulk.' },
      { title: 'Going on leave?', body: 'Set a delegate in Me › Delegation so nothing waits for you.' },
    ],
  },
  {
    id: 'payroll',
    name: 'Your first payroll run',
    version: 3,
    trigger: 'First payroll run created',
    steps: [
      { title: 'Readiness and variance', body: 'Fix readiness items first, then review people whose pay changed more than your variance threshold.' },
      { title: 'Approve and lock', body: 'A second approver locks the run. After that, changes go to next month as arrears.' },
      { title: 'Bank file and publish', body: 'Release the bank file, then publish payslips. Both ask you to type a confirmation phrase.' },
    ],
  },
  {
    id: 'admin',
    name: 'Set up your company',
    version: 1,
    trigger: 'First HR or System Admin sign-in',
    steps: [
      { title: 'Start at the set-up hub', body: 'Each product has a card with what is left before go-live.' },
      { title: 'Starter defaults are yours to change', body: 'Settings marked Starter default came from our template. The law is a floor; everything above it is your choice.' },
      { title: 'Invite your team', body: 'Import employees, then invite them. They sign in with a one-time code.' },
    ],
  },
];

export interface TourProgress {
  tourId: TourDef['id'];
  version: number;
  status: 'completed' | 'skipped' | 'in-progress';
  step?: number;
}

/** Shown once per user per tour version, only when its event has happened (APX-D §6.1). */
export function shouldShowTour(tour: TourDef, eventHappened: boolean, history: TourProgress[]): boolean {
  if (!eventHappened) return false;
  const seen = history.find((h) => h.tourId === tour.id && h.version === tour.version);
  return !seen || seen.status === 'in-progress';
}

export function TourCard({ tour, defaultStep = 0, onDone }: { tour: TourDef; defaultStep?: number; onDone?: (status: 'completed' | 'skipped', step: number) => void }) {
  const [step, setStep] = useState(Math.min(defaultStep, tour.steps.length - 1));
  const [closed, setClosed] = useState<null | 'completed' | 'skipped'>(null);
  const s = tour.steps[step];
  const last = step === tour.steps.length - 1;
  if (closed)
    return (
      <p className="yx-m-muted" role="status">
        {closed === 'completed' ? 'Tour finished.' : 'Tour skipped.'} You can replay it from Help › Tours.
      </p>
    );
  const finish = (status: 'completed' | 'skipped') => {
    setClosed(status);
    onDone?.(status, step);
  };
  return (
    <div className="yx-tour" role="dialog" aria-modal="false" aria-labelledby={`tour-${tour.id}-t`}>
      <p className="yx-tour__progress">
        {tour.name} · {step + 1} of {tour.steps.length}
      </p>
      <h2 className="yx-tour__title" id={`tour-${tour.id}-t`}>
        {s.title}
      </h2>
      <p className="yx-tour__body">{s.body}</p>
      <div className="yx-tour__foot">
        <Button size="sm" onClick={() => finish('skipped')}>
          Skip tour
        </Button>
        <div>
          {step > 0 && (
            <Button size="sm" onClick={() => setStep(step - 1)}>
              Back
            </Button>
          )}
          <Button size="sm" variant="primary" onClick={() => (last ? finish('completed') : setStep(step + 1))}>
            {last ? 'Finish' : 'Next'}
          </Button>
        </div>
      </div>
    </div>
  );
}

/* ============================== 6.2 Contextual help drawer ============================== */

export interface HelpTopic {
  screenId: string;
  title: string;
  summary: string;
  steps: string[];
  fields: { label: string; help: string }[];
  glossary: { term: string; meaning: string }[];
  setting?: { label: string; pageId: string; scope: string };
  rule?: string;
  article?: string;
  video?: string;
  companyNote?: { text: string; by: string };
}

export const APPLY_LEAVE_HELP: HelpTopic = {
  screenId: 'TIM-18',
  title: 'Apply leave',
  summary: 'Choose dates and a leave type. The summary shows how many days count and what is left before you send it.',
  steps: ['Pick the dates; use half days for mornings or afternoons.', 'Choose the leave type. Types you are not eligible for are hidden.', 'Check the summary, add a delegate if you manage people, and send.'],
  fields: [
    { label: 'Leave type', help: 'Only the types in your leave policy are shown.' },
    { label: 'Half day', help: 'First half ends at 1:30 pm on the General shift.' },
    { label: 'Delegate', help: 'Approvals that reach you while away go to this person.' },
  ],
  glossary: [
    { term: 'Unpaid leave (LWP)', meaning: 'Leave without pay. It reduces your salary for those days and shows as "taken", not as a balance.' },
    { term: 'Sandwich rule', meaning: 'Weekly offs between two leave days count as leave when your policy says so.' },
  ],
  setting: { label: 'Leave types', pageId: '3.6', scope: 'Inherited from Kaveri Foods Pvt Ltd' },
  rule: 'Casual leave needs 1 day notice and can be at most 3 days in a row.',
  article: 'How leave is counted at Kaveri Foods',
  video: 'Applying leave in 90 seconds',
  companyNote: { text: 'Plant staff: apply at least 3 days ahead so the roster can be covered.', by: 'Ravi Menon, Plant HR' },
};

export interface NewsItem {
  id: string;
  date: string;
  product: string;
  title: string;
  body: string;
  roles: string[];
}

export const NEWS: NewsItem[] = [
  { id: 'n1', date: '2026-09-24', product: 'Time', title: 'Fix a missed punch from the day card', body: 'Tap the red marker on any day to fix it; the effect on pay shows before you send.', roles: ['Employee', 'Manager'] },
  { id: 'n2', date: '2026-09-17', product: 'Pay', title: 'Why is my pay different?', body: 'Your payslip now explains each line that changed from last month.', roles: ['Employee'] },
  { id: 'n3', date: '2026-09-10', product: 'Settings', title: 'Search every setting', body: 'Type a task word such as "probation" to jump to the exact field.', roles: ['HR', 'System Admin'] },
  { id: 'n4', date: '2026-09-02', product: 'Performance', title: 'Suggested 1:1 agendas', body: 'Managers see agenda ideas from goals and recent feedback.', roles: ['Manager'] },
];

/** Entries targeted to the viewer's role and the products switched on (P20 YX-GRO-11). */
export function newsFor(items: NewsItem[], role: string, products: string[]): NewsItem[] {
  return items.filter((n) => n.roles.includes(role) && products.includes(n.product));
}

const iso = (s: string) => {
  const [y, m, d] = s.split('-').map(Number);
  return new Date(y, m - 1, d);
};

export function WhatsNewList({ items }: { items: NewsItem[] }) {
  if (!items.length) return <EmptyState compact title="Nothing new for you yet." description="Changes to the products you use appear here with each release." />;
  return (
    <ul className="yx-news">
      {items.map((n) => (
        <li key={n.id}>
          <span className="yx-news__meta">
            <Badge tone="neutral">{n.product}</Badge>
            {formatDate(iso(n.date))}
          </span>
          <p className="yx-news__title">{n.title}</p>
          <p className="yx-news__body">{n.body}</p>
        </li>
      ))}
    </ul>
  );
}

export interface HelpDrawerProps {
  topic: HelpTopic;
  open?: boolean;
  defaultTab?: 'page' | 'new' | 'tours';
  news?: NewsItem[];
  tourHistory?: TourProgress[];
  tours?: TourDef[];
  onOpenChange?: (o: boolean) => void;
}

/** The "?" help drawer (T1) / T3 right rail. Mobile uses the same content in a bottom sheet. */
export function HelpDrawer({ topic, open = true, defaultTab = 'page', news = NEWS, tourHistory = [], tours = TOURS, onOpenChange = () => {} }: HelpDrawerProps) {
  const [lang, setLang] = useState<string | null>('English');
  return (
    <Drawer open={open} onOpenChange={onOpenChange} title="Help" subtitle={`${topic.title} · ${topic.screenId}`}>
      <Tabs defaultValue={defaultTab}>
        <TabsList aria-label="Help sections">
          <TabsTrigger value="page">This page</TabsTrigger>
          <TabsTrigger value="new">What's new</TabsTrigger>
          <TabsTrigger value="tours">Tours</TabsTrigger>
        </TabsList>
        <TabsContent value="page">
          <HelpTopicBody topic={topic} lang={lang} setLang={setLang} />
        </TabsContent>
        <TabsContent value="new">
          <WhatsNewList items={news} />
        </TabsContent>
        <TabsContent value="tours">
          <ul className="yx-news">
            {tours.map((t) => {
              const h = tourHistory.find((x) => x.tourId === t.id);
              return (
                <li key={t.id}>
                  <span className="yx-news__meta">
                    <Badge tone={h?.status === 'completed' ? 'success' : h?.status === 'in-progress' ? 'info' : 'neutral'}>
                      {h?.status === 'completed' ? 'Done' : h?.status === 'in-progress' ? `Stopped at step ${(h.step ?? 0) + 1}` : h?.status === 'skipped' ? 'Skipped' : 'Not started'}
                    </Badge>
                    {t.steps.length} steps · starts on: {t.trigger.toLowerCase()}
                  </span>
                  <p className="yx-news__title">{t.name}</p>
                  <div>
                    <Button size="sm">{h?.status === 'in-progress' ? 'Resume tour' : 'Replay tour'}</Button>
                  </div>
                </li>
              );
            })}
          </ul>
        </TabsContent>
      </Tabs>
    </Drawer>
  );
}

export function HelpTopicBody({ topic, lang, setLang }: { topic: HelpTopic; lang: string | null; setLang: (v: string | null) => void }) {
  return (
    <div className="yx-help">
      <FormField label="Help language">
        <Select value={lang} onChange={setLang} options={['English', 'हिन्दी', 'தமிழ்', 'తెలుగు'].map((l) => ({ value: l, label: l }))} size="sm" />
      </FormField>
      <p>{topic.summary}</p>
      <div className="yx-help__block">
        <h3>How it works</h3>
        <ol className="yx-help__steps">
          {topic.steps.map((s) => (
            <li key={s}>{s}</li>
          ))}
        </ol>
      </div>
      <div className="yx-help__block">
        <h3>Fields</h3>
        <dl className="yx-help__glossary">
          {topic.fields.map((f) => (
            <div key={f.label}>
              <dt>{f.label}</dt>
              <dd>{f.help}</dd>
            </div>
          ))}
        </dl>
      </div>
      <div className="yx-help__block">
        <h3>Words used here</h3>
        <dl className="yx-help__glossary">
          {topic.glossary.map((g) => (
            <div key={g.term}>
              <dt>{g.term}</dt>
              <dd>{g.meaning}</dd>
            </div>
          ))}
        </dl>
      </div>
      {topic.rule && (
        <div className="yx-help__block">
          <h3>The rule for you</h3>
          <p>{topic.rule}</p>
        </div>
      )}
      {topic.companyNote && (
        <div className="yx-help__note">
          <p>
            <strong>Company note:</strong> {topic.companyNote.text}
          </p>
          <p className="yx-m-muted">{topic.companyNote.by}</p>
        </div>
      )}
      {topic.video && (
        <div className="yx-help__video" role="img" aria-label={`Video: ${topic.video}`}>
          <Icon icon={PlayCircle} size="md" /> {topic.video}
        </div>
      )}
      <div className="yx-state__actions">
        {topic.setting && (
          <Button size="sm" icon={ArrowUpRight}>
            {`Settings ${topic.setting.pageId} ${topic.setting.label}`}
          </Button>
        )}
        {topic.article && (
          <Button size="sm" icon={ArrowUpRight}>
            Read the article
          </Button>
        )}
      </div>
      {topic.setting && <p className="yx-m-muted">Setting source: {topic.setting.scope}</p>}
    </div>
  );
}

/* ============================== 6.3 Permission denied vs not found ============================== */

export type AccessVerdict = 'denied' | 'not-found' | 'not-enabled';

const RESTRICTED = ['POSH case', 'Disciplinary case', 'Grievance', 'Whistleblower report', 'Medical record'];

/** Restricted areas and missing records look identical: "Not found", never Request access (YX-SEC-10). */
export function accessVerdict(input: { exists: boolean; recordType: string; mayKnowExists: boolean; inPlan?: boolean }): AccessVerdict {
  if (input.inPlan === false) return 'not-enabled';
  if (!input.exists || RESTRICTED.includes(input.recordType) || !input.mayKnowExists) return 'not-found';
  return 'denied';
}

export interface AccessDeniedProps {
  recordType: string;
  ownerRole: string;
  /** Show the request form open. */
  defaultRequesting?: boolean;
  sent?: boolean;
  maxDays?: number;
}

export function AccessDeniedState({ recordType, ownerRole, defaultRequesting, sent: sentProp, maxDays = 30 }: AccessDeniedProps) {
  const [requesting, setRequesting] = useState(Boolean(defaultRequesting));
  const [reason, setReason] = useState('');
  const [days, setDays] = useState<string | null>('7');
  const [error, setError] = useState<string | null>(null);
  const [sent, setSent] = useState(Boolean(sentProp));
  const send = () => {
    if (reason.trim().length < 10) {
      setError('Say why you need access, in a sentence or more.');
      return;
    }
    setSent(true);
  };
  return (
    <div className="yx-state">
      <Icon icon={Lock} size="md" />
      <h1 className="yx-state__title">You don't have access to this {recordType}</h1>
      <p className="yx-state__text">It's managed by the {ownerRole}. You can ask for access; if they agree, it's given for a limited time.</p>
      {sent ? (
        <InlineAlert tone="success" title="Access requested">
          Your request went to the {ownerRole}, then the System Admin if they don't respond in 2 working days. You'll get a notification.
        </InlineAlert>
      ) : requesting ? (
        <>
          <FormField label="Why do you need access?" required error={error}>
            <TextArea value={reason} onChange={setReason} rows={3} />
          </FormField>
          <FormField label="For how long" helper={`Your role allows up to ${maxDays} days.`}>
            <Select value={days} onChange={setDays} options={['1', '7', '14', String(maxDays)].map((d) => ({ value: d, label: `${d} ${d === '1' ? 'day' : 'days'}` }))} />
          </FormField>
          <div className="yx-state__actions">
            <Button onClick={() => setRequesting(false)}>Cancel</Button>
            <Button variant="primary" onClick={send}>
              Send request
            </Button>
          </div>
        </>
      ) : (
        <div className="yx-state__actions">
          <Button>Go back</Button>
          <Button variant="primary" icon={KeyRound} onClick={() => setRequesting(true)}>
            Request access
          </Button>
        </div>
      )}
    </div>
  );
}

export function NotFoundState({ reference = 'NF-40412' }: { reference?: string }) {
  return (
    <div className="yx-state" role="alert">
      <Icon icon={FileQuestion} size="md" />
      <h1 className="yx-state__title">Not found</h1>
      <p className="yx-state__text">This page or record doesn't exist, or the link is out of date. Check the link, or search for what you need.</p>
      <div className="yx-state__actions">
        <Button>Go to Home</Button>
        <Button>Search</Button>
      </div>
      <span className="yx-state__ref">Reference {reference}</span>
    </div>
  );
}

/* ============================== 6.4 Irreversible-action dialog ============================== */

export interface ImpactFigure {
  label: string;
  value: string;
}
export interface IrreversibleActionProps {
  /** "Publish payslips for September 2026?" */
  title: string;
  whatHappens: string[];
  figures: ImpactFigure[];
  cannotUndo: string;
  correction: string;
  /** Typed phrase, e.g. "KAVERI SEP 2026". Case-sensitive. */
  phrase: string;
  confirmLabel: string;
  reasonRequired?: boolean;
  maker: string;
  checker: string;
  /** Maker and checker are the same person: blocked (YX-SEC-12). */
  sameAsMaker?: boolean;
  defaultTyped?: string;
  open?: boolean;
  onConfirm?: (audit: { phrase: string; reason: string; figures: ImpactFigure[] }) => void;
}

export function canConfirmIrreversible(p: { phrase: string; typed: string; reasonRequired?: boolean; reason: string; sameAsMaker?: boolean }) {
  return p.typed === p.phrase && (!p.reasonRequired || p.reason.trim().length > 0) && !p.sameAsMaker;
}

export function IrreversibleActionDialog(p: IrreversibleActionProps) {
  const [open, setOpen] = useState(p.open ?? true);
  const [typed, setTyped] = useState(p.defaultTyped ?? '');
  const [reason, setReason] = useState('');
  const ok = canConfirmIrreversible({ phrase: p.phrase, typed, reasonRequired: p.reasonRequired, reason, sameAsMaker: p.sameAsMaker });
  return (
    <Dialog
      open={open}
      onOpenChange={setOpen}
      destructive
      size="md"
      title={p.title}
      footer={
        <>
          <Button onClick={() => setOpen(false)}>Cancel</Button>
          <Button variant="danger" disabled={!ok} onClick={() => (p.onConfirm?.({ phrase: typed, reason, figures: p.figures }), setOpen(false))}>
            {p.confirmLabel}
          </Button>
        </>
      }
    >
      <div className="yx-irrev">
        <dl className="yx-impact">
          {p.figures.map((f) => (
            <div key={f.label}>
              <dt>{f.label}</dt>
              <dd>{f.value}</dd>
            </div>
          ))}
        </dl>
        <ul className="yx-irrev__list">
          {p.whatHappens.map((w) => (
            <li key={w}>{w}</li>
          ))}
        </ul>
        <InlineAlert tone="warning" title="You can't undo this">
          {p.cannotUndo} {p.correction}
        </InlineAlert>
        <div className="yx-maker">
          <span>Prepared by {p.maker}</span>
          <span>Approving: {p.checker}</span>
          {p.sameAsMaker ? <Badge tone="danger">Same person, not allowed</Badge> : <Badge tone="success">Maker and checker differ</Badge>}
        </div>
        {p.sameAsMaker && <InlineAlert tone="danger" title="Someone other than the preparer must approve this.">Ask another approver with this permission.</InlineAlert>}
        {p.reasonRequired && (
          <FormField label="Reason" required helper="Stored with the audit event.">
            <TextArea value={reason} onChange={setReason} rows={2} />
          </FormField>
        )}
        <FormField label={`Type ${p.phrase} to confirm`} helper="Must match exactly, including capitals. The phrase and these totals are stored with the audit event.">
          <TextField value={typed} onChange={setTyped} autoComplete="off" spellCheck={false} />
        </FormField>
      </div>
    </Dialog>
  );
}

/** Bulk approve: lighter count confirmation, low-risk types only (YX-MOB-03). */
export function BulkApproveConfirm({ count, type }: { count: number; type: string }) {
  const [open, setOpen] = useState(true);
  const [ack, setAck] = useState(false);
  return (
    <Dialog
      open={open}
      onOpenChange={setOpen}
      title={`Approve ${count} ${type}?`}
      description="Each person is told right away. You can still cancel an approved request from its record."
      footer={
        <>
          <Button onClick={() => setOpen(false)}>Cancel</Button>
          <Button variant="primary" disabled={!ack} onClick={() => setOpen(false)}>
            {`Approve ${count}`}
          </Button>
        </>
      }
    >
      <Checkbox checked={ack} onChange={setAck} label={`I checked the ${count} requests`} />
    </Dialog>
  );
}

/* ============================== 6.5 Availability states ============================== */

export type Availability = 'maintenance' | 'degraded' | 'read-only' | 'wave' | 'not-enabled' | 'setup-needed';

export function AvailabilityBanner({ kind }: { kind: 'maintenance' | 'degraded' | 'read-only' }) {
  if (kind === 'maintenance')
    return <PageBanner tone="warning" action={<Button size="sm">Status page</Button>}>Scheduled maintenance tonight, 11:00 pm to 1:00 am. Save your work before 11:00 pm.</PageBanner>;
  if (kind === 'degraded')
    return <PageBanner tone="warning" action={<Button size="sm">Status page</Button>}>Payslip downloads are slow right now. Everything else works. We'll update the status page every 30 minutes.</PageBanner>;
  return <PageBanner tone="info" action={<Button size="sm">Export my data</Button>}>Your account is read-only until 28 Oct 2026. You can view and export everything; changes are paused.</PageBanner>;
}

export function AvailabilityState({ kind, feature, wave, isAdmin = true, until }: { kind: Availability; feature: string; wave?: number; isAdmin?: boolean; until?: string }) {
  const body: Record<Availability, { icon: typeof Wrench; title: string; text: string; action?: ReactNode }> = {
    maintenance: { icon: Wrench, title: `${feature} is down for maintenance`, text: `Back by ${until ?? '1:00 am'}. Your saved work is safe.`, action: <Button>Status page</Button> },
    degraded: { icon: Construction, title: `${feature} is running slowly`, text: 'You can keep working; some pages may take longer to load.', action: <Button>Status page</Button> },
    'read-only': { icon: Lock, title: `${feature} is read-only`, text: 'You can view and export. Changes are paused while the account is read-only.', action: <Button>Export data</Button> },
    wave: { icon: Construction, title: `${feature} is coming in wave ${wave ?? 5}`, text: 'We are building this now. You will see it here when it is ready; nothing to set up yet.' },
    'not-enabled': {
      icon: Lock,
      title: `${feature} is not enabled for your company`,
      text: isAdmin ? 'Switch it on from Billing & Account to use it.' : 'Ask your System Admin if you need it.',
      action: isAdmin ? <Button variant="primary">Enable in Billing & Account</Button> : undefined,
    },
    'setup-needed': { icon: Wrench, title: `${feature} needs set-up`, text: 'It is switched on but a few settings are missing.', action: <Button variant="primary">Open set-up hub card</Button> },
  };
  const b = body[kind];
  return (
    <div className="yx-state" role="status">
      <Icon icon={b.icon} size="md" />
      <h1 className="yx-state__title">{b.title}</h1>
      <p className="yx-state__text">{b.text}</p>
      {b.action && <div className="yx-state__actions">{b.action}</div>}
    </div>
  );
}

/* ============================== 6.6 Empty states ============================== */

export type EmptyKind = 'first-use' | 'filtered' | 'not-due' | 'not-covered' | 'pending';

export function RoleEmptyState({ kind, role, sandbox }: { kind: EmptyKind; role: 'Employee' | 'Manager' | 'HR' | 'Payroll admin'; sandbox?: boolean }) {
  const [sample, setSample] = useState(false);
  const firstUse = {
    Employee: { title: 'You have no requests yet.', desc: 'Requests you raise, and ones raised for you, appear here with their status.', action: <Button variant="primary">New request</Button> },
    Manager: { title: 'Nothing is waiting for your approval.', desc: "Your team's leave, attendance and expense requests appear here when they need you.", action: <Button>Set a delegate</Button> },
    HR: { title: 'No leave types yet.', desc: 'Leave types decide what people can apply for and how balances build up.', action: <Button variant="primary">Add leave type</Button> },
    'Payroll admin': { title: 'No payroll runs yet.', desc: 'Create your first run once pay groups and salary templates are ready.', action: <Button variant="primary">Create payroll run</Button> },
  }[role];
  let content: ReactNode;
  if (kind === 'first-use') content = <EmptyState title={firstUse.title} description={firstUse.desc} action={firstUse.action} help={<Button icon={ArrowUpRight}>How it works</Button>} />;
  else if (kind === 'filtered') content = <EmptyState title="No results for these filters." description="Try fewer filters or a different date range." action={<Button>Clear filters</Button>} />;
  else if (kind === 'not-due') content = <EmptyState title="Not due yet." description="Tax proofs open on 1 Jan 2027. We'll remind you a week before." />;
  else if (kind === 'not-covered') content = <EmptyState title="Not covered by your policy." description="Earned wage access isn't part of the Hosur plant pay group. Ask HR if you think this is wrong." />;
  else content = <EmptyState title="Pending with Finance." description="Your August claims are approved and waiting for the next payout on 5 Oct 2026." />;
  return (
    <div className="yx-help">
      {sandbox && kind === 'first-use' && (
        <div className="yx-sample">
          <Checkbox checked={sample} onChange={setSample} label="Load sample data" description="Sandbox only. Sample records are labelled and removed in one action." />
          {sample && <Badge tone="info">42 sample records</Badge>}
        </div>
      )}
      {content}
    </div>
  );
}
