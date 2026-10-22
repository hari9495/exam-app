// Shell, homes, settings home, access states and search (PLT-01, 02, 10, 18, 20, 21; APX-D §1.1 Home).
import { Fragment, useMemo, useState, type ReactNode } from 'react';
import {
  ArrowLeft, Bell, Bookmark, CalendarPlus, Megaphone, MessageCircleQuestionMark, Clock, CheckSquare, Download, Eye, EyeOff, FileText, House, FolderSearch, HelpCircle, IndianRupee, Lock, Receipt, Search, Settings as SettingsIcon, Ticket, UserRound, Users,
} from 'lucide-react';
import {
  AppShell, CommandPalette, ScopePicker, type ScopePeriod, PanelGroup, PanelLink, ProfileMenu, SidePanel, SideRail, TopBar, PageHeader, Card, type PaletteGroup, type RailItem,
} from '../../components/shell';
import { Monogram } from '../../components/brand';
import { NotificationCentre, useToast, type NotificationItem } from '../../components/notify';
import { Select } from '../../components/select';
import { Button, IconButton, Link } from '../../components/button';
import { Badge, PersonLabel, type BadgeTone } from '../../components/display';
import { EmptyState, InlineAlert } from '../../components/feedback';
import { DashboardGrid, NeedsActionList, type ActionItem, type DashboardWidget, type WidgetSize } from '../../components/dashboard';
import { LineChart, StatCard } from '../../components/charts';
import { Dialog } from '../../components/overlay';
import { Checkbox } from '../../components/choice';
import { FormField } from '../../components/field';
import { TextArea, TextField } from '../../components/inputs';
import { DatePicker } from '../../components/date';
import { Figure, Heading, Icon } from '../../components/foundations';
import { Meter } from '../../components/feedback';
import { QrCode } from '../portals/portals-kit';
import { formatDate, formatINR } from '../../lib/format';
import { DesktopFrame, PERIODS, PhoneFrame, SCREEN_RAIL, type PanelSection } from '../_kit/frames';
import { ENTITIES, HOLIDAYS_2026, HR_ADMIN, ME, PAYROLL_ADMIN, RECRUITER, TODAY } from '../_kit/data';
import { ClockCard } from '../time/time-kit';
import { GENERAL_SHIFT, NOW_MIN, TODAY_PUNCHES } from '../time/time-data';
import '../time/time.css';
import { ListPage, homePanel, parseQuery } from './platform-kit';
import { SETTINGS_GROUPS as SETTINGS_MAP } from '../settings/settings-groups';
import { SettingsHomeScreen as SettingsMapHome } from '../settings/settings-screens';
import { NOTIFICATIONS } from './platform-data';
import type { TableColumn } from '../../components/table';

export type Persona = 'employee' | 'manager' | 'hr' | 'finance' | 'recruiter' | 'admin';

/** Role-filtered rail (APX-D §1: a person sees only modules their grants reach). */
export function railFor(persona: Persona): RailItem[] {
  const ids: Record<Persona, string[]> = {
    employee: ['home', 'time', 'pay', 'performance', 'learning', 'helpdesk', 'engage'],
    manager: ['home', 'people', 'time', 'pay', 'performance', 'learning', 'helpdesk', 'engage', 'analytics'],
    hr: ['home', 'people', 'time', 'pay', 'compliance', 'hire', 'performance', 'learning', 'helpdesk', 'engage', 'analytics', 'settings'],
    finance: ['home', 'pay', 'compliance', 'projects', 'analytics', 'settings'],
    recruiter: ['home', 'hire', 'assess'],
    admin: SCREEN_RAIL.map((r) => r.id),
  };
  return SCREEN_RAIL.filter((r) => ids[persona].includes(r.id));
}

const toNotifItems = (list = NOTIFICATIONS): NotificationItem[] =>
  list.map((n) => ({ id: n.id, actor: { name: n.actor }, text: n.text, at: n.at, read: n.read, href: '#', approval: n.approvable ? { onApprove: () => {} } : undefined }));

/* ================================================================ PLT-01 App shell */

export { PERIODS };

export interface AppShellScreenProps {
  persona: Persona;
  /** 'all' = every entity the user may see (YX-ORG-13 default). */
  entity?: string;
  period?: string;
  bellOpen?: boolean;
  paletteOpen?: boolean;
  panelCollapsed?: boolean;
  navOpen?: boolean;
  panel?: PanelSection[];
  children?: ReactNode;
}

// PLT-01 · App shell: role sidebar, entity + period switcher, bell, global search box (Ctrl-K).
export function AppShellScreen({ persona, entity = 'all', period = '2026-09', bellOpen, paletteOpen, panelCollapsed, navOpen, panel, children }: AppShellScreenProps) {
  const [ent, setEnt] = useState<string | null>(entity);
  const [per, setPer] = useState<string | null>(period);
  const [palette, setPalette] = useState(Boolean(paletteOpen));
  const entities = [{ id: 'all', name: 'All entities (2)', gstin: '2 GSTINs', state: 'Karnataka, Tamil Nadu' }, ...ENTITIES];
  const sections = panel ?? homePanel('Home');
  return (
    <AppShell
      rail={<SideRail items={railFor(persona)} activeId="home" logo={<Monogram size="sm" />} />}
      panel={
        <SidePanel title="Home">
          {sections.map((s, i) => (
            <PanelGroup key={i} label={s.label}>
              {s.items.map((it) => (
                <PanelLink key={it.label} active={it.active} count={it.count}>
                  {it.label}
                </PanelLink>
              ))}
            </PanelGroup>
          ))}
        </SidePanel>
      }
      topBar={
        <TopBar
          onSearch={() => setPalette(true)}
          entity={
            persona === 'employee' || persona === 'manager' ? undefined : (
              <ScopePicker entities={entities} entity={ent} onEntityChange={setEnt} periods={PERIODS} period={per} onPeriodChange={setPer} />
            )
          }
          onAsk={() => {}}
          notifications={<NotificationCentre items={toNotifItems()} onMarkAllRead={() => {}} settingsHref="#notification-preferences" now={TODAY} defaultOpen={bellOpen} />}
          onHelp={() => {}}
          profile={<ProfileMenu name={ME.name} email={ME.email} />}
        />
      }
      defaultPanelCollapsed={panelCollapsed}
      defaultNavOpen={navOpen}
    >
      <div className="yx-screen">
        {children ?? <PageHeader title="Home" description="Your role home loads here. Use Ctrl K to search people, requests and actions." />}
      </div>
      <CommandPalette groups={paletteFor(persona)} onSelect={() => {}} open={palette} onOpenChange={setPalette} placeholder={PALETTE_PLACEHOLDER} onSearchAll={() => {}} onAsk={() => {}} onClearRecent={() => {}} />
    </AppShell>
  );
}

/* ================================================================ PLT-02 Role homes */

export interface HomeData {
  actions: ActionItem[];
  actionsTotal?: number;
}

function Bullets({ items }: { items: ReactNode[] }) {
  return (
    <ul className="yx-plt-list">
      {items.map((it, i) => (
        <li key={i}>{it}</li>
      ))}
    </ul>
  );
}

const stat = (id: string, title: string, content: ReactNode): DashboardWidget => ({ id, title, size: 3, bare: true, content });

// Finance home: what leaves the bank in the next 30 days, with challan / file status.
const MONEY_OUT: { date: string; what: string; amount: number; status: string; tone: 'warning' | 'success' | 'neutral'; action: string }[] = [
  { date: '30 Sep', what: 'September salaries', amount: 18240500, status: 'Waiting for your approval', tone: 'warning', action: 'Open run' },
  { date: '1 Oct', what: 'Expense claims payout · 23 claims', amount: 184250, status: 'File ready', tone: 'success', action: 'Release' },
  { date: '7 Oct', what: 'TDS on salaries', amount: 1482600, status: 'Challan ready', tone: 'success', action: 'Pay' },
  { date: '15 Oct', what: 'Provident Fund', amount: 2412100, status: 'Challan not generated', tone: 'neutral', action: 'Generate challan' },
  { date: '15 Oct', what: 'ESI', amount: 556300, status: 'Challan not generated', tone: 'neutral', action: 'Generate challan' },
  { date: '20 Oct', what: 'Professional tax, Karnataka', amount: 49800, status: 'Challan not generated', tone: 'neutral', action: 'Generate challan' },
];

// Who's off this week for the manager home (Mon 28 Sep to Fri 2 Oct).
const WEEK_OFF = [
  { day: 'Mon 28', who: 'Meera Krishnan (sick)' },
  { day: 'Tue 29 · today', who: 'Meera Krishnan (sick), Rahul Nair' },
  { day: 'Wed 30', who: 'Rahul Nair' },
  { day: 'Thu 1 Oct', who: 'Kavya Reddy, Vikram Rao · Arjun Mehta asked (pending)' },
  { day: 'Fri 2 Oct', who: 'Holiday: Gandhi Jayanti' },
];

/** "Hide amounts" on the finance home: a per-viewer convenience, so browser storage is fine. */
function readHideAmounts() {
  try {
    return window.localStorage.getItem('yx-hide-amounts') === '1';
  } catch {
    return false;
  }
}
function saveHideAmounts(v: boolean) {
  try {
    window.localStorage.setItem('yx-hide-amounts', v ? '1' : '0');
  } catch {
    /* not remembered in a private window */
  }
}

/** First login (new joiner, day 1): no history yet; onboarding tasks, people, first-week plan (founder review 30 Sep 2026). */
const FIRST_WEEK = [
  { what: 'Laptop and accounts set up', when: 'Done', done: true },
  { what: 'Collect ID card from reception', when: 'Done', done: true },
  { what: 'Induction with HR', when: 'Today, 11:00 am · Board room 2' },
  { what: 'Lunch with your buddy', when: 'Today, 1:00 pm' },
  { what: 'POSH awareness training (20 minutes)', when: 'By Fri 2 Oct' },
  { what: '1:1 with your manager', when: 'Thu 1 Oct, 3:00 pm' },
  { what: 'Team introduction', when: 'Thu 1 Oct, 4:00 pm' },
];

