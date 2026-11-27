// Devices, timesheets, reports, timesheet pre-fill. TIM-14, TIM-15, TIM-16, TIM-30, TIM-43.
import { useEffect, useState, type ReactNode } from 'react';
import { FilterToggle } from '../../components/filter-toggle';
import { ArrowLeft, Download, Link2, LogOut, Plus } from 'lucide-react';
import { PhoneFrame } from '../_kit/frames';
import { EMPLOYEES, ENTITIES } from '../_kit/data';
import { Segment } from '../people/people-kit';
import { Button, IconButton } from '../../components/button';
import { AiBadge, Badge } from '../../components/display';
import { Drawer } from '../../components/drawer';
import { EmptyState, ErrorState, InlineAlert, NoAccessState, Skeleton } from '../../components/feedback';
import { FormField } from '../../components/field';
import { useToast } from '../../components/notify';
import { Icon } from '../../components/foundations';
import { NumberField, TextField } from '../../components/inputs';
import { ConfirmDialog, Dialog } from '../../components/overlay';
import { useNarrow } from '../../components/stepper';
import { Tooltip } from '../../components/tooltip';
import { Card, PageHeader, Tabs, TabsContent, TabsList, TabsTrigger } from '../../components/shell';
import { DataTable, type TableColumn } from '../../components/table';
import { PlainTable } from '../../components/plain-table';
import { FilterBar } from '../../components/filters';
import { Select } from '../../components/select';
import { BarChart, LineChart } from '../../components/charts';
import { checkTimesheet, newTimesheetLine, TimesheetGrid, type TimesheetDay, type TimesheetLine, type TimesheetNoteRule, type TimesheetProject, type TimesheetStatus } from '../../components/timesheet';
import { formatDate, formatINR } from '../../lib/format';
import type { FilterValue } from '../../lib/table';
import { DueBadge, Kpis, NoRecordState, TimePage } from './time-kit';
import { relativeDue } from './time-logic';
import { balancesFor, CLAIM, HR_ADMIN, ME, myReports, NEGATIVE_BALANCES, PAYROLL_ADMIN, TEAM, TODAY, type TimeUser } from './time-data';
import type { ViewState } from './attendance';
import { ApplyLeavePanel, type LiveLeaveHome } from './leave';
import type { AttendanceReport, LeaveReport as LiveLeaveReport, LeaveReportKind, LeaveReportQuery, LeaveReportRow, LoadState, MyLeave, MyProject, MyTimesheet, TimesheetActivity, HoursReport, NightRegister, PayrollFeed, Registers, TimesheetLineInput } from './live/types';
import { useRun } from '../org/org-kit';
import { LiveDevicesScreen, RevokeKioskDialog, RevokedKiosksTable, ShowRevoked, type RevokedKiosk, WebApprovalDialog, computerWords, type LiveDevices, type WebApproval } from './devices-live';
import { TrainingTab, type TrainingRow, type TrainingTabProps } from './training-tab';
import { LivePrefillDrawer, type LivePrefill, type PrefillProject } from './prefill-live';
import { TimeSummary, type TimeSummaryWeek } from './time-summary';
import './time.css';

/** End of the open period (September freezes after 30 Sep). */
const SEP_LOCK = new Date(2026, 8, 30);
const SYS_ADMIN: TimeUser = { name: 'Arjun Kulkarni', role: 'System Admin', email: 'arjun.k@kaverifoods.in' };
/** Links to other screens' stories (same pattern as leave.tsx and roster.tsx). */
const storyHref = (id: string, args?: string) => `/?path=/story/${id}${args ? `&args=${args}` : ''}`;
const STORY = {
  exceptionsHr: 'screens-time-tim-04-·-attendance-exceptions--hr',
  exceptionsMgr: 'screens-time-tim-04-·-attendance-exceptions--manager',
  periodsHr: 'screens-time-tim-11-·-periods--hr',
  leaveCardHr: 'screens-time-tim-21-·-leave-card--hr',
};

/* ---------- live pages (the designed screens with the API's data) ---------- */

/** A live page's load states around a designed screen part: loading, error with retry, no access. */
export function LiveGate({ state, onRetry, what, children }: { state: LoadState; onRetry?: () => void; what: string; children?: ReactNode }) {
  if (state === 'loading')
    return (
      <div className="yx-tim-stack" role="status" aria-busy="true" aria-label={`Loading ${what}`}>
        <Skeleton height={96} />
        <Skeleton height={240} />
      </div>
    );
  if (state === 'error') return <ErrorState title={`We couldn't load ${what}.`} description="Nothing has changed. Try again in a moment." onRetry={onRetry} />;
  if (state === 'no-access') return <NoAccessState grantedBy="HR" what={what} />;
  if (state === 'no-record') return <NoRecordState />;
  return <>{children}</>;
}
/** DataTable shows loading and error itself; no access is a LiveGate. */
export const liveTable = (s: LoadState) => (s === 'loading' ? 'loading' : s === 'error' ? 'error' : 'ready');
/** "12 Oct 2026" from an API date (yyyy-mm-dd, or an ISO time). */
export const isoDate = (iso: string) => formatDate(new Date(`${iso.slice(0, 10)}T00:00:00`));
const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;
/** "September 2026" from yyyy-mm. */
export const monthText = (month: string) => new Date(`${month}-01T00:00:00Z`).toLocaleDateString('en-GB', { month: 'long', year: 'numeric', timeZone: 'UTC' });
export const shiftMonth = (month: string, n: number) => {
  const d = new Date(`${month}-01T00:00:00Z`);
  d.setUTCMonth(d.getUTCMonth() + n);
  return d.toISOString().slice(0, 7);
};

const multi = (f: FilterValue[], key: string) => {
  const v = f.find((x) => x.key === key);
  return v && v.type === 'multi' && v.values.length ? v.values : null;
};

/* =====================================================================
   TIM-14 · Devices: kiosk registry and last seen, new phone requests, remote sign-out
   ===================================================================== */

interface Kiosk { id: string; code: string; place: string; location: string; entity: string; mode: 'Attendance' | 'Visitor'; lastSeen: string; status: 'Online' | 'Offline' | 'Stale' | 'Not set up'; uses: number }
const KIOSKS: Kiosk[] = [
  { id: 'k1', code: 'KF-HSR-K1', place: 'Gate 1', location: 'Hosur plant', entity: ENTITIES[0].name, mode: 'Attendance', lastSeen: '1 min ago', status: 'Online', uses: 212 },
  { id: 'k2', code: 'KF-HSR-K2', place: 'Canteen', location: 'Hosur plant', entity: ENTITIES[0].name, mode: 'Attendance', lastSeen: '3 h ago', status: 'Offline', uses: 0 },
  { id: 'k3', code: 'KF-MAA-K1', place: 'Reception', location: 'Chennai office', entity: ENTITIES[0].name, mode: 'Visitor', lastSeen: '2 min ago', status: 'Online', uses: 14 },
  { id: 'k4', code: 'KF-BLR-K1', place: 'Lobby', location: 'Bengaluru head office', entity: ENTITIES[0].name, mode: 'Attendance', lastSeen: '22 min ago', status: 'Stale', uses: 31 },
  // The Tamil Nadu entity has its own site; the Hosur plant belongs to Kaveri Foods Pvt Ltd.
  { id: 'k5', code: 'KF-CBE-K1', place: 'Packing hall', location: 'Coimbatore unit', entity: ENTITIES[1].name, mode: 'Attendance', lastSeen: '4 min ago', status: 'Online', uses: 22 },
];
const SITE_CODE: Record<string, string> = { 'Hosur plant': 'HSR', 'Chennai office': 'MAA', 'Bengaluru head office': 'BLR', 'Coimbatore unit': 'CBE' };
/** TIM-14 Training (30 Oct 2026): sessions around the design's today (29 Sep 2026, 9:42 am), times in India. */
const TRAINING_SITES = Object.keys(SITE_CODE).map((name) => ({ id: SITE_CODE[name]!, name, zone: 'Asia/Kolkata' }));
const site = (code: string) => TRAINING_SITES.find((l) => l.id === code)!;
const TRAINING: TrainingRow[] = [
  { id: 'tr1', title: 'Food safety refresher', room: 'Training room 1', location: site('HSR'), startsAt: '2026-09-29T03:30:00Z', endsAt: '2026-09-29T05:00:00Z', invitees: [], present: 18, state: 'running', version: 1 },
  { id: 'tr2', title: 'Forklift licence renewal', room: 'Bay 3', location: site('HSR'), startsAt: '2026-09-30T08:30:00Z', endsAt: '2026-09-30T11:30:00Z', invitees: [{ id: 'e7', name: 'Arvind Natarajan' }, { id: 'e8', name: 'Rahul Deshpande' }, { id: 'e9', name: 'Priya Shankar' }], present: 0, state: 'upcoming', version: 1 },
  { id: 'tr3', title: 'Fire drill', room: null, location: site('MAA'), startsAt: '2026-10-01T05:30:00Z', endsAt: '2026-10-01T06:00:00Z', invitees: [], present: 0, state: 'upcoming', version: 2 },
  { id: 'tr4', title: 'POSH awareness', room: 'Board room', location: site('BLR'), startsAt: '2026-09-25T09:30:00Z', endsAt: '2026-09-25T11:00:00Z', invitees: [], present: 26, state: 'ended', version: 1 },
  { id: 'tr5', title: 'First aid basics', room: 'Training room 2', location: site('MAA'), startsAt: '2026-09-28T04:30:00Z', endsAt: '2026-09-28T06:30:00Z', invitees: [], present: 0, state: 'cancelled', version: 2 },
];
const TRAINING_PEOPLE = EMPLOYEES.map((e) => ({ id: e.id, label: e.name, detail: null }));
/** `computer`: a computer for web clock-in (DeviceNotApproved), asked for from My attendance today. */
interface BindReq { id: string; person: string; site: string; from: string; to: string; lost: boolean; reason: string; raised: Date; computer?: boolean }
/** Computers story: one computer waiting and one approved (company setting "Web clock-in only from an approved computer"). */
const COMPUTER_BIND: BindReq = { id: 'b4', person: 'Arun Prakash', site: 'Chennai office', from: '', to: 'Chrome on Windows', lost: false, reason: 'Asked from My attendance today', raised: new Date(2026, 8, 29, 9, 31), computer: true };
const BINDS: BindReq[] = [
  { id: 'b1', person: 'Meera Krishnan', site: 'Chennai office', from: 'Redmi Note 11', to: 'Samsung Galaxy M34', lost: true, reason: 'Old phone lost on 26 Sep', raised: new Date(2026, 8, 27) },
  { id: 'b2', person: 'Kavitha Sundaram', site: 'Hosur plant', from: '', to: 'Nokia G21', lost: false, reason: 'First smartphone', raised: new Date(2026, 8, 28) },
  { id: 'b3', person: 'Divya Raghunathan', site: 'Chennai office', from: 'Pixel 7a', to: 'Samsung Galaxy A15', lost: false, reason: 'Old phone is slow', raised: new Date(2026, 8, 29, 9, 24) },
];
const REJECT_REASONS = ['Phone model not allowed', 'Ask them to visit HR with the phone', "Request doesn't match our records"].map((r) => ({ value: r, label: r }));
interface Phone { id: string; person: string; model: string; app: string; lastSeen: string; status: 'Active' | 'Lost' | 'Signed out' | 'Inactive'; seenOn?: Date; computer?: boolean }
const COMPUTER: Phone = { id: 'c1', person: 'Nisha Menon', model: 'Edge on Windows', app: '—', lastSeen: 'Today, 9:04 am', status: 'Active', computer: true };
const PHONES: Phone[] = [
  { id: 'p1', person: 'Meera Krishnan', model: 'Redmi Note 11', app: '4.2.0', lastSeen: '26 Sep, 6:10 pm', status: 'Lost' },
  { id: 'p2', person: 'Divya Raghunathan', model: 'Pixel 7a', app: '4.2.1', lastSeen: 'Today, 9:38 am', status: 'Active' },
  { id: 'p3', person: 'Nisha Menon', model: 'OnePlus Nord CE 3', app: '4.2.1', lastSeen: 'Today, 9:05 am', status: 'Active' },
  { id: 'p4', person: 'Arvind Natarajan', model: 'Redmi 13C', app: '4.2.1', lastSeen: 'Today, 9:12 am', status: 'Active' },
  { id: 'p5', person: 'Arun Prakash', model: 'Moto G54', app: '4.2.1', lastSeen: 'Yesterday, 6:40 pm', status: 'Active' },
  { id: 'p6', person: 'Priya Shankar', model: 'Vivo T2', app: '4.2.0', lastSeen: 'Yesterday, 6:05 pm', status: 'Active' },
  { id: 'p7', person: 'Fathima Beevi', model: 'Samsung Galaxy A15', app: '4.2.1', lastSeen: 'Yesterday, 6:32 pm', status: 'Active' },
  { id: 'p8', person: 'Rahul Deshpande', model: 'Realme Narzo 60', app: '4.1.8', lastSeen: '2 Aug', status: 'Inactive', seenOn: new Date(2026, 7, 2) },
];
/** Computers · web clock-in rule: on for the company, the Hosur plant (shared tablets at the gate) turns it off. */
const RULE_PLACES = [
  ...ENTITIES.map((e) => ({ value: `legal_entity:${e.id}`, label: `${e.name} · legal entity` })),
  ...Object.keys(SITE_CODE).map((name) => ({ value: `location:${SITE_CODE[name]}`, label: name })),
];
const SAMPLE_RULE: WebApproval = { company: 'on', overrides: [{ id: 'o1', scopeType: 'location', scopeId: 'HSR', name: 'Hosur plant', value: 'off' }] };
/** Fits "Packing hall · Bengaluru head office" on one line at desktop width. */
const KIOSK_W = 320;
// flex: none — the kit class's 256px flex-basis turns into a min-height when phone cards stack the cell.
const pad = { paddingBlock: 'var(--yx-space-1)', flex: 'none' } as const;

export function DevicesScreen({ live, ...story }: { persona?: 'hr' | 'sa'; tab?: 'kiosks' | 'binds' | 'phones' | 'training'; signOut?: boolean; state?: ViewState; /** Computers stories (DeviceNotApproved): a computer request and an approved computer; `removeComputer` opens its remove confirmation. */ computers?: boolean; removeComputer?: boolean; /** Computers · web clock-in rule: the rule dialog open. */ webRule?: boolean; /** Answer 793: the revoke dialog open for the first kiosk. */ revoke?: boolean; /** Answer 871: the Show revoked filter on. */ showRevoked?: boolean; /** Training stories: the add form, a session's edit form, or its cancel confirmation. */ training?: TrainingTabProps['open']; /** The live app's /time/setup/devices. */ live?: LiveDevices }) {
  return live ? <LiveDevicesScreen live={live} /> : <SampleDevicesScreen {...story} />;
}

/** Answer 871: sample revoked kiosks. */
const REVOKED_KIOSKS: RevokedKiosk[] = [
  { id: 'rk1', code: 'KSK-04', place: 'Loading bay', location: 'Hosur plant', reason: 'Tablet stolen from the loading bay', by: 'Neha Joshi', at: '2026-10-28T10:15:00' },
  { id: 'rk2', code: 'KSK-02', place: 'Old gate', location: 'Chennai office', reason: 'Replaced by KSK-07 at the new gate', by: 'Arjun Rao', at: '2026-09-14T16:40:00' },
];

