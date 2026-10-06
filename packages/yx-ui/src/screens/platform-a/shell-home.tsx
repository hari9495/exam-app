// Shell, homes, settings home, access states and search (PLT-01, 02, 10, 18, 20, 21; APX-D §1.1 Home).
import { Fragment, useMemo, useState, type ReactNode } from 'react';
import {
  ArrowLeft, Bell, Bookmark, CalendarPlus, Megaphone, MessageCircleQuestionMark, Clock, CheckSquare, Download, Eye, EyeOff, FileText, House, FolderSearch, HelpCircle, IndianRupee, Lock, Receipt, Search, Settings as SettingsIcon, Ticket, UserRound, Users,
} from 'lucide-react';
import {
  AppShell, CommandPalette, ScopePicker, type ScopePeriod, PanelGroup, PanelLink, ProfileMenu, SidePanel, SideRail, TopBar, PageHeader, Card, type PaletteGroup, type RailItem,
} from '../../components/shell';
import { Monogram } from '../../components/brand';
import { NotificationCentre, type NotificationItem } from '../../components/notify';
import { Select } from '../../components/select';
import { Button, IconButton, Link } from '../../components/button';
import { Badge, PersonLabel } from '../../components/display';
import { EmptyState, InlineAlert } from '../../components/feedback';
import { DashboardGrid, NeedsActionList, type ActionItem, type DashboardWidget } from '../../components/dashboard';
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
import { ENTITIES, HOLIDAYS_2026, HR_ADMIN, ME, PAYROLL_ADMIN, TODAY } from '../_kit/data';
import { ClockCard } from '../time/time-kit';
import { GENERAL_SHIFT, NOW_MIN, TODAY_PUNCHES } from '../time/time-data';
import '../time/time.css';
import { ListPage, homePanel, parseQuery } from './platform-kit';
import { SETTINGS_GROUPS as SETTINGS_MAP } from '../settings/settings-groups';
import { SettingsHomeScreen as SettingsMapHome } from '../settings/settings-screens';
import { NOTIFICATIONS } from './platform-data';
import type { TableColumn } from '../../components/table';

export type Persona = 'employee' | 'manager' | 'hr' | 'finance' | 'admin';