function firstRunWidgets(data: HomeData, loading: boolean): DashboardWidget[] {
  const done = FIRST_WEEK.filter((t) => t.done).length;
  return [
    {
      id: 'actions',
      title: 'Needs your action',
      size: 8,
      pinned: true,
      bare: true,
      content: <NeedsActionList title="Set up your pay and records" items={data.actions} viewAllHref="#my-tasks" today={TODAY} onReview={() => {}} loading={loading} />,
    },
    {
      id: 'clock',
      title: 'Attendance today',
      size: 4,
      pinned: true,
      content: <ClockCard variant="home" now={NOW_MIN} seconds={15} date={TODAY} shift={GENERAL_SHIFT} defaultState="not_in" defaultPunches={[]} />,
    },
    {
      id: 'firstWeek',
      title: 'Your first week',
      size: 8,
      content: (
        <div className="yx-plt-stack" data-gap="sm">
          <Meter label="First week done" value={done} max={FIRST_WEEK.length} valueText={`${done} of ${FIRST_WEEK.length} done`} />
          <ul className="yx-plt-list">
            {FIRST_WEEK.map((t) => (
              <li key={t.what}>
                <span className="yx-plt-list__main">
                  {t.what}
                  <span className="yx-plt-muted">{t.when}</span>
                </span>
                {t.done && <Badge tone="success">Done</Badge>}
              </li>
            ))}
          </ul>
        </div>
      ),
    },
    {
      id: 'people',
      title: 'Your people',
      size: 4,
      content: (
        <ul className="yx-plt-list">
          <li>
            <span className="yx-plt-list__main"><PersonLabel name="Karthik Subramanian" secondary="Your manager · Sales" /></span>
            <Button size="sm">Say hello</Button>
          </li>
          <li>
            <span className="yx-plt-list__main"><PersonLabel name="Meera Krishnan" secondary="Your buddy for the first 90 days" /></span>
            <Button size="sm">Say hello</Button>
          </li>
          <li>
            <span className="yx-plt-list__main"><PersonLabel name="Lakshmi Venkatesan" secondary="Your HR contact" /></span>
            <Button size="sm">Say hello</Button>
          </li>
        </ul>
      ),
    },
    stat('payday', 'First payday', <StatCard loading={loading} label="Your first payday" value={31} unit="Oct" drill={{ label: 'How pay works here', href: '#pay-help' }} />),
    stat('leave', 'Leave balance', <StatCard loading={loading} label="Earned leave" value={1.5} unit="days" drill={{ label: 'Grows 1.5 days a month', href: '#leave' }} />),
    stat('probation', 'Probation', <StatCard loading={loading} label="Probation ends" value={29} unit="Mar 2027" drill={{ label: 'What probation means', href: '#probation' }} />),
    stat('docs', 'Documents', <StatCard loading={loading} label="Documents uploaded" value={2} unit="of 5" drill={{ label: 'Upload the rest', href: '#documents' }} />),
    {
      id: 'app',
      title: 'Get the mobile app',
      size: 12,
      content: (
        <div className="yx-plt-app">
          <QrCode value="https://kaverifoods.yukthix.app/get" size={112} label="QR code to download the YukthiX app" />
          <div className="yx-plt-stack" data-gap="sm">
            <p>Clock in from your phone, apply for leave and see your payslips.</p>
            <p className="yx-plt-muted">Scan with your phone camera, or sign in on the app with your work email.</p>
          </div>
        </div>
      ),
    },
  ];
}

/** One line per widget for the Add widget list; "suggested" = fits the role (founder review 30 Sep 2026). */
const WIDGET_INFO: Record<string, { description: string; suggested?: boolean }> = {
  tasks: { description: 'Trainings, declarations and reviews you need to finish', suggested: true },
  news: { description: 'Company and office announcements' },
  coming: { description: 'Birthdays, work anniversaries and holidays' },
  today: { description: 'Who is in, on leave or not checked in, with Nudge', suggested: true },
  off: { description: 'Your team day by day this week, including pending leave', suggested: true },
  goals: { description: 'Your 1:1s, probation reviews and goals behind plan', suggested: true },
  due: { description: 'Attendance lock, probation and contract deadlines', suggested: true },
  moves: { description: 'Who joins and leaves this week, with IT and ID status', suggested: true },
  cycles: { description: 'Reviews, surveys and declaration windows that are open', suggested: true },
  moneyOut: { description: 'Salaries, claims and statutory payments due in 30 days', suggested: true },
  approval: { description: 'The payroll run waiting for your approval', suggested: true },
  trend: { description: 'Monthly payroll cost against budget' },
  interviewsToday: { description: 'The interviews you sit on today', suggested: true },
  myJobs: { description: 'Your open jobs with candidates at each stage', suggested: true },
};

/** Pay is private: hidden on every load, shown only on request (founder review 30 Sep 2026). */
/** The employee's own net pay (HR turned it on): hidden until they ask, and hidden again on every visit. */
export interface HomePay {
  /** "Net pay, September". */
  label: string;
  /** Null: no payslip yet. */
  value: number | null;
  previous?: number;
  previousLabel?: string;
  href: string;
}

const SAMPLE_PAY: HomePay = { label: 'Net pay, September', value: 86420, previous: 84900, previousLabel: 'August', href: '#payslip' };

function PayStat({ loading, pay = SAMPLE_PAY }: { loading: boolean; pay?: HomePay }) {
  const [shown, setShown] = useState(false);
  const toggle = (
    <Button size="sm" icon={shown ? EyeOff : Eye} aria-pressed={shown} onClick={() => setShown(!shown)}>
      {shown ? 'Hide amount' : 'Show amount'}
    </Button>
  );
  if (pay.value === null) return <StatCard loading={loading} label={pay.label} value={0} empty="No payslip yet." drill={{ label: 'View payslips', href: pay.href }} />;
  if (shown || loading)
    return (
      <div className="yx-plt-pay">
        <StatCard loading={loading} label={pay.label} value={pay.value} money previous={pay.previous} previousLabel={pay.previousLabel} drill={{ label: 'View payslip', href: pay.href }} />
        {!loading && toggle}
      </div>
    );
  return (
    <section className="yx-stat yx-plt-pay" aria-label={pay.label}>
      <span className="yx-stat__label">{pay.label}</span>
      <Figure size="md" className="yx-stat__figure"><span aria-hidden="true">₹ ••,•••</span><span className="yx-visually-hidden">Amount hidden</span></Figure>
      <Link className="yx-stat__drill" href={pay.href}>View payslip</Link>
      {toggle}
    </section>
  );
}

/** The recruiter part of the Home (founder decision 19 Oct 2026). A part is left out when the person has no access to it. */
export interface HiringHomeView {
  /** The person's own interviews today (as a panellist). */
  interviewsToday: { id: string; at: Date; candidate: string; job: string; href: string }[];
  interviewsHref: string;
  /** This week, counts only: no trends. */
  week?: { applied: number; interview: number; offers: number; hired: number };
  /** Open jobs the person created or is hiring manager for, with candidates per stage. */
  jobs?: { id: string; title: string; href: string; stages: { name: string; count: number }[] }[];
  jobsHref: string;
}

const HIRING_SAMPLE: HiringHomeView = {
  interviewsToday: [
    { id: 'i1', at: new Date(2026, 8, 29, 11, 0), candidate: 'Ananya Kulkarni', job: 'Quality Analyst', href: '#interview' },
    { id: 'i2', at: new Date(2026, 8, 29, 14, 30), candidate: 'Farhan Sheikh', job: 'Plant Engineer', href: '#interview' },
    { id: 'i3', at: new Date(2026, 8, 29, 16, 0), candidate: 'Priya Menon', job: 'Area Sales Manager', href: '#interview' },
  ],
  interviewsHref: '#interviews',
  week: { applied: 18, interview: 6, offers: 2, hired: 1 },
  jobs: [
    { id: 'j1', title: 'Quality Analyst · Hosur plant', href: '#job', stages: [{ name: 'Applied', count: 12 }, { name: 'Screened', count: 5 }, { name: 'Interview', count: 3 }, { name: 'Offer', count: 1 }, { name: 'Hired', count: 0 }] },
    { id: 'j2', title: 'Plant Engineer · Hosur plant', href: '#job', stages: [{ name: 'Applied', count: 7 }, { name: 'Screened', count: 2 }, { name: 'Interview', count: 2 }, { name: 'Offer', count: 0 }, { name: 'Hired', count: 1 }] },
    { id: 'j3', title: 'Area Sales Manager · Chennai', href: '#job', stages: [{ name: 'Applied', count: 4 }, { name: 'Screened', count: 1 }, { name: 'Interview', count: 1 }, { name: 'Offer', count: 1 }, { name: 'Hired', count: 0 }] },
  ],
  jobsHref: '#jobs',
};

const interviewTime = (d: Date) => d.toLocaleTimeString('en-IN', { hour: 'numeric', minute: '2-digit' });

/** Today's interviews, this week's counts and the open jobs; shared by the designed and the live recruiter Home. */
function hiringWidgets(h: HiringHomeView, loading: boolean): DashboardWidget[] {
  const week = h.week;
  return [
    {
      id: 'interviewsToday',
      title: 'Your interviews today',
      size: 4,
      actions: <Link href={h.interviewsHref}>All interviews</Link>,
      empty: h.interviewsToday.length ? undefined : 'No interviews for you today.',
      content: (
        <ul className="yx-plt-list">
          {h.interviewsToday.map((i) => (
            <li key={i.id} className="yx-plt-off">
              <span className="yx-plt-off__day">{interviewTime(i.at)}</span>
              <span className="yx-plt-list__main">
                <Link href={i.href}>{i.candidate}</Link>
                <span className="yx-plt-muted">{i.job}</span>
              </span>
            </li>
          ))}
        </ul>
      ),
    },
    ...(week
      ? [
          stat('applied', 'New applicants', <StatCard loading={loading} label="New applicants this week" value={week.applied} drill={{ label: 'View jobs', href: h.jobsHref }} />),
          stat('toInterview', 'Moved to interview', <StatCard loading={loading} label="Moved to interview this week" value={week.interview} drill={{ label: 'View interviews', href: h.interviewsHref }} />),
          stat('offersMade', 'Offers made', <StatCard loading={loading} label="Offers sent this week" value={week.offers} drill={{ label: 'View jobs', href: h.jobsHref }} />),
          stat('joined', 'Joined', <StatCard loading={loading} label="Hired this week" value={week.hired} drill={{ label: 'View jobs', href: h.jobsHref }} />),
        ]
      : []),
    ...(h.jobs
      ? [{
          id: 'myJobs',
          title: 'My open jobs',
          size: 12 as const,
          actions: <Link href={h.jobsHref}>All jobs</Link>,
          empty: h.jobs.length ? undefined : 'You have no open jobs.',
          content: (
            <ul className="yx-plt-list">
              {h.jobs.map((j) => {
                const total = j.stages.reduce((n, s) => n + s.count, 0);
                return (
                  <li key={j.id}>
                    <span className="yx-plt-list__main">
                      <Link href={j.href}>{j.title}</Link>
                      <span className="yx-plt-muted">{j.stages.map((s) => `${s.name} ${s.count}`).join(' · ') || 'No stages set up'}</span>
                    </span>
                    <Badge>{`${total} ${total === 1 ? 'candidate' : 'candidates'}`}</Badge>
                  </li>
                );
              })}
            </ul>
          ),
        }]
      : []),
  ];
}

