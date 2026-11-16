// Proctoring building blocks the library lacks: camera / screen placeholders, system-check rows, live proctor tile,
// flag timeline, evidence frames, integrity score card, connection status, calculator, code answer, QR placeholder.
// Token-only, reusable across PRC screens (T03–T05, T08).
import { useId, useState, type ReactNode } from 'react';
import {
  AlertTriangle,
  Camera,
  CheckCircle2,
  Circle,
  CreditCard,
  Flag,
  Monitor,
  Smartphone,
  Wifi,
  WifiOff,
  XCircle,
} from 'lucide-react';
import { Icon, Spinner } from '../../components/foundations';
import { Badge, AiBadge } from '../../components/display';
import { Button, IconButton } from '../../components/button';
import { formatClock } from '../../components/exam';
import { calcApply, calcUnary, integrityLevel, integrityScore, LEVEL_LABEL, LEVEL_TONE, type CalcFn, type CalcOp, type LiveTileData, type SignalCount } from './proctoring-logic';
import './proctoring-kit.css';

/* ---------- Camera / screen placeholders ---------- */

export type CameraState = 'live' | 'no-face' | 'multiple' | 'off' | 'connecting' | 'captured' | 'phone';
const CAMERA_TEXT: Record<CameraState, string> = {
  live: 'Camera on',
  'no-face': 'Face not in view',
  multiple: 'More than one face',
  off: 'Camera off',
  connecting: 'Connecting camera…',
  captured: 'Photo captured',
  phone: 'Phone detected',
};

/** SVG silhouette with a state line. No real video: a labelled placeholder frame. */
export function CameraFrame({ state = 'live', label, size = 'md', kind = 'camera' }: { state?: CameraState; label?: string; size?: 'sm' | 'md' | 'lg'; kind?: 'camera' | 'id' | 'room' }) {
  const faces = state === 'no-face' || state === 'off' || state === 'connecting' ? 0 : state === 'multiple' ? 2 : 1;
  const alert = state === 'no-face' || state === 'multiple' || state === 'phone';
  return (
    <figure className="yx-cam" data-size={size} data-state={state} data-alert={alert || undefined}>
      <svg viewBox="0 0 160 100" className="yx-cam__svg" role="img" aria-label={`${label ? label + ': ' : ''}${CAMERA_TEXT[state]}`}>
        {kind === 'id' ? (
          <g className="yx-cam__shape">
            <rect x="30" y="22" width="100" height="58" rx="4" />
            <circle cx="55" cy="46" r="10" />
            <rect x="75" y="38" width="42" height="5" />
            <rect x="75" y="50" width="32" height="5" />
            <rect x="42" y="66" width="76" height="5" />
          </g>
        ) : kind === 'room' ? (
          <g className="yx-cam__shape">
            <rect x="20" y="60" width="120" height="6" />
            <rect x="36" y="30" width="36" height="30" />
            <rect x="96" y="42" width="24" height="18" />
          </g>
        ) : (
          <g className="yx-cam__shape">
            {faces >= 1 && (
              <g>
                <circle cx={faces === 2 ? 60 : 80} cy="40" r="15" />
                <path d={`M${faces === 2 ? 34 : 54} 96 q${faces === 2 ? 26 : 26} -36 52 0`} />
              </g>
            )}
            {faces === 2 && (
              <g>
                <circle cx="108" cy="44" r="12" />
                <path d="M88 96 q20 -30 40 0" />
              </g>
            )}
            {state === 'phone' && <rect x="110" y="50" width="14" height="24" rx="2" className="yx-cam__object" />}
          </g>
        )}
      </svg>
      <figcaption className="yx-cam__caption">
        {state === 'connecting' ? <Spinner /> : <Icon icon={state === 'off' ? XCircle : alert ? AlertTriangle : Camera} />}
        <span>{label ? `${label} · ` : ''}{CAMERA_TEXT[state]}</span>
      </figcaption>
    </figure>
  );
}