/** Role-filtered rail (APX-D §1: a person sees only modules their grants reach). */
export function railFor(persona: Persona): RailItem[] {
  const ids: Record<Persona, string[]> = {
    employee: ['home', 'time', 'pay', 'performance', 'learning', 'helpdesk', 'engage'],
    manager: ['home', 'people', 'time', 'pay', 'performance', 'learning', 'helpdesk', 'engage', 'analytics'],
    hr: ['home', 'people', 'time', 'pay', 'compliance', 'hire', 'performance', 'learning', 'helpdesk', 'engage', 'analytics', 'settings'],
    finance: ['home', 'pay', 'compliance', 'projects', 'analytics', 'settings'],
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
};

/** Pay is private: hidden on every load, shown only on request (founder review 30 Sep 2026). */
function PayStat({ loading }: { loading: boolean }) {
  const [shown, setShown] = useState(false);
  const toggle = (
    <Button size="sm" icon={shown ? EyeOff : Eye} aria-pressed={shown} onClick={() => setShown(!shown)}>
      {shown ? 'Hide amount' : 'Show amount'}
    </Button>
  );
  if (shown || loading)
    return (
      <div className="yx-plt-pay">
        <StatCard loading={loading} label="Net pay, September" value={86420} money previous={84900} previousLabel="August" drill={{ label: 'View payslip', href: '#payslip' }} />
        {!loading && toggle}
      </div>
    );
  return (
    <section className="yx-stat yx-plt-pay" aria-label="Net pay, September">
      <span className="yx-stat__label">Net pay, September</span>
      <Figure size="md" className="yx-stat__figure"><span aria-hidden="true">₹ ••,•••</span><span className="yx-visually-hidden">Amount hidden</span></Figure>
      <Link className="yx-stat__drill" href="#payslip">View payslip</Link>
      {toggle}
    </section>
  );
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
}

const GREETING: Record<RoleHomeScreenProps['persona'], string> = {
  employee: 'Here is your day.',
  manager: 'Your team and what is waiting for you.',
  hr: 'Exceptions, runs and what is due across Kaveri Foods.',
  finance: 'Money to pay, payroll to approve and statutory dues.',
};

// PLT-02 · Role homes (employee / manager / HR / finance). APX-D §1.1 Home.
export function RoleHomeScreen({ persona, data, loading = false, editing, firstRun, customisable = false, payOnHome = false, defaultHideAmounts, widgetStates, defaultHidden = [] }: RoleHomeScreenProps) {
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
    <DesktopFrame area="home" panelTitle="Home" panel={panel} railItems={railFor(persona)} user={persona === 'hr' ? HR_ADMIN : persona === 'finance' ? PAYROLL_ADMIN : ME} scope={persona === 'hr' || persona === 'finance' ? 'full' : 'none'}>
      <div className="yx-plt-row" data-justify="between">
        <div className="yx-plt-greet">
          <Heading level={1}>{newJoiner ? 'Welcome to Kaveri Foods, Divya' : `Good morning, ${persona === 'hr' ? 'Lakshmi' : persona === 'finance' ? 'Suresh' : 'Divya'}`}</Heading>
          <p className="yx-plt-muted">
            {formatDate(TODAY)} · {newJoiner ? 'Your first day. Here is what to do and who to meet.' : GREETING[persona]}
          </p>
        </div>
        {(
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
const PALETTE_ONLY: Record<string, Persona[]> = { rc2: ['hr', 'finance', 'admin'], pp3: ['hr', 'admin'] };
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
  updated: Date;
}

/** What each role may find (founder review 30 Sep 2026), the same rule as the command palette: a manager finds their
 * people, the requests they approve and policies, never someone's personal documents, tickets or candidates. */
const SEARCH_SOURCES: Record<Persona, SearchHit['source'][] | 'all'> = {
  employee: ['People', 'Requests', 'Policies'],
  manager: ['People', 'Requests', 'Policies'],
  finance: ['People', 'Requests', 'Policies', 'Documents'],
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

const searchColumns = (query: string, withEntity: boolean, withSource: boolean): TableColumn<SearchHit>[] => [
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
  { key: 'updated', header: 'Updated', value: (r) => r.updated.getTime(), render: (r) => formatDate(r.updated), width: 140 },
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

// PLT-21 · Search results page: tabs by type, only what you may open, the match in bold.
export function SearchResultsScreen({ query, hits, state = 'ready', persona = 'manager' }: { query: string; hits: SearchHit[]; state?: 'ready' | 'loading' | 'error'; persona?: Persona }) {
  const mine = explainedHits(searchableFor(persona, hits), query);
  const [tab, setTab] = useState('all');
  const [saving, setSaving] = useState(false);
  const sources = [...new Set(mine.map((h) => h.source))];
  const rows = tab === 'all' ? mine : mine.filter((h) => h.source === tab);
  const many = multiEntity(persona);
  const looksLikeCode = /^[a-z]{2,4}-?\d{3,}$/i.test(query.trim());
  return (
    <DesktopFrame area="home" panelTitle="Home" panel={homePanel('Search')} scope={many ? 'entity' : 'none'}>
      <ListPage
        title={`Results for “${query}”`}
        description="You only see results you're allowed to open."
        facts={`${mine.length} result${mine.length === 1 ? '' : 's'}`}
        actions={
          <Button icon={Bookmark} onClick={() => setSaving(true)}>
            Save search
          </Button>
        }
        tabs={mine.length ? [{ id: 'all', label: 'All', count: mine.length }, ...sources.map((s) => ({ id: s, label: s, count: mine.filter((h) => h.source === s).length }))] : undefined}
        tab={tab}
        onTabChange={setTab}
        label="Search results"
        columns={searchColumns(query, many, tab === 'all')}
        rows={rows}
        getRowId={(r) => r.id}
        onRowClick={() => {}}
        filters={many ? [{ key: 'entity', label: 'Company', type: 'multi', options: ENTITIES.map((e) => ({ value: e.name, label: e.name })) }, { key: 'updated', label: 'Date', type: 'date' }] : [{ key: 'updated', label: 'Date', type: 'date' }]}
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
              <div className="yx-plt-row">
                {many && <Button icon={Search}>Search all my companies</Button>}
                <Button icon={MessageCircleQuestionMark}>Ask AI</Button>
              </div>
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
