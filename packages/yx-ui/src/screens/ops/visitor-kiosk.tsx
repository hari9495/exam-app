// VIS-03 the visitor kiosk, live (Visitors slice 2; answers 601, 602, 604, 606, 610): the drawn kiosk steps with the
// API behind them. A walk-in gives their details, a photo (when the location takes one) and accepts the notice, the NDA
// and the safety induction of their visitor type, then waits for the host; a pre-registered visitor types or scans their
// pass. Outside the hours, with the kiosk off, or any problem: "Please see the reception desk" (never the reason).
import { useEffect, useRef, useState } from 'react';
import { QrCode, UserPlus } from 'lucide-react';
import { KioskFrame } from '../_kit/frames';
import { Button } from '../../components/button';
import { InlineAlert } from '../../components/feedback';
import { FormField, useTooEarly } from '../../components/field';
import { TextField } from '../../components/inputs';
import { Checkbox } from '../../components/choice';
import { Select } from '../../components/select';
import { Actions, CameraFrame } from './ops-kit';
import { VisitorBadge } from './visitors';
import type { Visit } from './visitors-data';

type Choice = { value: string; label: string };
export interface KioskDoc {
  title: string;
  text: string;
  versionId: string;
}
/** What a visitor reads before entry: the location's notice, and their type's NDA and induction (null when not needed). */
export interface KioskNeeds {
  notice: { text: string; version: string };
  nda: KioskDoc | null;
  induction: KioskDoc | null;
}
export type KioskResult =
  | { state: 'see-reception' }
  | { state: 'waiting'; id?: string; host: string; dueAt?: string | null }
  | { state: 'badge'; name: string; host: string; badge: string | null; passCode: string }
  | { state: 'rejected'; host: string }
  | { state: 'notice'; id: string; name: string; host: string; needs: KioskNeeds };
export interface KioskWalkInInput {
  name: string;
  mobile: string;
  company: string | null;
  typeId: string | null;
  hostName: string;
  photoBase64: string | null;
  noticeVersion: string;
  ndaVersionId: string | null;
  inductionVersionId: string | null;
}
export interface LiveVisitorKiosk {
  state: 'loading' | 'ready' | 'error';
  onRetry: () => void;
  info: { company: string; location: string; open: boolean; photo: boolean; retentionDays: number; types: Choice[] } | null;
  needs: (q: { typeId: string | null; mobile: string; company: string | null }) => Promise<KioskNeeds>;
  walkIn: (input: KioskWalkInInput) => Promise<KioskResult>;
  status: (id: string) => Promise<KioskResult>;
  pass: (code: string) => Promise<KioskResult>;
  checkIn: (id: string, accepted: { noticeVersion: string; ndaVersionId: string | null; inductionVersionId: string | null }) => Promise<KioskResult>;
  /** How often the waiting screen asks again (ms; tests make it short). */
  pollMs?: number;
}

type Step = 'welcome' | 'pass' | 'details' | 'photo' | 'notice' | 'waiting' | 'badge' | 'see-reception' | 'rejected';
const blank = { name: '', mobile: '', company: '', typeId: null as string | null, host: '' };

/** The camera for the visitor's photo: a JPEG of the face, kept only in memory until it is sent. */
function PhotoTaker({ onPhoto, onProblem }: { onPhoto: (base64: string) => void; onProblem: () => void }) {
  const video = useRef<HTMLVideoElement>(null);
  const [state, setState] = useState<'starting' | 'ready' | 'denied'>('starting');
  useEffect(() => {
    let stream: MediaStream | null = null;
    let done = false;
    if (!navigator.mediaDevices?.getUserMedia) {
      setState('denied');
      return;
    }
    void navigator.mediaDevices.getUserMedia({ video: { facingMode: 'user' } }).then(
      (s) => {
        stream = s;
        if (done || !video.current) return;
        video.current.srcObject = s;
        void video.current.play();
        setState('ready');
      },
      () => setState('denied'),
    );
    return () => {
      done = true;
      stream?.getTracks().forEach((t) => t.stop());
    };
  }, []);
  const take = () => {
    const v = video.current;
    if (!v || !v.videoWidth) return;
    const w = 480;
    const c = document.createElement('canvas');
    c.width = w;
    c.height = Math.round((v.videoHeight / v.videoWidth) * w);
    c.getContext('2d')?.drawImage(v, 0, 0, c.width, c.height);
    onPhoto(c.toDataURL('image/jpeg', 0.7).split(',')[1] ?? '');
  };
  if (state === 'denied')
    return (
      <>
        <CameraFrame subject="face" state="denied" />
        <Actions end>
          <Button variant="primary" onClick={onProblem}>
            See reception
          </Button>
        </Actions>
      </>
    );
  return (
    <>
      <figure className="yx-ops-camera" data-state="ready">
        <video ref={video} muted playsInline aria-label="Camera ready · look at the camera" style={{ width: '100%', borderRadius: 'var(--yx-radius-md)' }} />
      </figure>
      <Actions end>
        <Button variant="primary" onClick={take} disabled={state !== 'ready'}>
          Take photo
        </Button>
      </Actions>
    </>
  );
}

