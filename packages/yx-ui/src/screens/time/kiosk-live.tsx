// TIM-13 · Kiosk, live: the designed KioskScreen (field.tsx) on a real tablet. Same frame, keypad, cards and texts;
// a person is identified by code + PIN or the ID-card QR, sees only their first name, checks in or out, sees their
// requests, and the screen clears itself. Not here yet (feature not built): training attendance and leave at the kiosk.
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { ArrowLeft, Delete, QrCode } from 'lucide-react';
import { KioskFrame } from '../_kit/frames';
import { Button } from '../../components/button';
import { Badge } from '../../components/display';
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
  /** Seconds before a screen with a person on it clears itself (30). */
  clearAfter?: number;
}

type View = 'code' | 'qr' | 'pin' | 'menu' | 'checked_in' | 'status';
const STATUS_TONE: Record<string, 'success' | 'warning' | 'danger' | 'neutral'> = { approved: 'success', pending: 'warning', rejected: 'danger', cancelled: 'neutral', cancel_pending: 'warning', withdrawn: 'neutral' };
const STATUS_TEXT: Record<string, string> = { approved: 'Approved', pending: 'Pending', rejected: 'Not approved', cancelled: 'Cancelled', cancel_pending: 'Cancel asked', withdrawn: 'Withdrawn' };
const local = (iso: string) => new Date(Number(iso.slice(0, 4)), Number(iso.slice(5, 7)) - 1, Number(iso.slice(8, 10)));
const range = (a: string, b: string) => (a === b ? formatDate(local(a)) : `${formatDate(local(a))} – ${formatDate(local(b))}`);
const clock = (iso: string, zone: string) => new Date(iso).toLocaleTimeString('en-IN', { hour: 'numeric', minute: '2-digit', hour12: true, timeZone: zone }).toLowerCase();
const more = (n: number) => (n === 1 ? '1 more digit' : `${n} more digits`);
const reqRow = { flexWrap: 'nowrap' } as const;

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
  const nextCode = () => {
    if (code.length < digits) return setProblem(`Type all ${digits} digits of your code.`);
    setProblem(null);
    touch();
    setV('pin');
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
        {problem ? <InlineAlert tone="danger" title={problem.startsWith('Type all') ? 'Code not complete' : "That didn't work"}>{problem}</InlineAlert> : <p className="yx-tim-muted">{code.length < digits ? more(digits - code.length) : 'Code complete'}</p>}
        {live.offline && <InlineAlert tone="warning" title="No connection">Check-ins resume when the tablet is back online. Check the Wi-Fi.</InlineAlert>}
        <div className="yx-tim-row">
          {useQr && <Button icon={QrCode} onClick={() => { setProblem(null); touch(); setV('qr'); }}>Scan ID card</Button>}
          <Button variant="primary" onClick={nextCode}>Next</Button>
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
  else if (v === 'status' && today)
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
