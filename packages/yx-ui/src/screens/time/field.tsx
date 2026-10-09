// Phone check-in, kiosk, field force, presence. TIM-12, TIM-13, TIM-32, TIM-33, TIM-36.
import { useState } from 'react';
import { ArrowLeft, Delete, MapPin, QrCode, RotateCw } from 'lucide-react';
import { KioskFrame, PhoneFrame } from '../_kit/frames';
import { Button, ButtonGroup, IconButton } from '../../components/button';
import { Badge, PersonLabel, type BadgeTone } from '../../components/display';
import { Drawer } from '../../components/drawer';
import { EmptyState, InlineAlert, Meter } from '../../components/feedback';
import { BottomSheet, ConfirmDialog } from '../../components/overlay';
import { Card, PageHeader, Tabs, TabsContent, TabsList, TabsTrigger } from '../../components/shell';
import { Select } from '../../components/select';
import { TextArea, TextField } from '../../components/inputs';
import { FormField } from '../../components/field';
import { formatDate } from '../../lib/format';
import { FENCES, FIELD_DAY, GENERAL_SHIFT, HOLIDAYS, HR_ADMIN, ME, NOW_MIN, SEPTEMBER, TEAM, TODAY, TODAY_PUNCHES, balancesFor, type TimeUser } from './time-data';
import { PUBLISHED_ROSTER } from './roster';
import { CameraFrame, GeoMap, Kpis, PunchList, TimePage, type MapPin as Pin } from './time-kit';
import { evaluateClock, fmt12, fmtDuration, formatDistance, geofenceVerdict, toHHMM, toMin, type ClockState } from './time-logic';
import './time.css';

const sameDay = (a: Date, b: Date) => a.toDateString() === b.toDateString();
const DOW = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
/** "Mon 28 Sep" (no year, no comma). */
const dayLabel = (d: Date) => `${DOW[d.getDay()]} ${formatDate(d).slice(0, -5).replace(/^0/, '')}`;
/** Links to other screens' stories (same pattern as roster.tsx). */
const storyHref = (id: string) => `/?path=/story/${id}`;
const STORY = {
  muster: 'screens-time-tim-02-·-muster--open',
  regularise: 'screens-time-tim-07-·-attendance-request--regularise',
  privacy: 'screens-mobile-requests-and-me-tabs--privacy',
  checkInSettings: 'screens-settings-group-3-·-time-leave--p-3-2',
};
const StoryLink = ({ to, children, ...rest }: { to: keyof typeof STORY; children: string; variant?: 'primary' | 'secondary'; size?: 'sm' | 'md'; fullWidth?: boolean }) => (
  <Button asChild {...rest}><a href={storyHref(STORY[to])} target="_top">{children}</a></Button>
);

/* =====================================================================
   TIM-12 · Mobile check-in sheet
   ===================================================================== */

export type CheckInScenario = 'inside' | 'outside' | 'coarse' | 'early' | 'offline' | 'field' | 'checked_in' | 'device' | 'selfie';

const SCEN: Record<CheckInScenario, { pin: { lat: number; lng: number; accuracyM: number }; state: ClockState; now: number; mode: 'restricted' | 'field'; device?: boolean }> = {
  inside: { pin: { lat: 12.9896, lng: 80.2483, accuracyM: 18 }, state: 'not_in', now: 9 * 60 + 24, mode: 'restricted' },
  outside: { pin: { lat: 12.9985, lng: 80.2530, accuracyM: 25 }, state: 'not_in', now: 9 * 60 + 27, mode: 'restricted' },
  coarse: { pin: { lat: 12.9896, lng: 80.2490, accuracyM: 300 }, state: 'not_in', now: 9 * 60 + 25, mode: 'restricted' },
  early: { pin: { lat: 12.9896, lng: 80.2483, accuracyM: 15 }, state: 'not_in', now: 7 * 60 + 40, mode: 'restricted' },
  offline: { pin: { lat: 12.9894, lng: 80.2481, accuracyM: 40 }, state: 'not_in', now: 9 * 60 + 29, mode: 'restricted' },
  field: { pin: { lat: 13.0100, lng: 80.2200, accuracyM: 20 }, state: 'not_in', now: 9 * 60 + 5, mode: 'field' },
  checked_in: { pin: { lat: 12.9896, lng: 80.2483, accuracyM: 18 }, state: 'working', now: NOW_MIN, mode: 'restricted' },
  device: { pin: { lat: 12.9896, lng: 80.2483, accuracyM: 18 }, state: 'not_in', now: 9 * 60 + 24, mode: 'restricted', device: false },
  selfie: { pin: { lat: 12.9896, lng: 80.2483, accuracyM: 18 }, state: 'not_in', now: 9 * 60 + 24, mode: 'restricted' },
};

/** The phone in hand in the "device" story, and the one HR approved (TIM-14). */
const APPROVED_PHONE = 'Pixel 7a';
const THIS_PHONE = 'Samsung Galaxy A15';
/** Today's one check-in (shared with Home, attendance and the time-kit stories). */
const TODAY_IN = TODAY_PUNCHES[0];
const rowStyle = { display: 'flex', alignItems: 'center', gap: 'var(--yx-space-2)' } as const;