export function ScreenThumb({ label = 'Screen', note }: { label?: string; note?: string }) {
  return (
    <figure className="yx-cam" data-size="sm" data-kind="screen">
      <svg viewBox="0 0 160 100" className="yx-cam__svg" role="img" aria-label={`${label}${note ? ': ' + note : ''}`}>
        <g className="yx-cam__shape">
          <rect x="16" y="14" width="128" height="72" rx="3" />
          <rect x="26" y="26" width="60" height="6" />
          <rect x="26" y="40" width="100" height="4" />
          <rect x="26" y="50" width="90" height="4" />
          <rect x="26" y="60" width="70" height="4" />
        </g>
      </svg>
      <figcaption className="yx-cam__caption">
        <Icon icon={Monitor} />
        <span>{note ?? label}</span>
      </figcaption>
    </figure>
  );
}

/** Evidence still placeholder with its timestamp and source. */
export function EvidenceFrame({ at, source, label, flagged }: { at: string; source: 'camera' | 'screen' | 'phone' | 'audio'; label: string; flagged?: boolean }) {
  const icon = source === 'screen' ? Monitor : source === 'phone' ? Smartphone : Camera;
  return (
    <figure className="yx-evidence" data-flagged={flagged || undefined}>
      <svg viewBox="0 0 160 90" className="yx-cam__svg" aria-hidden="true">
        <g className="yx-cam__shape">
          {source === 'audio' ? (
            <path d="M10 45 L30 45 L36 25 L44 65 L52 30 L60 60 L68 40 L76 50 L150 45" fill="none" />
          ) : (
            <>
              <circle cx="80" cy="36" r="13" />
              <path d="M56 90 q24 -32 48 0" />
            </>
          )}
        </g>
      </svg>
      <figcaption>
        <span className="yx-evidence__meta">
          <Icon icon={icon} />
          {at} · {source}
        </span>
        <span>{label}</span>
      </figcaption>
    </figure>
  );
}

/* ---------- System check ---------- */

export type CheckStatus = 'pass' | 'warn' | 'fail' | 'running' | 'pending';
export interface SystemCheck {
  id: string;
  label: string;
  status: CheckStatus;
  /** Result in plain words: "Camera found: Integrated webcam, 720p". */
  detail: string;
  /** Numbered fix steps shown when the check warns or fails. */
  fix?: string[];
  /** Block = the test can't start while it fails (YX-DLV-09). */
  blocking?: boolean;
  icon?: typeof Camera;
}
const CHECK_ICON: Record<CheckStatus, typeof Camera> = { pass: CheckCircle2, warn: AlertTriangle, fail: XCircle, running: Circle, pending: Circle };
const CHECK_WORD: Record<CheckStatus, string> = { pass: 'Passed', warn: 'Warning', fail: 'Failed', running: 'Checking', pending: 'Not checked yet' };

export function SystemCheckList({ checks, onRetry }: { checks: SystemCheck[]; onRetry?: (id: string) => void }) {
  return (
    <ul className="yx-syscheck" aria-live="polite">
      {checks.map((c) => (
        <li key={c.id} className="yx-syscheck__row" data-status={c.status}>
          <span className="yx-syscheck__icon">{c.status === 'running' ? <Spinner /> : <Icon icon={CHECK_ICON[c.status]} size="md" />}</span>
          <div className="yx-syscheck__main">
            <div className="yx-syscheck__head">
              <strong>{c.label}</strong>
              <Badge tone={c.status === 'pass' ? 'success' : c.status === 'warn' ? 'warning' : c.status === 'fail' ? 'danger' : 'neutral'}>{CHECK_WORD[c.status]}</Badge>
              {c.blocking && c.status === 'fail' && <span className="yx-syscheck__block">Blocks the start</span>}
              {!c.blocking && c.status === 'warn' && <span className="yx-syscheck__note">You can still start; the reviewer is told</span>}
            </div>
            <p className="yx-syscheck__detail">{c.detail}</p>
            {c.fix && (c.status === 'fail' || c.status === 'warn') && (
              <div className="yx-syscheck__fix">
                <p>How to fix it</p>
                <ol>
                  {c.fix.map((s) => (
                    <li key={s}>{s}</li>
                  ))}
                </ol>
                {onRetry && (
                  <Button size="sm" onClick={() => onRetry(c.id)}>
                    Check {c.label.toLowerCase()} again
                  </Button>
                )}
              </div>
            )}
          </div>
        </li>
      ))}
    </ul>
  );
}

/* ---------- Integrity score card ---------- */

