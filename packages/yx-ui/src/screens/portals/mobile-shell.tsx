// Mobile shell (M04): first run (MOB-01), tab bar + Home with Team segment (MOB-02), Me › Settings & security (MOB-03).
import { useState } from 'react';
import { ArrowLeft, Bell, CalendarPlus, Clock, FileText, Fingerprint, Laptop, LogOut, MapPin, Receipt, Search, Smartphone, WifiOff } from 'lucide-react';
import { PhoneFrame } from '../_kit/frames';
import { Button, IconButton } from '../../components/button';
import { Badge } from '../../components/display';
import { EmptyState, InlineAlert, Skeleton } from '../../components/feedback';
import { FormField } from '../../components/field';
import { TextField } from '../../components/inputs';
import { Checkbox, RadioGroup, Switch } from '../../components/choice';
import { TimeField } from '../../components/inputs';
import { ConfirmDialog } from '../../components/overlay';
import { Icon } from '../../components/foundations';
import { PageBanner } from '../../components/notify';
import { Segment } from '../../components/segment';
import { formatDate } from '../../lib/format';
import { ALWAYS_DELIVERED, inQuietHours } from './portals-logic';
import { OtpInput, PORTAL_LANGUAGES, StepDots } from './portals-kit';

/* ================================================================== */
/* MOB-01 First run                                                    */
/* ================================================================== */

export type FirstRunStep = 'welcome' | 'phone' | 'otp' | 'otp-wrong' | 'otp-locked' | 'language' | 'notifications' | 'device' | 'device-taken' | 'install' | 'pin';

const STEPS = ['Sign in', 'Language', 'Notifications', 'Device', 'Install'];
const stepIndex: Record<FirstRunStep, number> = { welcome: 0, phone: 0, otp: 0, 'otp-wrong': 0, 'otp-locked': 0, language: 1, notifications: 2, device: 3, 'device-taken': 3, pin: 3, install: 4 };

