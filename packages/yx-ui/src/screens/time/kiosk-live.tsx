// TIM-13 · Kiosk, live: the designed KioskScreen (field.tsx) on a real tablet. Same frame, keypad, cards and texts;
// a person is identified by code + PIN or the ID-card QR, sees only their first name, checks in or out, sees their
// requests, marks training attendance, applies leave, and the screen clears itself. An unknown employee code is told
// apart before the PIN (founder decision, company setting kiosk.tell_unknown_code).
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { ArrowLeft, Delete, QrCode } from 'lucide-react';
import { KioskFrame } from '../_kit/frames';
import { Button, ButtonGroup } from '../../components/button';
import { Badge, DayDate } from '../../components/display';
import { InlineAlert } from '../../components/feedback';
import { FormField } from '../../components/field';
import { TextField } from '../../components/inputs';
import { formatDate } from '../../lib/format';
import { CameraFrame } from './time-kit';
import { fmt12, toHHMM } from './time-logic';

export interface KioskInfo { company: string; location: string; place: string; code: string; mode: string; methods: string[]; codePrefix: string; codeDigits: number; pinTries: number; zone: string }
export interface KioskToday {
  firstName: string;
  today: string;
  shift: { name: string; start: number; end: number; grace: number } | null;
  punches: { kind: string; at: string }[];
  next: 'in' | 'out';
  requests: { id: string; kind: string; label: string; from: string; to: string; days: number; status: string }[];
}
export interface KioskPunched { accepted: boolean; message: string; at: string; kind: string }
/** Apply leave at the kiosk: the kinds offered with days left (after pending requests), sick leave, the approver, the next days. */
export interface KioskLeave {
  today: string;
  types: { id: string; name: string; kind: string; available: number; pending: number }[];
  sick: { name: string; available: number } | null;
  approver: string | null;
  days: { on: string; note: 'On leave' | 'Requested' | 'Weekly off' | 'Holiday' | null; holiday: string | null; hint: string | null }[];
}
/** Today's training sessions at this kiosk's location. */
export interface KioskTraining { zone: string; sessions: { id: string; title: string; room: string | null; startsAt: string; endsAt: string; opensAt: string; marked: boolean }[] }
export interface LiveKiosk {
  /** setup: no secret on this tablet yet; loading: reading the kiosk; ready. */
  state: 'setup' | 'loading' | 'ready';
  info: KioskInfo | null;
  /** The browser has no connection right now. */
  offline?: boolean;
  onSetup: (code: string) => Promise<unknown>;
  onIdentify: (input: { method: 'pin'; code: string; pin: string } | { method: 'qr'; qr: string }) => Promise<{ person: string; firstName: string }>;
  onToday: (person: string) => Promise<KioskToday>;
  onPunch: (person: string, kind: 'in' | 'out') => Promise<KioskPunched>;
  /** Before the PIN: rejects (code UNKNOWN_CODE) when no one has this code. */
  onCheckCode?: (code: string) => Promise<unknown>;
  onTraining?: (person: string) => Promise<KioskTraining>;
  onMarkTraining?: (person: string, sessionId: string) => Promise<unknown>;
  onLeave?: (person: string) => Promise<KioskLeave>;
  onApplyLeave?: (person: string, input: { leaveTypeId: string; from: string; to: string }) => Promise<unknown>;
  /** Seconds before a screen with a person on it clears itself (30). */
  clearAfter?: number;
}