export function LiveVisitorKioskView({ live }: { live: LiveVisitorKiosk }) {
  const info = live.info;
  const [step, setStep] = useState<Step>('welcome');
  const [d, setD] = useState(blank);
  const [code, setCode] = useState('');
  const [photo, setPhoto] = useState<string | null>(null);
  const [needs, setNeeds] = useState<KioskNeeds | null>(null);
  const [passVisit, setPassVisit] = useState<{ id: string; name: string; host: string } | null>(null);
  const [ticks, setTicks] = useState({ notice: false, nda: false, induction: false });
  const [waiting, setWaiting] = useState<{ id: string; host: string } | null>(null);
  const [done, setDone] = useState<{ name: string; host: string; badge: string | null; passCode: string } | null>(null);
  const [host, setHost] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const detailsEarly = useTooEarly([
    !d.name.trim() && { fieldId: 'vk-name', message: 'Enter your name.' },
    !/^\+?[\d\s-]{10,16}$/.test(d.mobile.trim()) && { fieldId: 'vk-mobile', message: 'Enter your 10-digit mobile number.' },
    d.host.trim().length < 2 && { fieldId: 'vk-host', message: 'Enter the name of the person you are meeting.' },
  ].filter(Boolean) as { fieldId: string; message: string }[]);
  const noticeEarly = useTooEarly(
    [
      !ticks.notice && { fieldId: 'vk-agree', message: 'Tick to accept the notice before you continue.' },
      needs?.nda && !ticks.nda && { fieldId: 'vk-nda', message: `Tick to accept ${needs.nda.title}.` },
      needs?.induction && !ticks.induction && { fieldId: 'vk-induction', message: `Tick to confirm ${needs.induction.title}.` },
    ].filter(Boolean) as { fieldId: string; message: string }[],
  );
  const passEarly = useTooEarly(code.trim().length < 9 ? [{ fieldId: 'vk-code', message: 'Type the code under your QR pass, like V-7KQ2-MX4P.' }] : []);
  const reset = () => (setStep('welcome'), setD(blank), setCode(''), setPhoto(null), setNeeds(null), setPassVisit(null), setTicks({ notice: false, nda: false, induction: false }), setWaiting(null), setDone(null), setError(null));
  const result = (r: KioskResult) => {
    if (r.state === 'see-reception') return setStep('see-reception');
    if (r.state === 'rejected') return (setHost(r.host), setStep('rejected'));
    if (r.state === 'badge') return (setDone(r), setStep('badge'));
    if (r.state === 'waiting') return (setWaiting({ id: r.id ?? waiting?.id ?? '', host: r.host }), setStep('waiting'));
    setPassVisit({ id: r.id, name: r.name, host: r.host });
    setNeeds(r.needs);
    setStep('notice');
  };
  const run = async (fn: () => Promise<void>) => {
    setBusy(true);
    setError(null);
    try {
      await fn();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'That did not work. Try again, or see reception.');
    } finally {
      setBusy(false);
    }
  };
  // Waiting for the host: ask every few seconds until they (or reception) decide.
  useEffect(() => {
    if (step !== 'waiting' || !waiting?.id) return;
    const t = setInterval(() => void live.status(waiting.id).then((r) => r.state !== 'waiting' && result(r), () => undefined), live.pollMs ?? 5000);
    return () => clearInterval(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [step, waiting?.id]);
  // The last screens go back to the start by themselves, so the next visitor finds the welcome.
  useEffect(() => {
    if (step !== 'badge' && step !== 'rejected' && step !== 'see-reception') return;
    const t = setTimeout(reset, 30_000);
    return () => clearTimeout(t);
  }, [step]);

  const toNotice = () =>
    void run(async () => {
      setNeeds(await live.needs({ typeId: d.typeId, mobile: d.mobile.trim(), company: d.company.trim() || null }));
      setStep('notice');
    });
  const accept = () => {
    if (noticeEarly.stop() || !needs) return;
    const accepted = { noticeVersion: needs.notice.version, ndaVersionId: needs.nda?.versionId ?? null, inductionVersionId: needs.induction?.versionId ?? null };
    void run(async () => {
      if (passVisit) return result(await live.checkIn(passVisit.id, accepted));
      const r = await live.walkIn({ name: d.name.trim(), mobile: d.mobile.trim(), company: d.company.trim() || null, typeId: d.typeId, hostName: d.host.trim(), photoBase64: photo, ...accepted });
      if (r.state === 'waiting') setWaiting({ id: r.id ?? '', host: r.host });
      result(r);
    });
  };
  const badgeVisit: Visit | null = done ? { id: 'k', name: done.name, mobile: '', company: '—', purpose: 'Meeting', host: done.host, location: info?.location ?? '', from: new Date(), to: new Date(), status: 'On site', badge: done.badge ?? undefined } : null;
  const closed = live.state === 'ready' && info && !info.open;

  return (
    <KioskFrame tenant={info ? `${info.company} · ${info.location}` : 'Visitor kiosk'}>
      <div className="yx-ops-kiosk">
        {error && <InlineAlert tone="danger" title="Not done">{error}</InlineAlert>}
        {live.state === 'loading' && <p className="yx-ops-kiosk__lead">Getting ready…</p>}
        {live.state === 'error' && (
          <>
            <h1 className="yx-ops-kiosk__title">This kiosk can't reach the server</h1>
            <Button variant="primary" onClick={live.onRetry}>
              Try again
            </Button>
          </>
        )}
        {(closed || step === 'see-reception') && live.state === 'ready' && (
          <>
            <h1 className="yx-ops-kiosk__title">Please see the reception desk</h1>
            <p className="yx-ops-kiosk__lead">They'll help you complete your check-in.</p>
            {!closed && (
              <Button variant="primary" onClick={reset}>
                Done
              </Button>
            )}
          </>
        )}
        {!closed && live.state === 'ready' && info && (
          <>
            {step === 'welcome' && (
              <>
                <h1 className="yx-ops-kiosk__title">Welcome. Please check in.</h1>
                <p className="yx-ops-kiosk__lead">Your details are used only for this visit and deleted after {info.retentionDays} days.</p>
                <div className="yx-ops-kiosk__choices">
                  <Button variant="primary" icon={QrCode} onClick={() => setStep('pass')}>
                    Scan my QR pass
                  </Button>
                  <Button icon={UserPlus} onClick={() => setStep('details')}>
                    I don't have a pass
                  </Button>
                </div>
              </>
            )}
            {step === 'pass' && (
              <>
                <h1 className="yx-ops-kiosk__title">Your pass</h1>
                <p className="yx-ops-kiosk__lead">Hold the QR to the scanner, or type the code under it.</p>
                <FormField id="vk-code" label="Pass code" required error={passEarly.errorOf('vk-code')}>
                  <TextField value={code} onChange={setCode} autoFocus autoComplete="off" spellCheck={false} />
                </FormField>
                <Actions end>
                  <Button onClick={reset}>Back</Button>
                  <Button variant="primary" loading={busy} onClick={() => !passEarly.stop() && void run(async () => result(await live.pass(code.trim())))}>
                    Next
                  </Button>
                </Actions>
              </>
            )}
            {step === 'details' && (
              <>
                <h1 className="yx-ops-kiosk__title">Tell us who you are</h1>
                <FormField id="vk-name" label="Your name" required error={detailsEarly.errorOf('vk-name')}>
                  <TextField value={d.name} onChange={(name) => setD({ ...d, name })} maxLength={200} autoComplete="off" />
                </FormField>
                <FormField id="vk-mobile" label="Mobile" required error={detailsEarly.errorOf('vk-mobile')}>
                  <TextField inputMode="tel" prefix="+91" value={d.mobile} onChange={(mobile) => setD({ ...d, mobile })} maxLength={16} autoComplete="off" />
                </FormField>
                <FormField id="vk-company" label="Company" optional>
                  <TextField value={d.company} onChange={(company) => setD({ ...d, company })} maxLength={200} autoComplete="off" />
                </FormField>
                {info.types.length > 0 && (
                  <FormField id="vk-type" label="You are visiting as" optional>
                    <Select aria-label="You are visiting as" value={d.typeId} onChange={(typeId) => setD({ ...d, typeId })} options={info.types} placeholder="Choose" />
                  </FormField>
                )}
                <FormField id="vk-host" label="Who are you meeting?" required error={detailsEarly.errorOf('vk-host')}>
                  <TextField value={d.host} onChange={(h) => setD({ ...d, host: h })} maxLength={200} autoComplete="off" />
                </FormField>
                <Actions end>
                  <Button onClick={reset}>Back</Button>
                  <Button variant="primary" loading={busy} onClick={() => !detailsEarly.stop() && (info.photo ? setStep('photo') : toNotice())}>
                    Next
                  </Button>
                </Actions>
              </>
            )}
            {step === 'photo' && (
              <>
                <h1 className="yx-ops-kiosk__title">Look at the camera</h1>
                {photo ? (
                  <>
                    <img src={`data:image/jpeg;base64,${photo}`} alt="Your photo" style={{ width: '100%', borderRadius: 'var(--yx-radius-md)' }} />
                    <Actions end>
                      <Button onClick={() => setPhoto(null)}>Take again</Button>
                      <Button variant="primary" loading={busy} onClick={toNotice}>
                        Use this photo
                      </Button>
                    </Actions>
                  </>
                ) : (
                  <PhotoTaker onPhoto={setPhoto} onProblem={() => setStep('see-reception')} />
                )}
              </>
            )}
            {step === 'notice' && needs && (
              <>
                <h1 className="yx-ops-kiosk__title">Before you enter</h1>
                <div className="yx-ops-kiosk__notice" tabIndex={0} role="region" aria-label="Visitor notice">
                  <p>{needs.notice.text}</p>
                  {needs.nda && (
                    <p>
                      <strong>{needs.nda.title}.</strong> {needs.nda.text}
                    </p>
                  )}
                  {needs.induction && (
                    <p>
                      <strong>{needs.induction.title}.</strong> {needs.induction.text}
                    </p>
                  )}
                </div>
                <Checkbox id="vk-agree" checked={ticks.notice} onChange={(notice) => setTicks({ ...ticks, notice })} label="I have read and accept the visitor notice" />
                {noticeEarly.errorOf('vk-agree') && <p className="yx-field__error">{noticeEarly.errorOf('vk-agree')}</p>}
                {needs.nda && (
                  <>
                    <Checkbox id="vk-nda" checked={ticks.nda} onChange={(nda) => setTicks({ ...ticks, nda })} label={`I accept ${needs.nda.title}`} />
                    {noticeEarly.errorOf('vk-nda') && <p className="yx-field__error">{noticeEarly.errorOf('vk-nda')}</p>}
                  </>
                )}
                {needs.induction && (
                  <>
                    <Checkbox id="vk-induction" checked={ticks.induction} onChange={(induction) => setTicks({ ...ticks, induction })} label={`I have read ${needs.induction.title} and will follow it`} />
                    {noticeEarly.errorOf('vk-induction') && <p className="yx-field__error">{noticeEarly.errorOf('vk-induction')}</p>}
                  </>
                )}
                <Actions end>
                  <Button onClick={reset}>Back</Button>
                  <Button variant="primary" loading={busy} onClick={accept}>
                    Accept and continue
                  </Button>
                </Actions>
              </>
            )}
            {step === 'waiting' && waiting && (
              <>
                <h1 className="yx-ops-kiosk__title">We've told {waiting.host}</h1>
                <p className="yx-ops-kiosk__lead" aria-live="polite">
                  Please take a seat. Waiting for approval; reception will help if there's no answer soon.
                </p>
              </>
            )}
            {step === 'badge' && done && badgeVisit && (
              <>
                <h1 className="yx-ops-kiosk__title">You're checked in</h1>
                <p className="yx-ops-kiosk__lead" aria-live="polite">
                  {done.host} knows you're here. Collect your badge at reception, and show your pass {done.passCode} when you leave.
                </p>
                <div className="yx-ops-row" data-center>
                  <VisitorBadge visit={badgeVisit} today={new Date()} />
                </div>
                <Button variant="primary" onClick={reset}>
                  Done
                </Button>
              </>
            )}
            {step === 'rejected' && (
              <>
                <h1 className="yx-ops-kiosk__title">Your visit can't go ahead today</h1>
                <p className="yx-ops-kiosk__lead">{host} isn't available. Please speak to reception to arrange another time.</p>
                <Button variant="primary" onClick={reset}>
                  Done
                </Button>
              </>
            )}
          </>
        )}
      </div>
    </KioskFrame>
  );
}