// MOB-01
/** Invite → mobile OTP sign-in → language → notifications → device binding (if the company requires it) → install. */
export function FirstRunScreen({ step: initial, tenant = 'Kaveri Foods' }: { step: FirstRunStep; tenant?: string }) {
  const [step, setStep] = useState(initial);
  const [otp, setOtp] = useState(initial === 'otp-wrong' ? '' : '');
  const [lang, setLang] = useState<string | undefined>('ta');
  const [pin, setPin] = useState('');
  const next = (s: FirstRunStep) => () => setStep(s);
  const primary: Partial<Record<FirstRunStep, [string, () => void, boolean?]>> = {
    welcome: ['Get started', next('phone')],
    phone: ['Send code', next('otp')],
    otp: ['Verify', next('language'), otp.length < 6],
    'otp-wrong': ['Verify', next('language'), otp.length < 6],
    language: ['Continue', next('notifications')],
    notifications: ['Allow notifications', next('device')],
    device: ['Use this phone for check-in', next('pin')],
    pin: ['Set PIN', next('install'), pin.length < 4],
    install: ['Add to home screen', () => undefined],
  };
  const p = primary[step];
  return (
    <PhoneFrame tab="home" title={step === 'welcome' ? tenant : 'Set up the app'} hideTabs back={step !== 'welcome' ? <IconButton icon={ArrowLeft} label="Back" /> : undefined}>
      {step !== 'welcome' && <StepDots steps={STEPS} current={stepIndex[step]} />}
      {step === 'welcome' && (
        <div className="yx-ps-stack">
          <section className="yx-ps-hero">
            <h1>Welcome to {tenant}</h1>
            <p>Check in, apply for leave, see your payslips and approve requests from your phone. Setting up takes about 2 minutes.</p>
          </section>
          <p className="yx-ps-muted">Your invitation came by SMS from {tenant} HR.</p>
        </div>
      )}
      {step === 'phone' && (
        <div className="yx-ps-stack">
          <FormField label="Mobile number" helper="We send a code by SMS, or on WhatsApp if your company uses it.">
            <TextField prefix="+91" defaultValue="98450 12321" inputMode="tel" autoComplete="tel" />
          </FormField>
          <p className="yx-ps-muted">
            Prefer email and password, or your company's SSO? <a href="#">Sign in another way</a>
          </p>
        </div>
      )}
      {(step === 'otp' || step === 'otp-wrong') && (
        <div className="yx-ps-stack">
          <p className="yx-ps-p">Enter the 6-digit code sent to +91 ••••• ••321. It is valid for 10 minutes.</p>
          <OtpInput value={otp} onChange={setOtp} invalid={step === 'otp-wrong'} />
          {step === 'otp-wrong' && (
            <p className="yx-blocknote" role="alert">
              That code didn't match. 3 attempts left.
            </p>
          )}
          <Button disabled>Resend code in 0:24</Button>
        </div>
      )}
      {step === 'otp-locked' && (
        <InlineAlert tone="danger" title="Sign-in is paused for 15 minutes">
          Too many wrong codes. Try again after 9:57 am, or ask HR to check your mobile number.
        </InlineAlert>
      )}
      {step === 'language' && (
        <RadioGroup value={lang} onChange={setLang} options={PORTAL_LANGUAGES.map((l) => ({ value: l.value, label: l.label }))} />
      )}
      {step === 'notifications' && (
        <div className="yx-ps-stack">
          <p className="yx-ps-p">Get approvals, shift changes and payslip alerts. You can choose exactly which ones later in Me › Settings.</p>
          <p className="yx-ps-muted">Sign-in codes and security alerts always reach you. Nothing else is sent between 9 pm and 8 am.</p>
          <Button onClick={next('device')}>Not now</Button>
        </div>
      )}
      {step === 'device' && (
        <div className="yx-ps-stack">
          <Icon icon={Smartphone} size="md" />
          <p className="yx-ps-p">{tenant} asks you to check in from one phone. This phone becomes your check-in device.</p>
          <p className="yx-ps-muted">Every punch records its device. To change phones later, raise a request; HR or your manager approves it.</p>
        </div>
      )}
      {step === 'device-taken' && (
        <InlineAlert tone="warning" title="Another phone is already your check-in device" actions={<Button size="sm">Request device change</Button>}>
          You can still use this phone for everything except check-in until HR approves the change.
        </InlineAlert>
      )}
      {step === 'pin' && (
        <div className="yx-ps-stack">
          <Button icon={Fingerprint} fullWidth>
            Use fingerprint or face unlock
          </Button>
          <FormField label="Or set a 4-digit app PIN">
            <OtpInput value={pin} onChange={setPin} length={4} label="App PIN" />
          </FormField>
        </div>
      )}
      {step === 'install' && (
        <div className="yx-ps-stack">
          <InlineAlert tone="success" title="You're all set">
            Add the app to your home screen so it opens in one tap, even on slow networks.
          </InlineAlert>
          <Button onClick={() => undefined}>Maybe later</Button>
        </div>
      )}
      {p && (
        <Button variant="primary" fullWidth onClick={p[1]} disabled={p[2]}>
          {p[0]}
        </Button>
      )}
    </PhoneFrame>
  );
}

/* ================================================================== */
/* MOB-02 Tab bar + Home                                               */
/* ================================================================== */

export interface HomeTodo {
  id: string;
  text: string;
  due?: string;
  kind: 'approval' | 'task' | 'ack';
}

export interface TeamToday {
  in: number;
  late: number;
  leave: number;
  wfh: number;
  notIn: { name: string; shift: string }[];
}