function homeWidgets(persona: Exclude<Persona, 'admin'>, data: HomeData, loading: boolean, payOnHome: boolean, hideMoney = false): DashboardWidget[] {
  const actions: DashboardWidget = {
    id: 'actions',
    title: 'Needs your action',
    size: 12,
    pinned: true,
    bare: true,
    content: <NeedsActionList items={hideMoney ? data.actions.map((x) => ({ ...x, title: x.title.replace(/₹[\d,]+/g, '₹ ••••••') })) : data.actions} total={data.actionsTotal} viewAllHref="#approvals" today={TODAY} onApprove={() => {}} onReview={() => {}} loading={loading} />,
  };
  // Shared by everyone who is also an employee (founder review 30 Sep 2026).
  const clock: DashboardWidget = {
        id: 'clock',
        pinned: true,
        title: 'Attendance today',
        size: 4,
        content: <ClockCard variant="home" now={NOW_MIN} seconds={15} date={TODAY} shift={GENERAL_SHIFT} defaultState="working" defaultPunches={TODAY_PUNCHES} />,
      };
  const news: DashboardWidget = {
        id: 'news',
        title: 'Announcements',
        size: 4,
        content: (
          <Bullets
            items={[
              <span className="yx-plt-list__main">Chennai office canteen closed Sat 3 Oct for maintenance<span className="yx-plt-muted">HR team · 28 Sep</span></span>,
              <span className="yx-plt-list__main">Open enrolment for parents' health cover ends 15 Oct<span className="yx-plt-muted">Benefits team · 25 Sep</span></span>,
            ]}
          />
        ),
      };
  const coming: DashboardWidget = {
        id: 'coming',
        title: 'Coming up',
        size: 4,
        content: (
          <Bullets
            items={[
              <PersonLabel name="Arjun Mehta" secondary="Birthday today" />,
              <PersonLabel name="Kavya Reddy" secondary="3 years at Kaveri Foods on Thu 1 Oct" />,
              ...HOLIDAYS_2026.slice(0, 2).map((h) => <span className="yx-plt-list__main">{h.name}<span className="yx-plt-muted">Holiday · {formatDate(h.date)}</span></span>),
            ]}
          />
        ),
      };
  if (persona === 'recruiter') return [{ ...actions, size: 8 }, ...hiringWidgets(HIRING_SAMPLE, loading)];
  if (persona === 'employee')
    return [
      { ...actions, size: 8 },
      clock,
      stat('leave', 'Leave balance', <StatCard loading={loading} label="Earned leave left" value={9} unit="days" previous={12} previousLabel="1 Apr" drill={{ label: 'View balances', href: '#leave' }} />),
      stat('present', 'Days present', <StatCard loading={loading} label="Days present in September" value={19} previous={21} previousLabel="August" drill={{ label: 'View attendance', href: '#attendance' }} />),
      payOnHome
        ? stat('pay', 'Net pay', <PayStat loading={loading} />)
        : stat('late', 'Late marks', <StatCard loading={loading} label="Late marks this month" value={2} unit="of 3 free" previous={1} previousLabel="August" drill={{ label: 'View late marks', href: '#attendance' }} />),
      stat('requests', 'My requests', <StatCard loading={loading} label="Requests pending" value={2} previous={1} previousLabel="last week" drill={{ label: 'View 2 requests', href: '#my-requests' }} />),
      { id: 'tasks', title: 'My tasks', size: 4, content: <Bullets items={['Complete POSH refresher (20 minutes) by 30 Sep', 'Submit investment proofs by 15 Oct', 'Self-review for H1 opens 5 Oct']} /> },
      news,
      coming,
    ];
  if (persona === 'manager')
    return [
      { ...actions, size: 8 },
      clock,
      {
        id: 'today',
        title: 'Team today',
        size: 8,
        actions: <Link href="#today">View all 14</Link>,
        content: (
          <div className="yx-plt-stack">
            <p className="yx-plt-muted">11 in · 2 on leave · 1 not checked in · 0 late</p>
            <ul className="yx-plt-list">
              <li>
                <span className="yx-plt-list__main"><PersonLabel name="Sanjay Gupta" secondary="Not checked in · General shift started 9:30 am" /></span>
                <span className="yx-plt-row">
                  <Button size="sm" icon={Bell}>Nudge</Button>
                  <Button size="sm">Mark on duty</Button>
                </span>
              </li>
              <li><PersonLabel name="Meera Krishnan" secondary="Sick leave today" /></li>
              <li><PersonLabel name="Rahul Nair" secondary="Casual leave today and tomorrow" /></li>
            </ul>
          </div>
        ),
      },
      {
        id: 'off',
        title: "Who's off this week",
        size: 4,
        actions: <Link href="#leave-calendar">Team calendar</Link>,
        content: (
          <ul className="yx-plt-list">
            {WEEK_OFF.map((w) => (
              <li key={w.day} className="yx-plt-off">
                <span className="yx-plt-off__day">{w.day}</span>
                <span className="yx-plt-off__who">{w.who}</span>
              </li>
            ))}
          </ul>
        ),
      },
      stat('late', 'Late', <StatCard loading={loading} label="Late check-ins this week" value={3} previous={5} previousLabel="last week" drill={{ label: 'View late marks', href: '#muster' }} />),
      stat('goalsBehind', 'Goals behind plan', <StatCard loading={loading} label="Team goals behind plan" value={4} unit="of 14" previous={6} previousLabel="last month" drill={{ label: 'View team goals', href: '#goals' }} />),
      stat('reviews', 'Reviews', <StatCard loading={loading} label="H1 reviews to write" value={6} previous={0} previousLabel="last cycle start" drill={{ label: 'Open reviews', href: '#reviews' }} />),
      stat('probation', 'Probation', <StatCard loading={loading} label="Probation reviews due in October" value={1} previous={0} previousLabel="September" drill={{ label: 'View Kavya Reddy', href: '#probation' }} />),
      {
        id: 'goals',
        title: 'Goals and 1:1s',
        size: 4,
        content: (
          <Bullets
            items={[
              <Link href="#one-on-one">1:1 with Arjun Mehta · today 3:00 pm</Link>,
              <Link href="#probation">Probation review for Kavya Reddy · due 5 Oct</Link>,
              <Link href="#goals">4 team goals behind plan · review with owners</Link>,
            ]}
          />
        ),
      },
      news,
      coming,
    ];
  if (persona === 'hr')
    return [
      { ...actions, size: 8 },
      clock,
      stat('exceptions', 'Attendance exceptions', <StatCard loading={loading} label="Attendance exceptions" value={27} previous={41} previousLabel="August" drill={{ label: 'Resolve before lock', href: '#exceptions' }} />),
      stat('notReady', 'Not ready for payroll', <StatCard loading={loading} label="Not ready for payroll" value={12} previous={5} previousLabel="August" drill={{ label: 'See the 12 of 248', href: '#run-readiness' }} />),
      stat('cases', 'Open cases', <StatCard loading={loading} label="Open cases" value={9} previous={12} previousLabel="last week" drill={{ label: 'View helpdesk', href: '#tickets' }} />),
      stat('joins', 'Joining in October', <StatCard loading={loading} label="Joining in October" value={7} previous={4} previousLabel="September" drill={{ label: 'View onboarding', href: '#onboarding' }} />),
      {
        id: 'due',
        title: 'Due dates',
        size: 6,
        content: (
          <ul className="yx-plt-list">
            <li>
              <span className="yx-plt-list__main">
                Lock September attendance, Chennai office
                <span className="yx-plt-row"><Badge tone="warning">Due today</Badge><span className="yx-plt-muted">27 exceptions still open</span></span>
              </span>
              <Button size="sm" icon={Lock}>Lock attendance</Button>
            </li>
            <li><Link href="#probation">Probation confirmations · 3 due by 5 Oct</Link></li>
            <li><Link href="#contracts">Fixed-term contracts ending 31 Oct · 2 people</Link></li>
          </ul>
        ),
      },
      {
        id: 'moves',
        title: 'Joiners and leavers this week',
        size: 6,
        actions: <Link href="#onboarding">Onboarding board</Link>,
        content: (
          <ul className="yx-plt-list">
            <li>
              <span className="yx-plt-list__main"><PersonLabel name="Rohan Shetty" secondary="Joins Thu 1 Oct · Sales" /></span>
              <span className="yx-plt-row"><Badge tone="success">Laptop ready</Badge><Badge tone="success">ID card ready</Badge><Badge tone="warning">Email pending</Badge></span>
            </li>
            <li>
              <span className="yx-plt-list__main"><PersonLabel name="Imran Qureshi" secondary="Joins Thu 1 Oct · Hosur plant" /></span>
              <span className="yx-plt-row"><Badge tone="success">All ready</Badge></span>
            </li>
            <li>
              <span className="yx-plt-list__main"><PersonLabel name="Rahul Verma" secondary="Last day Wed 30 Sep · Finance" /></span>
              <span className="yx-plt-row"><Badge tone="warning">IT clearance pending</Badge></span>
            </li>
          </ul>
        ),
      },
      {
        id: 'cycles',
        title: 'Cycles',
        size: 4,
        content: (
          <Bullets
            items={[
              <Link href="#reviews">H1 reviews open 5 Oct · 212 eligible</Link>,
              <Link href="#pulse">Engagement pulse closes 2 Oct · 61% responded</Link>,
              <Link href="#proofs">Investment proof window closes 15 Oct</Link>,
            ]}
          />
        ),
      },
      { ...news, actions: <Button size="sm" icon={Megaphone}>New announcement</Button> },
      coming,
    ];
  // Finance. Every ₹ figure goes through m() so "Hide amounts" masks the whole page.
  const m = (v: number) => (hideMoney ? '₹ ••••••' : formatINR(v));
  const outTotal = MONEY_OUT.reduce((t, r) => t + r.amount, 0);
  return [
    { ...actions, size: 8 },
    clock,
    stat('topay', 'To pay', <StatCard loading={loading} masked={hideMoney} label="Claims approved, to pay" value={184250} money previous={162300} previousLabel="last month" drill={{ label: 'View 23 claims', href: '#to-pay' }} />),
    stat('net', 'Payroll net', <StatCard loading={loading} masked={hideMoney} label="September net payroll" value={18240500} money previous={17985200} previousLabel="last month" drill={{ label: 'Open run for approval', href: '#run' }} />),
    stat('pf', 'Statutory due', <StatCard loading={loading} masked={hideMoney} label="PF and ESI due 15 Oct" value={2968400} money previous={2931000} previousLabel="last month" drill={{ label: 'View challans', href: '#statutory' }} />),
    stat('tds', 'TDS', <StatCard loading={loading} masked={hideMoney} label="TDS to deposit by 7 Oct" value={1482600} money previous={1455000} previousLabel="last month" drill={{ label: 'View TDS', href: '#tds' }} />),
    {
      id: 'moneyOut',
      title: 'Money going out',
      size: 8,
      actions: <Link href="#payments">All payments</Link>,
      content: (
        <div className="yx-plt-stack" data-gap="sm">
          <p className="yx-plt-muted">
            <strong className="yx-plt-strong">{m(outTotal)}</strong> due in the next 30 days
          </p>
          <ul className="yx-plt-list">
            {MONEY_OUT.map((r) => (
              <li key={r.what} className="yx-plt-out">
                <span className="yx-plt-out__date">{r.date}</span>
                <span className="yx-plt-list__main">
                  {r.what}
                  <span className="yx-plt-row"><Badge tone={r.tone}>{r.status}</Badge></span>
                </span>
                <span className="yx-plt-out__amount">{m(r.amount)}</span>
                <Button size="sm">{r.action}</Button>
              </li>
            ))}
          </ul>
        </div>
      ),
    },
    {
      id: 'approval',
      title: 'Payroll approval',
      size: 4,
      content: (
        <div className="yx-plt-stack" data-gap="sm">
          <p>September run prepared by <strong className="yx-plt-strong">Anita Desai</strong>, payroll executive, on 28 Sep. You approve it; the person who prepares a run can never approve it.</p>
          <Link href="#variance">Variance vs August{hideMoney ? '' : ' +1.4%'} · 3 employees above 20% change</Link>
          <p className="yx-plt-muted">Releasing the bank file after approval asks you to sign in again.</p>
          <span><Button variant="primary">Open run for approval</Button></span>
        </div>
      ),
    },
    {
      id: 'trend',
      title: 'Payroll cost',
      size: 4,
      bare: true,
      content: hideMoney ? (
        <section className="yx-stat" aria-label="Payroll cost">
          <span className="yx-stat__label">Payroll cost, last 6 months</span>
          <p className="yx-plt-muted">Amounts are hidden. Select Show amounts to see the chart.</p>
        </section>
      ) : (
        <LineChart
          title="Payroll cost vs budget"
          description="Monthly cost to company, April to September"
          money
          xLabel="Month"
          height={180}
          yMin={20000000}
          categories={['Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep']}
          series={[
            { name: 'Cost', values: [20850000, 20910000, 21120000, 21300000, 21280000, 21560000] },
            { name: 'Budget', values: [21400000, 21400000, 21400000, 21400000, 21400000, 21400000] },
          ]}
        />
      ),
    },
    news,
    coming,
  ];
}