/** `saved`: the offline check-in has already been tapped and is waiting on the phone. */
export function MobileCheckInSheet({ scenario = 'inside', saved: savedInit = false }: { scenario?: CheckInScenario; saved?: boolean }) {
  const s = SCEN[scenario];
  const [open, setOpen] = useState(true);
  const [sent, setSent] = useState<null | 'hr' | 'device'>(null);
  const [saved, setSaved] = useState(savedInit);
  /** What the person just did on this sheet (each button lands here). */
  const [done, setDone] = useState<null | 'in' | 'wfh' | 'od' | 'retry' | 'out'>(null);
  const v = geofenceVerdict(s.pin, FENCES);
  const { actions, block } = evaluateClock({
    state: s.state,
    now: s.now,
    shift: GENERAL_SHIFT,
    inside: v.kind === 'inside',
    locationName: v.fence.name,
    distanceM: v.distanceM,
    accuracyM: s.pin.accuracyM,
    mode: s.mode,
    deviceApproved: s.device ?? true,
  });
  const code = block?.code;
  const toStart = toMin(GENERAL_SHIFT.start) - s.now;
  const offline = scenario === 'offline';
  const dist = formatDistance(v.distanceM);
  const shiftEnd = toMin(GENERAL_SHIFT.end);
  const early = s.state === 'working' && s.now < shiftEnd;
  const nowText = fmt12(toHHMM(s.now));
  const checkedIn = s.state === 'working' || done === 'in' || (offline && saved);
  const opensAt = toMin(GENERAL_SHIFT.start) - GENERAL_SHIFT.opensBeforeMin;
  // Screen copy in plain words ("check in", not "clock-in"); one message per state.
  const alert = !block || offline || (done && done !== 'retry') || (done === 'retry' && code === 'coarse')
    ? null
    : code === 'not_started'
      ? { tone: 'info' as const, title: 'Check-in is not open yet', body: `Check-in opens at ${fmt12(toHHMM(opensAt))} (in ${fmtDuration(opensAt - s.now)}).` }
      : code === 'device'
        ? { tone: 'warning' as const, title: 'This phone is not approved for check-in', body: `Your approved phone is ${APPROVED_PHONE}. This phone (${THIS_PHONE}) isn't approved yet. Use your ${APPROVED_PHONE}, or ask HR to approve this one.` }
        : code === 'coarse'
          ? { tone: 'warning' as const, title: 'Location is not accurate enough', body: `Accuracy ±${s.pin.accuracyM} m. Move outdoors or near a window, then retry.` }
          : code === 'outside'
            ? { tone: 'warning' as const, title: `You're ${dist} from ${v.fence.name}`, body: 'Check in as WFH or on duty, or ask HR. This attempt is logged.' }
            : { tone: 'warning' as const, title: block.title, body: block.message };
  // The alert already says where you are when outside or too coarse, and the punch row says it once checked in.
  const place = v.kind === 'inside' ? v.fence.name : `${dist} from ${v.fence.name}`;
  const where = s.mode === 'field' ? `Location recorded: ${place}` : `Inside the office area · ${v.fence.name}`;
  const showWhere = !offline && !checkedIn && code !== 'outside' && code !== 'coarse';
  // Map geometry: fence centre (150,100). 1 px ≈ 6 m near the office; zoomed out so a far pin still sits at its true distance.
  const r = v.fence.radiusM;
  const scale = v.kind === 'inside' ? 1 / 6 : Math.min(1 / 6, 110 / (r + v.distanceM));
  const px = v.kind === 'inside' ? 8 : (r + v.distanceM) * scale;
  const pins: Pin[] = [{ id: 'me', label: 'You', x: 150 + px, y: 100 - px / 3, kind: 'you', accuracy: Math.min(60, s.pin.accuracyM * scale) }];
  const result =
    done === 'in' ? { tone: 'success' as const, title: `Checked in at ${nowText}`, body: s.mode === 'field' ? `Field check-in · ${place}` : `${v.fence.name} · inside the office area` }
      : done === 'wfh' ? { tone: 'success' as const, title: 'Sent for approval', body: `Work from home from ${nowText}. You'll get a notification when your manager decides.` }
        : done === 'od' ? { tone: 'success' as const, title: 'Sent for approval', body: `On duty from ${nowText} at your current location. You'll get a notification when your manager decides.` }
          : done === 'out' ? { tone: 'success' as const, title: `Checked out at ${nowText}${early ? ' · early exit' : ''}`, body: `Today shows ${fmtDuration(s.now - toMin(TODAY_IN.time))} worked.` }
            // The row and map caption already say where and how accurate, so a good retry needs no body.
            : done === 'retry' ? { tone: 'info' as const, title: 'Location updated', body: code === 'coarse' ? `Accuracy is still ±${s.pin.accuracyM} m. Move near a window and retry.` : undefined }
              : null;
  const retry = <Button variant={code === 'coarse' ? 'primary' : 'secondary'} size={code === 'coarse' ? 'lg' : 'sm'} fullWidth={code === 'coarse'} icon={RotateCw} onClick={() => setDone('retry')}>Retry location</Button>;
  const checkOut = <Button variant="primary" size="lg" fullWidth disabled={!actions.includes('clock_out')} onClick={early ? undefined : () => setDone('out')}>Check out</Button>;
  // A saved offline check-in is finished too: the badge and alert say it's waiting to sync.
  const finished = done === 'in' || done === 'wfh' || done === 'od' || done === 'out' || (offline && saved);
  return (
    <PhoneFrame tab="time" title="Time">
      <BottomSheet
        open={open}
        onOpenChange={setOpen}
        title={done === 'out' ? 'Checked out' : done === 'wfh' || done === 'od' ? 'Request sent' : s.state === 'working' ? 'Check out' : checkedIn ? 'Checked in' : 'Check in'}
        description={`${GENERAL_SHIFT.name} shift · ${fmt12(GENERAL_SHIFT.start)} – ${fmt12(GENERAL_SHIFT.end)}`}
        footer={
          finished ? (
            <Button size="lg" fullWidth onClick={() => setOpen(false)}>Done</Button>
          ) : (
            <div className="yx-tim-sheet-actions">
              {s.state === 'working' ? (
                early ? (
                  <>
                    <ConfirmDialog
                      trigger={checkOut}
                      title={`Check out ${fmtDuration(shiftEnd - s.now)} early?`}
                      consequence={`Your shift ends at ${fmt12(GENERAL_SHIFT.end)}. Checking out now marks an early exit on today's attendance.`}
                      confirmLabel="Check out now"
                      onConfirm={() => setDone('out')}
                    />
                    <p className="yx-tim-muted">Shift ends {fmt12(GENERAL_SHIFT.end)}. Checking out now marks an early exit.</p>
                  </>
                ) : checkOut
              ) : code === 'coarse' ? (
                retry
              ) : offline ? (
                <Button variant="primary" size="lg" fullWidth onClick={() => setSaved(true)}>Check in</Button>
              ) : (
                <Button variant="primary" size="lg" fullWidth disabled={!actions.includes('clock_in')} onClick={() => setDone('in')}>Check in</Button>
              )}
              {code === 'outside' && (
                <>
                  <Button fullWidth disabled={sent === 'hr'} onClick={() => setDone('wfh')}>Check in as WFH</Button>
                  <Button fullWidth disabled={sent === 'hr'} onClick={() => setDone('od')}>Check in on duty</Button>
                  <Button fullWidth disabled={sent === 'hr'} onClick={() => setSent('hr')}>Ask HR to fix today's attendance</Button>
                  {sent === 'hr' && <p className="yx-tim-muted">You asked HR to fix today. Wait for their decision.</p>}
                </>
              )}
              {code === 'device' && <Button fullWidth disabled={sent === 'device'} onClick={() => setSent('device')}>Ask HR to approve this phone</Button>}
            </div>
          )
        }
      >
        <div className="yx-tim-stack">
          <div className="yx-tim-row">
            {done === 'out' ? <Badge tone="neutral">Checked out at {nowText}</Badge>
              : s.state === 'working' ? <Badge tone="success">Checked in at {fmt12(TODAY_IN.time)}</Badge>
                : done === 'in' ? <Badge tone="success">Checked in at {nowText}</Badge>
                  : done === 'wfh' || done === 'od' ? <Badge tone="info">{done === 'wfh' ? 'WFH' : 'On duty'} from {nowText} · waiting for approval</Badge>
                  : offline && saved ? <Badge tone="warning">Checked in at {nowText} · waiting to sync</Badge>
                    : toStart > 0 ? <Badge tone="info">Shift starts in {fmtDuration(toStart)}</Badge>
                      : <Badge tone="warning">Shift started {fmtDuration(-toStart)} ago</Badge>}
            {s.mode === 'field' && <Badge tone="info">Field staff</Badge>}
          </div>
          <GeoMap
            // Offline the verdict isn't known yet, so the office circle isn't drawn around the dot.
            fences={offline ? [] : [{ id: 'f', label: `${v.fence.name} · ${r} m`, x: 150, y: 100, r: r * scale }]}
            pins={pins}
            caption={offline ? `Accuracy ±${s.pin.accuracyM} m · checked when online` : `Accuracy ±${s.pin.accuracyM} m`}
            height={180}
          />
          {showWhere && (
            <div style={rowStyle}>
              <MapPin size={16} aria-hidden="true" style={{ flexShrink: 0 }} />
              <strong style={{ flex: 1, minWidth: 0 }}>{where}</strong>
              <IconButton icon={RotateCw} label="Retry location" variant="secondary" size="sm" onClick={() => setDone('retry')} />
            </div>
          )}
          {scenario === 'selfie' && <InlineAlert tone="info" title="Selfie check-in isn't on for your company yet">Check in with your location as usual.</InlineAlert>}
          {alert && <InlineAlert tone={alert.tone} title={alert.title}>{alert.body}</InlineAlert>}
          {result && <InlineAlert tone={result.tone} title={result.title}>{result.body}</InlineAlert>}
          {offline && (
            <InlineAlert tone="info" title="No connection">
              {saved
                ? "Saved on this phone. It syncs when you're back online, and HR sees it marked \"offline\"."
                : 'Your check-in will be saved on this phone with the time and location, and syncs when you are back online.'}
            </InlineAlert>
          )}
          {sent === 'hr' && <InlineAlert tone="success" title="Sent to HR">HR will review your {nowText} attempt. You'll get a notification when they decide.</InlineAlert>}
          {sent === 'device' && <InlineAlert tone="success" title="Request sent to HR">HR approves phones in Devices. You can check in from this {THIS_PHONE} once they do.</InlineAlert>}
          {s.state === 'working' && <PunchList punches={[TODAY_IN]} />}
        </div>
      </BottomSheet>
    </PhoneFrame>
  );
}

/* =====================================================================
   TIM-13 · Kiosk
   ===================================================================== */

export type KioskView = 'code' | 'unknown_code' | 'pin' | 'menu' | 'checked_in' | 'training' | 'leave' | 'status' | 'wrong_pin' | 'qr';

/** The kiosk's sample person and her data (TEAM t10, balances from time-data). */
const KAVITHA = TEAM.find((t) => t.id === 't10')!;
const KAVITHA_DIGITS = KAVITHA.code.slice(3);
const KIOSK_IN = KAVITHA.inAt ?? '06:02';
const SUPERVISOR = KAVITHA.reportsTo;
const kioskBalance = (code: string) => balancesFor(KAVITHA.name).find((b) => b.code === code)?.balance ?? 0;
/** Leave already approved for her (raised by her supervisor), on a working day. */
const KIOSK_LEAVE_ON = new Date(2026, 9, 1);
/** Her casual leave request still waiting for her supervisor (two working days). */
const KIOSK_PENDING = { from: new Date(2026, 9, 6), to: new Date(2026, 9, 7), days: 2 };
/**
 * Her published roster (roster.tsx p1): week of 28 Sep (same as roster LAST_WEEK p1), then the week of 5 Oct.
 * ponytail: 28 Sep week copied here because roster.tsx doesn't export LAST_WEEK; import it once it does.
 */
const KAVITHA_ROSTER = [...['OFF', 'M', 'M', 'M', 'M', 'OFF', 'OFF'], ...PUBLISHED_ROSTER.p1];
const kioskWeeklyOff = (date: Date) => KAVITHA_ROSTER[Math.round((date.getTime() - new Date(2026, 8, 28).getTime()) / 864e5)] === 'OFF';
/**
 * Days she can tap on the kiosk: the ten days from tomorrow, with weekly offs and booked days shown but locked.
 * A holiday she is rostered to work (Fri 2 Oct, roster p1 'M') stays open and says so (`hint`).
 */
const KIOSK_DAYS = Array.from({ length: 10 }, (_, i) => new Date(TODAY.getFullYear(), TODAY.getMonth(), TODAY.getDate() + i + 1)).map((date) => {
  const hol = HOLIDAYS.find((h) => sameDay(h.date, date));
  const note = sameDay(date, KIOSK_LEAVE_ON) ? 'On leave'
    : date >= KIOSK_PENDING.from && date <= KIOSK_PENDING.to ? 'Requested'
      : kioskWeeklyOff(date) ? 'Weekly off'
        : undefined;
  return { date, note, hint: !note && hol ? 'Holiday shift' : undefined, holiday: hol?.name };
});
/** Equal-width day tiles: five across on the kiosk, two on a phone. */
const dayGrid = { display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(calc(var(--yx-space-16) * 1.75), 1fr))', gap: 'var(--yx-space-2)', width: '100%' } as const;
const dayTile = { height: 'auto', minHeight: 'var(--yx-control-lg)', padding: 'var(--yx-space-2)', width: '100%' } as const;
const TRAINING_OPENS = '08:45';
const dayRange = (a: Date, b: Date) => (sameDay(a, b) ? dayLabel(a) : `${dayLabel(a)} – ${dayLabel(b)}`);
/** The actual days, e.g. "Mon 5 Oct, Thu 8 Oct" (a range can skip weekly offs). */
const dayList = (ds: Date[]) => ds.map(dayLabel).join(', ');
const booked = (note?: string) => note === 'On leave' || note === 'Requested';
/** My requests rows never wrap, so the badge stays on the right on every row, even on a phone. */
const reqRow = { flexWrap: 'nowrap' } as const;

export function KioskScreen({ view = 'code' }: { view?: KioskView }) {
  const [v, setV] = useState<KioskView>(view === 'unknown_code' ? 'code' : view);
  const [code, setCode] = useState(view === 'unknown_code' ? '9999' : '');
  const [unknown, setUnknown] = useState(view === 'unknown_code');
  const [pin, setPin] = useState(view === 'pin' ? '12' : '');
  // Opens on the first type with days left.
  const [leaveType, setLeaveType] = useState<'CL' | 'EL'>(kioskBalance('CL') - KIOSK_PENDING.days > 0 ? 'CL' : 'EL');
  const [from, setFrom] = useState<Date | null>(null);
  const [to, setTo] = useState<Date | null>(null);
  const [sentLeave, setSentLeave] = useState<null | { type: 'CL' | 'EL'; days: Date[] }>(null);
  const [confirm, setConfirm] = useState(false);
  const [marked, setMarked] = useState(false);
  const onCode = v === 'code';
  const value = onCode ? code : pin;
  const set = onCode ? setCode : setPin;
  const press = (k: string) => {
    setUnknown(false);
    set(k === 'del' ? value.slice(0, -1) : value.length < 4 ? value + k : value);
  };
  const more = (n: number) => (n === 1 ? '1 more digit' : `${n} more digits`);
  const pad = (
    <div className="yx-tim-keypad" role="group" aria-label="Number pad">
      {['1', '2', '3', '4', '5', '6', '7', '8', '9', '', '0', 'del'].map((k, i) =>
        k === '' ? <span key={i} /> : (
          <button key={i} type="button" aria-label={k === 'del' ? 'Delete' : k} title={k === 'del' ? 'Delete' : undefined} onClick={() => press(k)}>
            {k === 'del' ? <Delete aria-hidden="true" /> : k}
          </button>
        ),
      )}
    </div>
  );
  // Days she just requested lock like the pending request.
  const days = KIOSK_DAYS.map((d) => (!d.note && sentLeave?.days.some((x) => sameDay(x, d.date)) ? { ...d, note: 'Requested' } : d));
  const pickDay = (d: Date) => {
    // A range can't run across leave that is already booked: start a new range instead.
    if (!from || to || d < from || days.some((x) => booked(x.note) && x.date > from && x.date < d)) {
      setFrom(d);
      setTo(null);
    } else setTo(d);
  };
  const end = to ?? from;
  const picked = days.filter((d) => !d.note && from && end && d.date >= from && d.date <= end).map((d) => d.date);
  // Pending days come off the balance too, so the same days can't be spent twice.
  const pendingDays = (type: 'CL' | 'EL') => (type === 'CL' ? KIOSK_PENDING.days : 0) + (sentLeave?.type === type ? sentLeave.days.length : 0);
  const available = (type: 'CL' | 'EL') => kioskBalance(type) - pendingDays(type);
  const after = available(leaveType) - picked.length;
  const now = fmt12(KIOSK_IN);
  const leaveName = (t: 'CL' | 'EL') => (t === 'CL' ? 'Casual leave' : 'Earned leave');
  const plural = (n: number) => `${n} ${n === 1 ? 'day' : 'days'}`;
  const sendLeave = () => {
    if (picked.length === 0) return;
    setSentLeave({ type: leaveType, days: picked });
    setConfirm(true);
    setFrom(null);
    setTo(null);
  };
  return (
    <KioskFrame tenant="Kaveri Foods · Hosur plant · Gate 1 kiosk">
      {v === 'code' && (
        <div className="yx-tim-kiosk-card">
          <p className="yx-tim-big">Enter your employee code</p>
          <p className="yx-tim-big yx-tim-code" aria-live="polite">KF-{code.padEnd(4, '_')}</p>
          {pad}
          {unknown ? (
            <InlineAlert tone="danger" title={`No one with code KF-${code}`}>Check the code on your ID card and try again.</InlineAlert>
          ) : (
            <p className="yx-tim-muted">{code.length < 4 ? more(4 - code.length) : 'Code complete'}</p>
          )}
          <div className="yx-tim-row">
            <Button icon={QrCode} onClick={() => setV('qr')}>Scan ID card</Button>
            <Button variant="primary" disabled={code.length < 4 || unknown} onClick={() => (code === KAVITHA_DIGITS ? setV('pin') : setUnknown(true))}>Next</Button>
          </div>
          <p className="yx-tim-muted">{now} · Tue 29 Sep 2026</p>
        </div>
      )}
      {v === 'qr' && (
        <div className="yx-tim-kiosk-card">
          <CameraFrame state="ready" subject="qr" />
          <p className="yx-tim-big">Hold your ID card QR up to the camera</p>
          <Button onClick={() => setV('code')}>Use employee code instead</Button>
        </div>
      )}
      {(v === 'pin' || v === 'wrong_pin') && (
        <div className="yx-tim-kiosk-card">
          <p className="yx-tim-big">{KAVITHA.name}, enter your PIN</p>
          <div className="yx-tim-pin" role="status" aria-label={`${pin.length} of 4 digits entered`}>{[0, 1, 2, 3].map((i) => <span key={i} data-filled={i < pin.length || undefined} />)}</div>
          {v === 'wrong_pin' && (
            // Left-aligned like its button (the kiosk card centres text).
            <div style={{ alignSelf: 'stretch', textAlign: 'left' }}>
              <InlineAlert tone="danger" title="PIN didn't match · 2 tries left" actions={<Button size="sm" icon={QrCode} onClick={() => { setPin(''); setV('qr'); }}>Scan ID card</Button>}>
                Your code locks for 5 minutes after 2 more wrong tries. Forgot it? Scan your ID card or ask your supervisor.
              </InlineAlert>
            </div>
          )}
          {pad}
          <p className="yx-tim-muted">{pin.length < 4 ? more(4 - pin.length) : 'PIN complete'}</p>
          <div className="yx-tim-row">
            <Button icon={ArrowLeft} onClick={() => setV('code')}>Back</Button>
            <Button variant="primary" disabled={pin.length < 4} onClick={() => { setPin(''); setV('menu'); }}>Continue</Button>
          </div>
        </div>
      )}
      {v === 'menu' && (
        <div className="yx-tim-kiosk-card">
          <p className="yx-tim-big">Hello, {KAVITHA.name.split(' ')[0]}</p>
          <InlineAlert tone="info" title={`${SUPERVISOR} applied leave for you`}>Casual leave on {dayLabel(KIOSK_LEAVE_ON)} was approved on 25 Sep. You'll also get an SMS.</InlineAlert>
          <div className="yx-tim-kiosk-grid">
            <Button variant="primary" onClick={() => setV('checked_in')}>Check in</Button>
            <Button onClick={() => setV('training')}>Training</Button>
            <Button onClick={() => setV('leave')}>Apply leave</Button>
            <Button onClick={() => setV('status')}>My requests</Button>
          </div>
          <Kpis
            items={[
              { label: 'Casual leave', value: `${plural(available('CL'))} left`, note: pendingDays('CL') ? `${plural(pendingDays('CL'))} waiting for approval` : undefined },
              { label: 'Earned leave', value: `${plural(available('EL'))} left`, note: pendingDays('EL') ? `${plural(pendingDays('EL'))} waiting for approval` : undefined },
              { label: 'Sick leave', value: `${plural(kioskBalance('SL'))} left`, note: `Ask ${SUPERVISOR.split(' ')[0]} to record` },
              { label: 'Aug payslip', value: 'Sent by SMS' },
            ]}
          />
          <p className="yx-tim-muted" aria-live="polite">Signing out in 30 s</p>
        </div>
      )}
      {v === 'checked_in' && (
        <div className="yx-tim-kiosk-card" role="status">
          <Badge tone="success">Checked in</Badge>
          <p className="yx-tim-big">{now} · Hosur plant</p>
          <p className="yx-tim-muted">On time for your Morning shift (6:00 am, 10 minutes allowed)</p>
          <Button onClick={() => setV('code')}>Done</Button>
        </div>
      )}
      {v === 'training' && marked && (
        <div className="yx-tim-kiosk-card" role="status">
          <Badge tone="success">Marked present</Badge>
          <p className="yx-tim-big">Food safety refresher · 9:00 am</p>
          <Button onClick={() => { setMarked(false); setV('menu'); }}>Done</Button>
        </div>
      )}
      {v === 'training' && !marked && (
        <div className="yx-tim-kiosk-card">
          <p className="yx-tim-big">Mark training attendance</p>
          <p><strong>Food safety refresher</strong> · 9:00 am · Training room 1</p>
          <div className="yx-tim-row">
            <Button icon={ArrowLeft} onClick={() => setV('menu')}>Back</Button>
            <Button variant="primary" disabled={toMin(KIOSK_IN) < toMin(TRAINING_OPENS)} onClick={() => setMarked(true)}>Mark me present</Button>
          </div>
          {toMin(KIOSK_IN) < toMin(TRAINING_OPENS) && <p className="yx-tim-muted">Opens at {fmt12(TRAINING_OPENS)}</p>}
        </div>
      )}
      {v === 'leave' && confirm && sentLeave && (
        <div className="yx-tim-kiosk-card" role="status">
          <Badge tone="success">Sent</Badge>
          <p className="yx-tim-big">{leaveName(sentLeave.type)} · {dayList(sentLeave.days)} · {plural(sentLeave.days.length)}</p>
          <p className="yx-tim-muted">Sent to {SUPERVISOR} · you'll get an SMS when they decide.</p>
          <Button onClick={() => { setConfirm(false); setV('menu'); }}>Done</Button>
        </div>
      )}
      {v === 'leave' && !confirm && (
        <div className="yx-tim-kiosk-card">
          <p className="yx-tim-big">Apply leave</p>
          {/* Short labels so both options fit a phone; the waiting days and sick leave go on the line below. */}
          <ButtonGroup aria-label="Leave type">
            {(['CL', 'EL'] as const).map((t) => (
              <Button key={t} size="lg" aria-pressed={leaveType === t} disabled={available(t) <= 0} onClick={() => setLeaveType(t)}>
                {t === 'CL' ? 'Casual' : 'Earned'} · {available(t)} left
              </Button>
            ))}
          </ButtonGroup>
          <p className="yx-tim-muted">
            {pendingDays('CL') ? `${plural(pendingDays('CL'))} of casual leave waiting for approval. ` : ''}
            Sick leave ({plural(kioskBalance('SL'))} left): ask {SUPERVISOR} to record sick days.
          </p>
          <p className="yx-tim-muted">Tap the first day, then the last day.</p>
          <div style={dayGrid} role="group" aria-label="Leave dates">
            {days.map((d) => {
              const on = !!from && !!end && d.date >= from && d.date <= end && !d.note;
              const line2 = d.note ?? d.hint;
              return (
                <Button key={d.date.toISOString()} size="lg" style={dayTile} variant={on ? 'primary' : 'secondary'} aria-pressed={on} disabled={!!d.note} onClick={() => pickDay(d.date)}>
                  <span style={{ display: 'flex', flexDirection: 'column' }}>
                    <span>{dayLabel(d.date)}</span>
                    {line2 && <span className="yx-tim-note" style={{ color: 'inherit' }}>{line2}</span>}
                  </span>
                </Button>
              );
            })}
          </div>
          {days.some((d) => d.hint) && <p className="yx-tim-muted">{days.filter((d) => d.hint).map((d) => `${dayLabel(d.date)} is a holiday (${d.holiday}) you are rostered to work.`).join(' ')}</p>}
          <p className="yx-tim-muted">
            {picked.length === 0 ? 'No working days picked' : `${dayList(picked)} · ${plural(picked.length)} · balance after: ${plural(after)}`} · goes to {SUPERVISOR}
          </p>
          <div className="yx-tim-row">
            <Button icon={ArrowLeft} onClick={() => setV('menu')}>Back</Button>
            <Button variant="primary" disabled={picked.length === 0 || after < 0} onClick={sendLeave}>Send leave request</Button>
          </div>
          {after < 0 && <p className="yx-tim-muted">Not enough {leaveName(leaveType).toLowerCase()} for these days ({available(leaveType)} left after pending requests)</p>}
        </div>
      )}
      {v === 'status' && (
        <div className="yx-tim-kiosk-card">
          <p className="yx-tim-big">My requests</p>
          {/* Full width and left-aligned, so every row keeps its badge on the right. */}
          <ul className="yx-tim-list" style={{ alignSelf: 'stretch', textAlign: 'left' }}>
            {sentLeave && <li style={reqRow}><span className="yx-tim-list__main"><span>{leaveName(sentLeave.type)} · {dayList(sentLeave.days)}</span><span className="yx-tim-muted">With {SUPERVISOR}</span></span><Badge tone="warning">Pending</Badge></li>}
            <li style={reqRow}><span className="yx-tim-list__main"><span>Casual leave · {dayLabel(KIOSK_LEAVE_ON)}</span><span className="yx-tim-muted">Raised by {SUPERVISOR}</span></span><Badge tone="success">Approved</Badge></li>
            <li style={reqRow}><span className="yx-tim-list__main"><span>Casual leave · {dayRange(KIOSK_PENDING.from, KIOSK_PENDING.to)}</span><span className="yx-tim-muted">With {SUPERVISOR}</span></span><Badge tone="warning">Pending</Badge></li>
          </ul>
          <Button icon={ArrowLeft} onClick={() => setV('menu')}>Back</Button>
        </div>
      )}
    </KioskFrame>
  );
}

/* =====================================================================
   TIM-32 · Field-force live map & visit log
   ===================================================================== */

type VisitStatus = 'Done' | 'On site' | 'Upcoming' | 'Missed';
/** `flagged`: a done visit with an open integrity flag (shows amber until the flag is reviewed). */
interface FieldVisit { id: string; person: string; place: string; time: string; status: VisitStatus; planned: boolean; detail: string; flagged?: true }
/** `audit`: on duty for a one-off audit, not a sales beat (left out of Beat coverage). `trackingOff`: no trail today (TEAM). */
interface FieldPerson { id: string; name: string; beat: string; audit?: true; reportsTo: string; inAt?: string; km: number | null; shiftStart: string; withdrawnAt?: string; trackingOff?: string; flag?: { at: string }; x: number; y: number }

const VIKRAM = TEAM.find((t) => t.name === FIELD_DAY.person)!;
/** Nisha's audit day comes from TEAM t6, including her tracking being off for the audit. */
const NISHA = TEAM.find((t) => t.id === 't6')!;
/** Sales field staff report to the Sales manager; Nisha Menon (on duty for Quality) shows only in the HR view. */
const SALES_MANAGER: TimeUser = { name: VIKRAM.reportsTo, email: 'vikram.rao@kaverifoods.in', role: 'Head of Sales' };

const FIELD: FieldPerson[] = [
  { id: 'v', name: VIKRAM.name, beat: 'Chennai south · Tue beat', reportsTo: VIKRAM.reportsTo, inAt: VIKRAM.inAt, km: FIELD_DAY.km, shiftStart: '09:00', x: 200, y: 80 },
  { id: 's', name: 'Suganya Ramesh', beat: 'Chennai west', reportsTo: VIKRAM.reportsTo, inAt: '08:30', km: 9.6, shiftStart: '08:30', flag: { at: '09:20' }, x: 120, y: 40 },
  { id: 'b', name: 'Bharath Reddy', beat: 'Vellore', reportsTo: VIKRAM.reportsTo, km: null, shiftStart: '09:00', x: 0, y: 0 },
  { id: 'p', name: 'Pooja Iyengar', beat: 'Chennai north', reportsTo: VIKRAM.reportsTo, inAt: '08:45', km: null, shiftStart: '08:30', withdrawnAt: '09:05', x: 0, y: 0 },
  { id: 'n', name: NISHA.name, beat: 'Supplier audit, Guindy', audit: true, reportsTo: NISHA.reportsTo, inAt: NISHA.inAt, km: NISHA.trackingOff ? null : 7.4, trackingOff: NISHA.trackingOff, shiftStart: '09:30', x: 160, y: 140 },
];

const VISITS: FieldVisit[] = [
  { id: 'v1', person: 'v', place: 'Anand Stores, Adyar', time: '9:16 – 9:27 am', status: 'Done', planned: true, detail: 'Inside site · 22 m · photo · order taken' },
  { id: 'v2', person: 'v', place: 'Kumar Agencies, Besant Nagar', time: '9:31 – 9:40 am', status: 'Done', planned: true, detail: 'Inside site · follow-up' },
  { id: 'v3', person: 'v', place: 'Sri Murugan Traders, Thiruvanmiyur', time: '10:00 – 11:00 am', status: 'Upcoming', planned: true, detail: 'New product demo' },
  { id: 'v4', person: 'v', place: 'Balaji Supermarket, Velachery', time: '11:30 am – 12:15 pm', status: 'Upcoming', planned: true, detail: 'Payment follow-up' },
  { id: 'v5', person: 'v', place: 'Lakshmi Provisions, Perungudi', time: '2:00 – 2:45 pm', status: 'Upcoming', planned: true, detail: 'Order collection' },
  { id: 'v6', person: 'v', place: 'Selvam Stores, Madipakkam', time: '3:30 – 4:15 pm', status: 'Upcoming', planned: true, detail: 'New outlet' },
  { id: 's1', person: 's', place: 'Ganesh Traders, Anna Nagar', time: '8:40 – 9:00 am', status: 'Done', planned: true, detail: 'Inside site · order taken' },
  { id: 's2', person: 's', place: 'Vel Murugan Stores, Koyambedu', time: '9:10 – 9:25 am', status: 'Done', planned: true, detail: 'Mock location flag at 9:20 am', flagged: true },
  { id: 's3', person: 's', place: 'New Jothi Mart, Vadapalani', time: '9:30 – 9:38 am', status: 'Done', planned: false, detail: 'Inside site · follow-up' },
  { id: 's4', person: 's', place: 'Sakthi Provisions, Ashok Nagar', time: '10:30 – 11:15 am', status: 'Upcoming', planned: true, detail: 'Payment follow-up' },
  { id: 's5', person: 's', place: 'Raja Stores, KK Nagar', time: '12:00 – 12:45 pm', status: 'Upcoming', planned: true, detail: 'Order collection' },
  { id: 'b1', person: 'b', place: 'Sri Venkateswara Agencies, Vellore', time: '10:00 – 10:45 am', status: 'Upcoming', planned: true, detail: 'Order collection' },
  { id: 'b2', person: 'b', place: 'Kannan Stores, Katpadi', time: '11:30 am – 12:15 pm', status: 'Upcoming', planned: true, detail: 'New product demo' },
  { id: 'b3', person: 'b', place: 'Murali Traders, Sathuvachari', time: '2:00 – 2:45 pm', status: 'Upcoming', planned: true, detail: 'Payment follow-up' },
  { id: 'b4', person: 'b', place: 'Anbu Supermarket, Gandhi Nagar', time: '3:30 – 4:15 pm', status: 'Upcoming', planned: true, detail: 'Order collection' },
  { id: 'p1', person: 'p', place: 'Bismi Stores, Perambur', time: '8:50 – 9:10 am', status: 'Done', planned: true, detail: 'Field check-in · order taken' },
  { id: 'p2', person: 'p', place: 'Saravana Traders, Kolathur', time: '9:20 – 9:35 am', status: 'Done', planned: true, detail: 'Field check-in · follow-up' },
  { id: 'p3', person: 'p', place: 'Velan Mart, Madhavaram', time: '10:30 – 11:15 am', status: 'Upcoming', planned: true, detail: 'New product demo' },
  { id: 'n1', person: 'n', place: 'Supplier audit, Guindy', time: '9:30 am – 1:00 pm', status: 'On site', planned: true, detail: 'Inside site' },
];

const VISIT_TONE: Record<VisitStatus, BadgeTone> = { Done: 'success', 'On site': 'info', Upcoming: 'neutral', Missed: 'danger' };
const visitsOf = (id: string) => VISITS.filter((x) => x.person === id);
/** A done visit with an open flag isn't counted as done until the flag is reviewed. */
const doneOf = (id: string, flagOpen = true) => visitsOf(id).filter((x) => x.status === 'Done' && !(flagOpen && x.flagged)).length;
const visitCount = (id: string, flagOpen = true) => {
  const flagged = flagOpen ? visitsOf(id).filter((x) => x.flagged).length : 0;
  return `${doneOf(id, flagOpen)} of ${visitsOf(id).length}${flagged ? ` (${flagged} flagged)` : ''}`;
};
/** Visits and distance in one line; distance left out when there is no trail, and "Tracking off" said when it's off. */
const visitsLine = (p: FieldPerson, flagOpen = true) =>
  [`${visitCount(p.id, flagOpen)} visits`, p.km !== null ? `${p.km} km` : p.trackingOff && 'Tracking off'].filter(Boolean).join(' · ');
const nameOf = (id: string) => FIELD.find((f) => f.id === id)?.name ?? '';

/** `flagOpen`: a flagged visit shows an amber "Flagged" badge until its flag is reviewed. */
function VisitList({ visits, showPerson, flagOpen = true }: { visits: FieldVisit[]; showPerson?: boolean; flagOpen?: boolean }) {
  return (
    <ul className="yx-tim-list">
      {visits.map((x) => (
        // No wrap: the badge stays on the right of every row, even on a phone.
        <li key={x.id} style={{ flexWrap: 'nowrap' }}>
          <span className="yx-tim-list__main">
            <strong>{x.place}</strong>
            <span className="yx-tim-muted">{[x.time, showPerson && nameOf(x.person), x.planned ? 'Planned' : 'Unplanned', x.detail].filter(Boolean).join(' · ')}</span>
          </span>
          {x.flagged && flagOpen ? <Badge tone="warning">Flagged</Badge> : <Badge tone={VISIT_TONE[x.status]}>{x.status}</Badge>}
        </li>
      ))}
    </ul>
  );
}

export function FieldForceScreen({ persona = 'mgr', openId, state = 'ready' }: { persona?: 'mgr' | 'hr'; openId?: string; state?: 'ready' | 'empty' }) {
  const user = persona === 'hr' ? HR_ADMIN : SALES_MANAGER;
  const rows = persona === 'hr' ? FIELD : FIELD.filter((f) => f.reportsTo === user.name);
  const [open, setOpen] = useState(openId ?? null);
  const [who, setWho] = useState<string | null>('all');
  const [flag, setFlag] = useState<'open' | 'asked' | 'reviewed'>('open');
  const [messaged, setMessaged] = useState<string[]>([]);
  const [askedHr, setAskedHr] = useState(false);
  const person = rows.find((f) => f.id === open);
  const nowMin = NOW_MIN;
  const tracked = rows.filter((f) => f.inAt && f.km !== null);
  const flagOpen = flag !== 'reviewed';
  const teamVisits = VISITS.filter((x) => rows.some((r) => r.id === x.person));
  const shownVisits = who && who !== 'all' ? teamVisits.filter((x) => x.person === who) : teamVisits;
  // Beat coverage counts the same people its By beat list shows (audits are not beats).
  const beatRows = rows.filter((f) => !f.audit);
  const beatVisits = teamVisits.filter((x) => beatRows.some((r) => r.id === x.person));
  const isDone = (x: FieldVisit) => x.status === 'Done' && !(flagOpen && x.flagged);
  const count = (s: VisitStatus) => beatVisits.filter((x) => x.status === s).length;
  const planned = beatVisits.filter((x) => x.planned);
  const statusBadge = (f: FieldPerson) =>
    !f.inAt ? <Badge tone={nowMin > toMin(f.shiftStart) ? 'warning' : 'neutral'}>Not checked in</Badge>
      : f.withdrawnAt ? <Badge tone="neutral">No trail</Badge>
        : f.flag ? <Badge tone="warning">Flag: mock location</Badge>
          : visitsOf(f.id).some((x) => x.status === 'On site') ? <Badge tone="info">On site</Badge>
            : null;
  const first = person?.name.split(' ')[0];
  const done = person ? visitsOf(person.id).filter((x) => x.status === 'Done') : [];
  return (
    <TimePage active="Today" user={user}>
      <PageHeader title="Field force · today" description={`${persona === 'hr' ? 'All field staff' : 'Your team'}${state === 'empty' ? '' : ' · duty time only · trails kept 90 days, then only distance and visits'}`} />
      {state === 'empty' ? (
        persona === 'hr' ? (
          <EmptyState title="Field tracking is off for this group" description="Turn it on per group in Settings › Check-in & devices. Each person then gives consent before any location is recorded." action={<StoryLink to="checkInSettings">Open settings</StoryLink>} />
        ) : (
          <EmptyState
            title="Field tracking is off for your group"
            description={askedHr ? 'Request sent to HR. Each person gives consent before any location is recorded.' : 'Ask HR to turn on field tracking for your group. Each person then gives consent before any location is recorded.'}
            action={<Button disabled={askedHr} onClick={() => setAskedHr(true)}>{askedHr ? 'Asked HR' : 'Ask HR'}</Button>}
          />
        )
      ) : (
        <Tabs defaultValue="map">
          <TabsList aria-label="Field views"><TabsTrigger value="map">Live map</TabsTrigger><TabsTrigger value="visits">Visit log</TabsTrigger><TabsTrigger value="beats">Beat coverage</TabsTrigger></TabsList>
          <TabsContent value="map">
            <div className="yx-tim-grid">
              <div data-span="8">
                <GeoMap
                  fences={[{ id: 'o', label: 'Chennai office', x: 70, y: 150, r: 18 }]}
                  pins={tracked.map((f) => ({ id: f.id, label: f.name, x: f.x, y: f.y, kind: 'person' as const, tone: f.flag ? ('warn' as const) : undefined }))}
                  // Pins show an initial, so the caption names them (no hover on a phone).
                  caption={`Live positions during duty hours${tracked.length ? ` · ${tracked.map((f) => `${f.name[0]} = ${f.name.split(' ')[0]}`).join(', ')}` : ''}`}
                  height={280}
                />
              </div>
              <div data-span="4">
                <Card title="Team">
                  <ul className="yx-tim-list">
                    {rows.map((f) => (
                      <li key={f.id}>
                        <span className="yx-tim-list__main">
                          <PersonLabel name={f.name} secondary={persona === 'hr' ? `${visitsLine(f, flagOpen)} · ${f.reportsTo}` : visitsLine(f, flagOpen)} />
                        </span>
                        <span className="yx-tim-row">
                          {statusBadge(f)}
                          <Button size="sm" onClick={() => setOpen(f.id)}>Open</Button>
                        </span>
                      </li>
                    ))}
                  </ul>
                </Card>
              </div>
            </div>
          </TabsContent>
          <TabsContent value="visits">
            <div className="yx-tim-stack">
              <FormField label="Person">
                <Select value={who} onChange={setWho} options={[{ value: 'all', label: 'Everyone' }, ...rows.map((r) => ({ value: r.id, label: r.name }))]} />
              </FormField>
              <VisitList visits={shownVisits} showPerson flagOpen={flagOpen} />
            </div>
          </TabsContent>
          <TabsContent value="beats">
            <div className="yx-tim-stack">
              <Kpis items={[{ label: 'Planned visits', value: planned.length }, { label: 'Planned done', value: planned.filter(isDone).length }, { label: 'On site', value: count('On site') }, { label: 'Missed', value: count('Missed') }, { label: 'Unplanned', value: beatVisits.filter((x) => !x.planned).length }]} />
              <Card title="By beat">
                <ul className="yx-tim-list">
                  {beatRows.map((f) => {
                    const mine = visitsOf(f.id);
                    const plan = mine.filter((x) => x.planned);
                    const planDone = plan.filter(isDone).length;
                    const extra = mine.length - plan.length;
                    const missed = mine.filter((x) => x.status === 'Missed').length;
                    return (
                      <li key={f.id}>
                        <span className="yx-tim-list__main">
                          <strong>{f.beat}</strong>
                          <span className="yx-tim-muted">{[f.name, extra && `${extra} unplanned`, missed && `${missed} missed`].filter(Boolean).join(' · ')}</span>
                        </span>
                        <Meter value={planDone} max={plan.length} label={`${f.beat}: planned visits done`} warnAt={101} dangerAt={101} valueText={`${planDone} of ${plan.length}`} />
                      </li>
                    );
                  })}
                </ul>
              </Card>
            </div>
          </TabsContent>
        </Tabs>
      )}
      <Drawer open={!!person} onOpenChange={(o) => !o && setOpen(null)} title={person?.name ?? ''} subtitle={person ? `${person.beat} · ${person.inAt ? `on duty since ${fmt12(person.inAt)}` : 'not on duty yet'}` : ''} size="lg">
        {person && (
          <div className="yx-tim-stack">
            {!person.inAt ? (
              <InlineAlert
                tone={nowMin > toMin(person.shiftStart) ? 'warning' : 'info'}
                title="Not on duty yet"
                actions={
                  <Button size="sm" disabled={messaged.includes(person.id)} onClick={() => setMessaged((m) => [...m, person.id])}>
                    {messaged.includes(person.id) ? 'Message sent' : `Message ${first}`}
                  </Button>
                }
              >
                Shift started {fmt12(person.shiftStart)}. Nothing is recorded until {first} checks in.
              </InlineAlert>
            ) : (
              <>
                <Kpis
                  items={[
                    ...(person.km === null ? [] : [{ label: 'Distance', value: `${person.km} km`, note: 'From duty trail' }]),
                    { label: 'Visits', value: visitCount(person.id, flagOpen) },
                  ]}
                />
                {person.withdrawnAt ? (
                  <InlineAlert tone="info" title={`No trail: consent withdrawn at ${fmt12(person.withdrawnAt)}`}>Visits are still logged as field check-ins.</InlineAlert>
                ) : person.trackingOff ? (
                  <InlineAlert tone="info" title={`Tracking off today: ${person.trackingOff}`}>No location trail is recorded. Visits are still logged as check-ins.</InlineAlert>
                ) : (
                  <GeoMap
                    fences={[{ id: 'o', label: 'Office', x: 60, y: 150, r: 16 }]}
                    pins={done.map((x, i) => ({ id: x.id, label: x.place.split(',')[0], x: 120 + i * 60, y: 120 - i * 35, kind: 'visit' as const }))}
                    trail={[[60, 150], ...done.map((_, i) => [120 + i * 60, 120 - i * 35] as [number, number])]}
                    caption="Trail during duty only"
                  />
                )}
                {person.flag && flag !== 'reviewed' && (
                  <InlineAlert
                    tone="warning"
                    title={`Mock location detected ${fmt12(person.flag.at)}`}
                    actions={
                      <>
                        <Button size="sm" disabled={flag === 'asked'} onClick={() => setFlag('asked')}>{flag === 'asked' ? 'Note requested' : `Ask ${first} for a note`}</Button>
                        <Button size="sm" variant="review" onClick={() => setFlag('reviewed')}>Mark reviewed</Button>
                      </>
                    }
                  >
                    Flags are never penalised automatically.{flag === 'asked' ? ` ${first}'s note shows here once added.` : ''}
                  </InlineAlert>
                )}
                {person.flag && flag === 'reviewed' && <InlineAlert tone="success" title="Flag reviewed">Marked reviewed by {user.name}.</InlineAlert>}
              </>
            )}
            <Card title="Visits today"><VisitList visits={visitsOf(person.id)} flagOpen={flagOpen} /></Card>
            <p className="yx-tim-note">No per-minute timeline outside duty hours. Nothing is recorded on leave, weekly offs or after check-out.</p>
          </div>
        )}
      </Drawer>
    </TimePage>
  );
}

/* =====================================================================
   TIM-33 · Visit check-in, beat plan & distance conveyance (phone)
   ===================================================================== */

export type FieldPhoneView = 'consent' | 'beat' | 'visit' | 'visit_outside' | 'photo' | 'conveyance' | 'withdrawn' | 'pwa';

const MY_VISITS = visitsOf('v');
const UNPLANNED: FieldVisit = { id: 'u', person: 'v', place: 'Unplanned visit', time: '', status: 'On site', planned: false, detail: '' };
/** The tracking rule on the banner (the consent card says the end-of-day part only once, under "When"). */
const TRACKING_RULE = 'every 5 minutes while you move, until you end your day';
const VISIT_IN = fmt12(toHHMM(NOW_MIN));
/** The photo is taken now (story time), never after the clock. */
const PHOTO_AT = VISIT_IN;
/** "9:42 – 9:54 am", the same shape as the seeded visit rows. */
const VISIT_RANGE = (() => {
  const a = VISIT_IN;
  const b = fmt12(toHHMM(NOW_MIN + 12));
  return a.slice(-2) === b.slice(-2) ? `${a.slice(0, -3)} – ${b}` : `${a} – ${b}`;
})();
/** When Arvind turned tracking off in the "withdrawn" story (his own record for that story). */
const MY_WITHDRAWN_AT = toHHMM(NOW_MIN - 7);
/** Distance when there is no full trail: the trail up to the withdrawal plus a straight-line estimate after it, or (never consented) visit points only. */
const KM_WITHDRAWN = { trail: 4.1, after: 0.4 };
const KM_ESTIMATED = 4.3;
const FIRST_UPCOMING = MY_VISITS.find((x) => x.status === 'Upcoming');
const OUTCOMES = [{ value: 'o', label: 'Order taken' }, { value: 'f', label: 'Follow-up' }, { value: 'd', label: 'Demo given' }, { value: 'c', label: 'Shop closed' }];
/** Start of a visit's time ("11:30 am – 12:15 pm" → 690), to keep the day's list in time order. */
const startMin = (t: string) => {
  const m = /(\d+):(\d+)/.exec(t);
  if (!m) return 0;
  return (Number(m[1]) % 12) * 60 + Number(m[2]) + (/(am|pm)/.exec(t)?.[1] === 'pm' ? 720 : 0);
};

export function FieldVisitPhone({ view = 'beat' }: { view?: FieldPhoneView }) {
  const [v, setV] = useState<FieldPhoneView>(view);
  const [consent, setConsent] = useState<'on' | 'off' | 'withdrawn'>(view === 'withdrawn' ? 'withdrawn' : view === 'consent' ? 'off' : 'on');
  const [checkedIn, setCheckedIn] = useState(view === 'visit' || view === 'photo');
  /** Where the open visit is: outside its site (480 m away) or inside it. */
  const [outside, setOutside] = useState(view === 'visit_outside');
  /** Planned visits checked out today, with what really happened (times, site, photo, outcome, notes). */
  const [results, setResults] = useState<Record<string, Pick<FieldVisit, 'time' | 'detail'>>>({});
  /** Unplanned visits checked out today. */
  const [extra, setExtra] = useState<FieldVisit[]>([]);
  const [shop, setShop] = useState('');
  const [purpose, setPurpose] = useState('');
  const [outcome, setOutcome] = useState<string | null>(null);
  const [notes, setNotes] = useState('');
  const [shot, setShot] = useState(true);
  const [photoUsed, setPhotoUsed] = useState(false);
  const [dayEnded, setDayEnded] = useState(false);
  const [installAsked, setInstallAsked] = useState(false);
  const [claimSaved, setClaimSaved] = useState(false);
  const [curId, setCurId] = useState(FIRST_UPCOMING?.id ?? 'u');
  const openId = checkedIn ? curId : null;
  // Visits not reached by the end of the day are missed.
  const status = (x: FieldVisit): VisitStatus => (results[x.id] ? 'Done' : x.id === openId ? 'On site' : dayEnded && x.status === 'Upcoming' ? 'Missed' : x.status);
  const cur = MY_VISITS.find((x) => x.id === curId) ?? { ...UNPLANNED, place: shop.trim() || UNPLANNED.place, time: VISIT_IN, detail: purpose.trim() };
  const unplanned = cur.id === 'u';
  // The open unplanned visit shows on the plan too, so leaving it doesn't lose it. Rows stay in time order.
  const list = [...MY_VISITS.map((x) => ({ ...x, ...results[x.id] })), ...extra, ...(openId === 'u' ? [cur] : [])].sort((a, b) => startMin(a.time) - startMin(b.time));
  const upcomingLeft = list.filter((x) => status(x) === 'Upcoming').length;
  const next = list.find((x) => status(x) === 'Upcoming');
  const done = list.filter((x) => status(x) === 'Done');
  const onVisit = v === 'photo' || v === 'visit' || v === 'visit_outside';
  const tracking = consent === 'on' && !dayEnded;
  const title = onVisit ? cur.place.split(',')[0] : v === 'conveyance' ? 'Today’s distance' : v === 'consent' ? 'Field tracking' : 'Beat plan';
  const back = v === 'photo'
    ? <IconButton icon={ArrowLeft} label="Back to visit" onClick={() => setV('visit')} />
    : onVisit || v === 'conveyance' ? <IconButton icon={ArrowLeft} label="Back to beat plan" onClick={() => setV('beat')} /> : undefined;
  const startVisit = (id: string) => {
    setCurId(id);
    // An unplanned visit asks for the shop first; a planned one checks in straight away.
    setCheckedIn(id !== 'u');
    if (id === 'u') { setShop(''); setPurpose(''); }
    // Each visit starts fresh: no outcome picked, no notes, no photo. Planned visits in this story are checked in at the site.
    setOutcome(null);
    setNotes('');
    setOutside(false);
    setPhotoUsed(false);
    setV('visit');
  };
  const checkOut = () => {
    if (!outcome) return;
    // The row keeps what happened, written the same way as the seeded Done rows.
    const site = unplanned ? 'Field check-in' : outside ? 'Outside site · 480 m' : 'Inside site · 15 m';
    const what = OUTCOMES.find((o) => o.value === outcome)!.label.toLowerCase();
    const detail = [site, photoUsed && 'photo', what, notes.trim()].filter(Boolean).join(' · ');
    if (unplanned) setExtra((e) => [...e, { ...cur, id: `u${e.length + 1}`, time: VISIT_RANGE, status: 'Done', detail: [cur.detail, detail].filter(Boolean).join(' · ') }]);
    else setResults((r) => ({ ...r, [cur.id]: { time: VISIT_RANGE, detail } }));
    setCheckedIn(false);
    setV('beat');
  };
  const endDayButton = (
    upcomingLeft > 0 && !dayEnded && !openId ? (
      <ConfirmDialog
        trigger={<Button fullWidth>End day</Button>}
        title={`${upcomingLeft} planned ${upcomingLeft === 1 ? 'visit' : 'visits'} not done. End your day?`}
        consequence="Tracking stops and can't be restarted today. Visits not done are marked missed."
        confirmLabel="End day"
        cancelLabel="Keep working"
        onConfirm={() => setDayEnded(true)}
      />
    ) : (
      <Button fullWidth disabled={!!openId || dayEnded} onClick={() => setDayEnded(true)}>{dayEnded ? 'Day ended' : 'End day'}</Button>
    )
  );
  const km = consent === 'on' ? FIELD_DAY.km : consent === 'withdrawn' ? Math.round((KM_WITHDRAWN.trail + KM_WITHDRAWN.after) * 10) / 10 : KM_ESTIMATED;
  const kmNote = consent === 'on' ? 'From your trail today'
    : consent === 'withdrawn' ? `${KM_WITHDRAWN.trail} km trail until ${fmt12(MY_WITHDRAWN_AT)}, ${KM_WITHDRAWN.after} km estimated after`
      : 'Estimated: straight lines between visits';
  const visitLine = (x: FieldVisit) => [x.time, !x.planned && 'Unplanned', x.detail].filter(Boolean).join(' · ');
  return (
    <PhoneFrame tab="time" title={title} back={back} hideTabs={onVisit}>
      {tracking && !onVisit && v !== 'consent' && (
        <InlineAlert
          tone="info"
          title={v === 'pwa' ? 'Tracking only while this page is open' : 'Location tracking is on'}
          actions={v === 'pwa' ? <Button size="sm" disabled={installAsked} onClick={() => setInstallAsked(true)}>{installAsked ? 'Follow your browser’s prompt' : 'Install the app'}</Button> : undefined}
        >
          {v === 'pwa' ? 'You are using the web app: location is recorded only while this page is open. Install the app for background tracking.' : `Location is recorded ${TRACKING_RULE}.`}
        </InlineAlert>
      )}
      {v === 'consent' && (
        <Card title="Location tracking during duty">
          <div className="yx-tim-stack">
            <ul className="yx-tim-steps">
              {/* The end-of-day rule is said once, in "When". */}
              <li>What: your location every 5 minutes while you move.</li>
              <li>When: only between checking in and ending your day, on duty days. Never on leave, weekly offs or after you end your day.</li>
              <li>Who sees it: you, your manager and HR.</li>
              <li>How long: 90 days, then only distance and visits are kept.</li>
            </ul>
            <p className="yx-tim-note">You can withdraw consent any time in Me › Privacy. Without it you can still check in and log visits.</p>
            <Button variant="primary" fullWidth onClick={() => { setConsent('on'); setV('beat'); }}>I agree, turn on tracking</Button>
            <Button fullWidth onClick={() => { setConsent('off'); setV('beat'); }}>Not now</Button>
          </div>
        </Card>
      )}
      {!tracking && !dayEnded && !onVisit && v !== 'consent' && (
        <InlineAlert
          tone="info"
          title="Tracking is off"
          actions={<Button size="sm" onClick={() => setV('consent')}>{consent === 'withdrawn' ? 'Turn tracking back on' : 'Turn tracking on'}</Button>}
        >
          {consent === 'withdrawn' ? `You withdrew consent at ${fmt12(MY_WITHDRAWN_AT)}. ` : ''}Visits are still logged as field check-ins, without a trail.
        </InlineAlert>
      )}
      {dayEnded && (v === 'beat' || v === 'pwa' || v === 'withdrawn') && (
        <InlineAlert tone="success" title={`Day ended at ${VISIT_IN}`} actions={<Button size="sm" onClick={() => setV('conveyance')}>Review mileage</Button>}>
          Tracking has stopped. Your draft mileage claim is ready to review.
        </InlineAlert>
      )}
      {(v === 'beat' || v === 'pwa' || v === 'withdrawn') && (
        <>
          <div className="yx-tim-row">
            <p className="yx-tim-muted">{done.length} of {list.length} visits{consent === 'on' ? ` · ${FIELD_DAY.km} km ${dayEnded ? 'today' : 'so far'}` : ''}</p>
            <Button size="sm" onClick={() => setV('conveyance')}>See distance and mileage</Button>
          </div>
          <ul className="yx-tim-list">
            {list.map((x) => {
              const st = status(x);
              return (
                <li key={x.id} style={{ flexWrap: 'nowrap' }}>
                  <span className="yx-tim-list__main"><strong>{x.place}</strong><span className="yx-tim-muted">{visitLine(x)}</span></span>
                  {st === 'On site' ? (
                    <span className="yx-tim-row"><Badge tone={VISIT_TONE[st]}>On site</Badge><Button size="sm" onClick={() => setV('visit')}>Return to visit</Button></span>
                  ) : st === 'Upcoming' && !openId && !dayEnded ? (
                    <Button size="sm" variant={x === next ? 'primary' : 'secondary'} onClick={() => startVisit(x.id)}>Check in</Button>
                  ) : (
                    <Badge tone={VISIT_TONE[st]}>{st}</Badge>
                  )}
                </li>
              );
            })}
            <li>
              <div className="yx-tim-stack" style={{ flex: 1 }}>
                <Button fullWidth disabled={!!openId || dayEnded} onClick={() => startVisit('u')}>Add unplanned visit</Button>
                {endDayButton}
                {openId && <p className="yx-tim-muted">Check out of {cur.place.split(',')[0]} first.</p>}
              </div>
            </li>
          </ul>
        </>
      )}
      {(v === 'visit' || v === 'visit_outside') && (
        <div className="yx-tim-stack">
          {/* An unplanned visit has no site, so no site circle or inside/outside badge. */}
          {!unplanned && (
            <>
              <GeoMap fences={[{ id: 's', label: 'Site · 100 m', x: 150, y: 100, r: 30 }]} pins={[{ id: 'me', label: 'You', x: outside ? 230 : 158, y: outside ? 60 : 96, kind: 'you', accuracy: 4 }]} caption="Accuracy ±20 m" height={170} />
              {/* Inside or outside comes from where this visit is, not from the view, so going back and forth keeps it. */}
              {!outside ? (
                <div className="yx-tim-row"><Badge tone="success">Inside site · 15 m</Badge></div>
              ) : checkedIn ? (
                <div className="yx-tim-row"><Badge tone="warning">Outside site · 480 m</Badge></div>
              ) : (
                <InlineAlert tone="warning" title="Outside the site, 480 m away">You can still check in. Your manager sees the visit marked outside site.</InlineAlert>
              )}
            </>
          )}
          {checkedIn ? (
            <>
              <p className="yx-tim-muted">Checked in {VISIT_IN}{unplanned ? ' · Unplanned' : ''}{cur.detail ? ` · ${cur.detail}` : ''}</p>
              <FormField label="Outcome" required><Select value={outcome} onChange={setOutcome} placeholder="Pick an outcome" options={OUTCOMES} /></FormField>
              <FormField label="Notes" optional><TextArea rows={2} value={notes} onChange={setNotes} /></FormField>
              {photoUsed ? <div className="yx-tim-row"><Badge tone="success">Photo added · {PHOTO_AT}</Badge></div> : <Button fullWidth onClick={() => { setShot(false); setV('photo'); }}>Take photo (camera only)</Button>}
              <Button variant="primary" fullWidth disabled={!outcome} onClick={checkOut}>Check out of visit</Button>
              {!outcome && <p className="yx-tim-muted">Pick an outcome to check out.</p>}
            </>
          ) : unplanned ? (
            <>
              <FormField label="Shop name" required><TextField value={shop} onChange={setShop} /></FormField>
              <FormField label="Purpose" optional><TextField value={purpose} onChange={setPurpose} /></FormField>
              <Button variant="primary" fullWidth disabled={!shop.trim()} onClick={() => setCheckedIn(true)}>Check in here</Button>
              {!shop.trim() && <p className="yx-tim-muted">Enter the shop name to check in.</p>}
            </>
          ) : (
            <Button variant="primary" fullWidth onClick={() => { setOutside(true); setCheckedIn(true); }}>Check in here (outside site)</Button>
          )}
        </div>
      )}
      {v === 'photo' && (
        <div className="yx-tim-stack">
          <CameraFrame subject="scene" state={shot ? 'captured' : 'ready'} stamp={shot ? `${PHOTO_AT.replace(' ', ' ')} · 12.9830, 80.2594` : undefined} />
          <p className="yx-tim-note">Photos come from the camera only (no gallery) and carry time and location.</p>
          {shot ? (
            <>
              <Button variant="primary" fullWidth onClick={() => { setPhotoUsed(true); setV('visit'); }}>Use photo</Button>
              <Button fullWidth onClick={() => setShot(false)}>Retake</Button>
            </>
          ) : (
            <Button variant="primary" fullWidth onClick={() => setShot(true)}>Take photo</Button>
          )}
        </div>
      )}
      {v === 'conveyance' && (
        <div className="yx-tim-stack">
          <Kpis items={[{ label: 'Distance', value: `${km} km`, note: kmNote }, { label: 'Visits', value: `${done.length} of ${list.length}` }]} />
          <GeoMap
            fences={[{ id: 'o', label: 'Office', x: 50, y: 160, r: 14 }]}
            pins={done.map((x, i) => ({ id: x.id, label: x.place.split(',')[0], x: 120 + i * 80, y: 120 - i * 50, kind: 'visit' as const }))}
            trail={[[50, 160], ...done.map((_, i) => [120 + i * 80, 120 - i * 50] as [number, number])]}
            caption={consent === 'on' ? 'My trail today' : 'My visits today'}
            height={170}
          />
          <InlineAlert tone="info" title="Draft mileage line">{km} km {dayEnded ? 'today' : 'so far'} · two-wheeler. The line updates until you end your day, then waits for you in Pay › Expenses. Nothing is paid until you confirm and it's approved.</InlineAlert>
          <Button variant="primary" fullWidth disabled={!dayEnded || claimSaved} onClick={() => setClaimSaved(true)}>{claimSaved ? 'Sent to Pay › Expenses' : 'Send to Pay › Expenses'}</Button>
          {/* The blocked button's reason carries the action that unblocks it. */}
          {!dayEnded && (
            <>
              <p className="yx-tim-muted">Ready after you end your day.</p>
              {endDayButton}
              {openId && <p className="yx-tim-muted">Check out of {cur.place.split(',')[0]} first.</p>}
            </>
          )}
        </div>
      )}
    </PhoneFrame>
  );
}

/* =====================================================================
   TIM-36 · Presence-based attendance (desktop agent / Teams presence)
   ===================================================================== */

/** `webIn` / `webOut`: the web check-in and check-out that decide the day when presence can't be read (no consent). */
interface PresenceDay { id: string; person: string; dept: string; date: Date; status: 'Present' | 'Half day'; first: string; last: string; active: string; webIn?: string; webOut?: string }
type DayStatus = PresenceDay['status'] | 'No check-out';

/** The Sales person in the HR view (TEAM, Sales); 25 Sep was a WFH day, not a field day. */
const SALES_WFH = TEAM.find((t) => t.name === FIELD_DAY.person)!;

/** Each person's presence consent. Fathima withdrew hers on 21 Sep, which holds in every view. */
const PRESENCE_CONSENT: Record<string, { given: Date; withdrawn?: Date; version: string }> = {
  [ME.name]: { given: new Date(2026, 8, 2), version: 'Presence notice v2' },
  'Meera Krishnan': { given: new Date(2026, 8, 4), version: 'Presence notice v2' },
  'Fathima Beevi': { given: new Date(2026, 8, 3), withdrawn: new Date(2026, 8, 21), version: 'Presence notice v2' },
  [SALES_WFH.name]: { given: new Date(2026, 7, 18), version: 'Presence notice v1' },
};

/**
 * Divya's own presence per WFH day (day of September → times); first and last active are hers to see only.
 * Only 8 Sep is WFH in her calendar. 9:12 am – 6:07 pm less the 30-minute break = 8 h 25 m, as in My attendance.
 */
const MY_WFH_TIMES: Record<number, Pick<PresenceDay, 'first' | 'last' | 'active' | 'webIn' | 'webOut'>> = {
  8: { first: '09:10', last: '18:09', active: '7 h 40 m', webIn: '09:12', webOut: '18:07' },
};
/** Her WFH days come from her September calendar; a day with no presence data isn't listed. */
const MY_PRESENCE: PresenceDay[] = SEPTEMBER.filter((d) => d.code === 'WFH' && MY_WFH_TIMES[d.date.getDate()]).map((d, i) => ({ id: `me${i}`, person: ME.name, dept: 'Quality', date: d.date, status: 'Present', ...MY_WFH_TIMES[d.date.getDate()] }));
/** Team WFH days (Divya's reports), plus one from Sales for the HR view. Newest first. */
const TEAM_PRESENCE: PresenceDay[] = ([
  { id: 'm1', person: 'Meera Krishnan', dept: 'Quality', date: new Date(2026, 8, 28), status: 'Present', first: '09:14', last: '18:10', active: '7 h 40 m', webIn: '09:16', webOut: '18:08' },
  { id: 'm2', person: 'Meera Krishnan', dept: 'Quality', date: new Date(2026, 8, 21), status: 'Present', first: '09:20', last: '18:22', active: '7 h 55 m', webIn: '09:22', webOut: '18:20' },
  // No web check-out: once presence can't be read, the day has nothing to close it.
  { id: 'f1', person: 'Fathima Beevi', dept: 'Quality', date: new Date(2026, 8, 22), status: 'Half day', first: '09:30', last: '13:40', active: '3 h 50 m', webIn: '09:33' },
  { id: 'r1', person: SALES_WFH.name, dept: 'Sales', date: new Date(2026, 8, 25), status: 'Present', first: '09:05', last: '17:58', active: '7 h 30 m', webIn: '09:07', webOut: '17:55' },
] satisfies PresenceDay[]).sort((a, b) => b.date.getTime() - a.date.getTime());

/** `consent`: 'none' is the employee who never gave it; 'withdrawn' marks the story about Fathima's withdrawal (the withdrawal itself holds in every view). `openId`: a day whose drawer starts open. */
export function PresenceDayScreen({ persona = 'emp', consent = 'given', openId: openInit }: { persona?: 'emp' | 'mgr' | 'hr'; consent?: 'given' | 'none' | 'withdrawn'; openId?: string }) {
  const isEmp = persona === 'emp';
  const [dept, setDept] = useState<string | null>('all');
  const [showRecord, setShowRecord] = useState(false);
  const all = isEmp ? MY_PRESENCE : persona === 'mgr' ? TEAM_PRESENCE.filter((d) => TEAM.some((t) => t.name === d.person && t.reportsTo === ME.name)) : TEAM_PRESENCE;
  const days = persona === 'hr' && dept !== 'all' ? all.filter((d) => d.dept === dept) : all;
  // The list shows first; a drawer opens only when asked.
  const [openId, setOpenId] = useState<string | null>(openInit ?? null);
  const day = all.find((d) => d.id === openId);
  const depts = [...new Set(TEAM_PRESENCE.map((d) => d.dept))];
  const statusTone = (s: DayStatus): BadgeTone => (s === 'Present' ? 'success' : 'warning');
  const consentOf = (person: string) => PRESENCE_CONSENT[person];
  /** The person's withdrawal, whatever the day. */
  const withdrawnAt = (person: string) => consentOf(person)?.withdrawn;
  /** Presence decides the day only with consent in force on that date. */
  const withdrawnOn = (d: PresenceDay) => {
    const w = withdrawnAt(d.person);
    return w && d.date >= w ? w : undefined;
  };
  const hasConsent = (d: PresenceDay) => consent !== 'none' && !withdrawnOn(d);
  /** Without consent the web check-in and check-out decide the day; no check-out means no status yet. */
  const statusOf = (d: PresenceDay): DayStatus => (hasConsent(d) || d.webOut ? d.status : 'No check-out');
  const webLine = (d: PresenceDay) => (d.webIn ? `Checked in ${fmt12(d.webIn)} on the web` : 'No check-in');
  const fmtDay = (d: Date) => formatDate(d).slice(0, -5).replace(/^0/, '');
  return (
    <TimePage active={isEmp ? 'My attendance' : 'Muster'} user={persona === 'hr' ? HR_ADMIN : ME}>
      <PageHeader title={isEmp ? 'My work-from-home days' : persona === 'mgr' ? 'Presence days · My team' : 'Presence days'} description={consent === 'none' ? 'Work-from-home days, from your web check-in and check-out' : 'Work-from-home days, from Teams status and the YukthiX desktop app'} />
      <div className="yx-tim-stack">
        {persona === 'hr' && (
          <FormField label="Department">
            <Select value={dept} onChange={setDept} options={[{ value: 'all', label: 'All departments' }, ...depts.map((x) => ({ value: x, label: x }))]} />
          </FormField>
        )}
        <Card title="Work-from-home days">
          {days.length === 0 ? (
            isEmp ? (
              <EmptyState compact title="No work-from-home days" description="Your work-from-home days show here." action={<StoryLink to="privacy">Review and give consent</StoryLink>} />
            ) : (
              <EmptyState compact title="No presence days" description="Work-from-home days show here once someone with consent works from home." />
            )
          ) : (
            <ul className="yx-tim-list">
              {days.map((d) => (
                <li key={d.id}>
                  <span className="yx-tim-list__main">
                    <strong>{isEmp ? dayLabel(d.date) : `${d.person} · ${dayLabel(d.date)}`}</strong>
                    <span className="yx-tim-muted">{hasConsent(d) ? `Active ${d.active}` : webLine(d)}</span>
                  </span>
                  <Badge tone={statusTone(statusOf(d))}>{statusOf(d)}</Badge>
                  <Button size="sm" onClick={() => { setOpenId(d.id); setShowRecord(false); }}>Open</Button>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>
      <Drawer open={!!day} onOpenChange={(o) => !o && setOpenId(null)} title={day ? (isEmp ? dayLabel(day.date) : `${day.person} · ${dayLabel(day.date)}`) : ''} subtitle="Work from home">
        {day && (
          <div className="yx-tim-stack">
            {!hasConsent(day) ? (
              <>
                <InlineAlert tone={withdrawnOn(day) ? 'warning' : 'info'} title={withdrawnOn(day) ? `Consent withdrawn on ${fmtDay(withdrawnOn(day)!)}` : 'No consent yet'}>
                  No presence signals are read. {day.date < TODAY
                    ? day.webOut ? `This day used ${isEmp ? 'your' : 'the'} web check-in and check-out.` : 'It has a web check-in but no check-out, so the day has no status yet.'
                    : isEmp ? 'Check in as usual.' : 'The day follows the normal check-in and exception flow.'}
                </InlineAlert>
                <div className="yx-tim-row"><Badge tone={statusTone(statusOf(day))}>{statusOf(day)}</Badge><span>{webLine(day)}{day.webOut ? ` · out ${fmt12(day.webOut)}` : ''}</span></div>
                {isEmp ? <StoryLink to="privacy" variant="primary">Review and give consent</StoryLink> : <StoryLink to="muster">Open in muster</StoryLink>}
              </>
            ) : (
              <>
                <div className="yx-tim-row"><Badge tone={statusTone(day.status)}>{day.status}</Badge>{consentOf(day.person) && <Badge tone="neutral">Consent given {fmtDay(consentOf(day.person).given)}</Badge>}</div>
                <Kpis items={isEmp ? [{ label: 'First active', value: fmt12(day.first) }, { label: 'Last active', value: fmt12(day.last) }, { label: 'Active time', value: day.active }] : [{ label: 'Active time', value: day.active }]} />
                {isEmp && (
                  <>
                    <ul className="yx-tim-list" aria-label="Presence signals">
                      <li><span>{fmt12(day.first)} · Became available on Teams</span></li>
                      <li><span>{fmt12(day.last)} · Went offline on Teams</span></li>
                    </ul>
                    <Card title="What was recorded">
                      <ul className="yx-tim-check"><li><span>Presence states and times</span><Badge tone="success">Yes</Badge></li><li><span>Active or idle (idle after 10 minutes with no activity)</span><Badge tone="success">Yes</Badge></li><li><span>Keystrokes, screenshots, apps, windows, URLs, files, camera, microphone</span><Badge tone="neutral">Never</Badge></li></ul>
                    </Card>
                  </>
                )}
                {!isEmp && <p className="yx-tim-note">Managers and HR see the day status and total active hours only, never a minute-by-minute timeline.</p>}
              </>
            )}
            {persona === 'hr' && (
              <div className="yx-tim-row">
                <StoryLink to="regularise">Correct day</StoryLink>
                <Button aria-expanded={showRecord} onClick={() => setShowRecord((x) => !x)}>{showRecord ? 'Hide consent record' : 'View consent record'}</Button>
              </div>
            )}
            {persona === 'hr' && showRecord && (
              <Card title="Consent record">
                {consentOf(day.person) ? (
                  <ul className="yx-tim-list">
                    <li><span>Given</span><span>{fmtDay(consentOf(day.person).given)} · {consentOf(day.person).version}</span></li>
                    <li><span>Withdrawn</span><span>{withdrawnAt(day.person) ? fmtDay(withdrawnAt(day.person)!) : 'Not withdrawn'}</span></li>
                  </ul>
                ) : (
                  <p className="yx-tim-muted">No consent on record.</p>
                )}
              </Card>
            )}
            <StoryLink to="privacy">How presence attendance works</StoryLink>
          </div>
        )}
      </Drawer>
    </TimePage>
  );
}