// MOB-02
/** Home: Today card (shift, check-in state), to-dos, announcements, quick actions; managers get a Team segment. Offline shows a banner and queues actions. */
export function MobileHomeScreen({
  segment: initialSeg = 'me',
  manager,
  checkedIn,
  todos,
  team,
  offline,
  loading,
  tracking,
  today,
}: {
  segment?: 'me' | 'team';
  manager?: boolean;
  checkedIn: string | null;
  todos: HomeTodo[];
  team: TeamToday;
  offline?: boolean;
  loading?: boolean;
  tracking?: boolean;
  today: Date;
}) {
  const [seg, setSeg] = useState(initialSeg);
  const [nudged, setNudged] = useState<string[]>([]);
  return (
    <PhoneFrame
      tab="home"
      title="Home"
      actions={
        <>
          <IconButton icon={Search} label="Search" />
          <IconButton icon={Bell} label="Notifications, 3 unread" />
        </>
      }
    >
      {offline && (
        <PageBanner tone="warning">
          <Icon icon={WifiOff} /> You're offline. Leave and check-in are saved on this phone and sent when you reconnect.
        </PageBanner>
      )}
      {manager && (
        <Segment label="Show" className="yx-ps-seg" value={seg} onChange={setSeg} options={[{ value: 'me', label: 'Me' }, { value: 'team', label: 'Team' }]} />
      )}
      {loading ? (
        <div className="yx-ps-stack" aria-busy="true">
          <Skeleton height={120} />
          <Skeleton height={64} />
          <Skeleton height={64} />
        </div>
      ) : seg === 'me' ? (
        <>
          <section className="yx-ps-today" aria-label="Today">
            <div className="yx-ps-row" data-between>
              <strong>{formatDate(today)}</strong>
              {tracking && <Badge tone="info">Tracking on</Badge>}
            </div>
            <span className="yx-ps-muted">General shift · 9:30 am to 6:30 pm · Chennai office</span>
            {checkedIn ? (
              <>
                <Badge tone="success">Checked in at {checkedIn} · inside office area</Badge>
                <Button fullWidth>Check out</Button>
              </>
            ) : (
              <Button variant="primary" fullWidth icon={MapPin}>
                Check in
              </Button>
            )}
            {offline && !checkedIn && <Badge tone="warning">Pending sync</Badge>}
          </section>
          <div className="yx-ps-quick" role="group" aria-label="Quick actions">
            {[
              [CalendarPlus, 'Apply leave'],
              [Clock, 'Fix attendance'],
              [Receipt, 'Add expense'],
              [FileText, 'Payslip'],
            ].map(([I, l]) => (
              <button key={l as string} type="button">
                <Icon icon={I as typeof Clock} size="md" />
                {l as string}
              </button>
            ))}
          </div>
          <section aria-label="To do">
            <h2 className="yx-ps-h">To do · {todos.length}</h2>
            {todos.length === 0 ? (
              <EmptyState compact title="Nothing waiting for you." description="New approvals and tasks show up here." />
            ) : (
              <ul className="yx-ps-list">
                {todos.map((t) => (
                  <li key={t.id}>
                    <div className="yx-ps-list__main">
                      <span>{t.text}</span>
                      {t.due && <span className="yx-ps-list__meta">{t.due}</span>}
                    </div>
                    <Button size="sm">{t.kind === 'approval' ? 'Review' : t.kind === 'ack' ? 'Read' : 'Open'}</Button>
                  </li>
                ))}
              </ul>
            )}
          </section>
          <section className="yx-ps-today" aria-label="Announcement">
            <strong>Office closed on Gandhi Jayanti, Fri 2 Oct</strong>
            <span className="yx-ps-muted">From Lakshmi Venkatesan, HR · needs acknowledgement</span>
            <Button size="sm">Acknowledge</Button>
          </section>
        </>
      ) : (
        <>
          <section className="yx-ps-today" aria-label="Team today">
            <strong>Team today · {team.in + team.late + team.leave + team.wfh + team.notIn.length} people</strong>
            <div className="yx-ps-row">
              <Badge tone="success">{team.in} in</Badge>
              <Badge tone="warning">{team.late} late</Badge>
              <Badge>{team.leave} on leave</Badge>
              <Badge tone="info">{team.wfh} WFH</Badge>
              <Badge tone="danger">{team.notIn.length} not checked in</Badge>
            </div>
          </section>
          <section aria-label="Not checked in">
            <h2 className="yx-ps-h">Not checked in</h2>
            <ul className="yx-ps-list" aria-live="polite">
              {team.notIn.map((p) => (
                <li key={p.name}>
                  <div className="yx-ps-list__main">
                    <span>{p.name}</span>
                    <span className="yx-ps-list__meta">{p.shift}</span>
                  </div>
                  <Button size="sm" disabled={nudged.includes(p.name)} onClick={() => setNudged((x) => [...x, p.name])}>
                    {nudged.includes(p.name) ? 'Nudged' : 'Nudge'}
                  </Button>
                </li>
              ))}
            </ul>
          </section>
          <p className="yx-ps-muted">Approvals are in the Requests tab. Team salaries are not shown here.</p>
        </>
      )}
    </PhoneFrame>
  );
}

