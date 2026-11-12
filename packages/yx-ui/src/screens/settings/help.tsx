// Help & onboarding UX patterns (APX-D §6, GAP H7): first-run tours, what's new, permission denied vs not found with
// Request access, availability states. The Help drawer is desk/help.tsx; irreversible actions are the kit's
// IrreversibleSheet; empty states are the kit's EmptyState (H-1, answers 941 and 945: never a second version).
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { Construction, FileQuestion, Lock, Wrench } from 'lucide-react';
import { Badge } from '../../components/display';
import { Button } from '../../components/button';
import { AccessRequestContext, EmptyState, ErrorState, InlineAlert, NoAccessState, Skeleton, type AccessRequestSent } from '../../components/feedback';
import { FormField } from '../../components/field';
import { Icon } from '../../components/foundations';
import { TextArea } from '../../components/inputs';
import { PageBanner } from '../../components/notify';
import { Select } from '../../components/select';
import { timeOf } from '../../lib/dates';
import { formatDate } from '../../lib/format';
import './settings.css';

/* ============================== 6.1 First-run tours ============================== */

export interface TourStep {
  title: string;
  body: string;
  /** The page part the step points at (its data-tour value); the floating card outlines it. */
  anchor?: string;
}
export interface TourDef {
  id: 'employee' | 'manager' | 'payroll' | 'admin';
  name: string;
  version: number;
  /** The event that starts it (never a date). */
  trigger: string;
  steps: TourStep[];
}

/**
 * Calm tours: at most 3 steps (the product rule is ≤ 5; we keep 3), skippable, resumable from Help. Answer 944 (H-5):
 * every step names only what works in the app today (the drawn set-up hub is not built yet); the versions are the API's
 * (apps/api/src/help/tours.service.ts TOUR_DEFS): raise both when the words change in a way people should see again.
 */