function SampleDevicesScreen({ persona = 'hr', tab = 'kiosks', signOut = false, state = 'ready', training, computers = false, removeComputer = false, webRule = false, revoke = false, showRevoked: revokedOn = false }: { persona?: 'hr' | 'sa'; tab?: 'kiosks' | 'binds' | 'phones' | 'training'; signOut?: boolean; state?: ViewState; training?: TrainingTabProps['open']; computers?: boolean; removeComputer?: boolean; webRule?: boolean; revoke?: boolean; showRevoked?: boolean }) {
  const sa = persona === 'sa';
  const narrow = useNarrow(599);
  // The story opens the sign-out confirmation for Meera's lost Redmi (or the remove confirmation of Nisha's computer).
  const [so, setSo] = useState<Phone | null>(removeComputer ? COMPUTER : signOut ? PHONES[0] : null);
  const [outIds, setOutIds] = useState<string[]>([]);
  const [binds, setBinds] = useState(computers || removeComputer ? [...BINDS, COMPUTER_BIND] : BINDS);
  const [approving, setApproving] = useState<BindReq | null>(null);
  const [rejecting, setRejecting] = useState<BindReq | null>(null);
  const [rejectWhy, setRejectWhy] = useState<string | null>(null);
  const [notified, setNotified] = useState<string[]>([]);
  const [list, setList] = useState(KIOSKS);
  const [resetting, setResetting] = useState<Kiosk | null>(null);
  const [revoking, setRevoking] = useState<Kiosk | null>(revoke ? KIOSKS[0]! : null);
  const [showRevoked, setShowRevoked] = useState(revokedOn);
  const [registering, setRegistering] = useState(false);
  const [reg, setReg] = useState<{ place: string; location: string | null; mode: Kiosk['mode'] }>({ place: '', location: null, mode: 'Attendance' });
  // Done is said with a toast (founder rule).
  const { toast } = useToast();
  const setKioskNote = (title: string) => toast({ tone: 'success', title });
  const setBindNote = setKioskNote;
  const [added, setAdded] = useState<Phone[]>([]);
  const [sessions, setSessions] = useState(TRAINING);
  const [q, setQ] = useState('');
  const [onlyIssues, setOnlyIssues] = useState(false);
  const mine = (k: Kiosk) => sa || k.entity === ENTITIES[0].name;
  const kiosks = state === 'empty' ? [] : list.filter(mine);
  const offline = state === 'ready' ? kiosks.filter((k) => k.status === 'Offline') : [];
  /** The new-phone request that replaces the phone being signed out, if any. */
  const soReq = so ? BINDS.find((b) => b.person === so.person && b.from === so.model) : undefined;
  const sites = sa ? Object.keys(SITE_CODE) : Object.keys(SITE_CODE).filter((s) => s !== 'Coimbatore unit');
  const phones = [...[...PHONES, ...(computers || removeComputer ? [COMPUTER] : [])].map((p) => (outIds.includes(p.id) ? { ...p, status: 'Signed out' as const } : p)), ...added];
  /** The phone a request replaces (Meera's lost Redmi, Divya's Pixel 7a). */
  const oldPhone = (r: BindReq) => PHONES.find((p) => p.person === r.person && p.model === r.from);
  const signOutOld = (r: BindReq) => { const p = oldPhone(r); if (p) setOutIds((o) => [...o, p.id]); };
  const oldOut = (r: BindReq) => { const p = oldPhone(r); return !p || outIds.includes(p.id); };
  const isIssue = (p: Phone) => p.status === 'Lost' || p.status === 'Inactive';
  const shownPhones = phones.filter((p) => (!onlyIssues || isIssue(p)) && `${p.person} ${p.model}`.toLowerCase().includes(q.trim().toLowerCase()));
  const issueCount = phones.filter(isIssue).length;
  const kcols: TableColumn<Kiosk>[] = [
    { key: 'code', header: 'Kiosk', type: 'id', width: KIOSK_W, value: (r) => r.code, render: (r) => <span className="yx-tim-list__main" style={pad}><strong>{r.code}</strong><span className="yx-tim-muted">{r.place} · {r.location}</span></span> },
    ...(sa ? [{ key: 'entity', header: 'Entity', value: (r: Kiosk) => r.entity } as TableColumn<Kiosk>] : []),
    { key: 'mode', header: 'Mode', width: 110, value: (r) => r.mode, optional: true },
    { key: 'lastSeen', header: 'Last seen', width: 130, value: (r) => r.lastSeen },
    { key: 'status', header: 'Status', type: 'status', width: 120, value: (r) => r.status, statusTone: (v) => (v === 'Online' ? 'success' : v === 'Offline' ? 'danger' : v === 'Stale' ? 'warning' : 'neutral') },
    {
      // Not optional: at tablet width Mode hides first and the count stays. Short header so it isn't cut at 871 (the note under the table says "today").
      key: 'uses', header: 'Check-ins', type: 'number', width: 120,
      value: (r) => (r.mode === 'Visitor' || (r.status !== 'Online' && r.status !== 'Stale') ? null : r.uses),
      // An offline tablet keeps its check-ins until it syncs, so 0 would be wrong.
      render: (r) => (r.mode === 'Visitor' || r.status === 'Not set up' ? '—' : r.status === 'Offline' ? <span className="yx-tim-muted">Not synced</span> : r.uses),
    },
  ];
  const bcols: TableColumn<BindReq>[] = [
    { key: 'person', header: 'Employee', type: 'person', value: (r) => r.person, person: (r) => ({ name: r.person }) },
    // The reason is the second line, so no column is hidden at tablet width.
    {
      key: 'change', header: 'Phone change', value: (r) => r.to,
      render: (r) => (
        <span className="yx-tim-list__main" style={pad}>
          <span>{r.computer ? computerWords.change(r.to) : r.from ? `${r.from}${r.lost ? ' (lost)' : ''} → ${r.to}` : `First phone: ${r.to}`}</span>
          <span className="yx-tim-muted">{r.reason}</span>
        </span>
      ),
    },
    {
      key: 'raised', header: 'Raised', type: 'date', width: 170, value: (r) => r.raised,
      render: (r) => {
        const age = relativeDue(r.raised, TODAY);
        // Someone with a lost phone can't check in by phone, so a wait of more than a day is flagged.
        return <span className="yx-tim-row">{dayMonth(r.raised)}<Badge tone={r.lost && age.days < -1 ? 'warning' : 'neutral'}>{age.text.charAt(0).toUpperCase() + age.text.slice(1)}</Badge></span>;
      },
    },
  ];
  const pcols: TableColumn<Phone>[] = [
    { key: 'person', header: 'Employee', type: 'person', width: 240, value: (r) => r.person, person: (r) => ({ name: r.person, secondary: r.computer ? computerWords.device(r.model) : r.model }) },
    { key: 'app', header: 'App version', value: (r) => r.app, optional: true },
    {
      key: 'lastSeen', header: 'Last seen', value: (r) => r.lastSeen,
      render: (r) => (r.status === 'Inactive' && r.seenOn ? <span className="yx-tim-row">{r.lastSeen}<Badge tone="warning">{relativeDue(r.seenOn, TODAY).text}</Badge></span> : r.lastSeen),
    },
    { key: 'status', header: 'Status', type: 'status', value: (r) => r.status, statusTone: (v) => (v === 'Active' ? 'success' : v === 'Lost' ? 'danger' : v === 'Inactive' ? 'warning' : 'neutral') },
  ];
  const drop = (id: string) => setBinds((b) => b.filter((x) => x.id !== id));
  const first = (name?: string) => name?.split(' ')[0] ?? '';
  /** What the person can do after a rejection, from their phones and their site's kiosks. */
  const rejectEffect = (r: BindReq) => {
    const f = first(r.person);
    if (r.computer) return computerWords.rejectEffect(f);
    if (r.lost) return `The lost ${r.from} is signed out, so ${f} can't check in by phone until a new phone is approved.`;
    if (!oldOut(r)) return `${f} is told why and keeps using the ${r.from}.`;
    const kiosk = list.some((k) => k.location === r.site && k.mode === 'Attendance' && k.status !== 'Not set up');
    return `${f} is told why and can check in ${kiosk ? `at a kiosk at ${r.site}` : 'on the web or at the HR desk'} meanwhile.`;
  };
  const approve = (r: BindReq) => {
    const f = first(r.person);
    drop(r.id);
    // The new phone replaces the old one in the same step, so no one has two active phones.
    signOutOld(r);
    setAdded((a) => [...a, { id: `new-${r.id}`, person: r.person, model: r.to, app: '—', lastSeen: 'Approved today', status: 'Active', computer: r.computer }]);
    setBindNote(r.computer ? computerWords.approved(f, r.to) : `${f}'s ${r.to} approved · ${f} can check in from it now.${oldPhone(r) ? ` The ${r.lost ? 'lost ' : ''}${r.from} is signed out.` : ''}`);
  };
  const register = () => {
    if (!reg.location || !reg.place.trim()) return;
    const site = SITE_CODE[reg.location];
    const n = list.filter((k) => k.code.startsWith(`KF-${site}-`)).length + 1;
    const code = `KF-${site}-K${n}`;
    const entity = reg.location === 'Coimbatore unit' ? ENTITIES[1].name : ENTITIES[0].name;
    setList((l) => [...l, { id: `k-${code}`, code, place: reg.place.trim(), location: reg.location!, entity, mode: reg.mode, lastSeen: 'Not yet', status: 'Not set up', uses: 0 }]);
    setKioskNote(`${code} registered. Enter the set-up key on the tablet at ${reg.place.trim()}, ${reg.location}.`);
    setRegistering(false);
    setReg({ place: '', location: null, mode: 'Attendance' });
  };
  const registerBtn = <Button variant="primary" icon={Plus} onClick={() => setRegistering(true)}>Register kiosk</Button>;
  const [ruleOpen, setRuleOpen] = useState(webRule);
  const [rule, setRule] = useState<WebApproval>(SAMPLE_RULE);
  return (
    <TimePage active="Devices & kiosks" user={sa ? SYS_ADMIN : HR_ADMIN} allEntities={sa}>
      <PageHeader title="Devices and kiosks" description={sa ? 'System Admin · all entities' : `HR · ${ENTITIES[0].name}`} actions={<div className="yx-tim-row"><Button onClick={() => setRuleOpen(true)}>Web clock-in rule</Button>{registerBtn}</div>} />
      <WebApprovalDialog
        open={ruleOpen}
        onOpenChange={setRuleOpen}
        rule={rule}
        places={RULE_PLACES}
        onSet={async (x) => setRule((r) => (x.scopeType === 'tenant' ? { ...r, company: x.value } : { ...r, overrides: [...r.overrides, { id: `o-${x.scopeId}`, scopeType: x.scopeType as 'legal_entity' | 'location', scopeId: x.scopeId!, name: RULE_PLACES.find((p) => p.value === `${x.scopeType}:${x.scopeId}`)!.label.split(' · ')[0]!, value: x.value }] }))}
        onRemove={async (id) => setRule((r) => ({ ...r, overrides: r.overrides.filter((o) => o.id !== id) }))}
      />
      <Tabs defaultValue={tab}>
        <TabsList aria-label="Devices">
          <TabsTrigger value="kiosks">Kiosks</TabsTrigger>
          {/* Short labels on phones so all three tabs fit without scrolling. */}
          <TabsTrigger value="binds" count={binds.length}>{narrow ? 'Requests' : 'New device requests'}</TabsTrigger>
          <TabsTrigger value="phones">{narrow ? 'Devices' : 'Employee devices'}</TabsTrigger>
          <TabsTrigger value="training">Training</TabsTrigger>
        </TabsList>
        <TabsContent value="kiosks">
          <div className="yx-tim-stack">
            {offline.map((k) => (
              <InlineAlert
                key={k.id}
                tone="danger"
                title={`${k.code} · ${k.place} has been offline for ${k.lastSeen.replace(' ago', '')}`}
                actions={notified.includes(k.id) ? <Badge tone="neutral">Site admin notified</Badge> : <Button size="sm" onClick={() => setNotified((n) => [...n, k.id])}>Notify site admin</Button>}
              >
                Check-ins on it are kept on the tablet and sync when it's back. Check power and Wi-Fi at the {k.place.toLowerCase()}.
              </InlineAlert>
            ))}
            <DataTable
              label="Kiosks"
              columns={kcols}
              rows={kiosks}
              getRowId={(r) => r.id}
              state={state === 'loading' ? 'loading' : state === 'error' ? 'error' : 'ready'}
              onRetry={() => {}}
              empty={<EmptyState title="No kiosks registered" description="Register a site tablet so people without phones can check in with code and PIN." action={registerBtn} />}
              rowButtons={(r) => <>{r.status === 'Not set up' ? null : <Button size="sm" onClick={() => setResetting(r)}>Reset kiosk key</Button>}<Button size="sm" variant="danger" onClick={() => setRevoking(r)}>Revoke</Button></>}
              toolbar={<ShowRevoked pressed={showRevoked} onPressedChange={setShowRevoked} count={REVOKED_KIOSKS.length} />}
            />
            {showRevoked && <RevokedKiosksTable rows={REVOKED_KIOSKS} />}
            {state === 'ready' && kiosks.length > 0 && <p className="yx-tim-note">Check-ins: today so far. Stale: not seen for 15 min or more. Offline: not seen for an hour or more.</p>}
          </div>
        </TabsContent>
        <TabsContent value="binds">
          <div className="yx-tim-stack">
            <DataTable
              label="New device requests"
              columns={bcols}
              rows={binds}
              getRowId={(r) => r.id}
              empty={<EmptyState title="No new device requests" description="Requests appear here when someone asks to clock in from a phone or computer that isn't approved yet." />}
              rowButtons={(r) => <><Button size="sm" onClick={() => { setRejectWhy(null); setRejecting(r); }}>Reject</Button><Button variant="approve" size="sm" onClick={() => (!oldOut(r) ? setApproving(r) : approve(r))}>Approve</Button></>}
            />
          </div>
        </TabsContent>
        <TabsContent value="phones">
          <DataTable
            label="Employee devices"
            columns={pcols}
            rows={shownPhones}
            getRowId={(r) => r.id}
            toolbar={
              <FilterBar fields={[]} value={[]} onChange={() => {}} search={q} onSearchChange={setQ} searchPlaceholder="Search name or device">
                <FilterToggle pressed={onlyIssues} onPressedChange={setOnlyIssues}>
Only lost or inactive ({issueCount})
</FilterToggle>
              </FilterBar>
            }
            filtered={!!q.trim() || onlyIssues}
            onClearFilters={() => { setQ(''); setOnlyIssues(false); }}
            empty={<EmptyState title="No approved devices yet" description="Phones and computers appear here once you approve a request." />}
            rowButtons={(r) =>
              r.computer ? (
                r.status === 'Active' || r.status === 'Inactive' ? <Button size="sm" onClick={() => setSo(r)}>{computerWords.remove}</Button> : null
              ) : r.status === 'Lost' ? (
                <Button variant="danger" size="sm" icon={LogOut} onClick={() => setSo(r)}>Sign out remotely</Button>
              ) : r.status === 'Inactive' ? (
                <Button size="sm" icon={LogOut} onClick={() => setSo(r)}>Sign out phone</Button>
              ) : null
            }
          />
        </TabsContent>
        <TabsContent value="training">
          <TrainingTab
            rows={state === 'empty' ? [] : sessions}
            locations={TRAINING_SITES.filter((l) => sites.includes(l.name))}
            state={state === 'loading' ? 'loading' : state === 'error' ? 'error' : 'ready'}
            onFindPeople={async (q) => TRAINING_PEOPLE.filter((p) => p.label.toLowerCase().includes(q.trim().toLowerCase())).slice(0, 20)}
            onAdd={async (x) => setSessions((list) => [...list, { id: `tr${list.length + 1}`, title: x.title, room: x.room ?? null, location: TRAINING_SITES.find((l) => l.id === x.locationId)!, startsAt: x.startsAt, endsAt: x.endsAt, invitees: x.invitees.map((id) => ({ id, name: TRAINING_PEOPLE.find((p) => p.id === id)?.label ?? '' })), present: 0, state: 'upcoming', version: 1 }])}
            onEdit={async (r, x) => setSessions((list) => list.map((s) => (s.id === r.id ? { ...s, title: x.title, room: x.room ?? null, location: TRAINING_SITES.find((l) => l.id === x.locationId)!, startsAt: x.startsAt, endsAt: x.endsAt, invitees: x.invitees.map((id) => ({ id, name: TRAINING_PEOPLE.find((p) => p.id === id)?.label ?? s.invitees.find((i) => i.id === id)?.name ?? '' })), version: s.version + 1 } : s)))}
            onCancel={async (r) => setSessions((list) => list.map((s) => (s.id === r.id ? { ...s, state: 'cancelled' } : s)))}
            open={training}
          />
        </TabsContent>
      </Tabs>
      <RevokeKioskDialog kiosk={revoking} onClose={() => setRevoking(null)} onRevoke={async () => { const k = revoking!; setList((l) => l.filter((x) => x.id !== k.id)); setKioskNote(`${k.code} revoked · the ${k.place} tablet no longer works.`); }} />
      <ConfirmDialog
        open={!!resetting}
        onOpenChange={(o) => !o && setResetting(null)}
        destructive
        title={`Reset ${resetting?.code}'s key?`}
        consequence={`The ${resetting?.place} tablet at ${resetting?.location} stops ${resetting?.mode === 'Visitor' ? 'signing in visitors' : 'recording check-ins'} until someone enters the new key on it.`}
        confirmLabel="Reset key"
        onConfirm={() => { if (resetting) setKioskNote(`${resetting.code} key reset · enter the new key on the ${resetting.place} tablet.`); setResetting(null); }}
      />
      <Dialog
        open={registering}
        onOpenChange={setRegistering}
        title="Register kiosk"
        footer={
          <>
            {(!reg.place.trim() || !reg.location) && <span className="yx-tim-muted">Enter the place and location</span>}
            <Button onClick={() => setRegistering(false)}>Cancel</Button>
            {/* Never disabled: the note beside it says what is missing. */}
            <Button variant="primary" onClick={register}>Register kiosk</Button>
          </>
        }
      >
        <div className="yx-tim-form">
          <FormField label="Place on site" required helper="Where the tablet is mounted, e.g. Gate 2">
            <TextField value={reg.place} onChange={(place) => setReg((x) => ({ ...x, place }))} />
          </FormField>
          <FormField label="Location" required>
            <Select options={sites.map((s) => ({ value: s, label: s }))} value={reg.location} onChange={(location) => setReg((x) => ({ ...x, location }))} placeholder="Choose a location" />
          </FormField>
          <FormField label="Mode">
            <Segment label="Mode" value={reg.mode} onChange={(mode) => setReg((x) => ({ ...x, mode }))} options={[{ value: 'Attendance', label: 'Attendance' }, { value: 'Visitor', label: 'Visitor' }]} />
          </FormField>
        </div>
      </Dialog>
      <Dialog
        open={!!rejecting}
        onOpenChange={(o) => !o && setRejecting(null)}
        title={`Reject ${first(rejecting?.person)}'s ${rejecting?.to}?`}
        description={rejecting ? rejectEffect(rejecting) : undefined}
        footer={
          <>
            {!rejectWhy && <span className="yx-tim-muted">Choose a reason</span>}
            <Button onClick={() => setRejecting(null)}>Cancel</Button>
            <Button
              variant="danger"
              onClick={() => {
                if (!rejecting || !rejectWhy) return;
                drop(rejecting.id);
                if (rejecting.lost) signOutOld(rejecting);
                setBindNote(`Rejected · ${first(rejecting.person)} is told why: ${rejectWhy?.toLowerCase()}.${rejecting.lost ? ` The lost ${rejecting.from} is signed out.` : ''}`);
                setRejecting(null);
              }}
            >
              Reject request
            </Button>
          </>
        }
      >
        <FormField label="Reason sent to the employee" required>
          <Select options={REJECT_REASONS} value={rejectWhy} onChange={setRejectWhy} placeholder="Choose a reason" />
        </FormField>
      </Dialog>
      <ConfirmDialog
        open={!!so}
        onOpenChange={(o) => !o && setSo(null)}
        destructive
        title={so?.computer ? computerWords.removeTitle(first(so.person), so.model) : `Sign out ${first(so?.person)}'s ${so?.model}?`}
        consequence={so?.computer ? computerWords.removeConsequence(first(so.person)) : `${first(so?.person)} is signed out on that phone at once, and it can't record check-ins. ${
          soReq ? (binds.some((b) => b.id === soReq.id) ? `${first(so?.person)} can use the app again once the ${soReq.to} is approved.` : `${first(so?.person)} keeps using the ${soReq.to}.`) : `If ${first(so?.person)} uses it again, it comes back here as a new phone request.`
        }`}
        confirmLabel={so?.computer ? computerWords.remove : 'Sign out phone'}
        onConfirm={() => { if (so) { setOutIds((o) => [...o, so.id]); if (so.computer) setBindNote(computerWords.removed(first(so.person), so.model)); } setSo(null); }}
      />
      <ConfirmDialog
        open={!!approving}
        onOpenChange={(o) => !o && setApproving(null)}
        confirmVariant="approve"
        title={`Approve ${first(approving?.person)}'s ${approving?.to}?`}
        consequence={
          approving?.lost
            ? `The lost ${approving.from} is signed out in the same step, so only the new phone can record check-ins.`
            : `${first(approving?.person)}'s ${approving?.from} (last seen ${approving ? oldPhone(approving)?.lastSeen.toLowerCase() : ''}) is signed out in the same step, so only the new phone can record check-ins.`
        }
        confirmLabel={`Approve and sign out ${approving?.from}`}
        onConfirm={() => { if (approving) approve(approving); setApproving(null); }}
      />
    </TimePage>
  );
}

/* =====================================================================
   TIM-15 · Timesheets (desk weekly grid; mobile day list, submit week)
   ===================================================================== */

export const TS_PROJECTS: TimesheetProject[] = [
  { id: 'pr1', code: 'QA-ERP', name: 'ERP rollout testing', client: 'Internal', billable: false, tasks: [{ id: 't1', name: 'Test execution' }, { id: 't2', name: 'Defect triage' }] },
  { id: 'pr2', code: 'SRF-24', name: 'Supplier audit', client: 'Sundaram Retail Foods', billable: true, tasks: [{ id: 't3', name: 'Audit visits' }, { id: 't4', name: 'Reports' }] },
  { id: 'pr3', code: 'INT', name: 'Internal', billable: false, tasks: [{ id: 't5', name: 'Training' }, { id: 't6', name: 'Meetings' }] },
];
const WORKDAY: TimesheetDay = { expected: 8, kind: 'workday' };
const WEEKEND: TimesheetDay = { expected: 0, kind: 'weekend' };
/** This week, 28 Sep – 4 Oct: Gandhi Jayanti is Fri 2 Oct. */
export const TS_DAYS: TimesheetDay[] = [WORKDAY, WORKDAY, WORKDAY, WORKDAY, { expected: 0, kind: 'holiday', label: 'Gandhi Jayanti' }, WEEKEND, WEEKEND];
/** Today is Tue 29 Sep, 9:42 am: only Monday and the morning meeting are booked. */
export const TS_LINES: TimesheetLine[] = [
  { id: 'l1', projectId: 'pr1', taskId: 't1', billable: false, hours: [4, null, null, null, null, null, null] },
  { id: 'l2', projectId: 'pr2', taskId: 't3', billable: true, hours: [2, null, null, null, null, null, null] },
  { id: 'l3', projectId: 'pr3', taskId: 't6', billable: false, hours: [1, 1, null, null, null, null, null] },
];
/** Hours worked on Sat 26 Sep: the same day record TIM-22 offers as a comp-off claim. */
const hm = (t: string) => Number(t.slice(0, 2)) * 60 + Number(t.slice(3));
const CLAIM_HOURS = (hm(CLAIM.out) - hm(CLAIM.in)) / 60;
/** Last week, 21–27 Sep: half-day casual leave on Thu 24 Sep, 4 h 30 m worked on Sat 26 Sep. */
const LAST_DAYS: TimesheetDay[] = [WORKDAY, WORKDAY, WORKDAY, { expected: 4, kind: 'workday', label: 'Half-day leave' }, WORKDAY, WEEKEND, WEEKEND];
const LAST_LINES: TimesheetLine[] = [
  { id: 'p1', projectId: 'pr1', taskId: 't1', billable: false, hours: [5, 4, 5, 3, 6, CLAIM_HOURS, null] },
  { id: 'p2', projectId: 'pr2', taskId: 't3', billable: true, hours: [2, 3, 2, null, 1, null, null] },
  { id: 'p3', projectId: 'pr3', taskId: 't6', billable: false, hours: [1, 1, 1, 1, 1, null, null] },
];
/** Weeks 7 Sep and 31 Aug, and every locked August week. */
const PLAIN_DAYS: TimesheetDay[] = [WORKDAY, WORKDAY, WORKDAY, WORKDAY, WORKDAY, WEEKEND, WEEKEND];
const AUG_LINES: TimesheetLine[] = [
  { id: 'a1', projectId: 'pr1', taskId: 't1', billable: false, hours: [5, 5, 6, 5, 6, null, null] },
  { id: 'a2', projectId: 'pr2', taskId: 't3', billable: true, hours: [2, 2, 1, 2, 1, null, null] },
  { id: 'a3', projectId: 'pr3', taskId: 't6', billable: false, hours: [1, 1, 1, 1, 1, null, null] },
];
/** Week of 14 Sep: worked on Vinayaka Chaturthi (comp-off credited), casual leave 16–17 Sep. */
const SEP14_DAYS: TimesheetDay[] = [{ expected: 0, kind: 'holiday', label: 'Vinayaka Chaturthi' }, WORKDAY, { expected: 0, kind: 'leave', label: 'Casual leave' }, { expected: 0, kind: 'leave', label: 'Casual leave' }, WORKDAY, WEEKEND, WEEKEND];
const SEP14_LINES: TimesheetLine[] = [
  { id: 'c1', projectId: 'pr1', taskId: 't1', billable: false, hours: [8, 6, null, null, 6, null, null] },
  { id: 'c2', projectId: 'pr2', taskId: 't3', billable: true, hours: [null, 1, null, null, 1, null, null] },
  { id: 'c3', projectId: 'pr3', taskId: 't6', billable: false, hours: [null, 1, null, null, 1, null, null] },
];
const THIS_MONDAY = new Date(2026, 8, 28);
/** Today is Tue 29 Sep: hours from Wed 30 Sep can't be entered yet. */
const LOCK_FROM = new Date(2026, 8, 30);
/** Batch D A8 (design): Request leave starts on today, Tue 29 Sep. */
const TODAY0_TS = new Date(2026, 8, 29);
/** The queried cell on the sent-back week: SRF-24 audit visits, Tue 22 Sep, 3 h. */
const QUERIED = { lineId: 'p2', day: 1, hours: 3 };
type WeekData = { days: TimesheetDay[]; lines: TimesheetLine[]; status: TimesheetStatus };
/** Week `o` weeks from this one (0 = this week, −1 = last week). September is open; August is locked. */
function weekData(o: number, storyStatus: TimesheetStatus): WeekData {
  if (o === 0) return { days: TS_DAYS, lines: TS_LINES, status: 'draft' };
  if (o === -1) return { days: LAST_DAYS, lines: LAST_LINES, status: storyStatus === 'draft' || storyStatus === 'locked' ? 'approved' : storyStatus };
  if (o === -2) return { days: SEP14_DAYS, lines: SEP14_LINES, status: 'approved' };
  if (o >= -4) return { days: PLAIN_DAYS, lines: AUG_LINES, status: 'approved' };
  return { days: PLAIN_DAYS, lines: AUG_LINES, status: 'locked' };
}
const addWeeks = (d: Date, n: number) => new Date(d.getFullYear(), d.getMonth(), d.getDate() + 7 * n);
/** "6 Sep 2026": the house date, always with the year. */
const dayMonth = formatDate;
/**
 * TIM-15 "Copy last week" (answer 2533): fills only this week's empty cells, only on the `open` days (working days up to
 * today, not locked), from last week's hours of the same project and task; a project not in `allowed` (no longer
 * allocated) is skipped. Daily notes are never copied. Returns the new lines and the days that changed.
 */