export interface RoleHomeScreenProps {
  persona: Exclude<Persona, 'admin'>;
  data: HomeData;
  loading?: boolean;
  editing?: boolean;
  /** First login: short tour prompt (APX-D §6.1). */
  firstRun?: boolean;
  /** Admin allowed this role to personalise their home (Settings › Directory & privacy › Home page). Off by default. */
  customisable?: boolean;
  /** HR turned on net pay for the employee home; it still shows hidden until asked. Off by default. */
  payOnHome?: boolean;
  /** Finance: start with every ₹ figure hidden (otherwise the viewer's last choice). */
  defaultHideAmounts?: boolean;
  /** Per-widget state for previews: e.g. { today: 'slow', goals: 'error' }. */
  widgetStates?: Record<string, 'loading' | 'slow' | 'error'>;
  /** Widgets the company layout leaves off (they can be added back in Edit home). */
  defaultHidden?: string[];
  /** The live app: real data, and only the widgets that have it (the sample widgets stay in stories). */
  live?: LiveHome;
}

/** Home in the live app (design audit step 1). Widgets without live data yet are left out, not faked. */
export interface LiveHome {
  /** First name for the greeting. */
  firstName: string;
  company: string;
  today: Date;
  approvalsHref: string;
  onApprove?: (item: ActionItem) => void;
  onReview?: (item: ActionItem) => void;
  /** The person's "Attendance today" card; left out for people with no attendance. */
  clock?: ReactNode;
  /** Count cards. previous: last period's number, only when it is on record. empty: nothing to count yet, in words. money: a rupee amount, masked by "Hide amounts". */
  stats?: { id: string; title: string; label: string; value: number; unit?: string; money?: boolean; previous?: number; previousLabel?: string; empty?: string; drill: { label: string; href: string } }[];
  /** Finance: the "Hide amounts" button; the page remembers the choice for the person. */
  amounts?: { hidden: boolean; onToggle: () => void };
  /** Finance: "Money going out" in the next 30 days, by date; an empty list says so, an absent one hides the widget. amount: unknown until calculated. */
  moneyOut?: { id: string; date: string; what: string; amount: number | null; status: string; tone: BadgeTone; action: string; href: string }[];
  /** Finance: "Payroll cost" against the payroll budget, month by month, oldest first; null = nothing on record that month. budgetHref: where the person sets the budget (only for those who may). */
  trend?: { months: { label: string; name: string; cost: number | null; budget: number | null }[]; budgetHref?: string };
  /** Finance: "Payroll approval", the run waiting for this person. changePct: net against last month, when on record. */
  approval?: { month: string; preparedBy: string; role?: string; on?: string; previousMonth?: string; changePct?: number; flagged: number; threshold: string; href: string };
  /** Manager: "Team today" (who is in, on leave, not checked in), with the people to look at. nudge: not checked in yet. */
  team?: { summary: string; total: number; href: string; rows: { id: string; name: string; secondary: string; nudge?: boolean; reminded?: boolean }[] };
  /** Nudge (Team today): reminds the person to check in. Rejects with a plain reason (already reminded today). */
  onNudge?: (row: { id: string; name: string }) => Promise<void>;
  /** Manager: "Who's off this week", day by day. */
  off?: { day: string; who: string }[];
  offHref?: string;
  /** Manager: "Goals and 1:1s": the next 1:1s, reviews and goals to look at. */
  goals?: { text: string; href: string }[];
  /** Employee: "My tasks": checklist tasks, feedback asked of them and their own review, each linked. */
  tasks?: { text: string; href: string }[];
  /** "Coming up": birthdays and work anniversaries in the person's circle, and the next holidays. */
  coming?: { id: string; kind: 'person' | 'holiday'; name: string; text: string }[];
  quickActions?: { label: string; href: string; kind: 'leave' | 'wfh' | 'payslip' }[];
  /** Employee: their own net pay, when HR shows pay on the employee home (in place of late marks, as designed). */
  pay?: HomePay;
  /** "Due dates" (HR): what must be done by when, e.g. locking last month's attendance or probation confirmations. */
  due?: { id: string; text: string; href: string; badge?: { label: string; tone: BadgeTone }; note?: string; action?: string }[];
  /** "Joiners and leavers this week"; an empty list says so, an absent one hides the widget. */
  moves?: { id: string; name: string; secondary: string; badges: { label: string; tone: BadgeTone }[] }[];
  movesHref?: string;
  /** People with a hiring key: today's interviews, this week and their open jobs. */
  hiring?: HiringHomeView;
}

/** Nudge on Team today (PLT-02): once sent it says so and stays done; a refusal says why in a toast. */
function NudgeButton({ name, reminded, onNudge }: { name: string; reminded?: boolean; onNudge: () => Promise<void> }) {
  const { toast } = useToast();
  const [state, setState] = useState<'idle' | 'busy' | 'done'>(reminded ? 'done' : 'idle');
  const send = async () => {
    setState('busy');
    try {
      await onNudge();
      setState('done');
      toast({ tone: 'success', title: `Reminder sent to ${name}`, description: 'They get a notification, and an email if they allow it.' });
    } catch (e) {
      setState('idle');
      toast({ tone: 'error', title: 'Reminder not sent', description: e instanceof Error ? e.message : 'Try again in a moment.' });
    }
  };
  return (
    <Button size="sm" icon={Bell} loading={state === 'busy'} disabled={state === 'done'} aria-label={state === 'done' ? `Reminded ${name}` : `Nudge ${name}`} onClick={() => void send()}>
      {state === 'done' ? 'Reminded' : 'Nudge'}
    </Button>
  );
}

const QUICK_ICON = { leave: CalendarPlus, wfh: House, payslip: Download };
const partOfDay = (d: Date) => (d.getHours() < 12 ? 'morning' : d.getHours() < 17 ? 'afternoon' : 'evening');

/** Widths that fill each row: n cards share it evenly (live data decides how many cards there are). */
const SHARE: Record<number, WidgetSize> = { 1: 12, 2: 6, 3: 4 };
const fill = (ws: DashboardWidget[], many: WidgetSize = 3) => ws.map((w) => ({ ...w, size: SHARE[ws.length] ?? many }));