export const TOURS: TourDef[] = [
  {
    id: 'employee',
    name: 'Your first day in the app',
    version: 1,
    trigger: 'Your employee record is ready',
    steps: [
      { title: 'Clock in from Home', body: 'Use Clock in on Home when you start work, and Clock out when you leave.' },
      { title: 'Balances and requests', body: 'Leave balances are on Time › Leave. Every request you raise shows its status in Me › Requests.' },
      { title: 'Your payslip and language', body: 'Payslips are in Me › Payslips once payroll publishes them. Change your language any time in Me › Language.' },
    ],
  },
  {
    id: 'manager',
    name: 'Your first approval',
    version: 1,
    trigger: 'A request comes to you to approve',
    steps: [
      { title: 'Read the request', body: 'Each request shows who asked, what for and the details you need to decide.' },
      { title: 'Approve, reject or send back', body: 'Send back asks for a change without closing the request. You can also tick several and approve them together.' },
      { title: 'Going on leave?', body: 'Set a delegate in Me › Delegation so nothing waits for you.' },
    ],
  },
  {
    id: 'payroll',
    name: 'Your first payroll run',
    version: 1,
    trigger: 'Your company has a payroll run',
    steps: [
      { title: 'Readiness and variance', body: 'Fix readiness items first, then review people whose pay changed more than your variance threshold.' },
      { title: 'Approve and lock', body: 'A second person approves the run. After that, changes go to next month as arrears.' },
      { title: 'Bank file and publish', body: 'Release the bank file, then publish payslips. Both ask you to type a confirmation phrase.' },
    ],
  },
  {
    // Answer 1001: version 2 starts at the set-up hub (H-6), so admins who saw version 1 see it once more.
    id: 'admin',
    name: 'Set up your company',
    version: 2,
    trigger: 'You can change company settings',
    steps: [
      { title: 'Start at the set-up hub', body: 'Settings › Set-up hub shows how much of each area is set up, from what each area already knows.', anchor: 'setup-hub' },
      { title: 'Starter templates are yours to change', body: 'The hub counts the YukthiX starter templates still to review. The law is a floor; everything above it is your choice.', anchor: 'setup-starter' },
      { title: 'Open an area', body: 'Open an area to see what is left; each check opens its set-up page. Add your people in People › Import.', anchor: 'setup-modules' },
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

export interface TourCardProps {
  tour: TourDef;
  defaultStep?: number;
  onDone?: (status: 'completed' | 'skipped', step: number) => void;
  /** Answer 944: each step reached (progress is kept per person, so the tour resumes there). */
  onStep?: (step: number) => void;
  /** Answer 944: floating on the page (bottom right), focus moved into it, Esc dismisses (as Skip tour). */
  floating?: boolean;
}

/**
 * A tour step card. Never modal and never a focus trap: Tab leaves it like any other part of the page. Floating, it takes
 * focus when it appears and Esc dismisses it; it moves only when the person has not asked for reduced motion.
 */
export function TourCard({ tour, defaultStep = 0, onDone, onStep, floating }: TourCardProps) {
  const [step, setStep] = useState(Math.min(defaultStep, tour.steps.length - 1));
  const [closed, setClosed] = useState<null | 'completed' | 'skipped'>(null);
  const title = useRef<HTMLHeadingElement>(null);
  useEffect(() => {
    if (floating) title.current?.focus();
  }, [floating]);
  const s = tour.steps[step]!;
  const last = step === tour.steps.length - 1;
  // The step's page part is outlined while the step shows (and brought into view, without motion if asked).
  useEffect(() => {
    if (!floating || closed || !s.anchor) return;
    const el = document.querySelector<HTMLElement>(`[data-tour="${s.anchor}"]`);
    if (!el) return;
    el.setAttribute('data-tour-active', '');
    const still = typeof window.matchMedia === 'function' && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    el.scrollIntoView?.({ block: 'nearest', behavior: still ? 'auto' : 'smooth' });
    return () => el.removeAttribute('data-tour-active');
  }, [floating, closed, s.anchor]);
  if (closed && !floating)
    return (
      <p className="yx-m-muted" role="status">
        {closed === 'completed' ? 'Tour finished.' : 'Tour skipped.'} You can replay it from Help › Tours.
      </p>
    );
  if (closed) return null;
  const finish = (status: 'completed' | 'skipped') => {
    setClosed(status);
    onDone?.(status, step);
  };
  const go = (n: number) => {
    setStep(n);
    onStep?.(n);
    if (floating) title.current?.focus();
  };
  return (
    <div
      className={floating ? 'yx-tour yx-tour--floating' : 'yx-tour'}
      role="dialog"
      aria-modal="false"
      aria-labelledby={`tour-${tour.id}-t`}
      onKeyDown={(e) => {
        if (e.key === 'Escape' && floating) {
          e.stopPropagation();
          finish('skipped');
        }
      }}
    >
      <p className="yx-tour__progress">
        {tour.name} · {step + 1} of {tour.steps.length}
      </p>
      <h2 className="yx-tour__title" id={`tour-${tour.id}-t`} ref={title} tabIndex={floating ? -1 : undefined}>
        {s.title}
      </h2>
      <p className="yx-tour__body">{s.body}</p>
      <div className="yx-tour__foot">
        <Button size="sm" onClick={() => finish('skipped')}>
          Skip tour
        </Button>
        <div>
          {step > 0 && (
            <Button size="sm" onClick={() => go(step - 1)}>
              Back
            </Button>
          )}
          <Button size="sm" variant="primary" onClick={() => (last ? finish('completed') : go(step + 1))}>
            {last ? 'Finish' : 'Next'}
          </Button>
        </div>
      </div>
      {floating && <p className="yx-tour__hint">Esc closes the tour. Replay it any time from Help › Tours.</p>}
    </div>
  );
}

/** Answer 944: the person's tours as the API gives them (only the tours whose event has happened). */
export interface LiveTours {
  state: 'loading' | 'ready' | 'error';
  onRetry: () => void;
  tours: { id: TourDef['id']; status: 'in_progress' | 'completed' | 'skipped' | null; step: number }[];
  /** The person turned tours off for themselves (replay still works). */
  stopped: boolean;
  onStart: (id: TourDef['id'], step: number) => void;
  onStopped: (stopped: boolean) => Promise<unknown>;
}

/** Answer 944: the Help drawer's Tours tab (H-1 puts it in the tab): resume or replay each tour, stop or restart them. */
export function ToursPanel({ live }: { live: LiveTours }) {
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState<string | null>(null);
  if (live.state === 'error') return <ErrorState title="Tours could not load" description="Check your connection and try again." onRetry={live.onRetry} />;
  if (live.state === 'loading') return <Skeleton height={120} />;
  const mine = live.tours.flatMap((x) => {
    const t = TOURS.find((d) => d.id === x.id);
    return t ? [{ t, x }] : [];
  });
  const toggle = async () => {
    setBusy(true);
    setFailed(null);
    try {
      await live.onStopped(!live.stopped);
    } catch (e) {
      setFailed(e instanceof Error && e.message ? e.message : 'That did not go through. Try again.');
    } finally {
      setBusy(false);
    }
  };
  return (
    <div className="yx-help-tours">
      {failed && <InlineAlert tone="danger" title={failed} />}
      {mine.length === 0 ? (
        <EmptyState compact title="No tours for you yet." description="A tour appears when you first reach the part it explains." />
      ) : (
        <ul className="yx-news" aria-label="Tours">
          {mine.map(({ t, x }) => (
            <li key={t.id}>
              <span className="yx-news__meta">
                <Badge tone={x.status === 'completed' ? 'success' : x.status === 'in_progress' ? 'info' : 'neutral'}>
                  {x.status === 'completed' ? 'Done' : x.status === 'in_progress' ? `Stopped at step ${x.step + 1}` : x.status === 'skipped' ? 'Skipped' : 'Not started'}
                </Badge>
                {t.steps.length} steps · {t.trigger.toLowerCase()}
              </span>
              <p className="yx-news__title">{t.name}</p>
              <div>
                <Button size="sm" onClick={() => live.onStart(t.id, x.status === 'in_progress' ? x.step : 0)}>
                  {x.status === 'in_progress' ? 'Resume tour' : x.status ? 'Replay tour' : 'Start tour'}
                </Button>
              </div>
            </li>
          ))}
        </ul>
      )}
      <p className="yx-m-muted">
        {live.stopped ? 'Tours do not start by themselves for you.' : 'Each tour starts once by itself, the first time you reach its page.'}{' '}
        <Button size="sm" loading={busy} onClick={() => void toggle()}>
          {live.stopped ? 'Start tours again' : 'Stop tours'}
        </Button>
      </p>
    </div>
  );
}

/* ============================== 6.2 Tours (the Help drawer's Tours tab, H-5) ============================== */

// What's new is H-4's WhatsNewPanel (PLT-50, exported from desk); the drawn list is retired (answer 945).

// The Tours tab's content is ToursPanel (6.1 above, answer 944): one version.

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

/**
 * Answer 946: the drawn "Access denied" is the kit's NoAccessState with Request access, as every live page shows it when
 * the company takes access requests. Stories send nothing.
 */
export function AccessDeniedState({ recordType, ownerRole, defaultRequesting, sent: sentProp, maxDays = 30 }: AccessDeniedProps) {
  const [sent, setSent] = useState<AccessRequestSent | null>(sentProp ? { askedAt: '2026-11-11', state: 'waiting' } : null);
  return (
    <AccessRequestContext.Provider value={() => ({ maxDays, sent, startOpen: defaultRequesting, send: async () => setSent({ askedAt: '2026-11-11', state: 'waiting' }) })}>
      <NoAccessState what={`this ${recordType}`} grantedBy={`the ${ownerRole}`} />
    </AccessRequestContext.Provider>
  );
}

/** Answer 947: Not found, with the reference support can look up (never saying whether the record exists). */
export function NotFoundState({ reference, actions }: { reference?: string | null; actions?: ReactNode }) {
  return (
    <div className="yx-state" role="alert">
      <Icon icon={FileQuestion} size="md" />
      <h1 className="yx-state__title">Not found</h1>
      <p className="yx-state__text">This page or record doesn't exist, or the link is out of date. Check the link, or search for what you need.</p>
      <div className="yx-state__actions">{actions ?? <Button>Go to Home</Button>}</div>
      {reference && <span className="yx-state__ref">Reference {reference}</span>}
    </div>
  );
}

/* 6.4: irreversible actions are the kit's IrreversibleSheet; bulk approve is the Approvals inbox (answer 945). */

/* ============================== 6.5 Availability states ============================== */

export type Availability = 'maintenance' | 'degraded' | 'read-only' | 'wave' | 'not-enabled' | 'setup-needed';

/** Console C-8 (YX-10): the latest posted update of an open incident on one of the company's products. */
export interface CurrentIncident {
  title: string;
  severity: number;
  stage: string;
  impact: string;
  action: string;
  nextUpdateAt: string | null;
  /** Answer 1206: staff ticked the payroll-day note. */
  payrollNote?: boolean;
  updatedAt: string;
}

/** Founder answer 1206: the payroll-day note, word for word. */
export const PAYROLL_DAY_NOTE = 'Payroll is not affected: pay runs, payslips and bank files continue as normal.';

export function AvailabilityBanner({ kind, live, incident }: { kind: 'maintenance' | 'degraded' | 'read-only'; /** Answer 948 (C-5): the planned window, before or during it. */ live?: { phase: 'upcoming' | 'now'; title: string; startsAt: string; endsAt: string }; /** C-8 (YX-10): an open incident, with kind "degraded". */ incident?: CurrentIncident }) {
  if (kind === 'degraded' && incident)
    return (
      <PageBanner tone={incident.severity === 1 ? 'danger' : 'warning'}>
        <strong>{incident.title}</strong> ({incident.stage}): {incident.impact} {incident.action}
        {incident.payrollNote ? ` ${PAYROLL_DAY_NOTE}` : ''}
        {incident.nextUpdateAt ? ` Next update by ${timeOf(new Date(incident.nextUpdateAt))}.` : ''}
      </PageBanner>
    );
  if (kind === 'maintenance' && live) {
    const start = new Date(live.startsAt);
    const end = new Date(live.endsAt);
    return live.phase === 'now' ? (
      <PageBanner tone="warning">
        {live.title}: planned maintenance until {timeOf(end)}. Some pages may be slow; your saved work is safe.
      </PageBanner>
    ) : (
      <PageBanner tone="info">
        {live.title}: planned maintenance on {formatDate(start)}, {timeOf(start)} to {timeOf(end)}. Save your work before {timeOf(start)}.
      </PageBanner>
    );
  }
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

/* 6.6: empty states are the kit's EmptyState with each page's own words (answer 945). */