/* ================================================================== */
/* MOB-03 Me › Settings & security                                     */
/* ================================================================== */

const CATEGORIES = ['Approvals', 'Time', 'Pay', 'Documents', 'People', 'Security', 'Announcements'];
const CHANNELS = ['In-app', 'Push', 'Email', 'WhatsApp', 'SMS'];

export interface DeviceRow {
  id: string;
  name: string;
  platform: string;
  version: string;
  bound: boolean;
  lastSeen: string;
  current?: boolean;
}

// MOB-03
/** Language, notification matrix, quiet hours, devices with remote sign-out, re-authentication for Pay and documents. */
export function MobileSettingsScreen({
  section = 'all',
  devices,
  whatsappOptIn,
  reauth,
  signOutId,
}: {
  section?: 'all' | 'notifications' | 'security';
  devices: DeviceRow[];
  whatsappOptIn?: boolean;
  reauth?: boolean;
  signOutId?: string;
}) {
  const [quiet, setQuiet] = useState(true);
  const [from, setFrom] = useState('21:00');
  const [to, setTo] = useState('08:00');
  const [wa, setWa] = useState(!!whatsappOptIn);
  const [pin, setPin] = useState('');
  const [signOut, setSignOut] = useState(signOutId ?? null);
  const nowQuiet = quiet && inQuietHours('22:15', from, to);
  if (reauth)
    return (
      <PhoneFrame tab="me" title="Confirm it's you" hideTabs back={<IconButton icon={ArrowLeft} label="Back" />}>
        <div className="yx-ps-stack yx-ps-center">
          <p className="yx-ps-p">Payslips and bank details need your fingerprint or PIN. You were idle for more than 15 minutes.</p>
          <Button icon={Fingerprint} variant="primary" fullWidth>
            Use fingerprint
          </Button>
          <OtpInput value={pin} onChange={setPin} length={4} label="App PIN" />
        </div>
      </PhoneFrame>
    );
  const dev = devices.find((d) => d.id === signOut);
  return (
    <PhoneFrame tab="me" title="Settings and security" back={<IconButton icon={ArrowLeft} label="Back to Me" />}>
      {(section === 'all' || section === 'notifications') && (
        <>
          {section === 'all' && (
            <FormField label="Language" helper="Used for screens and notifications.">
              <RadioGroup defaultValue="en" orientation="horizontal" options={PORTAL_LANGUAGES.map((l) => ({ value: l.value, label: l.label }))} />
            </FormField>
          )}
          <section aria-label="Notifications">
            <h2 className="yx-ps-h">Notifications</h2>
            <div className="yx-scroll-x" tabIndex={0} role="region" aria-label="Notification channels by category, scrolls sideways on small screens">
            <table className="yx-ps-matrix">
              <caption className="yx-visually-hidden">Notification channels by category</caption>
              <thead>
                <tr>
                  <th scope="col">Category</th>
                  {CHANNELS.map((c) => (
                    <th key={c} scope="col">
                      {c}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {CATEGORIES.map((cat) => (
                  <tr key={cat}>
                    <th scope="row">
                      {cat}
                      {cat === 'Security' && <Badge>Always on</Badge>}
                    </th>
                    {CHANNELS.map((ch) => {
                      const locked = cat === 'Security' && (ch === 'In-app' || ch === 'Push' || ch === 'Email');
                      const needsOptIn = (ch === 'WhatsApp' || ch === 'SMS') && !wa;
                      return (
                        <td key={ch}>
                          <input type="checkbox" aria-label={`${cat} by ${ch}`} defaultChecked={locked || (!needsOptIn && ch !== 'SMS' && cat !== 'Announcements')} disabled={locked || needsOptIn} />
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
            </div>
            <p className="yx-ps-muted">Always delivered: {ALWAYS_DELIVERED.join(', ')}.</p>
            <Switch checked={wa} onChange={setWa} label="Allow WhatsApp and SMS messages" description="Your consent is recorded. Turn it off any time." />
            <FormField label="Email digest">
              <RadioGroup defaultValue="daily" orientation="horizontal" options={[{ value: 'now', label: 'Immediately' }, { value: 'daily', label: 'Daily' }, { value: 'weekly', label: 'Weekly' }]} />
            </FormField>
          </section>
          <section aria-label="Quiet hours" className="yx-ps-stack">
            <Switch checked={quiet} onChange={setQuiet} label="Quiet hours" description="Push, WhatsApp and SMS wait until quiet hours end. Security alerts, same-day shift changes and sign-in codes still come through." />
            {quiet && (
              <div className="yx-ps-row">
                <FormField label="From">
                  <TimeField value={from} onChange={(v) => setFrom(v ?? '21:00')} />
                </FormField>
                <FormField label="To">
                  <TimeField value={to} onChange={(v) => setTo(v ?? '08:00')} />
                </FormField>
              </div>
            )}
            <p className="yx-ps-muted" aria-live="polite">
              {nowQuiet ? 'A message at 10:15 pm would wait until morning.' : 'A message at 10:15 pm would arrive straight away.'}
            </p>
          </section>
        </>
      )}
      {(section === 'all' || section === 'security') && (
        <section aria-label="Security" className="yx-ps-stack">
          <h2 className="yx-ps-h">Devices and sessions</h2>
          <ul className="yx-ps-list">
            {devices.map((d) => (
              <li key={d.id}>
                <Icon icon={d.platform === 'Web' ? Laptop : Smartphone} />
                <div className="yx-ps-list__main">
                  <span className="yx-ps-list__title">
                    {d.name} {d.current && <Badge tone="info">This device</Badge>} {d.bound && <Badge>Check-in device</Badge>}
                  </span>
                  <span className="yx-ps-list__meta">
                    {d.platform} · app {d.version} · last seen {d.lastSeen}
                  </span>
                </div>
                {!d.current && (
                  <Button size="sm" icon={LogOut} onClick={() => setSignOut(d.id)}>
                    Sign out
                  </Button>
                )}
              </li>
            ))}
          </ul>
          <Checkbox defaultChecked label="Alert me when a new device signs in" />
          <Button>Set up passkey</Button>
          <Button>View recovery codes</Button>
          <p className="yx-ps-muted">You stay signed in for 30 days on this phone. Pay, documents and bank details ask for your fingerprint or PIN.</p>
          <ConfirmDialog
            open={!!dev}
            onOpenChange={(o) => !o && setSignOut(null)}
            destructive
            title={`Sign out ${dev?.name ?? ''}?`}
            consequence="It is signed out straight away and stops getting notifications. Anything saved offline on it is deleted."
            confirmLabel="Sign out device"
            onConfirm={() => undefined}
          />
        </section>
      )}
    </PhoneFrame>
  );
}