/** A round axis floor below the lowest amount, so the months' differences show (the design starts at ₹2 crore). */
const axisFloor = (values: number[]) => {
  const low = Math.min(...values) * 0.97;
  if (!Number.isFinite(low) || low <= 0) return 0;
  const step = 10 ** (Math.floor(Math.log10(low)) - 1);
  return Math.floor(low / step) * step;
};

/** "Payroll cost" (PLT-02 finance): cost to company against the payroll budget; hidden with the amounts; worded when no budget is set. */
function costTrend(t: NonNullable<LiveHome['trend']>, hide: boolean): DashboardWidget {
  const span = t.months.length ? `${t.months[0].name} to ${t.months[t.months.length - 1].name}` : '';
  const values = t.months.flatMap((m) => [m.cost, m.budget]).filter((v): v is number => v !== null);
  const noBudget = t.months.every((m) => m.budget === null);
  const content = hide ? (
    <section className="yx-stat" aria-label="Payroll cost">
      <span className="yx-stat__label">Payroll cost, last {t.months.length} months</span>
      <p className="yx-plt-muted">Amounts are hidden. Select Show amounts to see the chart.</p>
    </section>
  ) : noBudget ? (
    <section className="yx-stat" aria-label="Payroll cost">
      <span className="yx-stat__label">Payroll cost vs budget</span>
      <p className="yx-plt-muted">No payroll budget set yet, so there is nothing to compare the cost with.</p>
      {t.budgetHref && <Link className="yx-stat__drill" href={t.budgetHref}>Set the budget</Link>}
    </section>
  ) : (
    <LineChart
      title="Payroll cost vs budget"
      description={`Monthly cost to company, ${span}`}
      money
      xLabel="Month"
      height={180}
      yMin={axisFloor(values)}
      categories={t.months.map((m) => m.label)}
      series={[
        { name: 'Cost', values: t.months.map((m) => m.cost) },
        { name: 'Budget', values: t.months.map((m) => m.budget) },
      ]}
    />
  );
  return { id: 'trend', title: 'Payroll cost', size: 4, bare: true, content };
}

const HIDDEN = '₹ ••••••';
const hideRupees = (t: string) => t.replace(/₹[\d,]+(\.\d+)?/g, HIDDEN);