export function IntegrityScoreCard({ signals, profile = 'Starter weights v2' }: { signals: SignalCount[]; profile?: string }) {
  const { score, contributions } = integrityScore(signals);
  const level = integrityLevel(score);
  return (
    <section className="yx-iscore" aria-label="Integrity score">
      <div className="yx-iscore__top">
        <span className="yx-iscore__value">
          {score}
          <span> / 100</span>
        </span>
        <Badge tone={LEVEL_TONE[level]}>{LEVEL_LABEL[level]}</Badge>
      </div>
      <p className="yx-iscore__note">A review aid, never a decision. Weights: {profile}.</p>
      {contributions.length === 0 ? (
        <p className="yx-iscore__note">No signals in this attempt.</p>
      ) : (
        <ul className="yx-iscore__list">
          {contributions.map((c) => (
            <li key={c.signal}>
              <span>
                {c.label} ×{c.count} {c.ai && <AiBadge />}
              </span>
              <span className="yx-iscore__ded">−{c.deduction}</span>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

/* ---------- Live proctor tile ---------- */

const TILE_STATUS: Record<LiveTileData['status'], { label: string; tone: 'success' | 'warning' | 'danger' | 'neutral' | 'info' }> = {
  'in-progress': { label: 'In progress', tone: 'success' },
  paused: { label: 'Paused', tone: 'warning' },
  waiting: { label: 'Waiting room', tone: 'info' },
  disconnected: { label: 'Reconnecting', tone: 'warning' },
  submitted: { label: 'Submitted', tone: 'neutral' },
  terminated: { label: 'Ended by proctor', tone: 'danger' },
};

export function ProctorTile({ tile, selected, onOpen, index }: { tile: LiveTileData; selected?: boolean; onOpen?: (id: string) => void; index?: number }) {
  const level = integrityLevel(tile.score);
  const st = TILE_STATUS[tile.status];
  const cam: CameraState = tile.status === 'disconnected' ? 'connecting' : tile.lastFlag?.startsWith('More than one') ? 'multiple' : tile.lastFlag?.startsWith('Face') ? 'no-face' : tile.lastFlag?.startsWith('Phone') ? 'phone' : 'live';
  return (
    <button type="button" className="yx-ptile" data-level={level} aria-pressed={selected} onClick={() => onOpen?.(tile.id)} aria-label={`${tile.name}, ${st.label}, integrity ${tile.score}, ${tile.flags} flags${index != null ? `, shortcut ${index + 1}` : ''}`}>
      <div className="yx-ptile__media">
        <CameraFrame state={cam} size="sm" />
        <ScreenThumb note={tile.question} />
      </div>
      <div className="yx-ptile__row">
        <strong className="yx-ptile__name">{tile.name}</strong>
        {index != null && index < 9 && <kbd className="yx-ptile__key">{index + 1}</kbd>}
      </div>
      <div className="yx-ptile__row">
        <Badge tone={st.tone}>{st.label}</Badge>
        <Badge tone={LEVEL_TONE[level]}>
          {tile.score} · {LEVEL_LABEL[level]}
        </Badge>
      </div>
      <div className="yx-ptile__row yx-ptile__meta">
        <span>
          <Icon icon={Flag} /> {tile.flags} {tile.flags === 1 ? 'flag' : 'flags'}
        </span>
        <span>{formatClock(tile.secondsLeft)} left</span>
      </div>
      <p className="yx-ptile__last">
        {tile.lastFlag ? (
          <>
            Latest: {tile.lastFlag} {tile.lastFlagAi && <AiBadge />}
          </>
        ) : (
          'No flags'
        )}
      </p>
      {tile.accommodation && <p className="yx-ptile__acc">Adjusted profile: {tile.accommodation}</p>}
    </button>
  );
}

/* ---------- Flag timeline ---------- */

export interface FlagEvent {
  id: string;
  /** Seconds from attempt start. */
  at: number;
  type: string;
  label: string;
  severity: 'low' | 'medium' | 'high';
  ai?: boolean;
  source?: 'camera' | 'screen' | 'phone' | 'audio' | 'client' | 'proctor';
}

/** Scrubbable track with flag markers (keyboard: Tab through markers, Enter to jump) and the event list. */
export function FlagTimeline({ duration, events, current, onSeek, label = 'Session timeline' }: { duration: number; events: FlagEvent[]; current: number; onSeek: (s: number) => void; label?: string }) {
  const id = useId();
  return (
    <section className="yx-ftl" aria-labelledby={id}>
      <h3 id={id} className="yx-ftl__title">
        {label}
      </h3>
      <div className="yx-ftl__track">
        <input
          type="range"
          min={0}
          max={duration}
          value={current}
          onChange={(e) => onSeek(Number(e.target.value))}
          aria-label="Playback position"
          aria-valuetext={`${formatClock(current)} of ${formatClock(duration)}`}
          className="yx-ftl__range"
        />
        <div className="yx-ftl__marks">
          {events.map((e) => (
            <button
              key={e.id}
              type="button"
              className="yx-ftl__mark"
              data-severity={e.severity}
              style={{ left: `${(e.at / duration) * 100}%` }}
              onClick={() => onSeek(e.at)}
              // Pointer shortcut only: the full-size list below is the accessible equivalent (WCAG 2.5.8 exception).
              tabIndex={-1}
              aria-hidden="true"
              title={`${formatClock(e.at)} ${e.label}`}
            />
          ))}
        </div>
      </div>
      <div className="yx-ftl__scale" aria-hidden="true">
        <span>00:00</span>
        <span>{formatClock(current)}</span>
        <span>{formatClock(duration)}</span>
      </div>
      <ol className="yx-ftl__list">
        {events.map((e) => (
          <li key={e.id} data-active={Math.abs(e.at - current) < 5 || undefined}>
            <button type="button" className="yx-ftl__item" onClick={() => onSeek(e.at)}>
              <span className="yx-ftl__time">{formatClock(e.at)}</span>
              <Badge tone={e.severity === 'high' ? 'danger' : e.severity === 'medium' ? 'warning' : 'neutral'}>{e.severity === 'high' ? 'High' : e.severity === 'medium' ? 'Medium' : 'Low'}</Badge>
              <span className="yx-ftl__label">{e.label}</span>
              {e.ai && <AiBadge />}
              {e.source && <span className="yx-ftl__src">{e.source}</span>}
            </button>
          </li>
        ))}
      </ol>
    </section>
  );
}

/* ---------- Connection status (runner) ---------- */

export type ConnState = 'online' | 'weak' | 'reconnecting' | 'offline';
export function ConnectionStatus({ state, queued = 0, offlineSeconds = 0, offlineMinutes = 5 }: { state: ConnState; queued?: number; offlineSeconds?: number; offlineMinutes?: number }) {
  const text =
    state === 'online'
      ? 'Connected'
      : state === 'weak'
        ? 'Weak connection, answers still saving'
        : state === 'reconnecting'
          ? `Reconnecting… ${queued} ${queued === 1 ? 'answer' : 'answers'} kept on this device`
          : offlineSeconds >= offlineMinutes * 60
            ? `Offline for ${formatClock(offlineSeconds)}. Answering stops until the connection is back; your saved answers are kept.`
            : `Offline for ${formatClock(offlineSeconds)}. You can keep answering for up to ${offlineMinutes} ${offlineMinutes === 1 ? 'minute' : 'minutes'}.`;
  return (
    <p className="yx-conn" data-state={state} role="status" aria-live="polite">
      <Icon icon={state === 'online' || state === 'weak' ? Wifi : WifiOff} />
      <span>{text}</span>
    </p>
  );
}

/* ---------- Calculator ---------- */

/** Answer 2162: the scientific keys (degrees by default), on top of the basic ones. */
const SCI_KEYS: [string, CalcFn | 'pi' | 'e' | 'pow', string][] = [
  ['sin', 'sin', 'sine'], ['cos', 'cos', 'cosine'], ['tan', 'tan', 'tangent'], ['π', 'pi', 'pi'],
  ['√', 'sqrt', 'square root'], ['x²', 'square', 'squared'], ['xʸ', 'pow', 'to the power of'], ['±', 'negate', 'change sign'],
  ['ln', 'ln', 'natural log'], ['log', 'log', 'log base 10'], ['1/x', 'inverse', 'one over'], ['e', 'e', 'e'],
];
const OP_LABEL: Record<string, string> = { '-': 'minus', '×': 'times', '÷': 'divide by', '+': 'plus', '=': 'equals' };

export function Calculator({ onClose, scientific = false }: { onClose?: () => void; scientific?: boolean }) {
  const [display, setDisplay] = useState('0');
  const [acc, setAcc] = useState<number | null>(null);
  const [op, setOp] = useState<CalcOp | null>(null);
  /** The next digit starts a new number. */
  const [fresh, setFresh] = useState(true);
  /** The display holds a number not yet used by the waiting operation. */
  const [entered, setEntered] = useState(false);
  const [radians, setRadians] = useState(false);
  const show = (v: number | 'Error') => {
    setDisplay(String(v));
    setFresh(true);
    setEntered(v !== 'Error');
  };
  const digit = (d: string) => {
    if (display === 'Error' || fresh) {
      setDisplay(d === '.' ? '0.' : d);
      setFresh(false);
    } else if (!(d === '.' && display.includes('.'))) setDisplay(display === '0' && d !== '.' ? d : display + d);
    setEntered(true);
  };
  const operate = (next: CalcOp | '=') => {
    const cur = Number(display);
    let val: number | 'Error' = cur;
    if (acc != null && op && entered) val = calcApply(acc, op, cur);
    setDisplay(String(val));
    setAcc(val === 'Error' ? null : val);
    setOp(next === '=' ? null : next);
    setFresh(true);
    setEntered(false);
  };
  const science = (k: CalcFn | 'pi' | 'e' | 'pow') => {
    if (k === 'pow') return operate('^');
    if (k === 'pi' || k === 'e') return show(Math.round((k === 'pi' ? Math.PI : Math.E) * 1e8) / 1e8);
    if (display !== 'Error') show(calcUnary(k, Number(display), radians));
  };
  const clear = () => {
    setDisplay('0');
    setAcc(null);
    setOp(null);
    setFresh(true);
    setEntered(false);
  };
  const keys: (string | [string, () => void, string])[] = [
    ...(scientific ? SCI_KEYS.map(([label, k, name]): [string, () => void, string] => [label, () => science(k), name]) : []),
    ...(['7', '8', '9', '÷', '4', '5', '6', '×', '1', '2', '3', '-', '0', '.', '=', '+'] as const).map((k): string | [string, () => void, string] =>
      k in OP_LABEL ? [k, () => operate(k as CalcOp | '='), OP_LABEL[k]!] : k,
    ),
  ];
  return (
    <section className="yx-calc" aria-label={scientific ? 'Scientific calculator' : 'Calculator'} data-scientific={scientific || undefined}>
      <div className="yx-calc__head">
        <strong>{scientific ? 'Scientific calculator' : 'Calculator'}</strong>
        <span className="yx-calc__tools">
          {scientific && (
            <Button size="sm" onClick={() => setRadians(!radians)} aria-pressed={radians} aria-label={radians ? 'Angles in radians: switch to degrees' : 'Angles in degrees: switch to radians'}>
              {radians ? 'Rad' : 'Deg'}
            </Button>
          )}
          {onClose && <IconButton icon={XCircle} label="Close calculator" size="sm" onClick={onClose} />}
        </span>
      </div>
      <output className="yx-calc__display" aria-live="polite">
        {display}
      </output>
      <div className="yx-calc__keys">
        {keys.map((k) =>
          typeof k === 'string' ? (
            <button key={k} type="button" className="yx-calc__key" onClick={() => digit(k)}>
              {k}
            </button>
          ) : (
            <button key={k[0]} type="button" className="yx-calc__key" data-op onClick={k[1]} aria-label={k[2]}>
              {k[0]}
            </button>
          ),
        )}
        <button type="button" className="yx-calc__key yx-calc__clear" onClick={clear}>
          Clear
        </button>
      </div>
    </section>
  );
}

/* ---------- Question media (answer 2161) ---------- */

export interface QuestionImage {
  src: string;
  /** The writer's alt text (answer 2126); a plain description stands in when there is none. */
  alt?: string | null;
}
/** A question's picture and read-only code snippet, under its text. */
export function QuestionMedia({ image, snippet }: { image?: QuestionImage | null; snippet?: { language?: string | null; code: string } | null }) {
  if (!image && !snippet) return null;
  return (
    <>
      {image && <img className="yx-prc-qimg" src={image.src} alt={image.alt?.trim() || 'Picture for this question'} />}
      {snippet && (
        <figure className="yx-prc-snippet">
          <figcaption>{snippet.language || 'Code'}</figcaption>
          <pre tabIndex={0} aria-label={`Code, ${snippet.language || 'plain text'}`}>
            <code>{snippet.code}</code>
          </pre>
        </figure>
      )}
    </>
  );
}
/** An answer option with its picture, if it has one. */
export function OptionLabel({ text, image }: { text: string; image?: QuestionImage | null }) {
  if (!image) return <>{text}</>;
  return (
    <span className="yx-prc-option">
      <img className="yx-prc-optimg" src={image.src} alt={image.alt?.trim() || (text ? `Picture: ${text}` : 'Picture for this option')} />
      {text && <span>{text}</span>}
    </span>
  );
}

/* ---------- Code answer ---------- */

export interface CodeTestResult {
  name: string;
  status: 'pass' | 'fail' | 'hidden';
  detail?: string;
}
/** Plain monospace editor with line numbers and a test-results panel. Hidden tests never show input or output. */
export function CodeAnswer({ language, value, onChange, results, running, onRun, runs }: { language: string; value: string; onChange: (v: string) => void; results?: CodeTestResult[]; running?: boolean; onRun?: () => void; runs?: number }) {
  const lines = value.split('\n').length;
  return (
    <div className="yx-code">
      <div className="yx-code__bar">
        <span>{language} · autocomplete off · sandbox 2 s CPU, 256 MB, no network</span>
        {onRun && (
          <Button size="sm" onClick={onRun} loading={running}>
            Run visible tests
          </Button>
        )}
      </div>
      <div className="yx-code__editor">
        <pre className="yx-code__gutter" aria-hidden="true">
          {Array.from({ length: lines }, (_, i) => i + 1).join('\n')}
        </pre>
        <textarea className="yx-code__area" value={value} onChange={(e) => onChange(e.target.value)} spellCheck={false} aria-label={`Code editor, ${language}`} rows={Math.max(10, lines)} />
      </div>
      {results && (
        <div className="yx-code__results" aria-live="polite">
          <p>
            Test results{runs != null && <> · run {runs} of your history is kept as evidence</>}
          </p>
          <ul>
            {results.map((r) => (
              <li key={r.name} data-status={r.status}>
                <Icon icon={r.status === 'pass' ? CheckCircle2 : r.status === 'fail' ? XCircle : Circle} />
                <span>{r.name}</span>
                <span className="yx-code__detail">{r.status === 'hidden' ? 'Hidden test, runs after you submit' : r.detail}</span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

/* ---------- QR placeholder ---------- */

/** Deterministic QR-like pattern from a seed (placeholder only; the real code is signed server-side). */
export function QrPlaceholder({ seed, label }: { seed: string; label: string }) {
  const n = 21;
  let h = 0;
  for (const ch of seed) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  const cells: ReactNode[] = [];
  for (let y = 0; y < n; y++)
    for (let x = 0; x < n; x++) {
      const finder = (x < 7 && y < 7) || (x > 13 && y < 7) || (x < 7 && y > 13);
      h = (h * 1103515245 + 12345) >>> 0;
      const on = finder ? x % 6 === 0 || y % 6 === 0 || (x % 7 > 1 && x % 7 < 5 && y % 7 > 1 && y % 7 < 5) || x === 20 || x === 14 || y === 14 || y === 20 : (h >> 16) % 2 === 0;
      if (on) cells.push(<rect key={`${x}-${y}`} x={x} y={y} width="1" height="1" />);
    }
  return (
    <figure className="yx-qr">
      <svg viewBox={`-1 -1 ${n + 2} ${n + 2}`} role="img" aria-label={label} className="yx-qr__svg">
        <g className="yx-qr__cells">{cells}</g>
      </svg>
      <figcaption>{label}</figcaption>
    </figure>
  );
}

/** ID-card capture placeholder (masked number only, YX-PROC-05). */
export function IdCapture({ docType, masked, state }: { docType: string; masked?: string; state: 'waiting' | 'captured' | 'blurry' }) {
  return (
    <div className="yx-idcap" data-state={state}>
      <CameraFrame kind="id" state={state === 'captured' ? 'captured' : 'live'} label={docType} />
      <p className="yx-idcap__meta">
        <Icon icon={CreditCard} />
        {state === 'captured' ? `${docType} · ${masked ?? 'number masked'}` : state === 'blurry' ? 'The photo is blurry. Hold the card still, flat and fill the frame.' : `Hold your ${docType} inside the frame`}
      </p>
    </div>
  );
}