export function copyWeekInto(lines: TimesheetLine[], from: TimesheetLine[], open: number[], allowed: (projectId: string | null) => boolean = () => true): [TimesheetLine[], number[]] {
  const changed = new Set<number>();
  const fill = (hours: (number | null)[], src: (number | null)[]) =>
    hours.map((h, i) => {
      if (h != null || src[i] == null || !src[i] || !open.includes(i)) return h;
      changed.add(i);
      return src[i];
    });
  const usable = from.filter((x) => x.projectId && allowed(x.projectId));
  const out = lines.map((l) => {
    const src = usable.find((x) => x.projectId === l.projectId && x.taskId === l.taskId);
    return src ? { ...l, hours: fill(l.hours, src.hours) } : l;
  });
  usable
    .filter((x) => !lines.some((l) => l.projectId === x.projectId && l.taskId === x.taskId))
    .forEach((x) => {
      const hours = fill(Array(7).fill(null), x.hours);
      if (hours.some((h) => h != null)) out.push({ ...x, id: `cp-${x.id}`, hours, comments: Array(7).fill('') });
    });
  return [out, [...changed].sort()];
}

/** Fills this week's empty cells before `LOCK_FROM` from last week's hours. Returns the new lines and the days that changed. */
function copyLastWeek(lines: TimesheetLine[]): [TimesheetLine[], number[]] {
  const open = TS_DAYS.map((_, i) => i).filter((i) => new Date(THIS_MONDAY.getFullYear(), THIS_MONDAY.getMonth(), THIS_MONDAY.getDate() + i) < LOCK_FROM && TS_DAYS[i].expected > 0);
  return copyWeekInto(lines, LAST_LINES, open);
}

/* ---------- batch D A14: the Home nudge (answer 2536) ---------- */

/** Home: today has no hours yet (from the company's time on a working day, for people allocated to a project). */
export function TimesheetNudgeCard({ href, onDismiss }: { href: string; onDismiss?: () => void }) {
  return (
    <Card title="You have not logged time today">
      <p className="yx-tim-muted">Add today's hours while you remember them. Your week goes to the project manager when you send it.</p>
      <div className="yx-tim-row">
        <Button size="sm" variant="primary" asChild>
          <a href={href}>Fill in today</a>
        </Button>
        {onDismiss && (
          <Button size="sm" onClick={onDismiss}>
            Not now
          </Button>
        )}
      </div>
    </Card>
  );
}

/* ---------- batch D A5: weeks not sent (TIM-15 "Not sent" tab) ---------- */

/** A past week never sent (answer 2534): none saved, a draft, or sent back; a week in a locked month is read-only. */
export type NotSentWeek = { week: string; status: 'not_started' | 'draft' | 'sent_back'; totalMinutes: number; locked: boolean };
const NOT_SENT_LABEL: Record<NotSentWeek['status'], { label: string; tone: 'warning' | 'danger' | 'neutral' }> = {
  not_started: { label: 'Nothing saved', tone: 'warning' },
  draft: { label: 'Draft, not sent', tone: 'neutral' },
  sent_back: { label: 'Sent back', tone: 'danger' },
};

/** TIM-15 Not sent: the person's past weeks to send, newest first; "Open week" goes to the grid; payroll needs full weeks. */
export function NotSentWeeks({ weeks, onOpenWeek, onShowOlder }: { weeks: NotSentWeek[]; onOpenWeek: (week: string) => void; /** The last 12 weeks are shown; this asks for up to a year. */ onShowOlder?: () => void }) {
  const columns: TableColumn<NotSentWeek & { id: string }>[] = [
    { key: 'week', header: 'Week', value: (r) => `${formatDate(new Date(`${r.week}T00:00:00`))} – ${formatDate(new Date(new Date(`${r.week}T00:00:00`).getTime() + 6 * 864e5))}` },
    { key: 'status', header: 'Status', type: 'status', value: (r) => NOT_SENT_LABEL[r.status].label, statusTone: (v) => Object.values(NOT_SENT_LABEL).find((x) => x.label === v)?.tone ?? 'neutral' },
    { key: 'hours', header: 'Hours saved', type: 'number', value: (r) => (r.totalMinutes ? Math.round((r.totalMinutes / 60) * 10) / 10 : null) },
    { key: 'note', header: 'Note', value: (r) => (r.locked ? 'Month locked: ask HR for a correction' : '') },
  ];
  return (
    <div className="yx-tim-stack">
      <p className="yx-tim-muted">Past weeks you have not sent yet. Payroll needs full weeks, so send each one.</p>
      {weeks.length === 0 ? (
        <EmptyState title="Every past week is sent." description="Weeks you still have to send appear here, with any your project manager sent back." />
      ) : (
        <DataTable label="Weeks not sent" rows={weeks.map((w) => ({ ...w, id: w.week }))} columns={columns} getRowId={(r) => r.id} rowButtons={(r) => (r.locked ? null : <Button size="sm" onClick={() => onOpenWeek(r.week)}>Open week</Button>)} />
      )}
      {onShowOlder && (
        <div>
          <Button size="sm" onClick={onShowOlder}>Show older</Button>
        </div>
      )}
    </div>
  );
}
const SAMPLE_NOT_SENT: NotSentWeek[] = [
  { week: '2026-09-21', status: 'sent_back', totalMinutes: 2280, locked: false },
  { week: '2026-09-07', status: 'draft', totalMinutes: 960, locked: false },
  { week: '2026-08-24', status: 'not_started', totalMinutes: 0, locked: true },
];

/* ---------- live: /time/timesheet (TIM-15) ---------- */

/** Me › Timesheet: the person's own weeks, saved as a draft and sent to the project manager (P03). */
export interface LiveTimesheet {
  state: LoadState;
  onRetry?: () => void;
  data: MyTimesheet | null;
  /** Monday of the week shown (yyyy-mm-dd). */
  week: string;
  today: string;
  onWeek: (week: string) => void;
  onSave: (week: string, lines: TimesheetLineInput[]) => Promise<unknown>;
  onSubmit: (week: string) => Promise<unknown>;
  onWithdraw: (id: string) => Promise<unknown>;
  /** TIM-43 "Pre-fill from my tools" (the person's own tools and the week's suggestions). */
  prefill?: LivePrefill;
  /** Keka ideas (2026-11): the Time summary view (GET /time/me/timesheet/summary). */
  summary?: { state: LoadState; data: { year: number; years: number[]; weeks: TimeSummaryWeek[] } | null; onYear: (year: number) => void };
  /** Batch D A3: last week's sheet, loaded while this week is shown (for "Copy last week"). */
  lastWeek?: MyTimesheet | null;
  /** Batch D A8: my leave, so "Request leave" opens the leave drawer here (unsaved hours stay on the grid). */
  leave?: { data: MyLeave | null; live: LiveLeaveHome };
  /** Batch D A5: my weeks not sent (GET /time/me/timesheet/not-sent); `onShowOlder` asks for a year. */
  notSent?: { state: LoadState; data: { weeks: NotSentWeek[] } | null; onShowOlder?: () => void };
  /** T2-D 55: the projects I am or was on, with my hours (GET /time/me/timesheet/projects). */
  myProjects?: { state: LoadState; data: MyProject[] | null; onRetry?: () => void };
}

const ACTIVITY_TEXT: Record<string, string> = {
  'timesheet.submitted': 'Sent to the project manager',
  'timesheet.withdrawn': 'Recalled to edit',
  'timesheet.approved': 'Week approved',
  'timesheet.rejected': 'Week sent back',
  'timesheet_line.approved': 'approved',
  'timesheet_line.reduced': 'reduced',
  'timesheet_line.rejected': 'rejected',
};