type View = 'code' | 'qr' | 'pin' | 'menu' | 'checked_in' | 'status' | 'training' | 'leave';
const STATUS_TONE: Record<string, 'success' | 'warning' | 'danger' | 'neutral'> = { approved: 'success', pending: 'warning', rejected: 'danger', cancelled: 'neutral', cancel_pending: 'warning', withdrawn: 'neutral' };
const STATUS_TEXT: Record<string, string> = { approved: 'Approved', pending: 'Pending', rejected: 'Not approved', cancelled: 'Cancelled', cancel_pending: 'Cancel asked', withdrawn: 'Withdrawn' };
const local = (iso: string) => new Date(Number(iso.slice(0, 4)), Number(iso.slice(5, 7)) - 1, Number(iso.slice(8, 10)));
const range = (a: string, b: string) => (a === b ? formatDate(local(a)) : `${formatDate(local(a))} – ${formatDate(local(b))}`);
const clock = (iso: string, zone: string) => new Date(iso).toLocaleTimeString('en-IN', { hour: 'numeric', minute: '2-digit', hour12: true, timeZone: zone }).toLowerCase();
const more = (n: number) => (n === 1 ? '1 more digit' : `${n} more digits`);
const reqRow = { flexWrap: 'nowrap' } as const;
const daysText = (n: number) => `${n} ${n === 1 ? 'day' : 'days'}`;
const short = (name: string) => name.replace(/ leave$/i, '');
/** Equal-width day tiles: five across on the kiosk, two on a phone (as the design). */
const dayGrid = { display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(calc(var(--yx-space-16) * 1.75), 1fr))', gap: 'var(--yx-space-2)', width: '100%' } as const;
const dayTile = { height: 'auto', minHeight: 'var(--yx-control-lg)', padding: 'var(--yx-space-2)', width: '100%' } as const;
const errCode = (e: unknown) => (e as { code?: string } | null)?.code;

/** The camera reads the ID-card QR where the browser can (BarcodeDetector); otherwise it says so. */
function QrReader({ onCode }: { onCode: (text: string) => void }) {
  const video = useRef<HTMLVideoElement>(null);
  const [problem, setProblem] = useState<string | null>(null);
  // The latest handler, so a re-render never restarts the camera.
  const handler = useRef(onCode);
  handler.current = onCode;
  useEffect(() => {
    const Detector = (globalThis as unknown as { BarcodeDetector?: new (o: { formats: string[] }) => { detect: (v: HTMLVideoElement) => Promise<{ rawValue: string }[]> } }).BarcodeDetector;
    if (!Detector || !navigator.mediaDevices?.getUserMedia) {
      setProblem("This tablet's browser can't read ID cards. Use your employee code.");
      return;
    }
    let stream: MediaStream | null = null;
    let timer: ReturnType<typeof setInterval> | null = null;
    let done = false;
    void navigator.mediaDevices
      .getUserMedia({ video: { facingMode: 'user' } })
      .then((s) => {
        stream = s;
        if (done || !video.current) return;
        video.current.srcObject = s;
        void video.current.play();
        const detector = new Detector({ formats: ['qr_code'] });
        timer = setInterval(() => {
          if (!video.current || video.current.readyState < 2) return;
          void detector.detect(video.current).then((codes) => {
            if (!done && codes[0]?.rawValue) {
              done = true;
              handler.current(codes[0].rawValue);
            }
          }, () => undefined);
        }, 400);
      })
      .catch(() => setProblem('Camera blocked. Allow the camera for this page on the tablet, or use your employee code.'));
    return () => {
      done = true;
      if (timer) clearInterval(timer);
      stream?.getTracks().forEach((t) => t.stop());
    };
  }, []);
  if (problem) return <><CameraFrame state="denied" subject="qr" /><InlineAlert tone="warning" title="ID card can't be read here">{problem}</InlineAlert></>;
  return (
    <figure className="yx-tim-camera" data-state="ready" data-subject="qr">
      <video ref={video} muted playsInline aria-label="Camera ready · hold the QR inside the box" style={{ width: '100%', borderRadius: 'var(--yx-radius-md)' }} />
      <figcaption>Camera ready · hold the QR inside the box</figcaption>
    </figure>
  );
}

function Setup({ live }: { live: LiveKiosk }) {
  const [code, setCode] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const go = async () => {
    if (code.replace(/[^A-Za-z0-9]/g, '').length < 12) {
      setError('Type all 12 letters and digits of the set-up key.');
      return void document.getElementById('yx-kiosk-setup')?.focus();
    }
    setBusy(true);
    setError(null);
    try {
      await live.onSetup(code);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'That did not work. Try again.');
    } finally {
      setBusy(false);
    }
  };
  return (
    <div className="yx-tim-kiosk-card">
      <p className="yx-tim-big">Set up this kiosk</p>
      <p className="yx-tim-muted">HR registers the kiosk on Devices and kiosks and gives you a set-up key. It works once, for 30 minutes.</p>
      <div style={{ alignSelf: 'stretch', textAlign: 'left' }}>
        <FormField id="yx-kiosk-setup" label="Set-up key" required error={error ?? undefined}>
          <TextField value={code} onChange={setCode} placeholder="XXXX-XXXX-XXXX" />
        </FormField>
      </div>
      <Button variant="primary" loading={busy} onClick={() => void go()}>Set up kiosk</Button>
    </div>
  );
}