function LiveHomeBody({ persona, data, loading, live }: { persona: RoleHomeScreenProps['persona']; data: HomeData; loading: boolean; live: LiveHome }) {
  // Every ₹ figure goes through m() (and titles through hideRupees) so "Hide amounts" masks the whole page.
  const hide = Boolean(live.amounts?.hidden);
  const m = (v: number) => (hide ? HIDDEN : formatINR(v));
  const outTotal = (live.moneyOut ?? []).reduce((t, r) => t + (r.amount ?? 0), 0);
  const hiring = live.hiring ? hiringWidgets(live.hiring, loading) : [];
  // Without a clock, today's interviews sit beside Needs your action (the recruiter home); otherwise they join the
  // small cards at the end.
  const besideActions = live.clock ? [] : hiring.filter((w) => w.id === 'interviewsToday');
  const laterHiring = hiring.filter((w) => !besideActions.includes(w) && w.id !== 'interviewsToday');
  const pair = (ws: DashboardWidget[]) => (ws.length === 1 ? [{ ...ws[0], size: 12 as const }] : ws);
  const widgets: DashboardWidget[] = [
    {
      id: 'actions',
      title: 'Needs your action',
      size: live.clock || besideActions.length ? 8 : 12,
      pinned: true,
      bare: true,
      content: <NeedsActionList items={hide ? data.actions.map((x) => ({ ...x, title: hideRupees(x.title) })) : data.actions} total={data.actionsTotal} viewAllHref={live.approvalsHref} today={live.today} onApprove={live.onApprove} onReview={live.onReview} loading={loading} />,
    },
    ...(live.clock ? [{ id: 'clock', pinned: true, title: 'Attendance today', size: 4 as const, content: live.clock }] : []),
    ...besideActions,
    ...pair([
    ...(live.team
      ? [{
          id: 'today',
          title: 'Team today',
          size: 8 as const,
          actions: <Link href={live.team.href}>{`View all ${live.team.total}`}</Link>,
          content: (
            <div className="yx-plt-stack">
              <p className="yx-plt-muted">{live.team.summary}</p>
              {live.team.rows.length > 0 && (
                <ul className="yx-plt-list">
                  {live.team.rows.map((r) => (
                    <li key={r.id}>
                      {r.nudge && live.onNudge ? (
                        <>
                          <span className="yx-plt-list__main"><PersonLabel name={r.name} secondary={r.secondary} /></span>
                          <NudgeButton name={r.name} reminded={r.reminded} onNudge={() => live.onNudge!(r)} />
                        </>
                      ) : (
                        <PersonLabel name={r.name} secondary={r.secondary} />
                      )}
                    </li>
                  ))}
                </ul>
              )}
            </div>
          ),
        }]
      : []),
    ...(live.off
      ? [{
          id: 'off',
          title: "Who's off this week",
          size: 4 as const,
          actions: live.offHref ? <Link href={live.offHref}>Team calendar</Link> : undefined,
          empty: live.off.length ? undefined : 'No one in your team is off this week.',
          content: (
            <ul className="yx-plt-list">
              {live.off.map((w) => (
                <li key={w.day} className="yx-plt-off">
                  <span className="yx-plt-off__day">{w.day}</span>
                  <span className="yx-plt-off__who">{w.who}</span>
                </li>
              ))}
            </ul>
          ),
        }]
      : []),
    ]),
    ...fill([
      ...(live.stats ?? []).map((x) =>
        x.id === 'late' && live.pay ? stat('pay', 'Net pay', <PayStat loading={loading} pay={live.pay} />) : stat(x.id, x.title, <StatCard loading={loading} label={x.label} value={x.value} unit={x.unit} money={x.money} masked={hide && x.money} previous={x.previous} previousLabel={x.previousLabel} empty={x.empty} drill={x.drill} />),
      ),
      ...(live.pay && !live.stats?.some((x) => x.id === 'late') ? [stat('pay', 'Net pay', <PayStat loading={loading} pay={live.pay} />)] : []),
    ]),
    ...pair([
    ...(live.moneyOut
      ? [{
          id: 'moneyOut',
          title: 'Money going out',
          size: 8 as const,
          content: live.moneyOut.length ? (
            <div className="yx-plt-stack" data-gap="sm">
              <p className="yx-plt-muted">
                <strong className="yx-plt-strong">{m(outTotal)}</strong> due in the next 30 days
              </p>
              <ul className="yx-plt-list">
                {live.moneyOut.map((r) => (
                  <li key={r.id} className="yx-plt-out">
                    <span className="yx-plt-out__date">{r.date}</span>
                    <span className="yx-plt-list__main">
                      {r.what}
                      <span className="yx-plt-row"><Badge tone={r.tone}>{r.status}</Badge></span>
                    </span>
                    <span className="yx-plt-out__amount">{r.amount === null ? '' : m(r.amount)}</span>
                    <Button size="sm" asChild>
                      <a href={r.href}>
                        <span className="yx-button__label">{r.action}</span>
                      </a>
                    </Button>
                  </li>
                ))}
              </ul>
            </div>
          ) : (
            <p className="yx-plt-muted">Nothing to pay in the next 30 days.</p>
          ),
        }]
      : []),
    ...(live.approval
      ? [{
          id: 'approval',
          title: 'Payroll approval',
          size: 4 as const,
          content: (
            <div className="yx-plt-stack" data-gap="sm">
              <p>
                {live.approval.month} run prepared by <strong className="yx-plt-strong">{live.approval.preparedBy}</strong>
                {live.approval.role ? `, ${live.approval.role.toLowerCase()},` : ''}
                {live.approval.on ? ` on ${live.approval.on}` : ''}. You approve it; the person who prepares a run can never approve it.
              </p>
              <Link href={live.approval.href}>
                {[
                  live.approval.previousMonth ? `Variance vs ${live.approval.previousMonth}${hide || live.approval.changePct === undefined ? '' : ` ${live.approval.changePct >= 0 ? '+' : '−'}${Math.abs(live.approval.changePct).toFixed(1)}%`}` : '',
                  `${live.approval.flagged} ${live.approval.flagged === 1 ? 'employee' : 'employees'} above ${live.approval.threshold}% change`,
                ].filter(Boolean).join(' · ')}
              </Link>
              <p className="yx-plt-muted">Releasing the bank file after approval asks you to sign in again.</p>
              <span>
                <Button variant="primary" asChild>
                  <a href={live.approval.href}>
                    <span className="yx-button__label">Open run for approval</span>
                  </a>
                </Button>
              </span>
            </div>
          ),
        }]
      : []),
    ...(live.due?.length
      ? [{
          id: 'due',
          title: 'Due dates',
          size: 6 as const,
          content: (
            <ul className="yx-plt-list">
              {live.due.map((d) => (
                <li key={d.id}>
                  {d.action ? (
                    <>
                      <span className="yx-plt-list__main">
                        {d.text}
                        {(d.badge || d.note) && (
                          <span className="yx-plt-row">
                            {d.badge && <Badge tone={d.badge.tone}>{d.badge.label}</Badge>}
                            {d.note && <span className="yx-plt-muted">{d.note}</span>}
                          </span>
                        )}
                      </span>
                      <Button size="sm" asChild>
                        <a href={d.href}>
                          <Icon icon={Lock} />
                          <span className="yx-button__label">{d.action}</span>
                        </a>
                      </Button>
                    </>
                  ) : (
                    <Link href={d.href}>{d.text}</Link>
                  )}
                </li>
              ))}
            </ul>
          ),
        }]
      : []),
    ...(live.moves
      ? [{
          id: 'moves',
          title: 'Joiners and leavers this week',
          size: 6 as const,
          actions: live.movesHref ? <Link href={live.movesHref}>Onboarding board</Link> : undefined,
          content: live.moves.length ? (
            <ul className="yx-plt-list">
              {live.moves.map((m) => (
                <li key={m.id}>
                  <span className="yx-plt-list__main"><PersonLabel name={m.name} secondary={m.secondary} /></span>
                  <span className="yx-plt-row">{m.badges.map((b) => <Badge key={b.label} tone={b.tone}>{b.label}</Badge>)}</span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="yx-plt-muted">No one joins or leaves this week.</p>
          ),
        }]
      : []),
    ]),
    ...fill([
    ...(live.trend ? [costTrend(live.trend, hide)] : []),
    ...(live.goals
      ? [{
          id: 'goals',
          title: 'Goals and 1:1s',
          size: 4 as const,
          empty: live.goals.length ? undefined : 'No 1:1s, reviews or goals to look at.',
          content: <Bullets items={live.goals.map((g) => <Link href={g.href}>{g.text}</Link>)} />,
        }]
      : []),
    ...(live.tasks
      ? [{
          id: 'tasks',
          title: 'My tasks',
          size: 4 as const,
          empty: live.tasks.length ? undefined : 'No tasks for you right now.',
          content: <Bullets items={live.tasks.map((t) => <Link href={t.href}>{t.text}</Link>)} />,
        }]
      : []),
    ...(live.coming
      ? [{
          id: 'coming',
          title: 'Coming up',
          size: 4 as const,
          empty: live.coming.length ? undefined : 'Nothing coming up this week.',
          content: (
            <Bullets
              items={live.coming.map((x) =>
                x.kind === 'person' ? <PersonLabel name={x.name} secondary={x.text} /> : <span className="yx-plt-list__main">{x.name}<span className="yx-plt-muted">{x.text}</span></span>,
              )}
            />
          ),
        }]
      : []),
    ...hiring.filter((w) => w.id === 'interviewsToday' && !besideActions.includes(w)),
    ], 4),
    ...laterHiring,
  ];
  const greeting = persona === 'hr' ? `Exceptions, runs and what is due across ${live.company}.` : GREETING[persona];
  return (
    <>
      <div className="yx-plt-row" data-justify="between">
        <div className="yx-plt-greet">
          <Heading level={1}>{`Good ${partOfDay(live.today)}, ${live.firstName}`}</Heading>
          <p className="yx-plt-muted">
            {formatDate(live.today)} · {greeting}
          </p>
        </div>
        {live.quickActions?.length || live.amounts ? (
          <div className="yx-plt-row" role="group" aria-label="Quick actions">
            {live.amounts && (
              <Button icon={hide ? Eye : EyeOff} aria-pressed={hide} onClick={live.amounts.onToggle}>
                {hide ? 'Show amounts' : 'Hide amounts'}
              </Button>
            )}
            {(live.quickActions ?? []).map((a) => (
              <Button key={a.href} asChild>
                <a href={a.href}>
                  <Icon icon={QUICK_ICON[a.kind]} />
                  <span className="yx-button__label">{a.label}</span>
                </a>
              </Button>
            ))}
          </div>
        ) : null}
      </div>
      {/* Controlled: live widgets arrive as their data loads, and the live home is not customisable. */}
      <DashboardGrid label="Your home" widgets={widgets} value={widgets.map((w) => w.id)} customisable={false} />
    </>
  );
}

const GREETING: Record<RoleHomeScreenProps['persona'], string> = {
  employee: 'Here is your day.',
  manager: 'Your team and what is waiting for you.',
  hr: 'Exceptions, runs and what is due across Kaveri Foods.',
  finance: 'Money to pay, payroll to approve and statutory dues.',
  recruiter: 'Your interviews, offers and the candidates waiting for you.',
};

// PLT-02 · Role homes (employee / manager / HR / finance). APX-D §1.1 Home.
export function RoleHomeScreen({ persona, data, loading = false, editing, firstRun, customisable = false, payOnHome = false, defaultHideAmounts, widgetStates, defaultHidden = [], live }: RoleHomeScreenProps) {
  const [hideMoney, setHideMoney] = useState(() => persona === 'finance' && (defaultHideAmounts ?? readHideAmounts()));
  const toggleHide = () => {
    setHideMoney(!hideMoney);
    saveHideAmounts(!hideMoney);
  };
  const newJoiner = firstRun && persona === 'employee';
  // Rule: the clock never waits. Clocking in is the one thing people must always be able to do, so the clock
  // widget is never put in a loading, slow or error state here (it works on its own, even offline).
  const widgets = (newJoiner ? firstRunWidgets(data, loading) : homeWidgets(persona, data, loading, payOnHome, hideMoney)).map((w) =>
    w.id === 'clock' || w.pinned ? w : { ...w, ...WIDGET_INFO[w.id], state: widgetStates?.[w.id] ?? (loading ? ('loading' as const) : undefined), onRetry: () => {} },
  );
  // A new joiner has nothing waiting yet, so the panel shows no counts.
  const panel = newJoiner ? homePanel('Home').map((sec) => ({ ...sec, items: sec.items.map((it) => ({ ...it, count: undefined })) })) : homePanel('Home');
  return (
    <DesktopFrame area="home" panelTitle="Home" panel={panel} railItems={railFor(persona)} user={persona === 'hr' ? HR_ADMIN : persona === 'finance' ? PAYROLL_ADMIN : persona === 'recruiter' ? RECRUITER : ME} scope={persona === 'hr' || persona === 'finance' ? 'full' : 'none'}>
      {live ? <LiveHomeBody persona={persona} data={data} loading={loading} live={live} /> : <>
      <div className="yx-plt-row" data-justify="between">
        <div className="yx-plt-greet">
          <Heading level={1}>{newJoiner ? 'Welcome to Kaveri Foods, Divya' : `Good morning, ${persona === 'hr' ? 'Lakshmi' : persona === 'finance' ? 'Suresh' : persona === 'recruiter' ? 'Neha' : 'Divya'}`}</Heading>
          <p className="yx-plt-muted">
            {formatDate(TODAY)} · {newJoiner ? 'Your first day. Here is what to do and who to meet.' : GREETING[persona]}
          </p>
        </div>
        {/* A recruiter often has no employee record, so no leave or payslip buttons. */}
        {persona !== 'recruiter' && (
          <div className="yx-plt-row" role="group" aria-label="Quick actions">
            {persona === 'finance' && (
              <Button icon={hideMoney ? Eye : EyeOff} aria-pressed={hideMoney} onClick={toggleHide}>
                {hideMoney ? 'Show amounts' : 'Hide amounts'}
              </Button>
            )}
            <Button icon={CalendarPlus}>Apply leave</Button>
            <Button icon={House}>Request work from home</Button>
            {!newJoiner && <Button icon={Download}>Download payslip</Button>}
          </div>
        )}
      </div>
      {firstRun && (
        <InlineAlert title="Take a 2-minute tour: 4 steps" actions={<><Button size="sm">Maybe later</Button><Button size="sm" variant="primary">Start tour</Button></>}>
          1. Clock in and out · 2. Your leave balance · 3. Raise a request · 4. Find your payslips. It stays in Help if you want it later.
        </InlineAlert>
      )}
      <DashboardGrid label="Your home" widgets={widgets} defaultValue={widgets.map((w) => w.id).filter((id) => !defaultHidden.includes(id))} defaultEditing={editing} customisable={Boolean(customisable || editing)} />
      </>}
    </DesktopFrame>
  );
}

/* ================================================================ PLT-10 Settings home */

// PLT-10 · Settings home: the one real settings home (founder review 30 Sep 2026), built from the 71-page settings map.
export function SettingsHomeScreen({ defaultQuery = '', setupNeeded = true }: { defaultQuery?: string; setupNeeded?: boolean }) {
  return <SettingsMapHome groups={SETTINGS_MAP} defaultQuery={defaultQuery} setupNeeded={setupNeeded} />;
}

/* ================================================================ PLT-18 Access denied / not found */

export type AccessKind = 'denied' | 'not-found' | 'not-enabled' | 'requested';

export interface AccessStateProps {
  kind: AccessKind;
  recordType?: string;
  /** The person who decides access (a name, not just a role). */
  ownerName?: string;
  ownerRole?: string;
  /** Opens the Request access dialog. */
  requestOpen?: boolean;
  isAdmin?: boolean;
}

/**
 * Private records never offer "Request access" (founder review 30 Sep 2026, pay privacy; APX-D §6.3): someone else's
 * payslip, salary, medical record or case shows Not found, so the page doesn't even confirm it exists.
 */
const PRIVATE_RECORDS = ['payslip', 'salary', 'medical record', 'case', 'disciplinary case'];

export function AccessStateBody({ kind: kindProp, recordType = 'employee record', ownerName = 'Lakshmi Venkatesan', ownerRole = 'HR Admin', requestOpen, isAdmin }: AccessStateProps) {
  const kind = (kindProp === 'denied' || kindProp === 'requested') && PRIVATE_RECORDS.includes(recordType) ? 'not-found' : kindProp;
  const [open, setOpen] = useState(Boolean(requestOpen));
  const [reason, setReason] = useState('');
  const [until, setUntil] = useState<Date | null>(new Date(2026, 9, 31));
  const [tried, setTried] = useState(false);
  const [sent, setSent] = useState(kind === 'requested');
  const [reported, setReported] = useState(false);
  const first = ownerName.split(' ')[0];

  if (kind === 'not-found')
    return (
      <div className="yx-plt-state">
        <Icon icon={FolderSearch} size="md" />
        <Heading level={1}>Not found</Heading>
        <p className="yx-plt-p">This page doesn't exist, or the link is out of date. Check the address or search for what you need.</p>
        <div className="yx-plt-row">
          <Button>Go to Home</Button>
          <Button variant="primary" icon={Search}>
            Search
          </Button>
        </div>
        {reported ? (
          <p className="yx-plt-muted" role="status">
            Thanks. We've told the YukthiX team about this link.
          </p>
        ) : (
          <Link
            href="#"
            onClick={(e) => {
              e.preventDefault();
              setReported(true);
            }}
          >
            Report a broken link
          </Link>
        )}
      </div>
    );
  if (kind === 'not-enabled')
    return (
      <div className="yx-plt-state">
        <Icon icon={Lock} size="md" />
        <Heading level={1}>{isAdmin ? 'Visitors is not enabled for your company' : "Visitors isn't turned on for your company"}</Heading>
        <p className="yx-plt-p">
          {isAdmin ? 'Visitor invites, badges and the visitor log are part of the Visitors add-on.' : 'Your admin can turn it on if your company needs it.'}
        </p>
        <div className="yx-plt-row">
          {isAdmin ? <Button variant="primary">Enable in Billing & Account</Button> : <Button>Go to Home</Button>}
        </div>
      </div>
    );
  return (
    <div className="yx-plt-state">
      <Icon icon={Lock} size="md" />
      <Heading level={1}>You don't have access to this {recordType}</Heading>
      <p className="yx-plt-p">
        Access is managed by <strong className="yx-plt-strong">{ownerName}</strong>, {ownerRole} at Kaveri Foods Pvt Ltd.
      </p>
      {sent ? (
        <InlineAlert
          tone="info"
          title={`You asked on 28 Sep · waiting for ${first}`}
          actions={
            <Button size="sm" onClick={() => setSent(false)}>
              Withdraw request
            </Button>
          }
        >
          Request AQ-26-00021. We'll tell you as soon as {first} decides.
        </InlineAlert>
      ) : (
        <div className="yx-plt-row">
          <Button>Go back</Button>
          <Button variant="primary" onClick={() => setOpen(true)}>
            Request access
          </Button>
        </div>
      )}
      <Dialog
        open={open}
        onOpenChange={setOpen}
        title="Request access"
        description={`${ownerName} (${ownerRole}) decides. If approved, access ends automatically on the date you choose.`}
        size="md"
        footer={
          <>
            <Button onClick={() => setOpen(false)}>Cancel</Button>
            <Button
              variant="primary"
              onClick={() => {
                setTried(true);
                if (reason.trim().length >= 10 && until) {
                  setOpen(false);
                  setSent(true);
                }
              }}
            >
              Send request
            </Button>
          </>
        }
      >
        <div className="yx-plt-stack">
          {/* Fixed text, not a field: the request covers exactly the page that was denied. */}
          <dl className="yx-plt-fact">
            <dt>What you're asking for</dt>
            <dd>View {recordType}: Ravi Shankar (KF-0412)</dd>
          </dl>
          <FormField label="Reason" required error={tried && reason.trim().length < 10 ? 'Say why you need access, in at least 10 characters.' : null}>
            <TextArea value={reason} onChange={setReason} rows={3} />
          </FormField>
          <FormField label="Access until" required helper="Access is removed on this date." error={tried && !until ? 'Choose an end date.' : null}>
            <DatePicker value={until} onChange={setUntil} min={TODAY} />
          </FormField>
        </div>
      </Dialog>
    </div>
  );
}

// PLT-18 · Access denied (with Request access) / not found / not enabled. Shown in the area that was opened; no company button.
export function AccessStateScreen(props: AccessStateProps) {
  const visitors = props.kind === 'not-enabled';
  return (
    <DesktopFrame
      area={visitors ? 'visitors' : 'people'}
      panelTitle={visitors ? 'Visitors' : 'People'}
      panel={
        visitors
          ? [{ items: [{ label: 'Today', active: true }, { label: 'Invites' }, { label: 'Visitor log' }] }]
          : [{ items: [{ label: 'Directory', active: true }, { label: 'Org chart' }, { label: 'Onboarding' }, { label: 'Changes' }, { label: 'Exits' }] }]
      }
      scope="none"
    >
      <AccessStateBody {...props} />
    </DesktopFrame>
  );
}

export function AccessStatePhone(props: AccessStateProps) {
  const notFound = props.kind === 'not-found' || PRIVATE_RECORDS.includes(props.recordType ?? '');
  return (
    <PhoneFrame tab="home" title={notFound ? 'Not found' : 'No access'}>
      <AccessStateBody {...props} />
    </PhoneFrame>
  );
}

/* ================================================================ PLT-20 Command palette */

export const PALETTE_PLACEHOLDER = 'Search, or type @ people, # reference, > action, ? help';

const pfx = (p: string, words: string[]) => words.map((w) => `${p}${w.toLowerCase()}`);

export const PALETTE_GROUPS: PaletteGroup[] = [
  {
    heading: 'Recent',
    recent: true,
    items: [
      { id: 'rc1', label: 'Arjun Mehta', secondary: 'KF-0231 · QA Engineer · Quality', icon: UserRound },
      { id: 'rc2', label: 'September payroll run', secondary: 'Pay › Payroll', icon: IndianRupee },
      { id: 'rc3', label: 'Muster', secondary: 'Time', icon: CheckSquare },
    ],
  },
  {
    heading: 'Actions',
    prefix: '>',
    items: [
      { id: 'ac1', label: 'Apply leave', secondary: 'Opens the request sheet', icon: CalendarPlus, shortcut: 'N L', keywords: ['leave', ...pfx('>', ['apply leave'])] },
      { id: 'ac2', label: 'Approve leave', secondary: 'Approvals › Leave · 2 waiting', icon: CheckSquare, keywords: pfx('>', ['approve leave']) },
      { id: 'ac3', label: 'New expense claim', secondary: 'Opens the request sheet', icon: Receipt, shortcut: 'N E', keywords: pfx('>', ['new expense claim']) },
    ],
  },
  {
    heading: 'People',
    prefix: '@',
    items: [
      { id: 'pp1', label: 'Arjun Mehta', secondary: 'KF-0231 · QA Engineer · Quality', icon: UserRound, keywords: ['KF-0231', 'arjun.m@kaverifoods.in', ...pfx('@', ['Arjun Mehta'])] },
      { id: 'pp2', label: 'Anjali Iyer', secondary: 'KF-0118 · Brand Manager · Sales', icon: UserRound, keywords: ['KF-0118', ...pfx('@', ['Anjali Iyer'])] },
      { id: 'pp3', label: 'Ananya Kulkarni', secondary: 'Candidate · Quality Analyst', icon: Users, keywords: pfx('@', ['Ananya Kulkarni']) },
    ],
  },
  {
    heading: 'Requests and tickets',
    prefix: '#',
    items: [
      { id: 'rq1', label: 'LV-26-01842', secondary: 'Casual leave · Arjun Mehta · Waiting', icon: FileText, keywords: pfx('#', ['LV-26-01842']) },
      { id: 'rq2', label: 'TKT-5521', secondary: 'Form 16 not received · Ticket · Open', icon: Ticket, keywords: pfx('#', ['TKT-5521']) },
    ],
  },
  {
    heading: 'Help and settings',
    prefix: '?',
    items: [
      { id: 'hs1', label: 'Leave types', secondary: 'Settings › 3.1 Time & Leave', icon: SettingsIcon, keywords: pfx('?', ['leave types']) },
      { id: 'hs2', label: 'How carry-forward works', secondary: 'Help', icon: HelpCircle, keywords: pfx('?', ['how carry-forward works', 'carry forward']) },
    ],
  },
];

/** Items only some roles may open (founder review 30 Sep 2026): payroll for HR / finance, candidates for HR and hiring managers. */
const PALETTE_ONLY: Record<string, Persona[]> = { rc2: ['hr', 'finance', 'admin'], pp3: ['hr', 'recruiter', 'admin'] };
/** The palette for one person: nothing they can't open is ever suggested. */
export const paletteFor = (persona: Persona): PaletteGroup[] =>
  PALETTE_GROUPS.map((g) => ({ ...g, items: g.items.filter((it) => !PALETTE_ONLY[it.id] || PALETTE_ONLY[it.id].includes(persona)) }));

// PLT-20 · Command palette (Ctrl-K / Cmd-K overlay: grouped records, actions, recent items, prefixes @ # > ?).
export function CommandPaletteScreen({ defaultSearch = '', persona = 'manager' }: { defaultSearch?: string; persona?: Persona }) {
  const q = parseQuery(defaultSearch);
  return (
    <AppShellScreen persona={persona}>
      <PageHeader title="Home" />
      <Card title="Search tips">
        <ul className="yx-plt-list">
          <li>
            <Badge>@</Badge> people and candidates
          </li>
          <li>
            <Badge>#</Badge> requests, tickets and cases by reference
          </li>
          <li>
            <Badge>&gt;</Badge> actions and screens
          </li>
          <li>
            <Badge>?</Badge> help and settings
          </li>
        </ul>
        {q.prefix && <p className="yx-plt-muted">Searching {q.prefix === '@' ? 'people' : q.prefix === '#' ? 'references' : q.prefix === '>' ? 'actions' : 'help and settings'} for “{q.term}”.</p>}
      </Card>
      <CommandPalette groups={paletteFor(persona)} onSelect={() => {}} defaultOpen defaultSearch={defaultSearch} placeholder={PALETTE_PLACEHOLDER} onSearchAll={() => {}} onAsk={() => {}} onClearRecent={() => {}} />
    </AppShellScreen>
  );
}

/* ================================================================ PLT-21 Search results page */

export interface SearchHit {
  id: string;
  source: 'People' | 'Requests' | 'Documents' | 'Tickets' | 'Policies' | 'Candidates' | 'Settings';
  title: string;
  subtitle: string;
  snippet?: string;
  entity: string;
  /** Left out by the live search, which has no dates yet: the column goes with it. */
  updated?: Date;
  /** Where the result opens (live app). */
  href?: string;
}

/** What each role may find (founder review 30 Sep 2026), the same rule as the command palette: a manager finds their
 * people, the requests they approve and policies, never someone's personal documents, tickets or candidates. */
const SEARCH_SOURCES: Record<Persona, SearchHit['source'][] | 'all'> = {
  employee: ['People', 'Requests', 'Policies'],
  manager: ['People', 'Requests', 'Policies'],
  finance: ['People', 'Requests', 'Policies', 'Documents'],
  recruiter: ['Candidates', 'Requests', 'Policies'],
  hr: 'all',
  admin: 'all',
};
export const searchableFor = (persona: Persona, hits: SearchHit[]) => {
  const allowed = SEARCH_SOURCES[persona];
  return allowed === 'all' ? hits : hits.filter((h) => allowed.includes(h.source));
};
/** A result is shown only when the searched word is visible in it: title, details or a snippet quoting the match
 * (founder review 30 Sep 2026). Nobody should wonder why something turned up. */
export const explainedHits = (hits: SearchHit[], query: string) => {
  const q = query.trim().toLowerCase();
  return q ? hits.filter((h) => [h.title, h.subtitle, h.snippet ?? ''].some((t) => t.toLowerCase().includes(q))) : hits;
};
/** "People · …", unless the subtitle already starts with the type ("Policies · v3", "Candidate · …"). */
const sourcePrefix = (h: SearchHit) => (h.subtitle.toLowerCase().startsWith(h.source.toLowerCase().replace(/s$/, '')) ? '' : `${h.source} · `);

/** Only people who can see more than one company get the entity column and "search all my companies". */
const multiEntity = (persona: Persona) => persona === 'hr' || persona === 'finance' || persona === 'admin';

/** The searched word in bold, so it's clear why a result matched. */
export function Highlight({ text, query }: { text: string; query: string }) {
  const q = query.trim();
  if (!q) return <>{text}</>;
  const parts = text.split(new RegExp(`(${q.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')})`, 'i'));
  return (
    <>
      {parts.map((p, i) =>
        p.toLowerCase() === q.toLowerCase() ? (
          <mark key={i} className="yx-mark">
            {p}
          </mark>
        ) : (
          <Fragment key={i}>{p}</Fragment>
        ),
      )}
    </>
  );
}

const searchColumns = (query: string, withEntity: boolean, withSource: boolean, withUpdated = true): TableColumn<SearchHit>[] => [
  {
    key: 'title',
    header: 'Result',
    value: (r) => r.title,
    render: (r) => (
      <span className="yx-plt-list__main">
        <span className="yx-plt-hit__title">
          <Highlight text={r.title} query={query} />
        </span>
        <span className="yx-plt-muted">
          {withSource ? sourcePrefix(r) : ''}
          <Highlight text={r.subtitle} query={query} />
        </span>
        {r.snippet && (
          <span className="yx-plt-muted">
            …<Highlight text={r.snippet} query={query} />…
          </span>
        )}
      </span>
    ),
  },
  ...(withEntity ? ([{ key: 'entity', header: 'Company', value: (r: SearchHit) => r.entity, width: 240 }] as TableColumn<SearchHit>[]) : []),
  ...(withUpdated ? ([{ key: 'updated', header: 'Updated', value: (r: SearchHit) => r.updated?.getTime() ?? 0, render: (r: SearchHit) => (r.updated ? formatDate(r.updated) : ''), width: 140 }] as TableColumn<SearchHit>[]) : []),
];

function SaveSearchDialog({ query, onClose }: { query: string; onClose: () => void }) {
  const [name, setName] = useState(`Results for “${query}”`);
  const [notify, setNotify] = useState(true);
  return (
    <Dialog
      open
      onOpenChange={(o) => !o && onClose()}
      title="Save this search"
      footer={
        <>
          <Button onClick={onClose}>Cancel</Button>
          <Button variant="primary" onClick={onClose}>
            Save search
          </Button>
        </>
      }
    >
      <div className="yx-plt-stack">
        <FormField label="Name">
          <TextField value={name} onChange={setName} />
        </FormField>
        <Checkbox label="Tell me when new results appear" checked={notify} onChange={setNotify} />
      </div>
    </Dialog>
  );
}

/** The live app (design audit step 2): the server already returns only what the person may open. Saving a search, the
 * date and company filters and Ask AI wait for their backend and are left out. */
export interface LiveSearchResults {
  onOpen: (hit: SearchHit) => void;
  onRetry?: () => void;
}

// PLT-21 · Search results page: tabs by type, only what you may open, the match in bold.
export function SearchResultsScreen({ query, hits, state = 'ready', persona = 'manager', live }: { query: string; hits: SearchHit[]; state?: 'ready' | 'loading' | 'error'; persona?: Persona; live?: LiveSearchResults }) {
  const mine = explainedHits(live ? hits : searchableFor(persona, hits), query);
  const [tab, setTab] = useState('all');
  const [saving, setSaving] = useState(false);
  const sources = [...new Set(mine.map((h) => h.source))];
  const rows = tab === 'all' ? mine : mine.filter((h) => h.source === tab);
  const many = !live && multiEntity(persona);
  const looksLikeCode = /^[a-z]{2,4}-?\d{3,}$/i.test(query.trim());
  return (
    <DesktopFrame area="home" panelTitle="Home" panel={homePanel('Search')} scope={many ? 'entity' : 'none'}>
      <ListPage
        title={`Results for “${query}”`}
        description="You only see results you're allowed to open."
        facts={`${mine.length} result${mine.length === 1 ? '' : 's'}`}
        actions={
          live ? undefined : (
            <Button icon={Bookmark} onClick={() => setSaving(true)}>
              Save search
            </Button>
          )
        }
        tabs={mine.length ? [{ id: 'all', label: 'All', count: mine.length }, ...sources.map((s) => ({ id: s, label: s, count: mine.filter((h) => h.source === s).length }))] : undefined}
        tab={tab}
        onTabChange={setTab}
        label="Search results"
        columns={searchColumns(query, many, tab === 'all', !live)}
        rows={rows}
        getRowId={(r) => r.id}
        onRowClick={live ? live.onOpen : () => {}}
        onRetry={live?.onRetry}
        filters={live ? [] : many ? [{ key: 'entity', label: 'Company', type: 'multi', options: ENTITIES.map((e) => ({ value: e.name, label: e.name })) }, { key: 'updated', label: 'Date', type: 'date' }] : [{ key: 'updated', label: 'Date', type: 'date' }]}
        defaultSearch=""
        searchPlaceholder="Refine within results"
        state={state}
        empty={
          <EmptyState
            title={looksLikeCode ? `No employee with code ${query.trim().toUpperCase()}.` : `No results for “${query}”.`}
            description={
              looksLikeCode
                ? `They may have left${many ? ', or be in a company you have not selected' : ', or be in a company you can’t see'}.`
                : 'Check the spelling, or try an employee code, request reference or a shorter name.'
            }
            action={
              live ? undefined : (
                <div className="yx-plt-row">
                  {many && <Button icon={Search}>Search all my companies</Button>}
                  <Button icon={MessageCircleQuestionMark}>Ask AI</Button>
                </div>
              )
            }
          />
        }
      />
      {saving && <SaveSearchDialog query={query} onClose={() => setSaving(false)} />}
    </DesktopFrame>
  );
}

/** Mobile full-screen search from Home (P17 §4.1). Founder review 30 Sep 2026: the same @ # > chips as the desk palette
 * (tapped, not typed), recent searches, and icons on suggestions. */
const MOBILE_SCOPES: { key: SearchHit['source'] | 'Actions'; label: string; sources: SearchHit['source'][] }[] = [
  { key: 'People', label: '@ People', sources: ['People', 'Candidates'] },
  { key: 'Requests', label: '# References', sources: ['Requests', 'Tickets'] },
  { key: 'Actions', label: '> Actions', sources: [] },
];
const MOBILE_SUGGESTED = [
  { label: 'Apply leave', icon: CalendarPlus },
  { label: 'New expense claim', icon: Receipt },
  { label: 'September payslip', icon: FileText },
];
const MOBILE_RECENT = ['Arjun Mehta', 'LV-26-01842', 'Form 16'];

export function MobileSearchScreen({ query, hits: allHits, persona = 'manager' }: { query: string; hits: SearchHit[]; persona?: Persona }) {
  const hits = searchableFor(persona, allHits);
  const [q, setQ] = useState(query);
  const [scope, setScope] = useState<string | null>(null);
  const [recent, setRecent] = useState(MOBILE_RECENT);
  const term = q.trim().toLowerCase();
  const sc = MOBILE_SCOPES.find((x) => x.key === scope);
  const shown = useMemo(
    () => explainedHits(hits, term).filter((h) => !sc || sc.sources.includes(h.source)),
    [hits, term, sc],
  );
  const actions = MOBILE_SUGGESTED.filter((a) => !term || a.label.toLowerCase().includes(term));
  return (
    <PhoneFrame tab="home" title="Search" hideTabs back={<IconButton icon={ArrowLeft} label="Back to Home" />}>
      <FormField label="Search" hideLabel>
        <TextField value={q} onChange={setQ} placeholder="Search people, requests, actions" autoFocus />
      </FormField>
      <div className="yx-plt-row" role="group" aria-label="Search in">
        {MOBILE_SCOPES.map((x) => (
          <Button key={x.key} size="sm" aria-pressed={scope === x.key} variant={scope === x.key ? 'review' : undefined} onClick={() => setScope(scope === x.key ? null : x.key)}>
            {x.label}
          </Button>
        ))}
      </div>
      {term === '' && !scope ? (
        <>
          {recent.length > 0 && (
            <Card title="Recent searches" actions={<Button size="sm" onClick={() => setRecent([])}>Clear</Button>}>
              <ul className="yx-plt-list">
                {recent.map((r) => (
                  <li key={r}>
                    <button type="button" className="yx-plt-myreq__row" onClick={() => setQ(r)}>
                      <Icon icon={Clock} />
                      <span className="yx-plt-list__main">{r}</span>
                    </button>
                  </li>
                ))}
              </ul>
            </Card>
          )}
          <Card title="Suggested for you">
            <ul className="yx-plt-list">
              {MOBILE_SUGGESTED.map((a) => (
                <li key={a.label}>
                  <button type="button" className="yx-plt-myreq__row">
                    <Icon icon={a.icon} />
                    <span className="yx-plt-list__main">{a.label}</span>
                  </button>
                </li>
              ))}
            </ul>
          </Card>
        </>
      ) : scope === 'Actions' ? (
        <ul className="yx-plt-list" aria-live="polite">
          {actions.map((a) => (
            <li key={a.label}>
              <button type="button" className="yx-plt-myreq__row">
                <Icon icon={a.icon} />
                <span className="yx-plt-list__main">{a.label}</span>
              </button>
            </li>
          ))}
        </ul>
      ) : shown.length ? (
        <ul className="yx-plt-list" aria-live="polite">
          {shown.map((h) => (
            <li key={h.id}>
              <Icon icon={h.source === 'People' || h.source === 'Candidates' ? UserRound : h.source === 'Tickets' ? Ticket : FileText} />
              <a href="#" className="yx-plt-list__main yx-plt-hit">
                <span className="yx-plt-hit__title">
                  <Highlight text={h.title} query={q} />
                </span>
                <span className="yx-plt-muted">
                  {sourcePrefix(h)}
                  <Highlight text={h.subtitle} query={q} />
                </span>
              </a>
            </li>
          ))}
        </ul>
      ) : (
        <EmptyState compact title={`No results for “${q.trim()}”.`} description="Try a name or request reference." action={<Button icon={MessageCircleQuestionMark}>Ask AI</Button>} />
      )}
    </PhoneFrame>
  );
}