/** T2-D 62 (Keka A6): the week's activity, newest first, with who and when. */
export function TimesheetActivityCard({ activity, projects }: { activity: TimesheetActivity[]; projects: { id: string; code: string }[] }) {
  if (!activity.length) return null;
  const code = (id: string | null) => projects.find((x) => x.id === id)?.code ?? 'A line';
  return (
    <Card title="Activity">
      <ul className="yx-tim-list" aria-label="Timesheet activity">
        {activity.map((a, i) => (
          <li key={`${a.action}-${a.at}-${i}`}>
            <strong>{a.action.startsWith('timesheet_line.') ? `${code(a.projectId)}${a.task ? ` · ${a.task}` : ''} ${ACTIVITY_TEXT[a.action] ?? a.action}` : (ACTIVITY_TEXT[a.action] ?? a.action)}</strong>
            <span className="yx-tim-muted">
              {' '}
              · {formatDate(new Date(a.at))}, {new Date(a.at).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Kolkata' })}
              {a.by ? ` · ${a.by}` : ''}
              {a.reason ? ` · Reason: ${a.reason}` : ''}
            </span>
          </li>
        ))}
      </ul>
    </Card>
  );
}

const hoursText = (m: number) => `${Math.round((m / 60) * 100) / 100} h`;

/** T2-D 55 (Keka A10 / A11): my projects, current first, with my allocation and my hours booked and approved. */
export function MyProjectsTable({ projects }: { projects: MyProject[] }) {
  const rows = [...projects].sort((a, b) => Number(b.current) - Number(a.current) || a.code.localeCompare(b.code));
  if (!rows.length) return <EmptyState compact title="No projects yet." description="Projects you are allocated to show here with your hours." />;
  return (
    <PlainTable<MyProject>
      label="My projects"
      columns={[
        { key: 'project', header: 'Project', cell: (p) => `${p.code} · ${p.name}`, rowHeader: true },
        { key: 'me', header: 'My allocation', cell: (p) => p.allocations.map((a) => `${a.role ? `${a.role}, ` : ''}${a.percent}% from ${isoDate(a.fromOn)}${a.toOn ? ` to ${isoDate(a.toOn)}` : ''}${a.tentative ? ' (tentative)' : ''}`).join('; ') || 'Not allocated' },
        { key: 'status', header: 'Status', cell: (p) => <Badge tone={p.current ? 'success' : 'neutral'}>{p.current ? 'On it now' : p.status === 'active' ? 'Not on it now' : 'Project ' + p.status}</Badge> },
        { key: 'pm', header: 'Project manager', cell: (p) => p.manager ?? '—' },
        { key: 'booked', header: 'My hours booked', cell: (p) => hoursText(p.bookedMinutes), num: true },
        { key: 'approved', header: 'Approved', cell: (p) => hoursText(p.approvedMinutes), num: true },
      ]}
      rows={rows}
      getRowId={(p) => p.id}
    />
  );
}

/** T2-D 61: the person's choice of grid or day cards, kept on this device only. */
const VIEW_KEY = 'yx.timesheet.layout';
function useWeekLayout(): ['auto' | 'grid' | 'days', (v: 'grid' | 'days') => void] {
  const [v, setV] = useState<'auto' | 'grid' | 'days'>(() => {
    try {
      const x = window.localStorage.getItem(VIEW_KEY);
      return x === 'grid' || x === 'days' ? x : 'auto';
    } catch {
      return 'auto';
    }
  });
  return [
    v,
    (x) => {
      setV(x);
      try {
        window.localStorage.setItem(VIEW_KEY, x);
      } catch {
        /* storage off: the choice lasts this visit */
      }
    },
  ];
}
const LIVE_STATUS: Record<NonNullable<MyTimesheet['sheet']>['status'], TimesheetStatus> = { draft: 'draft', pending: 'submitted', approved: 'approved', rejected: 'sent_back' };
const localDay = (iso: string) => new Date(Number(iso.slice(0, 4)), Number(iso.slice(5, 7)) - 1, Number(iso.slice(8, 10)));
const isoPlus = (iso: string, n: number) => new Date(Date.UTC(Number(iso.slice(0, 4)), Number(iso.slice(5, 7)) - 1, Number(iso.slice(8, 10)) + n)).toISOString().slice(0, 10);
const weekRange = (iso: string) => `${dayMonth(localDay(iso))} – ${dayMonth(localDay(isoPlus(iso, 6)))}`;

function LiveTimesheetScreen({ live }: { live: LiveTimesheet }) {
  const { toast } = useToast();
  const d = live.data;
  const [lines, setLines] = useState<TimesheetLine[]>([]);
  const [problems, setProblems] = useState<string[]>([]);
  const [pf, setPf] = useState(false);
  const [view, setView] = useState('week');
  const [layout, setLayout] = useWeekLayout();
  const { busy, error, run } = useRun();
  useEffect(() => {
    if (d) setLines(d.lines.map((l) => ({ id: l.id, projectId: l.projectId, taskId: l.activity, billable: l.billable, hours: l.minutes.map((m) => (m ? Math.round((m / 60) * 100) / 100 : null)), comments: Array.from({ length: 7 }, (_, k) => l.comments?.[k] ?? '') })));
    setProblems([]);
  }, [d]);
  const input = (): TimesheetLineInput[] => lines.filter((l) => l.projectId).map((l) => ({ projectId: l.projectId!, activity: l.taskId, billable: l.billable, minutes: l.hours.map((h) => Math.round((h ?? 0) * 60)), comments: Array.from({ length: 7 }, (_, k) => (l.comments?.[k] ?? '').trim()) }));
  // Answer 1787: the company's comment rule, per day with hours (the API checks it again on submit).
  const noteRule = d?.noteRule;
  const days: TimesheetDay[] = (d?.days ?? []).map((x) => (x.holiday ? { expected: 0, kind: 'holiday', label: x.holiday } : x.leave === 'full' ? { expected: 0, kind: 'leave', label: 'On leave' } : x.leaveRequested ? { expected: 0, kind: 'workday', label: 'Leave requested' } : { expected: 0, kind: 'workday' }));
  // Batch D A8 (answer 2539): the leave drawer opens on today in this week, else on the week's Monday.
  const [leaveOn, setLeaveOn] = useState<string | null>(null);
  const locked = (d?.days ?? []).filter((x) => x.locked);
  const allLocked = !!d && locked.length === d.days.length;
  const st: TimesheetStatus = allLocked ? 'locked' : d?.sheet ? LIVE_STATUS[d.sheet.status] : 'draft';
  const editable = st === 'draft' || st === 'sent_back';
  const thisWeek = isoPlus(live.today, -((localDay(live.today).getDay() + 6) % 7));
  const go = (week: string) => {
    setProblems([]);
    live.onWeek(week);
  };
  // Batch D A3 (answer 2533): as drawn, into this week's empty cells, working days up to today, still-allocated projects.
  const copyLast = () => {
    if (!d || !live.lastWeek) return;
    const from: TimesheetLine[] = live.lastWeek.lines.map((l) => ({ id: l.id, projectId: l.projectId, taskId: l.activity, billable: l.billable, hours: l.minutes.map((m) => (m ? Math.round((m / 60) * 100) / 100 : null)) }));
    const open = d.days.map((x, i) => (!x.holiday && x.leave !== 'full' && !x.locked && x.on <= live.today ? i : -1)).filter((i) => i >= 0);
    const active = new Set(d.projects.filter((x) => x.active).map((x) => x.id));
    const [ls, changed] = copyWeekInto(lines, from, open, (pid) => active.has(pid ?? ''));
    setLines(ls);
    const after = isoPlus(live.today, 1);
    toast({
      tone: changed.length ? 'success' : 'default',
      title: changed.length
        ? `Copied ${changed.map((i) => isoDate(d.days[i]!.on)).join(', ')} from ${weekRange(live.lastWeek.week)} into empty cells.${after <= isoPlus(d.week, 6) ? ` Days from ${isoDate(after)} fill in on the day.` : ''} Save the draft to keep them.`
        : 'Nothing to copy: the open days already have hours, or last week has none for your current projects.',
    });
  };
  const send = () => {
    const p = checkTimesheet(lines, 24, noteRule).map((x) => x.message);
    setProblems(p);
    if (p.length || !d) return;
    void run('submit', async () => {
      await live.onSave(d.week, input());
      await live.onSubmit(d.week);
    });
  };
  const gate = (
    <LiveGate state={live.state} onRetry={live.onRetry} what="your timesheet">
      {d && (
        <div className="yx-tim-stack">
          {locked.length > 0 && !allLocked && (
            <InlineAlert tone="warning" title="Part of this week is locked">
              {locked.map((x) => isoDate(x.on)).join(', ')}: the month is closed, so those hours can't change.
            </InlineAlert>
          )}
          {error && <InlineAlert tone="danger" title="That did not work">{error}</InlineAlert>}
          <div className="yx-tim-row">
            <Segment label="Show the week as" value={layout === 'days' ? 'days' : 'grid'} onChange={(x) => setLayout(x as 'grid' | 'days')} options={[{ value: 'grid', label: 'Grid' }, { value: 'days', label: 'Day cards' }]} />
          </div>
          <TimesheetGrid
            layout={layout}
            weekStart={localDay(d.week)}
            days={days}
            status={st}
            lines={lines}
            onLinesChange={setLines}
            // T2-D 56 (answer 2866): the tasks assigned to me come first (the API orders them) and say so.
            projects={d.projects.map((x) => ({ id: x.id, code: x.code, name: x.name, billable: x.billable, tasks: x.activities.map((a) => ({ id: a, name: x.myTasks?.includes(a) ? `${a} (assigned to you)` : a })) }))}
            onPrevWeek={() => go(isoPlus(d.week, -7))}
            // At this week the arrow stays and says why.
            onNextWeek={() => (d.week >= thisWeek ? toast({ title: 'Next week opens on Monday.' }) : go(isoPlus(d.week, 7)))}
            onThisWeek={d.week < isoPlus(thisWeek, -7) ? () => go(thisWeek) : undefined}
            onCopyLastWeek={editable && d.week === thisWeek && live.lastWeek ? copyLast : undefined}
            onRequestLeave={live.leave?.data && !allLocked ? () => setLeaveOn(live.today >= d.week && live.today <= isoPlus(d.week, 6) ? live.today : d.week) : undefined}
            onSaveDraft={editable ? () => void run('save', async () => { await live.onSave(d.week, input()); toast({ tone: 'success', title: `Draft saved for ${weekRange(d.week)}.` }); }) : undefined}
            saving={busy === 'save'}
            today={localDay(live.today)}
            noteRule={noteRule}
            footNote={editable ? `Goes ${st === 'sent_back' ? 'back ' : ''}to the project manager.` : undefined}
            submitAction={editable ? <Button variant="primary" loading={busy === 'submit'} onClick={send}>{st === 'sent_back' ? 'Resubmit week' : 'Submit week'}</Button> : undefined}
          />
          {editable && problems.length > 0 && <InlineAlert tone="danger" title="Fix these before sending">{problems.join('. ')}.</InlineAlert>}
          {st === 'submitted' && (
            <div className="yx-tim-row">
              <span className="yx-tim-muted">Waiting for the project manager.</span>
              <Button size="sm" loading={busy === 'withdraw'} onClick={() => void run('withdraw', () => live.onWithdraw(d.sheet!.id))}>Recall to edit</Button>
            </div>
          )}
          {/* Projects P-2 (1406, 1408): each reduced or rejected line with the reason, and anything the client sent back. */}
          {(() => {
            const code = (pid: string) => d.projects.find((x) => x.id === pid)?.code ?? 'Project';
            const h = (ms: number[]) => Math.round((ms.reduce((a, b) => a + b, 0) / 60) * 100) / 100;
            const changed = d.lines.filter((l) => l.decision === 'reduced' || l.decision === 'rejected' || l.clientStatus === 'sent_back');
            const waiting = d.lines.filter((l) => l.decision === 'pending').length;
            return (
              <>
                {st === 'submitted' && waiting > 0 && waiting < d.lines.length && <p className="yx-tim-muted">{d.lines.length - waiting} of {d.lines.length} lines decided; the rest are waiting.</p>}
                {changed.length > 0 && (
                  <InlineAlert tone="warning" title="Some hours were changed">
                    <ul className="yx-tim-list" aria-label="Changed hours">
                      {changed.map((l) => (
                        <li key={l.id}>
                          {code(l.projectId)}
                          {l.activity ? ` · ${l.activity}` : ''}:{' '}
                          {l.decision === 'rejected' ? `${h(l.minutes)} h rejected` : l.decision === 'reduced' ? `reduced from ${h(l.minutes)} h to ${h(l.approvedMinutes ?? [])} h` : 'sent back by the client'}
                          {l.decision === 'reduced' || l.decision === 'rejected' ? `. Reason: ${l.reason ?? ''}` : l.clientNote ? `. Note: ${l.clientNote}` : ''}
                        </li>
                      ))}
                    </ul>
                  </InlineAlert>
                )}
              </>
            );
          })()}
          {st === 'approved' && <p className="yx-tim-muted">Approved by the project manager.</p>}
          <TimesheetActivityCard activity={d.activity ?? []} projects={d.projects} />
        </div>
      )}
    </LiveGate>
  );
  return (
    <TimePage active="My timesheet">
      <PageHeader title="My timesheet" description={d ? `Approver: the project manager · ${d.mode === 'timesheet' ? 'your days come from this timesheet' : 'your days come from your check-ins; hours here don’t change your attendance'}` : 'Approver: the project manager'} actions={live.prefill && d && editable && d.week <= thisWeek ? <Button icon={Link2} onClick={() => setPf(true)}>Pre-fill from my tools</Button> : undefined} />
      {live.leave?.data && leaveOn && <ApplyLeavePanel open onOpenChange={(o) => !o && setLeaveOn(null)} live={{ data: live.leave.data, live: live.leave.live, startOn: leaveOn }} />}
      {live.prefill && d && <PrefillDrawer open={pf} onOpenChange={setPf} lines={lines} onLinesChange={setLines} live={{ prefill: live.prefill, week: d.week, projects: d.projects.filter((x) => x.active) }} />}
      {live.summary ? (
        <Tabs value={view} onValueChange={setView}>
          <TabsList aria-label="My timesheet views">
            <TabsTrigger value="week">Week</TabsTrigger>
            <TabsTrigger value="summary">Time summary</TabsTrigger>
            {live.notSent && <TabsTrigger value="not-sent">{`Not sent${live.notSent.data?.weeks.length ? ` (${live.notSent.data.weeks.length})` : ''}`}</TabsTrigger>}
            {live.myProjects && <TabsTrigger value="projects">My projects</TabsTrigger>}
          </TabsList>
          {live.myProjects && (
            <TabsContent value="projects">
              <LiveGate state={live.myProjects.state} onRetry={live.myProjects.onRetry} what="your projects">
                {live.myProjects.data && <MyProjectsTable projects={live.myProjects.data} />}
              </LiveGate>
            </TabsContent>
          )}
          <TabsContent value="week">{gate}</TabsContent>
          {live.notSent && (
            <TabsContent value="not-sent">
              <LiveGate state={live.notSent.state} what="your weeks not sent">
                {live.notSent.data && (
                  <NotSentWeeks
                    weeks={live.notSent.data.weeks}
                    onShowOlder={live.notSent.onShowOlder}
                    onOpenWeek={(w) => {
                      setView('week');
                      go(w);
                    }}
                  />
                )}
              </LiveGate>
            </TabsContent>
          )}
          <TabsContent value="summary">
            <LiveGate state={live.summary.state} what="your time summary">
              {live.summary.data && (
                <TimeSummary
                  year={live.summary.data.year}
                  years={live.summary.data.years}
                  onYear={live.summary.onYear}
                  weeks={live.summary.data.weeks}
                  onOpenWeek={(w) => {
                    setView('week');
                    go(w);
                  }}
                />
              )}
            </LiveGate>
          </TabsContent>
        </Tabs>
      ) : (
        gate
      )}
    </TimePage>
  );
}

export function TimesheetScreen({ status = 'draft', layout = 'auto', prefillOpen = false, prefillView = 'suggestions', initialLines, noteRule, view, leaveOpen, live }: { status?: TimesheetStatus; layout?: 'auto' | 'days'; prefillOpen?: boolean; prefillView?: PrefillView; initialLines?: TimesheetLine[]; /** Answer 1787: a comment per day with hours, with a live word count. */ noteRule?: TimesheetNoteRule; /** Keka ideas: open on the Time summary. */ view?: 'week' | 'summary' | 'not-sent'; /** Batch D A8: the leave drawer open (story). */ leaveOpen?: boolean; /** The live app's /time/timesheet. */ live?: LiveTimesheet }) {
  if (live) return <LiveTimesheetScreen live={live} />;
  return <SampleTimesheet status={status} layout={layout} prefillOpen={prefillOpen} prefillView={prefillView} initialLines={initialLines} noteRule={noteRule} view={view} leaveOpen={leaveOpen} />;
}

/** Keka ideas: the sample year for the Time summary, Monday 5 Jan to the week before this one (sample hours). */
const SAMPLE_WEEKS: TimeSummaryWeek[] = Array.from({ length: 38 }, (_, i) => {
  const d = new Date(2026, 0, 5 + i * 7);
  const week = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  return { week, totalMinutes: [2400, 2280, 2520, 2400, 1920, 2400, 2700][i % 7]!, status: i === 37 ? 'pending' : i === 30 ? 'rejected' : 'approved' };
});

function SampleTimesheet({ status, layout, prefillOpen, prefillView, initialLines, noteRule, view = 'week', leaveOpen: leaveOpen0 = false }: { status: TimesheetStatus; layout: 'auto' | 'days'; prefillOpen: boolean; prefillView: PrefillView; initialLines?: TimesheetLine[]; noteRule?: TimesheetNoteRule; view?: 'week' | 'summary' | 'not-sent'; leaveOpen?: boolean }) {
  const { toast } = useToast();
  const [tab, setTab] = useState<string>(view);
  // Batch D A8: Request leave opens the leave drawer on the timesheet (the design's own Apply leave).
  const [leaveOpen, setLeaveOpen] = useState(leaveOpen0);
  // `status` is for the week the story opens on: a draft is this week, locked is the August week, every other status is last week.
  const [offset, setOffset] = useState(status === 'draft' ? 0 : status === 'locked' ? -5 : -1);
  const [edits, setEdits] = useState<Record<number, TimesheetLine[]>>(initialLines ? { 0: initialLines } : {});
  const [statusOver, setStatusOver] = useState<Record<number, TimesheetStatus>>({});
  const [problems, setProblems] = useState<string[]>([]);
  const [pf, setPf] = useState(prefillOpen);
  const [correctionFor, setCorrectionFor] = useState<string | null>(null);
  const base = weekData(offset, status);
  const onThis = offset === 0;
  const st: TimesheetStatus = statusOver[offset] ?? base.status;
  const weekStart = addWeeks(THIS_MONDAY, offset);
  const lines = edits[offset] ?? base.lines;
  const setLines = (ls: TimesheetLine[]) => setEdits((e) => ({ ...e, [offset]: ls }));
  const thisLines = edits[0] ?? TS_LINES;
  const setThisLines = (ls: TimesheetLine[]) => setEdits((e) => ({ ...e, 0: ls }));
  const editable = st === 'draft' || st === 'sent_back';
  const range = (d: Date) => `${dayMonth(d)} – ${dayMonth(new Date(d.getFullYear(), d.getMonth(), d.getDate() + 6))}`;
  // The manager queried one cell; resubmitting without touching it ignores the query.
  const queriedUnchanged = st === 'sent_back' && lines.find((l) => l.id === QUERIED.lineId)?.hours[QUERIED.day] === QUERIED.hours;
  const go = (o: number) => { setOffset(o); setProblems([]); };
  const resubmit = () => {
    const p = checkTimesheet(lines, 24, noteRule).map((x) => x.message);
    setProblems(p);
    if (!p.length) setStatusOver((s) => ({ ...s, [offset]: 'submitted' }));
  };
  const copyLast = () => {
    const [ls, days] = copyLastWeek(thisLines);
    setThisLines(ls);
    toast({
      tone: days.length ? 'success' : 'default',
      title: days.length
        ? `Copied ${days.map((d) => DAY_NAMES[d]).join(' and ')} from ${range(addWeeks(THIS_MONDAY, -1))} into empty cells. Days from ${dayMonth(LOCK_FROM)} fill in on the day.`
        : `Nothing to copy: the days up to today already have hours. Days from ${dayMonth(LOCK_FROM)} fill in on the day.`,
    });
  };
  const addCorrection = () => {
    setCorrectionFor(range(weekStart));
    // An adjustment line: one hours field, kept out of this week's day totals.
    setThisLines([...thisLines, { ...newTimesheetLine(), correctionFor: range(weekStart) }]);
    go(0);
  };
  const clientNote = lines.some((l) => l.projectId === 'pr2') && <p className="yx-tim-note">SRF-24 client hours are also checked by S. Balaji, Sundaram Retail Foods.</p>;
  const correctionAlert = onThis && (
    <>
      {correctionFor && <InlineAlert tone="info" title={`Correction for ${correctionFor}`}>Pick the project and task in the new row at the end, and enter the hours you missed. Your manager sees it with this week.</InlineAlert>}
    </>
  );
  // Weeks are sent on the Monday after they end; the approver acts the same day.
  const sentOn = dayMonth(addWeeks(weekStart, 1));
  const weekFacts =
    st === 'submitted' ? (
      <div className="yx-tim-row">
        <span className="yx-tim-muted">Waiting for {ME.manager} since {sentOn}.</span>
        <Button size="sm" onClick={() => setStatusOver((s) => ({ ...s, [offset]: 'draft' }))}>Recall to edit</Button>
      </div>
    ) : st === 'approved' ? (
      <p className="yx-tim-muted">Approved by {ME.manager} on {sentOn}.</p>
    ) : null;
  // Submit sits after the hours (phone and desk), and is blocked until the last workday of the week. Answer 1886: the
  // hint beside it says why once; pressed too early, the error box says it and the hint steps aside.
  const [submitBtn, submitHint] = !editable
    ? [null, null]
    : onThis
      ? // Never disabled: pressed too early, it says why.
        [<Button key="s" variant="primary" onClick={() => setProblems(['Submit opens Thu 1 Oct, your last workday this week (Fri 2 Oct is Gandhi Jayanti)'])}>Submit week</Button>, problems.length === 0 ? 'Opens Thu 1 Oct, your last workday this week (Fri 2 Oct is Gandhi Jayanti).' : null]
      : queriedUnchanged
        ? [<Button key="s" variant="primary" onClick={() => setProblems(['Change the SRF-24 hours on Tue 22 Sep first: your manager queried them'])}>Resubmit week</Button>, problems.length === 0 ? 'Change the SRF-24 hours on Tue 22 Sep first.' : null]
        : [<Button key="s" variant="primary" onClick={resubmit}>{st === 'sent_back' ? 'Resubmit week' : 'Submit week'}</Button>, `Goes ${st === 'sent_back' ? 'back ' : ''}to ${ME.manager}.`];
  const problemsAlert = editable && problems.length > 0 && <InlineAlert tone="danger" title="Fix these before sending">{problems.join('. ')}.</InlineAlert>;
  // Phone: Submit sits after the hours; desk: in the grid's footer bar beside Save draft (founder reference, 16 Nov 2026).
  const submitRow = editable && (
    <div className="yx-tim-stack">
      {problemsAlert}
      <div className="yx-tim-row">
        {submitBtn}
        {submitHint && <span className="yx-tim-muted">{submitHint}</span>}
      </div>
    </div>
  );
  const grid = (
    <TimesheetGrid
      weekStart={weekStart}
      days={base.days}
      status={st}
      lines={lines}
      onLinesChange={setLines}
      projects={TS_PROJECTS}
      onPrevWeek={() => go(offset - 1)}
      onNextWeek={onThis ? undefined : () => go(offset + 1)}
      onThisWeek={offset < -1 ? () => go(0) : undefined}
      // Copying last week would overwrite hours fixed for a sent-back week.
      onCopyLastWeek={onThis ? copyLast : undefined}
      onRequestLeave={() => setLeaveOpen(true)}
      onSaveDraft={() => toast({ tone: 'success', title: `Draft saved for ${range(weekStart)}.` })}
      sentBackReason={st === 'sent_back' ? 'SRF-24 audit visits on Tue 22 Sep look high: 3 h for a 1 h visit. Move the travel time to Internal.' : undefined}
      sentBackCell={st === 'sent_back' ? { lineId: QUERIED.lineId, day: QUERIED.day, by: ME.manager } : undefined}
      // Days from tomorrow (Wed 30 Sep) are filled on the day.
      lockFrom={LOCK_FROM}
      today={TODAY}
      onAddCorrection={st === 'locked' ? addCorrection : undefined}
      layout={layout}
      noteRule={noteRule}
      submitAction={layout === 'days' ? undefined : submitBtn}
      footNote={layout === 'days' ? undefined : submitHint}
    />
  );
  const prefillBtn = onThis && editable && <Button icon={Link2} onClick={() => setPf(true)}>Pre-fill from my tools</Button>;
  const drawer = (
    <>
      {onThis && <PrefillDrawer open={pf} onOpenChange={setPf} view={prefillView} lines={thisLines} onLinesChange={setThisLines} />}
      <ApplyLeavePanel open={leaveOpen} onOpenChange={setLeaveOpen} from={TODAY0_TS} to={TODAY0_TS} />
    </>
  );
  if (layout === 'days')
    return (
      <PhoneFrame tab="time" title="My timesheet">
        <p className="yx-tim-muted">Approver: {ME.manager}</p>
        {prefillBtn}
        {correctionAlert}
        {grid}
        {weekFacts}
        {clientNote}
        {submitRow}
        {drawer}
      </PhoneFrame>
    );
  return (
    <TimePage active="My timesheet">
      <PageHeader title="My timesheet" description={`Approver: ${ME.manager}`} actions={prefillBtn || undefined} />
      <Tabs value={tab} onValueChange={setTab}>
        <TabsList aria-label="My timesheet views">
          <TabsTrigger value="week">Week</TabsTrigger>
          <TabsTrigger value="summary">Time summary</TabsTrigger>
          <TabsTrigger value="not-sent">{`Not sent (${SAMPLE_NOT_SENT.length})`}</TabsTrigger>
        </TabsList>
        <TabsContent value="not-sent">
          <NotSentWeeks weeks={SAMPLE_NOT_SENT} onShowOlder={() => {}} onOpenWeek={(w) => { setTab('week'); go(Math.round((new Date(`${w}T00:00:00`).getTime() - THIS_MONDAY.getTime()) / (7 * 864e5))); }} />
        </TabsContent>
        <TabsContent value="week">
          <div className="yx-tim-stack">
            {correctionAlert}
            {grid}
            {problemsAlert}
            {weekFacts}
            {clientNote}
          </div>
        </TabsContent>
        <TabsContent value="summary">
          <TimeSummary
            year={2026}
            years={[2026, 2025]}
            onYear={() => {}}
            weeks={SAMPLE_WEEKS}
            onOpenWeek={(w) => {
              setTab('week');
              go(Math.round((new Date(`${w}T00:00:00`).getTime() - THIS_MONDAY.getTime()) / (7 * 864e5)));
            }}
          />
        </TabsContent>
      </Tabs>
      {drawer}
    </TimePage>
  );
}

/* =====================================================================
   TIM-43 · My timesheet › Pre-fill from my tools
   ===================================================================== */

type PrefillView = 'suggestions' | 'connect' | 'none';
type Tool = 'cal' | 'jira' | 'git';
const TOOLS: { id: Tool; label: string }[] = [
  { id: 'cal', label: 'Work calendar' },
  { id: 'jira', label: 'Issue tracker' },
  { id: 'git', label: 'Code host' },
];
const DAY_NAMES = ['Mon 28 Sep', 'Tue 29 Sep', 'Wed 30 Sep', 'Thu 1 Oct', 'Fri 2 Oct', 'Sat 3 Oct', 'Sun 4 Oct'];
/** Your matching rules: a calendar title that contains the words goes to the project and task. */
const RULES = [
  { id: 'r1', words: 'Sundaram Retail', to: 'SRF-24 · Audit visits' },
  { id: 'r2', words: 'weekly sync', to: 'INT · Meetings' },
];
interface Suggestion { id: string; day: number; projectId: string; taskId: string; hours: number; from: string; tool: Tool; by: 'rule' | 'ai'; rule?: string; state: 'new' | 'accepted' | 'rejected'; prev?: number | null; created?: boolean }
/** Only days up to today (Tue 29 Sep), only from connected tools. */
const SUGG: Suggestion[] = [
  { id: 's1', day: 0, projectId: 'pr2', taskId: 't3', hours: 2, from: 'Calendar: "Sundaram Retail supplier audit" · matched by your rule: titles with "Sundaram Retail" go to SRF-24', tool: 'cal', by: 'rule', rule: 'r1', state: 'new' },
  { id: 's2', day: 0, projectId: 'pr1', taskId: 't2', hours: 1, from: 'Estimated from 6 issues you closed in the ERP project · check the hours', tool: 'jira', by: 'ai', state: 'new' },
  { id: 's3', day: 1, projectId: 'pr3', taskId: 't6', hours: 1, from: 'Calendar: "Quality weekly sync" · matched by your rule: "weekly sync" goes to Internal meetings', tool: 'cal', by: 'rule', rule: 'r2', state: 'new' },
];
/** Expected hours on a workday this week. */
const DAY_EXPECTED = 8;
const projectLabel = (s: Suggestion) => {
  const p = TS_PROJECTS.find((x) => x.id === s.projectId);
  return `${p?.code} · ${p?.tasks.find((t) => t.id === s.taskId)?.name}`;
};

/** Suggestions merged into the week's lines: hours already on the timesheet are not offered again. */
function useSuggestions(lines: TimesheetLine[], onLinesChange: (l: TimesheetLine[]) => void, connected: Record<Tool, boolean>, view: PrefillView) {
  const [rows, setRows] = useState<Suggestion[]>(view === 'none' ? [] : SUGG);
  const [offRules, setOffRules] = useState<string[]>([]);
  // A deleted rule stops offering its new suggestions; hours already accepted stay on the timesheet.
  const visible = rows.filter((r) => connected[r.tool] && !(r.rule && offRules.includes(r.rule) && r.state !== 'accepted'));
  const lineFor = (s: Suggestion, ls = lines) => ls.find((l) => l.projectId === s.projectId && l.taskId === s.taskId);
  const onSheet = (s: Suggestion) => lineFor(s)?.hours[s.day] ?? 0;
  const already = (s: Suggestion) => s.state === 'new' && onSheet(s) >= s.hours;
  const patch = (id: string, p: Partial<Suggestion>) => setRows((rs) => rs.map((r) => (r.id === id ? { ...r, ...p } : r)));
  const merge = (ls: TimesheetLine[], s: Suggestion): [TimesheetLine[], Partial<Suggestion>] => {
    const l = lineFor(s, ls);
    if (!l) {
      const hours: (number | null)[] = Array(7).fill(null);
      hours[s.day] = s.hours;
      const billable = TS_PROJECTS.find((p) => p.id === s.projectId)?.billable ?? false;
      return [[...ls, { id: `sg-${s.id}`, projectId: s.projectId, taskId: s.taskId, billable, hours }], { state: 'accepted', created: true }];
    }
    return [ls.map((x) => (x.id === l.id ? { ...x, hours: x.hours.map((h, i) => (i === s.day ? s.hours : h)) } : x)), { state: 'accepted', prev: l.hours[s.day], created: false }];
  };
  const accept = (s: Suggestion) => {
    const [ls, p] = merge(lines, s);
    onLinesChange(ls);
    patch(s.id, p);
  };
  const acceptAll = () => {
    let ls = lines;
    const done: Record<string, Partial<Suggestion>> = {};
    visible.filter((s) => s.state === 'new' && !already(s)).forEach((s) => {
      const [next, p] = merge(ls, s);
      ls = next;
      done[s.id] = p;
    });
    onLinesChange(ls);
    setRows((rs) => rs.map((r) => (done[r.id] ? { ...r, ...done[r.id] } : r)));
  };
  const undo = (s: Suggestion) => {
    if (s.state === 'accepted') {
      onLinesChange(s.created ? lines.filter((l) => l.id !== `sg-${s.id}`) : lines.map((l) => (l === lineFor(s) ? { ...l, hours: l.hours.map((h, i) => (i === s.day ? s.prev ?? null : h)) } : l)));
    }
    patch(s.id, { state: 'new', prev: undefined, created: undefined });
  };
  const fresh = visible.filter((s) => s.state === 'new' && !already(s));
  /** The day's total if this suggestion's cell were set to `hours` (accepting replaces that cell). */
  const dayTotal = (s: Suggestion, hours: number) => Math.round((lines.reduce((a, l) => a + (l === lineFor(s) ? 0 : l.hours[s.day] ?? 0), 0) + hours) * 100) / 100;
  const rules = RULES.filter((r) => !offRules.includes(r.id));
  const deleteRule = (id: string) => setOffRules((o) => [...o, id]);
  return { rows: visible, fresh, already, onSheet, dayTotal, accept, acceptAll, undo, rules, deleteRule, reject: (s: Suggestion) => patch(s.id, { state: 'rejected' }), setHours: (s: Suggestion, hours: number) => patch(s.id, { hours }) };
}

/** Connected tools with Connect / Revoke, and the rules that match calendar titles. Same on desk and phone. */
function ToolList({ connected, setConnected, api, quietNote }: { connected: Record<Tool, boolean>; setConnected: (c: Record<Tool, boolean>) => void; api: ReturnType<typeof useSuggestions>; quietNote: boolean }) {
  const [rulesOpen, setRulesOpen] = useState(false);
  // A tool connected with nothing to match this week says so, so Connect visibly did something.
  const quiet = quietNote ? TOOLS.filter((t) => connected[t.id] && !SUGG.some((s) => s.tool === t.id)) : [];
  return (
    <Card title="Your tools">
      <div className="yx-tim-stack" style={{ gap: 'var(--yx-space-2)' }}>
      <ul className="yx-tim-list">
        {TOOLS.map((t) => (
          <li key={t.id}>
            <span>{t.label}</span>
            {connected[t.id] ? (
              <span className="yx-tim-row"><Badge tone="success">Connected</Badge><Button size="sm" onClick={() => setConnected({ ...connected, [t.id]: false })}>Revoke</Button></span>
            ) : (
              <span className="yx-tim-row"><span className="yx-tim-muted">Not connected</span><Button size="sm" onClick={() => setConnected({ ...connected, [t.id]: true })}>Connect</Button></span>
            )}
          </li>
        ))}
      </ul>
      {quiet.map((t) => <p key={t.id} className="yx-tim-note">{t.label} connected. Nothing to match this week.</p>)}
      <p className="yx-tim-note">We read event titles, times and issue status only. Nothing is written back to your tools.</p>
      <div className="yx-tim-row"><Button size="sm" onClick={() => setRulesOpen(true)}>Manage rules ({api.rules.length})</Button></div>
      </div>
      <Dialog open={rulesOpen} onOpenChange={setRulesOpen} title="Your matching rules" description="A calendar event whose title has these words is suggested for the project." footer={<Button onClick={() => setRulesOpen(false)}>Done</Button>}>
        {api.rules.length ? (
          <ul className="yx-tim-list">
            {api.rules.map((r) => (
              <li key={r.id}>
                <span>Titles with "{r.words}" go to {r.to}</span>
                <Button size="sm" variant="danger" onClick={() => api.deleteRule(r.id)}>Delete rule</Button>
              </li>
            ))}
          </ul>
        ) : (
          <p className="yx-tim-muted">No rules left. Calendar events are no longer matched to a project by a rule.</p>
        )}
      </Dialog>
    </Card>
  );
}

/** The text column takes the row until it would be narrower than this; then the buttons drop below it (phones). */
const SUGG_MAIN = { flexBasis: 'calc(var(--yx-space-16) * 5)' } as const;
const nowrap = { whiteSpace: 'nowrap' } as const;

function SuggestionList({ api }: { api: ReturnType<typeof useSuggestions> }) {
  const [editing, setEditing] = useState<string | null>(null);
  const [draft, setDraft] = useState<number | null>(null);
  return (
    <ul className="yx-tim-list" aria-label="Suggestions">
      {api.rows.map((r) => {
        const had = api.onSheet(r);
        // Rule rows say "matched by your rule" in the text, so only the AI estimate gets a badge.
        const tag = r.by === 'ai' ? <AiBadge /> : null;
        const [code, task] = projectLabel(r).split(' · ');
        const total = editing === r.id ? api.dayTotal(r, draft ?? 0) : 0;
        const dayShort = DAY_NAMES[r.day].slice(0, 3);
        return (
          <li key={r.id}>
            <span className="yx-tim-list__main" style={SUGG_MAIN}>
              <strong>{DAY_NAMES[r.day]} · {r.hours} h</strong>
              <span><span style={nowrap}>{code}</span> · {task}</span>
              <span className="yx-tim-muted">{r.from}{r.state === 'new' && had > 0 && had < r.hours ? ` · adds ${r.hours - had} h to the ${had} h already there` : ''} {tag}</span>
              {editing === r.id && (
                <span className="yx-tim-row">
                  <NumberField aria-label={`Hours for ${projectLabel(r)}`} value={draft} onChange={setDraft} min={0} max={24} decimals size="sm" />
                  <Button size="sm" onClick={() => setEditing(null)}>Cancel</Button>
                  {/* Never disabled: the reason shows beside it. */}
                  <Button size="sm" variant="primary" onClick={() => { if (!draft || total > 24) return; api.setHours(r, draft); setEditing(null); }}>Save hours</Button>
                  {!draft ? (
                    <span className="yx-tim-muted">Enter the hours first.</span>
                  ) : total > 24 ? (
                    <span className="yx-tim-muted">{dayShort} would be {total} h. A day can have at most 24 h.</span>
                  ) : total > DAY_EXPECTED ? (
                    <Badge tone="warning">{dayShort} would be {total} h</Badge>
                  ) : null}
                </span>
              )}
            </span>
            {api.already(r) ? (
              <Badge tone="neutral">Already on your timesheet</Badge>
            ) : r.state === 'new' ? (
              editing !== r.id && (
                <span className="yx-tim-row">
                  <Button size="sm" onClick={() => api.reject(r)}>Reject</Button>
                  <Button size="sm" onClick={() => { setDraft(r.hours); setEditing(r.id); }}>Edit</Button>
                  <Button size="sm" variant="approve" onClick={() => api.accept(r)}>Accept</Button>
                </span>
              )
            ) : (
              <span className="yx-tim-row">
                <Badge tone={r.state === 'accepted' ? 'success' : 'neutral'}>{r.state === 'accepted' ? `Added to ${DAY_NAMES[r.day].slice(0, 3)} · ${projectLabel(r).split(' · ')[0]}` : 'Rejected'}</Badge>
                <Button size="sm" onClick={() => api.undo(r)}>Undo</Button>
              </span>
            )}
          </li>
        );
      })}
    </ul>
  );
}

export function PrefillDrawer({ live, ...p }: { open: boolean; onOpenChange: (o: boolean) => void; view?: PrefillView; lines: TimesheetLine[]; onLinesChange: (l: TimesheetLine[]) => void; /** The live timesheet's tools and suggestions. */ live?: { prefill: LivePrefill; week: string; projects: PrefillProject[] } }) {
  return live ? <LivePrefillDrawer open={p.open} onOpenChange={p.onOpenChange} lines={p.lines} onLinesChange={p.onLinesChange} live={live.prefill} week={live.week} projects={live.projects} /> : <SamplePrefillDrawer {...p} />;
}
function SamplePrefillDrawer({ open, onOpenChange, view = 'suggestions', lines, onLinesChange }: { open: boolean; onOpenChange: (o: boolean) => void; view?: PrefillView; lines: TimesheetLine[]; onLinesChange: (l: TimesheetLine[]) => void }) {
  const [connected, setConnected] = useState<Record<Tool, boolean>>({ cal: view !== 'connect', jira: view !== 'connect', git: false });
  const api = useSuggestions(lines, onLinesChange, connected, view);
  const anyConnected = connected.cal || connected.jira || connected.git;
  const firstOff = TOOLS.find((t) => !connected[t.id]);
  return (
    <Drawer
      open={open}
      onOpenChange={onOpenChange}
      title="Pre-fill from my tools"
      subtitle="Suggestions only. You still submit the week yourself."
      size="lg"
      footer={
        <>
          <Button onClick={() => onOpenChange(false)}>Back to timesheet</Button>
          {api.fresh.length > 0 && <Button variant="approve" onClick={api.acceptAll}>Accept all new ({api.fresh.length})</Button>}
        </>
      }
    >
      <div className="yx-tim-stack">
        <ToolList connected={connected} setConnected={setConnected} api={api} quietNote={view !== 'none'} />
        {api.rows.length ? (
          <SuggestionList api={api} />
        ) : !anyConnected ? (
          <EmptyState
            title="Connect a tool to get suggestions"
            description="We suggest hours for days up to today from your work calendar or issue tracker."
            action={<Button onClick={() => setConnected((c) => ({ ...c, cal: true }))}>Connect work calendar</Button>}
          />
        ) : (
          <EmptyState
            title="No suggestions for this week"
            description={`Your connected tools had no events or activity we could match to your projects.${firstOff ? ` ${firstOff.label} isn't connected yet.` : ''}`}
            action={
              <>
                <Button onClick={() => onOpenChange(false)}>Fill week by hand</Button>
                {firstOff && <Button onClick={() => setConnected((c) => ({ ...c, [firstOff.id]: true }))}>Connect {firstOff.label.toLowerCase()}</Button>}
              </>
            }
          />
        )}
      </div>
    </Drawer>
  );
}

/** The drawer opens over the real week. */
export function PrefillScreen({ view = 'suggestions' }: { view?: PrefillView }) {
  return <TimesheetScreen prefillOpen prefillView={view} />;
}

export function PrefillPhone() {
  const [lines, setLines] = useState(TS_LINES);
  const [connected, setConnected] = useState<Record<Tool, boolean>>({ cal: true, jira: true, git: false });
  const [back, setBack] = useState(false);
  const api = useSuggestions(lines, setLines, connected, 'suggestions');
  if (back) return <TimesheetScreen layout="days" initialLines={lines} />;
  return (
    <PhoneFrame tab="time" title="Pre-fill" back={<IconButton icon={ArrowLeft} label="Back to timesheet" onClick={() => setBack(true)} />}>
      <ToolList connected={connected} setConnected={setConnected} api={api} quietNote />
      {api.rows.length ? <SuggestionList api={api} /> : <EmptyState title="No suggestions for this week" description="Connect a tool above, or fill the week by hand." />}
      <p className="yx-tim-note">You still submit the week yourself.</p>
      <div className="yx-tim-sheet-actions">
        {/* Full width gives the bulk action the same solid green as the desk drawer's footer. */}
        {api.fresh.length > 0 && <Button variant="approve" fullWidth onClick={api.acceptAll}>Accept all new ({api.fresh.length})</Button>}
        <Button fullWidth onClick={() => setBack(true)}>Back to timesheet</Button>
      </div>
    </PhoneFrame>
  );
}

/* =====================================================================
   TIM-16 · Attendance reports (late / early, OT, Form 25, women night-shift register)
   ===================================================================== */

type Month = 'sep' | 'aug';
type Nums = [late: number, early: number, ot: number, lop: number];
interface LateRow { id: string; label: string; loc: string; sep: Nums; aug: Nums }

/** September counts days 1–28: today (29 Sep) is still open. */
const SEP_DAYS = 28;
interface Form25Row {
  id: string; name: string; code: string; dept: 'Quality' | 'Operations';
  /** present, weekly offs, leave days, overtime hours */
  sep: [present: number, off: number, leave: number, ot: number]; aug: [number, number, number, number];
  /** late marks, early exits, unpaid days (LOP) */
  marks: { sep: [late: number, early: number, lop: number]; aug: [number, number, number] };
  /** Absent days not yet explained (open exceptions). */
  open?: { sep: number; aug: number };
  /** The day still open as an exception, for the alert. */
  openDay?: string;
}
/** Hosur plant workers (the only site under the Factories Act). The Hosur rows of the late and overtime reports add these up. */
const FORM25: Form25Row[] = [
  { id: 'w1', name: 'Sanjay Rao', code: 'KF-0131', dept: 'Quality', sep: [23, 4, 1, 0], aug: [25, 5, 1, 0], marks: { sep: [0, 0, 0], aug: [1, 0, 0] } },
  // 17 Sep: absent with no leave (LOP). 25 Sep: no punches and no leave, still an open exception.
  { id: 'w2', name: 'Gopal Iyer', code: 'KF-0144', dept: 'Quality', sep: [22, 4, 0, 3], aug: [26, 5, 0, 2], marks: { sep: [2, 0, 1], aug: [1, 0, 0] }, open: { sep: 1, aug: 0 }, openDay: '25 Sep' },
  // One weekly off a week: 4 in 1–28 Sep, 5 in August.
  { id: 'w3', name: 'Kavitha Sundaram', code: 'KF-0177', dept: 'Operations', sep: [24, 4, 0, 9.5], aug: [26, 5, 0, 6], marks: { sep: [3, 1, 0], aug: [2, 0, 0] } },
  { id: 'w4', name: 'Rekha Balan', code: 'KF-0182', dept: 'Operations', sep: [23, 4, 1, 2], aug: [25, 5, 1, 0], marks: { sep: [4, 2, 0], aug: [3, 1, 0] } },
  { id: 'w5', name: 'Anil Kumar', code: 'KF-0190', dept: 'Operations', sep: [23, 4, 1, 6], aug: [26, 5, 0, 3], marks: { sep: [2, 1, 0], aug: [1, 1, 0] } },
  // Present days include her night shifts (6 in September, 8 in August: the night register below).
  { id: 'w6', name: 'Selvi Arumugam', code: 'KF-0186', dept: 'Operations', sep: [24, 4, 0, 0], aug: [26, 5, 0, 0], marks: { sep: [0, 0, 0], aug: [0, 0, 0] } },
];
const f25Nums = (ws: Form25Row[]) => {
  const pick = (m: Month): Nums => ws.reduce<Nums>((a, w) => [a[0] + w.marks[m][0], a[1] + w.marks[m][1], a[2] + w[m][3], a[3] + w.marks[m][2]], [0, 0, 0, 0]);
  return { sep: pick('sep'), aug: pick('aug') };
};
/** Kaveri Foods Pvt Ltd, by department and site. */
const LATE: LateRow[] = [
  { id: 'a', label: 'Quality', loc: 'Chennai office', sep: [9, 2, 6.5, 2], aug: [7, 3, 5, 0] },
  { id: 'b', label: 'Quality', loc: 'Hosur plant', ...f25Nums(FORM25.filter((w) => w.dept === 'Quality')) },
  { id: 'c', label: 'Operations', loc: 'Hosur plant', ...f25Nums(FORM25.filter((w) => w.dept === 'Operations')) },
  { id: 'd', label: 'Sales', loc: 'Chennai office', sep: [8, 11, 0, 2], aug: [10, 9, 0, 1] },
  { id: 'e', label: 'Finance', loc: 'Bengaluru head office', sep: [3, 1, 4, 0], aug: [2, 0, 6, 0] },
  { id: 'f', label: 'Engineering', loc: 'Bengaluru head office', sep: [19, 4, 22, 1], aug: [16, 5, 18, 2] },
];
/** Divya's own reports (manager view). Hosur people come from Form 25. */
const MY_TEAM_NUMS: Record<string, { sep: Nums; aug: Nums }> = {
  'Arun Prakash': { sep: [1, 0, 2, 0], aug: [0, 0, 1, 0] },
  'Meera Krishnan': { sep: [3, 1, 0, 2], aug: [2, 0, 0, 0] },
  'Fathima Beevi': { sep: [1, 0, 0, 0], aug: [0, 1, 0, 0] },
  'Nisha Menon': { sep: [0, 0, 0, 0], aug: [0, 0, 1, 0] },
  'Rahul Deshpande': { sep: [1, 0, 1.5, 0], aug: [1, 0, 0, 0] },
  'Priya Shankar': { sep: [2, 1, 0, 0], aug: [1, 1, 0, 0] },
};
const teamNums = (name: string) => {
  const w = FORM25.find((x) => x.name === name);
  return w ? f25Nums([w]) : MY_TEAM_NUMS[name] ?? { sep: [0, 0, 0, 0] as Nums, aug: [0, 0, 0, 0] as Nums };
};
const LOCS = ['Bengaluru head office', 'Chennai office', 'Hosur plant'];

interface NightRow { id: string; name: string; code: string; consent: string; validTo: string; sep: number; aug: number; transport: { sep: number; aug: number } }
/** Women with night-work consent on file (Rekha Balan has none, so she is never rostered at night). */
const NIGHT: NightRow[] = [
  { id: 'n1', name: 'Kavitha Sundaram', code: 'KF-0177', consent: 'NWC-2026-014', validTo: '31 Mar 2027', sep: 12, aug: 10, transport: { sep: 12, aug: 10 } },
  // Consent valid to 28 Feb 2027, as TIM-05 NIGHT_CONSENT p8 and TIM-08 say.
  { id: 'n2', name: 'Selvi Arumugam', code: 'KF-0186', consent: 'NWC-2026-021', validTo: '28 Feb 2027', sep: 6, aug: 8, transport: { sep: 6, aug: 8 } },
];

/* ---------- live: /time/registers and /time/payroll-feed (TIM-16's statutory register card and report table) ---------- */

interface LiveReportBase {
  state: LoadState;
  onRetry?: () => void;
  /** yyyy-mm */
  month: string;
  onMonth: (month: string) => void;
}
/** HR › Registers (P07): each establishment's muster and leave registers in its state's format; every download is audited. */
export interface LiveRegisters extends LiveReportBase {
  report: 'registers';
  data: Registers | null;
  onDownload: (type: 'muster' | 'leave', locationId: string, format: 'pdf' | 'xlsx') => Promise<unknown>;
}
/** HR › Payroll feed, read only: what payroll reads per person and month; frozen at the period lock. */
export interface LivePayrollFeed extends LiveReportBase {
  report: 'feed';
  data: PayrollFeed | null;
  entities: { id: string; name: string }[];
  entityId: string | null;
  onEntity: (id: string) => void;
}
export type LiveReports = LiveRegisters | LivePayrollFeed | LiveAttendanceReport | LiveNightRegister | LiveHoursReport;

const STATE_TEXT: Record<string, string> = { 'IN-KA': 'Karnataka', 'IN-TN': 'Tamil Nadu' };
const MODE_LABEL: Record<string, string> = { punch: 'Check in and out', assumed_present: 'Present unless on leave', timesheet: 'Timesheet' };
const hoursOf = (m: number) => Math.round((m / 60) * 100) / 100;
/** The 12 months up to this one, newest first, plus the month shown if it is older. */
function monthOptions(month: string) {
  const now = new Date().toISOString().slice(0, 7);
  const list = Array.from({ length: 12 }, (_, i) => shiftMonth(now, -i));
  if (!list.includes(month)) list.push(month);
  return list.map((m) => ({ value: m, label: monthText(m) }));
}
type FeedRow = PayrollFeed['rows'][number];

function LiveReportsScreen({ live }: { live: LiveRegisters | LivePayrollFeed }) {
  const { toast } = useToast();
  const { busy, error, run } = useRun();
  const regs = live.report === 'registers';
  const feedCols: TableColumn<FeedRow>[] = [
    { key: 'name', header: 'Person', type: 'person', width: 200, value: (r) => r.name, person: (r) => ({ name: r.name, secondary: r.code ?? undefined }) },
    { key: 'mode', header: 'Mode', optional: true, value: (r) => MODE_LABEL[r.mode] ?? r.mode },
    { key: 'days', header: 'Days', type: 'number', value: (r) => r.calendarDays, render: (r) => (r.unevaluatedDays ? <span className="yx-tim-list__main"><span>{r.calendarDays}</span><Badge tone="warning">{r.unevaluatedDays} not worked out</Badge></span> : r.calendarDays) },
    { key: 'paid', header: 'Paid days', type: 'number', value: (r) => r.paidDays, total: 'sum' },
    { key: 'lop', header: 'Unpaid days (LOP)', type: 'number', value: (r) => r.lopDays, total: 'sum' },
    { key: 'otN', header: 'OT working day (h)', type: 'number', value: (r) => hoursOf(r.otNormalMinutes), total: 'sum', optional: true },
    { key: 'otW', header: 'OT weekly off (h)', type: 'number', value: (r) => hoursOf(r.otWeeklyOffMinutes), total: 'sum', optional: true },
    { key: 'otH', header: 'OT holiday (h)', type: 'number', value: (r) => hoursOf(r.otHolidayMinutes), total: 'sum', optional: true },
    { key: 'night', header: 'Night shifts', type: 'number', value: (r) => r.nightShifts, total: 'sum', optional: true },
    { key: 'comp', header: 'Comp-off', type: 'number', value: (r) => r.compOffDays, total: 'sum', optional: true },
    { key: 'ts', header: 'Timesheet (h)', type: 'number', value: (r) => hoursOf(r.timesheetMinutes), total: 'sum', optional: true },
  ];
  const download = (l: Registers['locations'][number], f: Registers['locations'][number]['formats'][number], fmt: 'pdf' | 'xlsx') =>
    void run(`${l.id}-${f.type}-${fmt}`, async () => {
      if (live.report !== 'registers') return;
      await live.onDownload(f.type, l.id, fmt);
      toast({ tone: 'success', title: `${f.title} · ${l.name} · ${monthText(live.month)} downloaded.${l.locked ? '' : ' Draft: the month is not locked yet.'}` });
    });
  const feed = live.report === 'feed' ? live : null;
  const frozen = feed?.data?.frozen;
  return (
    <TimePage active="Reports">
      <PageHeader
        title={regs ? 'Registers' : 'Payroll feed'}
        description={regs ? "The muster and leave registers each establishment keeps, in its state's format. Every column the law asks for is always there." : 'What payroll reads for each person and month. Read only: it is frozen when the month is locked.'}
        facts={
          feed?.data ? (
            <span className="yx-tim-row"><span>{monthText(feed.data.month)}</span>{frozen ? <Badge tone="neutral">Frozen{feed.data.lockedAt ? ` ${isoDate(feed.data.lockedAt)}` : ''}</Badge> : <Badge tone="warning">Preview: the month is open</Badge>}</span>
          ) : undefined
        }
        actions={
          <div className="yx-tim-row">
            {feed && feed.entities.length > 0 && <div className="yx-tim-picker"><Select aria-label="Legal entity" value={feed.entityId} onChange={(v) => v && feed.onEntity(v)} options={feed.entities.map((e) => ({ value: e.id, label: e.name }))} /></div>}
            <div className="yx-tim-picker"><Select aria-label="Month" value={live.month} onChange={(v) => v && live.onMonth(v)} options={monthOptions(live.month)} /></div>
          </div>
        }
      />
      {error && <InlineAlert tone="danger" title="Not downloaded">{error}</InlineAlert>}
      {live.report === 'registers' ? (
        <LiveGate state={live.state} onRetry={live.onRetry} what="registers">
          {live.data && !live.data.locations.length && <EmptyState title="No establishments in your scope this month" description="Registers are kept per establishment for the people working there." />}
          {live.data?.locations.map((l) => (
            <Card key={l.id} title={`${l.name} · ${monthText(live.data!.month)}`} actions={l.locked ? <Badge tone="neutral">Month locked</Badge> : <Badge tone="warning">Draft: month not locked</Badge>}>
              <div className="yx-tim-stack">
                <p className="yx-tim-muted">
                  {l.entity} · {STATE_TEXT[l.state] ?? l.state} · {plural(l.people, 'person', 'people')}
                  {l.verify ? ' · formats to be confirmed by your compliance adviser' : ''}
                </p>
                {l.formats.length ? (
                  <ul className="yx-tim-list" aria-label={`${l.name} registers`}>
                    {l.formats.map((f) => (
                      <li key={f.type}>
                        <span className="yx-tim-list__main">
                          <span>{f.title}</span>
                          <span className="yx-tim-muted">{f.form}</span>
                        </span>
                        <span className="yx-tim-row">
                          <Button size="sm" icon={Download} loading={busy === `${l.id}-${f.type}-pdf`} onClick={() => download(l, f, 'pdf')}>Download PDF</Button>
                          <Button size="sm" icon={Download} loading={busy === `${l.id}-${f.type}-xlsx`} onClick={() => download(l, f, 'xlsx')}>Download Excel</Button>
                        </span>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="yx-tim-muted">No register format for this state yet.</p>
                )}
              </div>
            </Card>
          ))}
        </LiveGate>
      ) : !live.entityId && live.state === 'ready' ? (
        <EmptyState title="No legal entity in your scope this month" description="The payroll feed is kept per legal entity for the people you can see." />
      ) : live.state === 'no-access' ? (
        <LiveGate state="no-access" what="the payroll feed" />
      ) : (
        <DataTable
          label="Payroll feed"
          columns={feedCols}
          rows={live.data?.rows ?? []}
          getRowId={(r) => r.employeeId}
          state={liveTable(live.state)}
          onRetry={live.onRetry}
          empty={<EmptyState title="No one in your scope for this month" description="The feed lists the people of this legal entity you can see." />}
        />
      )}
    </TimePage>
  );
}

/* ---------- live: /time/reports (TIM-16 late and early, overtime, women's night-shift register) ---------- */

/** Late and early or overtime: HR by department and site, a manager by person (their team). */
export interface LiveAttendanceReport extends LiveReportBase {
  report: 'late' | 'ot';
  data: AttendanceReport | null;
  onReport: (report: 'late' | 'ot' | 'night' | 'hours') => void;
}
/** Batch C item 16: Short hours and Breaks (a manager's team by person; HR's scope by person too). */
export interface LiveHoursReport extends LiveReportBase {
  report: 'hours';
  data: HoursReport | null;
  onReport: (report: 'late' | 'ot' | 'night' | 'hours') => void;
}
/** HR only: women who worked a night shift in the month, with their consent on file (OSH Code / Factories Act). */
export interface LiveNightRegister extends LiveReportBase {
  report: 'night';
  data: NightRegister | null;
  onReport: (report: 'late' | 'ot' | 'night' | 'hours') => void;
}
type ReportRow = { id: string; label: string; loc: string; late: number; early: number; ot: number; lop: number };

function saveCsv(name: string, rows: (string | number)[][]) {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([rows.map((r) => r.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(',')).join('\n')], { type: 'text/csv' }));
  a.download = name;
  a.click();
  URL.revokeObjectURL(a.href);
}

/**
 * Batch C item 16 (answers 2507, 2508): Short hours (worked days short of the shift, in the company's bands) and Breaks
 * (frequent-break days: more breaks than the company's number, or its minutes). Where clock-in-again is off, the row says
 * breaks are not recorded instead of showing zero.
 */
export function HoursReportCard({ data, month, state, onRetry, onExport }: { data: HoursReport | null; month: string; state: ReturnType<typeof liveTable>; onRetry?: () => void; onExport: () => void }) {
  const rows = data?.rows ?? [];
  const b = rows[0]?.bands ?? [4, 6, 8];
  const lim = rows[0]?.limit ?? { count: 3, minutes: 60 };
  const notRecorded = rows.filter((r) => !r.breaksRecorded).length;
  type Row = HoursReport['rows'][number];
  const muted = (r: Row, v: number | null) => (r.breaksRecorded ? v ?? 0 : null);
  const cols: TableColumn<Row>[] = [
    { key: 'name', header: 'Employee', type: 'person', width: 220, value: (x) => x.name, person: (x) => ({ name: x.name, secondary: [x.dept, x.location].filter(Boolean).join(' · ') }) },
    { key: 'b1', header: `Under ${b[0]} h`, type: 'number', value: (x) => x.short.b1, total: 'sum' },
    { key: 'b2', header: `${b[0]}–${b[1]} h`, type: 'number', value: (x) => x.short.b2, total: 'sum' },
    { key: 'b3', header: `${b[1]}–${b[2]} h`, type: 'number', value: (x) => x.short.b3, total: 'sum' },
    { key: 'freq', header: 'Frequent-break days', value: (x) => muted(x, x.frequentBreakDays) ?? -1, render: (x) => (x.breaksRecorded ? String(x.frequentBreakDays ?? 0) : <span className="yx-tim-muted">Breaks not recorded</span>) },
    { key: 'breaks', header: 'Breaks', type: 'number', value: (x) => muted(x, x.breaks) ?? 0, optional: true },
    { key: 'mins', header: 'Break time (h)', type: 'number', value: (x) => (x.breaksRecorded ? hoursOf(x.breakMinutes ?? 0) : 0), optional: true },
  ];
  return (
    <Card title={`Short hours and breaks · ${monthText(month)}`}>
      <div className="yx-tim-stack">
        <p className="yx-tim-muted">
          Days worked short of the shift, by hours worked: under {b[0]} h, {b[0]}–{b[1]} h and {b[1]}–{b[2]} h. A frequent-break day has more than {lim.count} breaks or {lim.minutes} minutes of breaks. Your company sets these in Settings › Time.
        </p>
        {notRecorded > 0 && (
          <InlineAlert tone="info" title={`Breaks are not recorded for ${notRecorded === rows.length ? 'anyone here' : plural(notRecorded, 'person', 'people')}`}>
            Their shifts do not let people clock in again after clocking out, so their breaks are not recorded. Turn on clock-in-again for the shift to see them.
          </InlineAlert>
        )}
        <DataTable label="Short hours and breaks" columns={cols} rows={rows} getRowId={(x) => x.id} state={state} onRetry={onRetry} exportFormats={['csv']} onExport={onExport} empty={<EmptyState compact title="No short days or breaks this month" description="Days worked short of the shift appear here." />} />
      </div>
    </Card>
  );
}

function LiveTimeReportsScreen({ live }: { live: LiveAttendanceReport | LiveNightRegister | LiveHoursReport }) {
  const { toast } = useToast();
  const [filters, setFilters] = useState<FilterValue[]>([]);
  const night = live.report === 'night';
  const hours = live.report === 'hours' ? live : null;
  const rep = live.report === 'late' || live.report === 'ot' ? live : null;
  const mgr = (rep?.data ?? hours?.data)?.scope === 'team';
  const isOt = live.report === 'ot';
  // HR adds people up by department and site; a manager sees each person.
  const rows: ReportRow[] = !rep?.data
    ? []
    : mgr
      ? rep.data.rows.map((r) => ({ id: r.id, label: r.name, loc: r.location, late: r.late, early: r.early, ot: hoursOf(r.otMinutes), lop: r.lop }))
      : Object.values(
          rep.data.rows.reduce<Record<string, ReportRow>>((acc, r) => {
            const k = `${r.dept}|${r.location}`;
            const x = acc[k] ?? { id: k, label: r.dept, loc: r.location, late: 0, early: 0, ot: 0, lop: 0 };
            acc[k] = { ...x, late: x.late + r.late, early: x.early + r.early, ot: hoursOf(x.ot * 60 + r.otMinutes), lop: x.lop + r.lop };
            return acc;
          }, {}),
        );
  const locs = multi(filters, 'loc');
  const depts = multi(filters, 'dept');
  const shown = rows.filter((x) => (!locs || locs.includes(x.loc)) && (mgr || !depts || depts.includes(x.label)));
  const cats = [...new Set(shown.map((x) => x.label))];
  const by = (k: 'late' | 'early' | 'ot') => cats.map((c) => shown.filter((x) => x.label === c).reduce((a, x) => a + x[k], 0));
  const lateCols: TableColumn<ReportRow>[] = [
    { key: 'late', header: 'Late marks', type: 'number', value: (x) => x.late, total: 'sum', optional: isOt },
    { key: 'early', header: 'Early exits', type: 'number', value: (x) => x.early, total: 'sum', optional: isOt },
  ];
  const otCol: TableColumn<ReportRow> = { key: 'ot', header: 'Overtime hours', type: 'number', value: (x) => x.ot, total: 'sum', optional: !isOt };
  const cols: TableColumn<ReportRow>[] = [
    { key: 'label', header: mgr ? 'Employee' : 'Department', value: (x) => x.label },
    { key: 'loc', header: 'Location', value: (x) => x.loc, optional: true },
    ...(isOt ? [otCol, ...lateCols] : [...lateCols, otCol]),
    { key: 'lop', header: 'Unpaid days (LOP)', type: 'number', value: (x) => x.lop, total: 'sum', optional: true },
  ];
  const nightRows = live.report === 'night' ? (live.data?.rows ?? []) : [];
  const ncols: TableColumn<NightRegister['rows'][number]>[] = [
    { key: 'name', header: 'Worker', type: 'person', width: 220, value: (x) => x.name, person: (x) => ({ name: x.name, secondary: x.code ?? undefined }) },
    { key: 'shifts', header: 'Night shifts', type: 'number', value: (x) => x.shifts, total: 'sum' },
    { key: 'hours', header: 'Night hours (7 pm–6 am)', type: 'number', value: (x) => hoursOf(x.nightMinutes), total: 'sum' },
    {
      key: 'consent',
      header: 'Night-work consent',
      value: (x) => x.consent?.reference ?? '',
      render: (x) =>
        x.consent ? (
          <span className="yx-tim-list__main"><span>{x.consent.reference}</span><span className="yx-tim-muted" style={nowrap}>{x.consent.withdrawnOn ? `Withdrawn ${isoDate(x.consent.withdrawnOn)}` : `Given ${isoDate(x.consent.givenOn)}${x.consent.confirmed ? ' · confirmed' : ' · not confirmed'}`}</span></span>
        ) : (
          <Badge tone="danger">None on file</Badge>
        ),
    },
  ];
  const stage = (live.data as { stage?: string | null } | null)?.stage;
  const draft = stage !== 'locked' && stage !== 'filed';
  const reportName = night ? 'Register of women night-shift workers' : hours ? 'Short hours and breaks' : isOt ? 'Overtime' : 'Late and early';
  const exportRows = (fmt: 'csv' | 'xlsx') => {
    const file = `${reportName} · ${monthText(live.month)}.csv`;
    if (night) saveCsv(file, [['Worker', 'Code', 'Night shifts', 'Night hours', 'Consent', 'Given', 'Withdrawn'], ...nightRows.map((x) => [x.name, x.code ?? '', x.shifts, hoursOf(x.nightMinutes), x.consent?.reference ?? 'None', x.consent?.givenOn ?? '', x.consent?.withdrawnOn ?? ''])]);
    else if (hours) saveCsv(file, [['Employee', 'Code', 'Department', 'Location', 'Short band 1', 'Short band 2', 'Short band 3', 'Frequent-break days', 'Breaks', 'Break minutes'], ...(hours.data?.rows ?? []).map((x) => [x.name, x.code ?? '', x.dept, x.location, x.short.b1, x.short.b2, x.short.b3, x.breaksRecorded ? x.frequentBreakDays ?? 0 : 'Not recorded', x.breaksRecorded ? x.breaks ?? 0 : 'Not recorded', x.breaksRecorded ? x.breakMinutes ?? 0 : 'Not recorded'])]);
    else saveCsv(file, [[mgr ? 'Employee' : 'Department', 'Location', 'Late marks', 'Early exits', 'Overtime hours', 'Unpaid days'], ...shown.map((x) => [x.label, x.loc, x.late, x.early, x.ot, x.lop])]);
    toast({ tone: 'success', title: `${file} downloaded.${draft ? ' Draft: the month is not locked yet.' : ''}${fmt === 'xlsx' ? ' Saved as CSV, which Excel opens.' : ''}` });
  };
  const tableState = liveTable(live.state);
  return (
    <TimePage active="Reports">
      <PageHeader
        title={mgr ? 'My team · attendance' : 'Attendance reports'}
        description={mgr ? `Your ${rows.length} reports` : night ? 'Women who worked a night shift, with their consent on file' : 'By department and site'}
        facts={<span className="yx-tim-row"><span>{monthText(live.month)}{rep?.data && draft ? ` · up to ${isoDate(rep.data.upTo)}` : ''}</span>{stage ? <Badge tone={draft ? 'warning' : 'neutral'}>{draft ? 'Not locked' : 'Locked'}</Badge> : null}</span>}
        actions={
          <div className="yx-tim-row">
            <div className="yx-tim-picker"><Select aria-label="Report" value={live.report} onChange={(v) => v && live.onReport(v as 'late' | 'ot' | 'night' | 'hours')} options={[{ value: 'late', label: 'Late and early' }, { value: 'ot', label: 'Overtime' }, { value: 'hours', label: 'Short hours and breaks' }, ...(mgr ? [] : [{ value: 'night', label: 'Register of women night-shift workers' }])]} /></div>
            <div className="yx-tim-picker"><Select aria-label="Month" value={live.month} onChange={(v) => v && live.onMonth(v)} options={monthOptions(live.month)} /></div>
          </div>
        }
      />
      {live.state === 'no-access' ? (
        <LiveGate state="no-access" what={night ? 'the night-shift register' : 'attendance reports'} />
      ) : hours ? (
        <HoursReportCard data={hours.data} month={live.month} state={tableState} onRetry={live.onRetry} onExport={() => exportRows('csv')} />
      ) : night ? (
        <Card title={`Register of women night-shift workers · ${monthText(live.month)}`}>
          <div className="yx-tim-stack">
            <p className="yx-tim-muted">{plural(nightRows.length, 'woman', 'women')} · {nightRows.reduce((a, x) => a + x.shifts, 0)} night shifts · from the day engine and the consents on file. Pick-up and drop records are not in the app yet.</p>
            <DataTable label="Women night-shift register" columns={ncols} rows={nightRows} getRowId={(x) => x.id} state={tableState} onRetry={live.onRetry} onExport={exportRows} empty={<EmptyState compact title="No night shifts by women this month" description="Women who work a night shift show here with their consent." />} />
          </div>
        </Card>
      ) : (
        <>
          {(shown.length > 0 || live.state === 'loading') && (
            <BarChart
              title={isOt ? (mgr ? 'Overtime hours by person' : 'Overtime hours by department') : mgr ? 'Late marks and early exits by person' : 'Late marks and early exits by department'}
              categories={mgr ? cats.map((c) => c.split(' ')[0]) : cats}
              series={isOt ? [{ name: 'Overtime hours', values: by('ot') }] : [{ name: 'Late marks', values: by('late') }, { name: 'Early exits', values: by('early') }]}
              xLabel={mgr ? 'Employee' : 'Department'}
              horizontalBelow={480}
              loading={live.state === 'loading'}
            />
          )}
          <DataTable
            key={live.report}
            label="Report rows"
            columns={cols}
            rows={shown}
            getRowId={(x) => x.id}
            state={tableState}
            onRetry={live.onRetry}
            toolbar={<FilterBar fields={[{ key: 'loc', label: 'Location', type: 'multi', options: [...new Set(rows.map((x) => x.loc))].map((l) => ({ value: l, label: l })) }, ...(mgr ? [] : [{ key: 'dept', label: 'Department', type: 'multi' as const, options: [...new Set(rows.map((x) => x.label))].map((d) => ({ value: d, label: d })) }])]} value={filters} onChange={setFilters} />}
            // Answers 241/286: the file is CSV, so the menu offers CSV only.
            exportFormats={['csv']}
            onExport={exportRows}
            empty={
              filters.length > 0 ? (
                <EmptyState title="No attendance for these filters" description="No one matches every filter you picked." action={<Button onClick={() => setFilters([])}>Clear filters</Button>} />
              ) : (
                <EmptyState title="No attendance recorded" description="Nothing was recorded for this month yet." action={<Button onClick={() => live.onMonth(shiftMonth(live.month, -1))}>Show {monthText(shiftMonth(live.month, -1))}</Button>} />
              )
            }
          />
        </>
      )}
    </TimePage>
  );
}

export function AttendanceReportsScreen({ report = 'late', persona = 'hr', month: startMonth = 'sep', filters: startFilters = [], state = 'ready', live }: { report?: 'late' | 'ot' | 'form25' | 'night' | 'hours'; persona?: 'hr' | 'manager'; month?: Month; filters?: FilterValue[]; state?: ViewState; /** The live app's /time/registers or /time/payroll-feed. */ live?: LiveReports }) {
  if (live) return live.report === 'registers' || live.report === 'feed' ? <LiveReportsScreen live={live} /> : <LiveTimeReportsScreen live={live} />;
  if (report === 'hours') return <SampleHoursReport persona={persona} />;
  return <SampleAttendanceReports report={report} persona={persona} month={startMonth} filters={startFilters} state={state} />;
}

/** Batch C item 16 (design): September 2026, the manager's team; the Hosur plant's shift has clock-in-again off. */
function SampleHoursReport({ persona }: { persona: 'hr' | 'manager' }) {
  const people = persona === 'manager' ? myReports() : TEAM;
  const data: HoursReport = {
    month: '2026-09',
    upTo: '2026-09-30',
    scope: persona === 'manager' ? 'team' : 'company',
    rows: people.map((p, i) => {
      const recorded = !p.location.includes('Hosur');
      return { id: p.id, name: p.name, code: p.code, dept: p.dept, location: p.location, short: { b1: i % 4 === 1 ? 1 : 0, b2: i % 3, b3: (i * 2) % 5 }, breaksRecorded: recorded, breaks: recorded ? 18 + i * 3 : null, breakMinutes: recorded ? 400 + i * 35 : null, frequentBreakDays: recorded ? i % 4 : null, bands: [4, 6, 8], limit: { count: 3, minutes: 60 } };
    }),
  };
  return (
    <TimePage active="Reports">
      <PageHeader title={persona === 'manager' ? 'My team · attendance' : 'Attendance reports'} description="Short hours and breaks" facts="September 2026" />
      <HoursReportCard data={data} month="2026-09" state="ready" onExport={() => undefined} />
    </TimePage>
  );
}

function SampleAttendanceReports({ report, persona, month: startMonth, filters: startFilters, state }: { report: 'late' | 'ot' | 'form25' | 'night'; persona: 'hr' | 'manager'; month: Month; filters: FilterValue[]; state: ViewState }) {
  const { toast } = useToast();
  const [r, setR] = useState(report);
  const [month, setMonth] = useState<Month>(startMonth);
  const [filters, setFilters] = useState<FilterValue[]>(startFilters);
  const mgr = persona === 'manager';
  const sep = month === 'sep';
  const days = sep ? SEP_DAYS : 31;
  const monthLabel = sep ? 'Sep 2026' : 'Aug 2026';
  const all: LateRow[] = mgr ? myReports().map((p) => ({ id: p.id, label: p.name, loc: p.location, ...teamNums(p.name) })) : LATE;
  const locs = multi(filters, 'loc');
  const depts = multi(filters, 'dept');
  const rows = state === 'empty' ? [] : all.filter((x) => (!locs || locs.includes(x.loc)) && (mgr || !depts || depts.includes(x.label)));
  const n = (x: LateRow) => (sep ? x.sep : x.aug);
  const cats = [...new Set(rows.map((x) => x.label))];
  const by = (i: number) => cats.map((c) => rows.filter((x) => x.label === c).reduce((a, x) => a + n(x)[i], 0));
  // The chosen report's numbers lead; the other report's columns hide first when space runs out.
  const isOt = r === 'ot';
  const lateCols: TableColumn<LateRow>[] = [
    { key: 'late', header: 'Late marks', type: 'number', value: (x) => n(x)[0], total: 'sum', optional: isOt },
    { key: 'early', header: 'Early exits', type: 'number', value: (x) => n(x)[1], total: 'sum', optional: isOt },
  ];
  const otCol: TableColumn<LateRow> = { key: 'ot', header: 'Overtime hours', type: 'number', value: (x) => n(x)[2], total: 'sum', optional: !isOt };
  const cols: TableColumn<LateRow>[] = [
    { key: 'label', header: mgr ? 'Employee' : 'Department', value: (x) => x.label },
    { key: 'loc', header: 'Location', value: (x) => x.loc, optional: true },
    ...(isOt ? [otCol, ...lateCols] : [...lateCols, otCol]),
    { key: 'lop', header: 'Unpaid days (LOP)', type: 'number', value: (x) => n(x)[3], total: 'sum', optional: true },
  ];
  const statutory = r === 'form25' || r === 'night';
  const f25 = (x: Form25Row) => (sep ? x.sep : x.aug);
  const absent = (x: Form25Row) => days - f25(x)[0] - f25(x)[1] - f25(x)[2];
  // A statutory register stays complete: no optional columns, short headers and narrow number columns so all six fit, uncut, at tablet width.
  const f25cols: TableColumn<Form25Row>[] = [
    { key: 'name', header: 'Worker', type: 'person', width: 180, value: (x) => x.name, person: (x) => ({ name: x.name, secondary: x.code }) },
    { key: 'present', header: 'Present', type: 'number', width: 100, value: (x) => f25(x)[0], total: 'sum' },
    { key: 'off', header: 'Weekly offs', type: 'number', width: 120, value: (x) => f25(x)[1], total: 'sum' },
    { key: 'leave', header: 'Leave', type: 'number', width: 90, value: (x) => f25(x)[2], total: 'sum' },
    {
      // An absence not yet explained shows as an amber count; the alert above the table names it and opens it.
      key: 'absent', header: 'Absent', type: 'number', width: 90, value: absent, total: 'sum',
      render: (x) => ((x.open?.[month] ?? 0) > 0 ? <Badge tone="warning">{absent(x)}</Badge> : absent(x)),
    },
    { key: 'ot', header: 'OT hours', type: 'number', width: 110, value: (x) => f25(x)[3], total: 'sum' },
  ];
  const nightN = (x: NightRow) => (sep ? x.sep : x.aug);
  const ncols: TableColumn<NightRow>[] = [
    { key: 'name', header: 'Worker', type: 'person', width: 220, value: (x) => x.name, person: (x) => ({ name: x.name, secondary: x.code }) },
    { key: 'shifts', header: 'Night shifts', type: 'number', value: nightN, total: 'sum' },
    { key: 'hours', header: 'Night hours (7 pm–6 am)', type: 'number', value: (x) => nightN(x) * 8, total: 'sum' },
    {
      key: 'consent', header: 'Night-work consent', value: (x) => x.consent,
      render: (x) => <span className="yx-tim-list__main"><span>{x.consent}</span><span className="yx-tim-muted" style={nowrap}>Valid to {x.validTo}</span></span>,
    },
    {
      key: 'transport', header: 'Pick-up and drop', optional: true, value: (x) => x.transport[month],
      render: (x) => {
        const t = `${x.transport[month]} of ${nightN(x)} shifts`;
        return x.transport[month] < nightN(x) ? <Badge tone="warning">{t}</Badge> : t;
      },
    },
  ];
  const nightShifts = NIGHT.reduce((a, x) => a + nightN(x), 0);
  const period = sep ? (
    <span className="yx-tim-row"><span>1–28 Sep · today's check-ins not counted yet</span><DueBadge date={SEP_LOCK} prefix="Locks" /></span>
  ) : (
    <span className="yx-tim-row"><span>August 2026</span><Badge tone="neutral">Locked</Badge></span>
  );
  const draftNote = sep ? ' Draft: September is not locked yet.' : '';
  const download = (file: string) => toast({ tone: 'success', title: `${file} downloaded.${draftNote}` });
  const statTitle = r === 'form25' ? 'Form 25 · muster roll · Hosur plant' : 'Register of women night-shift workers · Hosur plant';
  const tableState = state === 'loading' ? 'loading' : state === 'error' ? 'error' : 'ready';
  const reportName = r === 'ot' ? 'Overtime' : 'Late and early';
  const filterWords = depts && locs ? `${depts.join(', ')} at ${locs.join(', ')}` : (depts ?? locs ?? []).join(', ');
  // Absences with no punches and no leave, still open as exceptions (Gopal Iyer, 25 Sep). HR sees them on Form 25; a manager sees their own reports'.
  const unexplained = state === 'ready' && month === 'sep' && (mgr || r === 'form25') ? FORM25.filter((w) => (w.open?.sep ?? 0) > 0 && (!mgr || all.some((p) => p.label === w.name))) : [];
  const unexplainedAlert = unexplained.length > 0 && (
    <InlineAlert
      tone="warning"
      title={<span className="yx-tim-row"><span>{unexplained.length === 1 ? `1 absence ${mgr ? 'in your team ' : ''}is not yet explained` : `${unexplained.length} absences ${mgr ? 'in your team ' : ''}are not yet explained`}</span><DueBadge date={SEP_LOCK} prefix="Locks" /></span>}
      actions={unexplained.map((w) => (
        <Button key={w.id} size="sm" asChild>
          <a href={storyHref(mgr ? STORY.exceptionsMgr : STORY.exceptionsHr, `defaultSearch:${w.name.replace(/ /g, '+')}`)} target="_top">{unexplained.length === 1 ? 'Open exception' : `Open ${w.name.split(' ')[0]}'s exception`}</a>
        </Button>
      ))}
    >
      {unexplained.map((w) => `${w.name}, ${w.openDay}`).join('; ')}: no check-ins and no leave. Unpaid if it isn't fixed before the lock.
    </InlineAlert>
  );
  return (
    <TimePage active="Reports" user={mgr ? ME : HR_ADMIN}>
      <PageHeader
        // The report picker names the report, so the manager title stays short enough for one line at tablet width.
        title={mgr ? 'My team · attendance' : 'Attendance reports'}
        description={mgr ? `Your ${all.length} direct reports` : ENTITIES[0].name}
        facts={period}
        actions={
          <div className="yx-tim-row">
            <div className="yx-tim-picker"><Select aria-label="Report" value={r} onChange={(v) => v && setR(v as typeof r)} options={[{ value: 'late', label: 'Late and early' }, { value: 'ot', label: 'Overtime' }, ...(mgr ? [] : [{ value: 'form25', label: 'Form 25 muster roll' }, { value: 'night', label: 'Register of women night-shift workers' }])]} /></div>
            <div className="yx-tim-picker"><Select aria-label="Month" value={month} onChange={(v) => v && setMonth(v as Month)} options={[{ value: 'sep', label: 'September 2026' }, { value: 'aug', label: 'August 2026' }]} /></div>
          </div>
        }
      />
      {unexplainedAlert}
      {statutory ? (
        <Card
          title={statTitle}
          actions={
            <Tooltip content="Hosur plant is a factory, so this register is required under the labour code (OSH Code) rules.">
              <span tabIndex={0}><Badge tone="neutral">Format from 21 Nov 2025</Badge></span>
            </Tooltip>
          }
        >
          {/* A stack keeps the standard gap between the note, the register and the downloads. */}
          <div className="yx-tim-stack">
          <p className="yx-tim-muted">
            {r === 'form25' ? `${FORM25.length} workers · days, except OT in hours · from the published roster and check-ins` : `${NIGHT.length} ${NIGHT.length === 1 ? 'woman' : 'women'} · ${nightShifts} night shifts`}
          </p>
          {r === 'form25' ? (
            <DataTable label="Form 25 muster roll" columns={f25cols} rows={FORM25} getRowId={(x) => x.id} state={tableState} onRetry={() => {}} />
          ) : (
            <DataTable label="Women night-shift register" columns={ncols} rows={NIGHT} getRowId={(x) => x.id} state={tableState} onRetry={() => {}} />
          )}
          <div className="yx-tim-row">
            <Button icon={Download} onClick={() => download(`${statTitle.split(' · ')[0]} · ${monthLabel} · Hosur.pdf`)}>Download PDF</Button>
            <Button icon={Download} onClick={() => download(`${statTitle.split(' · ')[0]} · ${monthLabel} · Hosur.xlsx`)}>Download Excel</Button>
          </div>
          </div>
        </Card>
      ) : (
        <>
          {/* With no rows the table's empty state is the one message; the chart would only repeat it. */}
          {(rows.length > 0 || state === 'loading') && (
            <BarChart
              title={r === 'ot' ? (mgr ? 'Overtime hours by person' : 'Overtime hours by department') : mgr ? 'Late marks and early exits by person' : 'Late marks and early exits by department'}
              // First names keep the person labels readable on phones.
              categories={mgr ? cats.map((c) => c.split(' ')[0]) : cats}
              series={r === 'ot' ? [{ name: 'Overtime hours', values: by(2) }] : [{ name: 'Late marks', values: by(0) }, { name: 'Early exits', values: by(1) }]}
              xLabel={mgr ? 'Employee' : 'Department'}
              horizontalBelow={480}
              loading={state === 'loading'}
            />
          )}
          <DataTable
            // A new report brings its own column order.
            key={r}
            label="Report rows"
            columns={cols}
            rows={rows}
            getRowId={(x) => x.id}
            state={tableState}
            onRetry={() => {}}
            toolbar={<FilterBar fields={[{ key: 'loc', label: 'Location', type: 'multi', options: LOCS.map((l) => ({ value: l, label: l })) }, ...(mgr ? [] : [{ key: 'dept', label: 'Department', type: 'multi' as const, options: [...new Set(LATE.map((l) => l.label))].map((d) => ({ value: d, label: d })) }])]} value={filters} onChange={setFilters} />}
            // Answers 241/286: the file is CSV, so the menu offers CSV only.
            exportFormats={['csv']}
            onExport={(format) => download(`${reportName} · ${monthLabel}.${format}`)}
            empty={
              filters.length > 0 ? (
                <EmptyState title={`No attendance for ${filterWords || 'these filters'}`} description="No one matches every filter you picked." action={<Button onClick={() => setFilters([])}>Clear filters</Button>} />
              ) : (
                <EmptyState title="No attendance recorded" description="Nothing was recorded for this month yet." action={sep ? <Button onClick={() => setMonth('aug')}>Show August 2026</Button> : undefined} />
              )
            }
          />
        </>
      )}
    </TimePage>
  );
}

/* =====================================================================
   TIM-30 · Leave reports (balances, ledger, taken, unpaid leave feed, liability, negatives)
   ===================================================================== */

type LeaveCode = 'CL' | 'SL' | 'EL' | 'CO' | 'LWP';
interface Bal { CL: number; SL: number; EL: number; CO: number; LWP: number }
/** Person columns never get cut while number columns have room. */
const PERSON_W = 220;
/** Earned leave liability per person: payroll only (R1). */
const LIABILITY: Record<string, number> = { 'Divya Raghunathan': 25846, 'Arun Prakash': 30115, 'Meera Krishnan': 0, 'Rahul Deshpande': 41538, 'Kavitha Sundaram': 8123, 'Priya Shankar': 11950 };
const PEOPLE = ['Divya Raghunathan', 'Arun Prakash', 'Meera Krishnan', 'Rahul Deshpande', 'Kavitha Sundaram', 'Priya Shankar'];
/** Founder decision 3: pay comes from Payroll; Priya joined last week and Payroll has not set her pay yet. */
const NO_PAY = new Set(['Priya Shankar']);
/** The company setting the liability names: (Basic + DA) ÷ 26. */
const DAILY_PAY_RULE = '(Basic + DA) ÷ 26 (company setting)';
const fromData = (name: string, field: 'balance' | 'taken'): Bal => {
  const out: Bal = { CL: 0, SL: 0, EL: 0, CO: 0, LWP: 0 };
  balancesFor(name).forEach((b) => { if (b.code in out) out[b.code as LeaveCode] = b[field]; });
  return out;
};
interface PersonRow { id: string; name: string; bal: Bal; taken: Bal; liability: number }
/** Balances and days taken come from time-data (the same figures as TIM-17 and TIM-21). */
const personRow = (name: string): PersonRow => ({ id: name, name, bal: fromData(name, 'balance'), taken: fromData(name, 'taken'), liability: LIABILITY[name] ?? 0 });
const PERSON_ROWS: PersonRow[] = PEOPLE.map(personRow);
/** Negative balances: the shared list TIM-17 counts. */
const NEGATIVE_ROWS: PersonRow[] = NEGATIVE_BALANCES.map(personRow);
interface LedgerRow { id: string; date: Date; name: string; type: string; change: number; reason: string; after: number | null }
/**
 * September entries. Leave is granted for the year on 1 Jan (TIM-21), so there are no monthly credit rows.
 * Divya: CL 7 before 16–17 Sep (−2), 30 Oct approved on 22 Sep (−1) and the 24 Sep half day (−0.5) leaves 3.5.
 * Meera: earned leave first (1–3 Sep, to -1.5), then unpaid leave for 7–8 Sep: 2 more days would pass the -2 limit in the earned leave policy.
 */
const LEDGER: LedgerRow[] = [
  { id: 'g4', date: new Date(2026, 8, 1), name: 'Meera Krishnan', type: 'Earned', change: -3, reason: 'Leave 1–3 Sep, 1.5 days more than balance (limit -2)', after: -1.5 },
  // Unpaid leave has no balance: the row records the days taken (the same 2 days as the LOP report).
  { id: 'g10', date: new Date(2026, 8, 7), name: 'Meera Krishnan', type: 'Unpaid', change: 2, reason: 'Leave without pay 7–8 Sep, approved', after: null },
  { id: 'g5', date: new Date(2026, 8, 14), name: 'Divya Raghunathan', type: 'Comp-off', change: 1, reason: 'Worked on Vinayaka Chaturthi', after: 1 },
  { id: 'g6', date: new Date(2026, 8, 16), name: 'Divya Raghunathan', type: 'Casual', change: -2, reason: 'Leave 16–17 Sep', after: 5 },
  { id: 'g8', date: new Date(2026, 8, 17), name: 'Meera Krishnan', type: 'Comp-off', change: 0.5, reason: 'Overtime on 17 Sep taken as comp-off', after: 0.5 },
  { id: 'g9', date: new Date(2026, 8, 22), name: 'Divya Raghunathan', type: 'Casual', change: -1, reason: 'Leave 30 Oct, approved', after: 4 },
  { id: 'g7', date: new Date(2026, 8, 24), name: 'Divya Raghunathan', type: 'Casual', change: -0.5, reason: 'Half day 24 Sep', after: 3.5 },
];
interface LopRow { id: string; name: string; days: number; dates: string; reason: string }
/** September unpaid days (Gopal's absence matches Form 25). */
const LOP: LopRow[] = [
  { id: 'u1', name: 'Meera Krishnan', days: 2, dates: '7–8 Sep', reason: 'Leave without pay, approved (earned leave would pass its -2 limit)' },
  { id: 'u2', name: 'Gopal Iyer', days: 1, dates: '17 Sep', reason: 'Absent, no leave applied' },
];

type LeaveReport = 'balances' | 'ledger' | 'taken' | 'lop' | 'liability' | 'negative';
export function LeaveReportsScreen({ report = 'balances', persona = 'hr', state = 'ready', live }: { report?: LeaveReport; persona?: 'hr' | 'fin'; state?: ViewState; /** The app: HR › Leave balances (everyone in scope). */ live?: LiveLeaveReports }) {
  if (live) return <LiveLeaveReports live={live} />;
  const { toast } = useToast();
  const fin = persona === 'fin';
  const [r, setR] = useState<LeaveReport>(fin ? 'liability' : report);
  const narrow = useNarrow(599);
  // Retry reloads the list; Export only works once the list has loaded.
  const [loadState, setLoadState] = useState(state);
  const tableState = loadState === 'loading' ? 'loading' : loadState === 'error' ? 'error' : 'ready';
  const asOf = formatDate(TODAY);
  const people = r === 'negative' ? NEGATIVE_ROWS : PERSON_ROWS;
  const num = (key: LeaveCode, header: string, pick: (x: PersonRow) => Bal, optional?: boolean): TableColumn<PersonRow> => ({ key, header, type: 'number', value: (x) => pick(x)[key], total: 'sum', optional });
  const bal = (x: PersonRow) => x.bal;
  const earnedCell = (x: PersonRow) => (x.bal.EL < 0 ? <Badge tone="danger">{x.bal.EL}</Badge> : x.bal.EL);
  const person: TableColumn<PersonRow> = { key: 'name', header: 'Employee', type: 'person', width: PERSON_W, value: (x) => x.name, person: (x) => ({ name: x.name }) };
  const earned: TableColumn<PersonRow> = { key: 'EL', header: 'Earned', type: 'number', value: (x) => x.bal.EL, total: 'sum', render: earnedCell };
  const unpaidTaken: TableColumn<PersonRow> = { key: 'LWP', header: 'Unpaid taken', type: 'number', value: (x) => x.taken.LWP, total: 'sum', optional: true };
  const liability: TableColumn<PersonRow> = { key: 'liability', header: 'Earned leave liability', type: 'money', value: (x) => (NO_PAY.has(x.name) ? 0 : x.liability), total: 'sum', render: (x) => (NO_PAY.has(x.name) ? <Badge tone="neutral">No pay set</Badge> : formatINR(x.liability)) };
  const dailyPay: TableColumn<PersonRow> = { key: 'dailyPay', header: 'Daily pay', type: 'money', value: (x) => (NO_PAY.has(x.name) || x.bal.EL <= 0 ? null : Math.round((x.liability / x.bal.EL) * 100) / 100), render: (x) => (NO_PAY.has(x.name) ? <Badge tone="neutral">No pay set</Badge> : x.bal.EL <= 0 ? '—' : formatINR(Math.round((x.liability / x.bal.EL) * 100) / 100)) };
  // Phones: the balances are one inline line under the name. Earned leads and keeps its value next to it; unpaid days taken show only when there are some.
  const personSummary: TableColumn<PersonRow> = {
    ...person,
    person: (x) => ({
      name: x.name,
      // Wraps instead of the usual one-line ellipsis, so "Unpaid taken" is never cut off.
      secondary: <span style={{ whiteSpace: 'normal' }}>Earned {earnedCell(x)} · Casual {x.bal.CL} · Sick {x.bal.SL} · Comp-off {x.bal.CO}{x.taken.LWP > 0 && ` · Unpaid taken ${x.taken.LWP}`}</span>,
    }),
  };
  const balCols: TableColumn<PersonRow>[] = narrow
    ? [personSummary]
    : [
        person,
        num('CL', 'Casual', bal),
        num('SL', 'Sick', bal),
        earned,
        num('CO', 'Comp-off', bal, true),
        unpaidTaken,
        ...(fin ? [{ ...liability, optional: true }] : []),
      ];
  // A recovery decision needs the earned balance and the unpaid days, not every type.
  // No total row: summing one person's negative balance only repeats the row.
  const negCols: TableColumn<PersonRow>[] = [person, { ...earned, total: undefined }, { ...unpaidTaken, optional: false, total: undefined }];
  const tk = (x: PersonRow) => x.taken;
  const takenCols: TableColumn<PersonRow>[] = [person, num('CL', 'Casual', tk), num('SL', 'Sick', tk), num('EL', 'Earned', tk), num('CO', 'Comp-off', tk, true), num('LWP', 'Unpaid', tk, true)];
  // Founder decision 3: money only for people who may see pay; everyone else gets the days.
  const liabCols: TableColumn<PersonRow>[] = fin ? [person, { ...earned, header: 'Earned balance' }, dailyPay, liability] : [person, { ...earned, header: 'Earned balance' }];
  const ledgerCols: TableColumn<LedgerRow>[] = [
    { key: 'date', header: 'Date', type: 'date', width: 90, value: (x) => x.date, render: (x) => dayMonth(x.date) },
    { key: 'name', header: 'Employee', type: 'person', width: PERSON_W, value: (x) => x.name, person: (x) => ({ name: x.name }) },
    // Leave and Change are narrow (values like "Earned", "-3"), so Reason gets the spare room.
    { key: 'type', header: 'Leave', width: 110, value: (x) => x.type },
    { key: 'change', header: 'Change', type: 'number', width: 96, value: (x) => x.change, render: (x) => (x.after === null ? `${x.change} taken` : x.change > 0 ? `+${x.change}` : `${x.change}`) },
    { key: 'reason', header: 'Reason', value: (x) => x.reason, optional: true },
    { key: 'after', header: 'Balance', type: 'number', width: 100, value: (x) => x.after, render: (x) => (x.after === null ? '—' : x.after) },
  ];
  const lopCols: TableColumn<LopRow>[] = [
    { key: 'name', header: 'Employee', type: 'person', width: PERSON_W, value: (x) => x.name, person: (x) => ({ name: x.name }) },
    { key: 'days', header: 'Unpaid days', type: 'number', width: 120, value: (x) => x.days, total: 'sum' },
    { key: 'dates', header: 'Dates', width: 120, value: (x) => x.dates },
    { key: 'reason', header: 'Why', value: (x) => x.reason },
  ];
  const lopDays = LOP.reduce((a, x) => a + x.days, 0);
  const takenTotals = (['CL', 'SL', 'EL', 'CO', 'LWP'] as LeaveCode[]).map((c) => PERSON_ROWS.reduce((a, x) => a + x.taken[c], 0));
  // Founder answer A: Payroll holds leave.liability.view, not leave.view, so the liability is its only report.
  const options: { value: LeaveReport; label: string }[] = (
    [
      { value: 'balances', label: 'Balances' },
      { value: 'ledger', label: 'Ledger' },
      { value: 'taken', label: 'Leave taken' },
      { value: 'lop', label: 'Unpaid leave (LOP) to payroll' },
      { value: 'liability' as const, label: 'Leave liability' },
      { value: 'negative', label: 'Negative balances' },
    ] as { value: LeaveReport; label: string }[]
  ).filter((o) => !fin || o.value === 'liability');
  const description = r === 'ledger' ? 'Entries in September 2026' : r === 'taken' ? `Days taken or approved in 2026, as of ${asOf}` : r === 'lop' ? 'September 2026' : `Balances as of ${asOf}`;
  const sample = <p className="yx-tim-note">Showing {r === 'negative' ? people.length : PERSON_ROWS.length} of {EMPLOYEES.length} people. Export has everyone.</p>;
  const reportLabel = options.find((o) => o.value === r)?.label ?? 'Leave report';
  const common = {
    getRowId: (x: { id: string }) => x.id,
    state: tableState,
    onRetry: () => setLoadState('ready'),
    onExport: tableState === 'ready' ? (format: 'csv' | 'xlsx') => toast({ tone: 'success', title: `${reportLabel} · ${asOf}.${format} downloaded.` }) : undefined,
  } as const;
  return (
    <TimePage active="Reports" user={fin ? PAYROLL_ADMIN : HR_ADMIN}>
      <PageHeader
        title="Leave reports"
        description={description}
        actions={<div className="yx-tim-row"><div className="yx-tim-picker"><Select aria-label="Report" value={r} onChange={(v) => v && setR(v as LeaveReport)} options={options} /></div>{!fin && <Button asChild><a href="/?path=/story/screens-time-tim-21-·-leave-card--balance-grid" target="_top">Correct balances</a></Button>}</div>}
      />
      {r === 'liability' && !fin && <p className="yx-tim-note">Unused earned leave that can be cashed in, in days. The money shows only to people who may see pay (Payroll, or HR with pay access).</p>}
      {r === 'liability' && fin && (
        <>
          <Kpis items={[{ label: 'Earned leave liability (all entities)', value: formatINR(4812600) }, { label: 'People', value: EMPLOYEES.length }, { label: 'Change vs August', value: '+₹1,12,400' }, { label: 'Daily pay', value: DAILY_PAY_RULE }]} />
          <LineChart title="Leave liability by month" money categories={['Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep']} series={[{ name: 'Liability', values: [4210000, 4330500, 4452000, 4588300, 4700200, 4812600] }]} xLabel="Month" />
        </>
      )}
      {r === 'lop' && (
        <InlineAlert
          tone="info"
          title={<span className="yx-tim-row"><span>Unpaid leave (LOP) for September payroll</span><DueBadge date={SEP_LOCK} prefix="Locks" /></span>}
          actions={
            <>
              <Button size="sm" asChild><a href={storyHref(STORY.exceptionsHr)} target="_top">Open exceptions</a></Button>
              <Button size="sm" asChild><a href={storyHref(STORY.periodsHr)} target="_top">Open September payroll period</a></Button>
            </>
          }
        >
          {lopDays} unpaid days across {LOP.length} people go to payroll when September locks. 1 open day (Gopal Iyer, 25 Sep, no punches and no leave) becomes unpaid if it isn't fixed before the lock. Later corrections go to October.
        </InlineAlert>
      )}
      {r === 'taken' && <BarChart title={`Days taken or approved by type, 2026 · these ${PERSON_ROWS.length} people`} categories={['Casual', 'Sick', 'Earned', 'Comp-off', 'Unpaid']} series={[{ name: 'Days', values: takenTotals }]} xLabel="Leave type" />}
      {r === 'ledger' ? (
        <DataTable label="Leave ledger" columns={ledgerCols} rows={state === 'empty' ? [] : LEDGER} {...common} empty={<EmptyState title="No ledger entries" description="No leave was taken, credited or adjusted in September." />} />
      ) : r === 'lop' ? (
        <DataTable label="Unpaid leave to payroll" columns={lopCols} rows={state === 'empty' ? [] : LOP} {...common} empty={<EmptyState title="No unpaid days in September" description="Nothing goes to payroll for unpaid leave this month." />} />
      ) : (
        <>
          <DataTable
            label="Leave report"
            columns={r === 'taken' ? takenCols : r === 'liability' ? liabCols : r === 'negative' ? negCols : balCols}
            rows={state === 'empty' ? [] : people}
            {...common}
            // Each row opens that person's own leave card (TIM-21 reads the `person` arg).
            rowButtons={r === 'negative' ? (x) => <Button size="sm" asChild><a href={storyHref(STORY.leaveCardHr, `person:${x.name.replace(/ /g, '+')}`)} target="_top">Open {x.name.split(' ')[0]}'s leave card</a></Button> : undefined}
            empty={r === 'negative' ? <EmptyState title="No one is below zero" description="No one has used more leave than they have." /> : <EmptyState title="Nothing to show" description="No balances recorded yet." />}
          />
          {people.length > 0 && loadState === 'ready' && sample}
        </>
      )}
    </TimePage>
  );
}

/* ---------------- TIM-30 live: leave reports for everyone in HR's scope (server paging, filters, export) ---------------- */

/** HR › Leave balances in the app: the report rows a page at a time; a row opens that person's leave card (TIM-21). */
export interface LiveLeaveReports {
  state: LoadState;
  onRetry?: () => void;
  data: LiveLeaveReport | null;
  query: LeaveReportQuery;
  onQuery: (q: LeaveReportQuery) => void;
  /** Downloads the whole report (every page) as CSV. */
  onExport: (q: LeaveReportQuery) => Promise<unknown>;
  /** Opens the person's leave card (leave.view); left out for someone who may read the liability only. */
  onOpenCard?: (employeeId: string) => void;
  /** Batch A D10: opens the balance grid (leave.balance.adjust); absent, no button. */
  onOpenGrid?: () => void;
  /** The reports this person may open (founder answer A: leave.liability.view alone opens the liability only). */
  reports?: LeaveReportKind[];
}

const REPORT_OPTIONS: { value: LeaveReportKind; label: string }[] = [
  { value: 'balances', label: 'Balances' },
  { value: 'ledger', label: 'Ledger' },
  { value: 'taken', label: 'Leave taken' },
  { value: 'lop', label: 'Unpaid leave (LOP) to payroll' },
  { value: 'negative', label: 'Negative balances' },
  { value: 'liability', label: 'Leave liability' },
];
const BASIS_TEXT: Record<string, string> = { basic_da: 'Basic + DA', gross: 'Gross pay' };
const divisorText = (d: string) => (d === 'calendar' ? 'the days in the month' : d);
const LEDGER_KIND: Record<string, string> = { opening: 'Opening balance', accrual: 'Credited', taken: 'Leave taken', cancelled: 'Leave given back', adjustment: 'Adjusted by HR', carry_forward: 'Carried forward', lapse: 'Lapsed', comp_off: 'Comp-off credited', encashed: 'Cashed in' };
const isoMonth = (iso: string) => {
  const [y, m] = iso.split('-').map(Number);
  return new Date(y!, m! - 1, 1);
};

function LiveLeaveReports({ live }: { live: LiveLeaveReports }) {
  const d = live.data;
  const q = live.query;
  const [search, setSearch] = useState(q.q ?? '');
  const { busy, error, run } = useRun();
  const { toast } = useToast();
  const set = (patch: Partial<LeaveReportQuery>) => live.onQuery({ ...q, ...patch, page: patch.page ?? 1 });
  useEffect(() => {
    const h = setTimeout(() => search !== (q.q ?? '') && set({ q: search.trim() || undefined }), 400);
    return () => clearTimeout(h);
  }, [search]); // eslint-disable-line react-hooks/exhaustive-deps
  const person: TableColumn<LeaveReportRow> = { key: 'name', header: 'Employee', type: 'person', width: PERSON_W, value: (x) => x.name, person: (x) => ({ name: x.name, secondary: [x.code, x.location].filter(Boolean).join(' · ') || undefined }) };
  const typeCols: TableColumn<LeaveReportRow>[] = (d?.types ?? []).map((t) => ({
    key: t.id,
    header: t.kind === 'lop' && q.report !== 'taken' ? `${t.name} taken` : t.name,
    type: 'number' as const,
    value: (x: LeaveReportRow) => x.values?.[t.id] ?? 0,
    render: (x: LeaveReportRow) => {
      const v = x.values?.[t.id] ?? 0;
      return v < 0 ? <Badge tone="danger">{String(v)}</Badge> : v;
    },
  }));
  // Founder decision 3: the API sends money fields only to people who may see pay; "No pay set" is never shown as 0.
  const money = (key: 'dailyPay' | 'amount', header: string, total?: 'sum'): TableColumn<LeaveReportRow> => ({ key, header, type: 'money', width: 140, total, value: (x) => x[key] ?? null, render: (x) => (x.noPay ? <Badge tone="neutral">No pay set</Badge> : x[key] == null ? '—' : formatINR(x[key]!, { decimals: 2 })) }); // one column, one format: ₹4,487.00 beside ₹3,461.50
  const liabilityCols: TableColumn<LeaveReportRow>[] = [
    person,
    { key: 'department', header: 'Department', value: (x) => x.department, optional: true },
    ...typeCols.map((c) => ({ ...c, header: `${c.header} days` })),
    ...(d?.money ? [money('dailyPay', 'Daily pay'), money('amount', 'Liability', 'sum')] : [{ key: 'days', header: 'Days', type: 'number' as const, width: 96, value: (x: LeaveReportRow) => x.days, total: 'sum' as const }]),
  ];
  const cols: TableColumn<LeaveReportRow>[] =
    q.report === 'liability'
      ? liabilityCols
      : q.report === 'ledger'
      ? [
          { key: 'on', header: 'Date', type: 'date', width: 110, value: (x) => (x.on ? isoMonth(x.on) : null), render: (x) => (x.on ? formatDate(new Date(`${x.on}T00:00:00`)) : '') },
          person,
          { key: 'type', header: 'Leave', width: 140, value: (x) => x.type },
          { key: 'kind', header: 'Entry', width: 150, value: (x) => LEDGER_KIND[x.kind ?? ''] ?? x.kind },
          { key: 'days', header: 'Change', type: 'number', width: 96, value: (x) => x.days, render: (x) => ((x.days ?? 0) > 0 ? `+${x.days}` : String(x.days)) },
          { key: 'reason', header: 'Reason', value: (x) => x.reason, optional: true },
        ]
      : q.report === 'lop'
        ? [
            person,
            { key: 'department', header: 'Department', value: (x) => x.department, optional: true },
            { key: 'lopLeave', header: 'Unpaid leave', type: 'number', width: 120, value: (x) => x.lopLeave, total: 'sum' },
            { key: 'absent', header: 'Absent, no leave', type: 'number', width: 140, value: (x) => x.absent, total: 'sum' },
            { key: 'days', header: 'Unpaid days', type: 'number', width: 120, value: (x) => x.days, total: 'sum' },
          ]
        : [person, { key: 'department', header: 'Department', value: (x) => x.department, optional: true }, ...typeCols];
  const months = Array.from({ length: 13 }, (_, i) => {
    const now = new Date();
    const m = new Date(now.getFullYear(), now.getMonth() - i, 1);
    return { value: `${m.getFullYear()}-${String(m.getMonth() + 1).padStart(2, '0')}`, label: m.toLocaleDateString('en-GB', { month: 'long', year: 'numeric' }) };
  });
  const from = d && d.total ? (d.page - 1) * d.pageSize + 1 : 0;
  const to = d ? Math.min(d.total, d.page * d.pageSize) : 0;
  const all = (label: string) => [{ value: '', label }];
  const filtered = Boolean(q.entityId || q.locationId || q.departmentId || q.q);
  const label = REPORT_OPTIONS.find((o) => o.value === q.report)?.label ?? 'Leave report';
  return (
    <TimePage active="Reports">
      <PageHeader
        title="Leave reports"
        description={q.report === 'ledger' || q.report === 'lop' ? months.find((m) => m.value === (q.month ?? months[0]!.value))?.label : q.report === 'liability' ? 'Unused leave that can be cashed in, as of today' : 'Balances as of today · leave taken in this leave year'}
        actions={
          <div className="yx-tim-row">
            <div className="yx-tim-picker"><Select aria-label="Report" value={q.report} onChange={(v) => v && set({ report: v as LeaveReportKind })} options={REPORT_OPTIONS.filter((o) => !live.reports || live.reports.includes(o.value))} /></div>
            {/* The month is the report's period, so it sits by Report: in the toolbar it pushed Columns to a second row at 1278 px. */}
            {(q.report === 'ledger' || q.report === 'lop') && <div className="yx-tim-picker"><Select aria-label="Month" value={q.month ?? months[0]!.value} onChange={(v) => v && set({ month: v })} options={months} /></div>}
            {live.state === 'ready' && <Button icon={Download} loading={busy === 'export'} onClick={() => void run('export', () => live.onExport(q))}>Export CSV</Button>}
            {live.onOpenGrid && <Button onClick={live.onOpenGrid}>Correct balances</Button>}
          </div>
        }
      />
      {error && <InlineAlert tone="danger" title="Not exported">{error}</InlineAlert>}
      {q.report === 'liability' && d && (
        d.money ? (
          <Kpis
            items={[
              { label: 'Unused days that can be cashed in', value: d.totalDays ?? 0 },
              { label: 'Liability, people on this page', value: formatINR((d.rows ?? []).reduce((a, x) => a + (x.amount ?? 0), 0)) },
              { label: 'Daily pay', value: d.dailyPayRule ? `${BASIS_TEXT[d.dailyPayRule.basis] ?? d.dailyPayRule.basis} ÷ ${divisorText(d.dailyPayRule.divisor)} (company setting)` : '—' },
            ]}
          />
        ) : (
          <p className="yx-tim-note">{d.totalDays ?? 0} unused days that can be cashed in. The money shows only to people who may see pay (Payroll, or HR with pay access).</p>
        )
      )}
      {live.state === 'no-access' ? <NoAccessState grantedBy="HR" what="leave reports" /> : (
        <DataTable
          key={q.report}
          label={label}
          columns={cols}
          rows={d?.rows ?? []}
          getRowId={(x) => x.id ?? x.employeeId}
          state={live.state === 'ready' ? 'ready' : live.state === 'error' ? 'error' : 'loading'}
          onRetry={live.onRetry}
          filtered={filtered}
          onClearFilters={() => { setSearch(''); live.onQuery({ report: q.report, month: q.month, page: 1, pageSize: q.pageSize }); }}
          toolbar={
            <div className="yx-tim-row">
              <TextField aria-label="Search by name or code" placeholder="Search by name or code" value={search} onChange={setSearch} />
              <Select aria-label="Legal entity" value={q.entityId ?? ''} onChange={(v) => set({ entityId: v || undefined })} options={[...all('All entities'), ...(d?.filters.entities ?? []).map((x) => ({ value: x.id, label: x.name }))]} />
              <Select aria-label="Location" value={q.locationId ?? ''} onChange={(v) => set({ locationId: v || undefined })} options={[...all('All locations'), ...(d?.filters.locations ?? []).map((x) => ({ value: x.id, label: x.name }))]} />
              <Select aria-label="Department" value={q.departmentId ?? ''} onChange={(v) => set({ departmentId: v || undefined })} options={[...all('All departments'), ...(d?.filters.departments ?? []).map((x) => ({ value: x.id, label: x.name }))]} />
            </div>
          }
          rowButtons={q.report === 'ledger' || !live.onOpenCard ? undefined : (x) => <Button size="sm" onClick={() => live.onOpenCard!(x.employeeId)}>Open leave card</Button>}
          empty={
            filtered ? <EmptyState title="No one matches these filters" description="Change or clear the filters." action={<Button onClick={() => { setSearch(''); live.onQuery({ report: q.report, month: q.month, page: 1, pageSize: q.pageSize }); }}>Clear filters</Button>} />
            : q.report === 'negative' ? <EmptyState title="No one is below zero" description="No one has used more leave than they have." />
            : q.report === 'lop' ? <EmptyState title="No unpaid days this month" description="Nothing goes to payroll for unpaid leave this month." />
            : q.report === 'ledger' ? <EmptyState title="No ledger entries" description="No leave was taken, credited or adjusted this month." />
            : <EmptyState title="Nothing to show" description="People in your scope appear here." />
          }
        />
      )}
      {d && d.total > 0 && (
        <div className="yx-tim-row" style={{ justifyContent: 'space-between' }}>
          <span className="yx-tim-muted">Showing {from}–{to} of {d.total}. Export has every row.</span>
          <span className="yx-tim-row">
            <Button size="sm" onClick={() => (d.page <= 1 ? toast({ title: 'This is the first page', tone: 'warning' }) : set({ page: d.page - 1 }))}>Previous</Button>
            <Button size="sm" onClick={() => (to >= d.total ? toast({ title: 'This is the last page', tone: 'warning' }) : set({ page: d.page + 1 }))}>Next</Button>
          </span>
        </div>
      )}
    </TimePage>
  );
}