export function LiveKioskScreen({ live }: { live: LiveKiosk }) {
  const info = live.info;
  const methods = info?.methods ?? ['pin', 'qr'];
  const usePin = methods.includes('pin');
  const useQr = methods.includes('qr');
  const digits = info?.codeDigits ?? 4;
  const start: View = usePin || !useQr ? 'code' : 'qr';
  const [v, setV] = useState<View>(start);
  const [code, setCode] = useState('');
  const [pin, setPin] = useState('');
  const [problem, setProblem] = useState<string | null>(null);
  const [who, setWho] = useState<{ person: string; firstName: string } | null>(null);
  const [today, setToday] = useState<KioskToday | null>(null);
  const [punched, setPunched] = useState<KioskPunched | null>(null);
  const [busy, setBusy] = useState(false);
  const [unknown, setUnknown] = useState(false);
  const [training, setTraining] = useState<KioskTraining | null>(null);
  const [marked, setMarked] = useState<string | null>(null);
  const [leave, setLeave] = useState<KioskLeave | null>(null);
  const [leaveType, setLeaveType] = useState<string | null>(null);
  const [from, setFrom] = useState<string | null>(null);
  const [to, setTo] = useState<string | null>(null);
  const [sent, setSent] = useState<{ type: string; days: string[] } | null>(null);
  const [touched, setTouched] = useState(Date.now());
  const [left, setLeft] = useState(live.clearAfter ?? 30);
  const clearAfter = live.clearAfter ?? 30;
  /** Back to the start: nothing personal stays on screen. */
  const clear = () => {
    setV(start);
    setCode('');
    setPin('');
    setWho(null);
    setToday(null);
    setPunched(null);
    setProblem(null);
    setUnknown(false);
    setTraining(null);
    setMarked(null);
    setLeave(null);
    setSent(null);
    setFrom(null);
    setTo(null);
  };
  // Any screen past the code clears itself after a short time without a touch.
  useEffect(() => {
    if (v === 'code' || v === start) return;
    const t = setInterval(() => {
      const gone = Math.floor((Date.now() - touched) / 1000);
      setLeft(Math.max(0, clearAfter - gone));
      if (gone >= clearAfter) clear();
    }, 1000);
    return () => clearInterval(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [v, touched, clearAfter]);
  const touch = () => {
    setTouched(Date.now());
    setLeft(clearAfter);
  };
  const fail = (e: unknown) => setProblem(e instanceof Error ? e.message : 'That did not work. Try again.');
  const enter = async (id: { person: string; firstName: string }) => {
    setWho(id);
    setToday(await live.onToday(id.person));
    setPin('');
    touch();
    setV('menu');
  };
  const onCode = v === 'code';
  const value = onCode ? code : pin;
  const max = onCode ? digits : 4;
  const press = (k: string) => {
    setProblem(null);
    setUnknown(false);
    touch();
    const set = onCode ? setCode : setPin;
    set(k === 'del' ? value.slice(0, -1) : value.length < max ? value + k : value);
  };
  const keypad = (
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
  const nextCode = async () => {
    if (code.length < digits) return setProblem(`Type all ${digits} digits of your code.`);
    if (unknown) return setProblem('This code is not known. Check it and type it again.');
    setProblem(null);
    if (live.onCheckCode) {
      setBusy(true);
      try {
        await live.onCheckCode(`${info?.codePrefix ?? ''}${code}`);
      } catch (e) {
        if (errCode(e) === 'UNKNOWN_CODE') setUnknown(true);
        else fail(e);
        return;
      } finally {
        setBusy(false);
      }
    }
    touch();
    setV('pin');
  };
  const openTraining = async () => {
    if (!who || !live.onTraining) return;
    setBusy(true);
    setProblem(null);
    try {
      setTraining(await live.onTraining(who.person));
      setMarked(null);
      touch();
      setV('training');
    } catch (e) {
      fail(e);
    } finally {
      setBusy(false);
    }
  };
  const mark = async (id: string) => {
    if (!who || !live.onMarkTraining) return;
    setBusy(true);
    setProblem(null);
    try {
      await live.onMarkTraining(who.person, id);
      setMarked(id);
      touch();
    } catch (e) {
      fail(e);
    } finally {
      setBusy(false);
    }
  };
  const openLeave = async () => {
    if (!who || !live.onLeave) return;
    setBusy(true);
    setProblem(null);
    try {
      const l = await live.onLeave(who.person);
      setLeave(l);
      // Opens on the first type with days left.
      setLeaveType((l.types.find((t) => t.available > 0) ?? l.types[0])?.id ?? null);
      setFrom(null);
      setTo(null);
      setSent(null);
      touch();
      setV('leave');
    } catch (e) {
      fail(e);
    } finally {
      setBusy(false);
    }
  };
  const sendPin = async () => {
    if (pin.length < 4) return setProblem('Type all 4 digits of your PIN.');
    setBusy(true);
    try {
      await enter(await live.onIdentify({ method: 'pin', code: `${info?.codePrefix ?? ''}${code}`, pin }));
    } catch (e) {
      setPin('');
      fail(e);
    } finally {
      setBusy(false);
    }
  };
  const scanned = async (qr: string) => {
    setBusy(true);
    try {
      await enter(await live.onIdentify({ method: 'qr', qr }));
    } catch (e) {
      fail(e);
      setV(start === 'qr' ? 'qr' : 'code');
    } finally {
      setBusy(false);
    }
  };
  const punch = async (kind: 'in' | 'out') => {
    if (!who) return clear();
    setBusy(true);
    try {
      setPunched(await live.onPunch(who.person, kind));
      touch();
      setV('checked_in');
    } catch (e) {
      fail(e);
    } finally {
      setBusy(false);
    }
  };
  const zone = info?.zone ?? 'Asia/Kolkata';
  const nowText = `${new Date().toLocaleTimeString('en-IN', { hour: 'numeric', minute: '2-digit', hour12: true, timeZone: zone }).toLowerCase()} · ${formatDate(new Date())}`;
  const shiftText = today?.shift ? `${today.shift.name} shift (${fmt12(toHHMM(today.shift.start))}, ${today.shift.grace} minutes allowed)` : 'No shift today (weekly off)';
  let body: ReactNode = null;
  if (live.state === 'setup') body = <Setup live={live} />;
  else if (live.state === 'loading') body = <div className="yx-tim-kiosk-card"><p className="yx-tim-muted" role="status">Getting the kiosk ready…</p></div>;
  else if (v === 'code')
    body = (
      <div className="yx-tim-kiosk-card">
        <p className="yx-tim-big">Enter your employee code</p>
        <p className="yx-tim-big yx-tim-code" aria-live="polite">{info?.codePrefix}{code.padEnd(digits, '_')}</p>
        {keypad}
        {unknown ? (
          <InlineAlert tone="danger" title={`No one with code ${info?.codePrefix ?? ''}${code}`}>{problem ?? 'Check the code on your ID card and try again.'}</InlineAlert>
        ) : problem ? <InlineAlert tone="danger" title={problem.startsWith('Type all') ? 'Code not complete' : "That didn't work"}>{problem}</InlineAlert> : <p className="yx-tim-muted">{code.length < digits ? more(digits - code.length) : 'Code complete'}</p>}
        {live.offline && <InlineAlert tone="warning" title="No connection">Check-ins resume when the tablet is back online. Check the Wi-Fi.</InlineAlert>}
        <div className="yx-tim-row">
          {useQr && <Button icon={QrCode} onClick={() => { setProblem(null); touch(); setV('qr'); }}>Scan ID card</Button>}
          <Button variant="primary" loading={busy} onClick={() => void nextCode()}>Next</Button>
        </div>
        <p className="yx-tim-muted">{nowText}</p>
      </div>
    );
  else if (v === 'qr')
    body = (
      <div className="yx-tim-kiosk-card">
        {busy ? <p className="yx-tim-muted" role="status">Reading your card…</p> : <QrReader onCode={(t) => void scanned(t)} />}
        <p className="yx-tim-big">Hold your ID card QR up to the camera</p>
        {problem && <InlineAlert tone="danger" title="That didn't work">{problem}</InlineAlert>}
        {usePin && <Button onClick={() => { setProblem(null); setV('code'); }}>Use employee code instead</Button>}
      </div>
    );
  else if (v === 'pin')
    body = (
      <div className="yx-tim-kiosk-card">
        {/* No name before the PIN: a code alone never tells who it belongs to. */}
        <p className="yx-tim-big">Enter your PIN</p>
        <div className="yx-tim-pin" role="status" aria-label={`${pin.length} of 4 digits entered`}>{[0, 1, 2, 3].map((i) => <span key={i} data-filled={i < pin.length || undefined} />)}</div>
        {problem && (
          <div style={{ alignSelf: 'stretch', textAlign: 'left' }}>
            <InlineAlert tone="danger" title={problem.startsWith('Type all') ? 'PIN not complete' : "Code or PIN didn't match"} actions={useQr && !problem.startsWith('Type all') ? <Button size="sm" icon={QrCode} onClick={() => { setPin(''); setProblem(null); setV('qr'); }}>Scan ID card</Button> : undefined}>
              {problem}
            </InlineAlert>
          </div>
        )}
        {keypad}
        <p className="yx-tim-muted">{pin.length < 4 ? more(4 - pin.length) : 'PIN complete'}</p>
        <div className="yx-tim-row">
          <Button icon={ArrowLeft} onClick={() => { setPin(''); setProblem(null); setV('code'); }}>Back</Button>
          <Button variant="primary" loading={busy} onClick={() => void sendPin()}>Continue</Button>
        </div>
      </div>
    );
  else if (v === 'menu' && who && today)
    body = (
      <div className="yx-tim-kiosk-card">
        <p className="yx-tim-big">Hello, {who.firstName}</p>
        {problem && <InlineAlert tone="danger" title="That didn't work">{problem}</InlineAlert>}
        <div className="yx-tim-kiosk-grid">
          <Button variant="primary" loading={busy} onClick={() => void punch(today.next)}>{today.next === 'in' ? 'Check in' : 'Check out'}</Button>
          {live.onTraining && <Button onClick={() => void openTraining()}>Training</Button>}
          {live.onLeave && <Button onClick={() => void openLeave()}>Apply leave</Button>}
          <Button onClick={() => { touch(); setV('status'); }}>My requests</Button>
          <Button onClick={clear}>Done</Button>
        </div>
        <p className="yx-tim-muted">{today.punches.length ? `Today: ${today.punches.map((p) => `${p.kind === 'in' ? 'in' : p.kind === 'out' ? 'out' : p.kind === 'break_start' ? 'break' : 'back'} ${clock(p.at, zone)}`).join(' · ')}` : shiftText}</p>
        <p className="yx-tim-muted" aria-live="polite">Signing out in {left} s</p>
      </div>
    );
  else if (v === 'checked_in' && punched)
    body = (
      <div className="yx-tim-kiosk-card" role="status">
        <Badge tone={punched.accepted ? 'success' : 'danger'}>{punched.accepted ? (punched.kind === 'in' ? 'Checked in' : 'Checked out') : 'Not recorded'}</Badge>
        <p className="yx-tim-big">{clock(punched.at, zone)} · {info?.location}</p>
        <p className="yx-tim-muted">{punched.accepted && punched.kind === 'in' ? shiftText : punched.message}</p>
        <Button onClick={clear}>Done</Button>
        <p className="yx-tim-muted" aria-live="polite">Signing out in {left} s</p>
      </div>
    );
  else if (v === 'training' && training) {
    const s = training.sessions.find((x) => x.id === marked) ?? training.sessions.find((x) => !x.marked) ?? training.sessions[0];
    const open = s ? new Date(s.opensAt).getTime() <= Date.now() : false;
    body =
      s && (marked === s.id || s.marked) ? (
        <div className="yx-tim-kiosk-card" role="status">
          <Badge tone="success">Marked present</Badge>
          <p className="yx-tim-big">{s.title} · {clock(s.startsAt, zone)}</p>
          <Button onClick={() => { setMarked(null); touch(); setV('menu'); }}>Done</Button>
          <p className="yx-tim-muted" aria-live="polite">Signing out in {left} s</p>
        </div>
      ) : (
        <div className="yx-tim-kiosk-card">
          <p className="yx-tim-big">Mark training attendance</p>
          {s ? <p><strong>{s.title}</strong> · {clock(s.startsAt, zone)}{s.room ? ` · ${s.room}` : ''}</p> : <p className="yx-tim-muted">No training here today.</p>}
          {problem && <InlineAlert tone="danger" title="That didn't work">{problem}</InlineAlert>}
          <div className="yx-tim-row">
            <Button icon={ArrowLeft} onClick={() => { setProblem(null); touch(); setV('menu'); }}>Back</Button>
            {s && <Button variant="primary" loading={busy} onClick={() => (open ? void mark(s.id) : setProblem(`Training opens at ${clock(s.opensAt, zone)}.`))}>Mark me present</Button>}
          </div>
          {s && !open && <p className="yx-tim-muted">Opens at {clock(s.opensAt, zone)}</p>}
          <p className="yx-tim-muted" aria-live="polite">Signing out in {left} s</p>
        </div>
      );
  } else if (v === 'leave' && leave && sent) {
    const t = leave.types.find((x) => x.id === sent.type);
    body = (
      <div className="yx-tim-kiosk-card" role="status">
        <Badge tone="success">Sent</Badge>
        <p className="yx-tim-big">{t?.name} · {sent.days.map((d) => formatDate(local(d))).join(', ')} · {daysText(sent.days.length)}</p>
        <p className="yx-tim-muted">{leave.approver ? `Sent to ${leave.approver}` : 'Sent for approval'} · see the answer in My requests.</p>
        <Button onClick={() => { setSent(null); touch(); if (who) void live.onToday(who.person).then(setToday, () => undefined); setV('menu'); }}>Done</Button>
        <p className="yx-tim-muted" aria-live="polite">Signing out in {left} s</p>
      </div>
    );
  } else if (v === 'leave' && leave) {
    const type = leave.types.find((x) => x.id === leaveType) ?? null;
    const booked = (n: string | null) => n === 'On leave' || n === 'Requested';
    const end = to ?? from;
    const picked = leave.days.filter((d) => !d.note && from && end && d.on >= from && d.on <= end).map((d) => d.on);
    const after = type ? type.available - picked.length : 0;
    const pickDay = (on: string) => {
      setProblem(null);
      touch();
      // A range can't run across leave that is already booked: start a new range instead.
      if (!from || to || on < from || leave.days.some((x) => booked(x.note) && x.on > from && x.on < on)) {
        setFrom(on);
        setTo(null);
      } else setTo(on);
    };
    const send = async () => {
      if (!who || !type || !live.onApplyLeave) return;
      if (picked.length === 0) return setProblem('Pick at least one day.');
      if (after < 0) return setProblem('Not enough leave left for these days.');
      setBusy(true);
      setProblem(null);
      try {
        await live.onApplyLeave(who.person, { leaveTypeId: type.id, from: picked[0]!, to: picked[picked.length - 1]! });
        setSent({ type: type.id, days: picked });
        setFrom(null);
        setTo(null);
        touch();
      } catch (e) {
        fail(e);
      } finally {
        setBusy(false);
      }
    };
    const pending = leave.types.filter((x) => x.pending > 0);
    body = (
      <div className="yx-tim-kiosk-card">
        <p className="yx-tim-big">Apply leave</p>
        {leave.types.length === 0 ? (
          <p className="yx-tim-muted">No leave you can apply for here. Ask your supervisor.</p>
        ) : (
          <ButtonGroup aria-label="Leave type">
            {leave.types.map((x) => (
              <Button key={x.id} size="lg" aria-pressed={leaveType === x.id} onClick={() => (x.available <= 0 ? setProblem('No days of this leave are left.') : (setProblem(null), touch(), setLeaveType(x.id)))}>
                {short(x.name)} · {x.available} left
              </Button>
            ))}
          </ButtonGroup>
        )}
        <p className="yx-tim-muted">
          {pending.map((x) => `${daysText(x.pending)} of ${x.name.toLowerCase()} waiting for approval. `).join('')}
          {leave.sick ? `${leave.sick.name} (${daysText(leave.sick.available)} left): ask ${leave.approver ?? 'your supervisor'} to record sick days.` : ''}
        </p>
        <p className="yx-tim-muted">Tap the first day, then the last day.</p>
        <div style={dayGrid} role="group" aria-label="Leave dates">
          {leave.days.map((d) => {
            const on = !!from && !!end && d.on >= from && d.on <= end && !d.note;
            const line2 = d.note ?? d.hint;
            return (
              <Button key={d.on} size="lg" style={dayTile} variant={on ? 'primary' : 'secondary'} aria-pressed={on} onClick={() => (d.note ? setProblem(`You cannot pick this day: ${d.note}.`) : pickDay(d.on))}>
                <span style={{ display: 'flex', flexDirection: 'column' }}>
                  <DayDate date={local(d.on)} stacked />
                  {line2 && <span className="yx-tim-note" style={{ color: 'inherit' }}>{line2}</span>}
                </span>
              </Button>
            );
          })}
        </div>
        {leave.days.some((d) => d.hint) && <p className="yx-tim-muted">{leave.days.filter((d) => d.hint).map((d) => `${formatDate(local(d.on))} is a holiday (${d.holiday}) you are rostered to work.`).join(' ')}</p>}
        <p className="yx-tim-muted">
          {picked.length === 0 ? 'No working days picked' : `${picked.map((d) => formatDate(local(d))).join(', ')} · ${daysText(picked.length)} · balance after: ${daysText(after)}`}{leave.approver ? ` · goes to ${leave.approver}` : ''}
        </p>
        {problem && <InlineAlert tone="danger" title="That didn't work">{problem}</InlineAlert>}
        <div className="yx-tim-row">
          <Button icon={ArrowLeft} onClick={() => { setProblem(null); touch(); setV('menu'); }}>Back</Button>
          {type && <Button variant="primary" loading={busy} onClick={() => void send()}>Send leave request</Button>}
        </div>
        {type && after < 0 && <p className="yx-tim-muted">Not enough {type.name.toLowerCase()} for these days ({type.available} left after pending requests)</p>}
        <p className="yx-tim-muted" aria-live="polite">Signing out in {left} s</p>
      </div>
    );
  } else if (v === 'status' && today)
    body = (
      <div className="yx-tim-kiosk-card">
        <p className="yx-tim-big">My requests</p>
        {today.requests.length === 0 ? (
          <p className="yx-tim-muted">No requests in the last 30 days.</p>
        ) : (
          <ul className="yx-tim-list" style={{ alignSelf: 'stretch', textAlign: 'left' }}>
            {today.requests.map((r) => (
              <li key={r.id} style={reqRow}>
                <span className="yx-tim-list__main"><span>{r.label} · {range(r.from, r.to)}</span><span className="yx-tim-muted">{r.days === 1 ? '1 day' : `${r.days} days`}</span></span>
                <Badge tone={STATUS_TONE[r.status] ?? 'neutral'}>{STATUS_TEXT[r.status] ?? r.status}</Badge>
              </li>
            ))}
          </ul>
        )}
        <Button icon={ArrowLeft} onClick={() => { touch(); setV('menu'); }}>Back</Button>
        <p className="yx-tim-muted" aria-live="polite">Signing out in {left} s</p>
      </div>
    );
  return <KioskFrame tenant={info ? `${info.company} · ${info.location} · ${info.place} kiosk` : 'YukthiX kiosk'}>{body}</KioskFrame>;
}
