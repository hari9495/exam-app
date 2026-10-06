// Reusable building blocks for T9 external portals (APX-D §4), the YukthiX console and the partner portal.
// TenantPortal adds what the lead's PortalFrame leaves to each screen: tenant accent (§38), access-ends banner,
// language switcher, pinned primary action and the four footer notices (GAP H6, APX-G).
import { useEffect, useMemo, useRef, useState, type CSSProperties, type KeyboardEvent, type ReactNode } from 'react';
import { Camera, CheckCircle2, Clock, Globe2, Lock, ShieldCheck, TriangleAlert } from 'lucide-react';
import { PortalFrame } from '../_kit/frames';
import { Button } from '../../components/button';
import { Icon } from '../../components/foundations';
import { Select } from '../../components/select';
import { Checkbox } from '../../components/choice';
import { FormField } from '../../components/field';
import { TextField } from '../../components/inputs';
import { InlineAlert } from '../../components/feedback';
import { Badge } from '../../components/display';
import { resolveTenantAccent } from '../../components/careers';
import { formatDate } from '../../lib/format';
import { cx } from '../../lib/cx';
import {
  accessWindow,
  cleanOtp,
  maskDestination,
  OTP_LENGTH,
  OTP_LOCK_MINUTES,
  OTP_MAX_ATTEMPTS,
  OTP_VALID_MINUTES,
  otpPhase,
  resendLabel,
  STATUS_LABEL,
  type ComponentStatus,
} from './portals-logic';
import './portals.css';

/* ================================================================== */
/* Language switcher (P04 Q4)                                          */
/* ================================================================== */

export const PORTAL_LANGUAGES = [
  { value: 'en', label: 'English' },
  { value: 'hi', label: 'हिन्दी (Hindi)' },
  { value: 'ta', label: 'தமிழ் (Tamil)' },
  { value: 'te', label: 'తెలుగు (Telugu)' },
];

export function LanguageSwitcher({ defaultValue = 'en', size = 'sm' }: { defaultValue?: string; size?: 'sm' | 'md' }) {
  const [lang, setLang] = useState<string | null>(defaultValue);
  return (
    <div className="yx-lang">
      <Icon icon={Globe2} />
      <Select aria-label="Language" size={size} options={PORTAL_LANGUAGES} value={lang} onChange={setLang} />
    </div>
  );
}

/* ================================================================== */
/* Footer notices (APX-D §4 footer-owner table)                        */
/* ================================================================== */

export interface FooterNotices {
  /** e.g. "Privacy notice (pre-boarding, G-09)". */
  privacy: string;
  /** Public pages add the cookie notice (G-14). */
  cookies?: boolean;
  /** Terms variant: acceptable use (G-16) or candidate terms (G-29). */
  terms?: string;
}

export function PortalFooterLinks({ privacy, cookies, terms = 'Terms of use' }: FooterNotices) {
  const links = [privacy, terms, 'Accessibility statement', ...(cookies ? ['Cookie notice'] : []), 'Grievance officer', 'Open-source notices'];
  return (
    <nav className="yx-portal-notices" aria-label="Legal notices">
      {links.map((l) => (
        <a key={l} href="#">
          {l}
        </a>
      ))}
    </nav>
  );
}

/* ================================================================== */
/* TenantPortal                                                        */
/* ================================================================== */

export type PortalAccess =
  | { kind: 'otp'; identity: string; endsOn: Date; today: Date; endsBecause?: string }
  | { kind: 'public' }
  | { kind: 'signin' }
  | { kind: 'note'; text: string }
  | { kind: 'access-code' }
  | { kind: 'link'; endsOn: Date; today: Date; endsBecause?: string };

export interface TenantPortalProps {
  tenant: string;
  portal: string;
  nav?: { label: string; active?: boolean }[];
  /** Tenant accent as hex (with or without #). Used only if it reaches 4.5:1 on white (§38). */
  accent?: string;
  whiteLabel?: boolean;
  access: PortalAccess;
  footer: FooterNotices;
  /** Primary action pinned at the bottom of the viewport (T8 pattern). */
  pinned?: ReactNode;
  /** Narrow single-column content (forms, sign-in). */
  narrow?: boolean;
  language?: string;
  children: ReactNode;
}

export function TenantPortal({ tenant, portal, nav, accent, whiteLabel, access, footer, pinned, narrow, language = 'en', children }: TenantPortalProps) {
  const res = resolveTenantAccent(accent);
  const style = res.accent ? ({ '--yx-tenant-accent': res.accent } as CSSProperties) : undefined;
  const user = access.kind === 'otp' ? access.identity : undefined;
  return (
    <div className="yx-tportal" data-accent={res.accent ? 'tenant' : 'default'} data-narrow={narrow || undefined} style={style}>
      <PortalFrame tenant={tenant} portal={portal} nav={nav} user={user} whiteLabel={whiteLabel}>
        <div className="yx-tportal__bar">
          <AccessNote access={access} />
          <LanguageSwitcher defaultValue={language} />
        </div>
        <div className="yx-tportal__content">{children}</div>
        {pinned && <div className="yx-tportal__pinned">{pinned}</div>}
        <PortalFooterLinks {...footer} />
      </PortalFrame>
    </div>
  );
}

function AccessNote({ access }: { access: PortalAccess }) {
  if (access.kind === 'public') return <span className="yx-tportal__note">Public page · no sign-in needed</span>;
  if (access.kind === 'note') return <span className="yx-tportal__note">{access.text}</span>;
  if (access.kind === 'signin')
    return (
      <span className="yx-tportal__note">
        <Icon icon={Lock} /> Sign in with a one-time code · no password
      </span>
    );
  if (access.kind === 'access-code')
    return (
      <span className="yx-tportal__note">
        <Icon icon={Lock} /> No name, IP address or device is stored
      </span>
    );
  const w = accessWindow(access.endsOn, access.today);
  const text =
    w.state === 'ended'
      ? `Access ended on ${formatDate(access.endsOn)}`
      : `Access ends ${formatDate(access.endsOn)}${access.endsBecause ? ` · ${access.endsBecause}` : ''}`;
  return (
    <span className="yx-tportal__note" data-state={w.state} role={w.state === 'ending' ? 'status' : undefined}>
      <Icon icon={Clock} /> {text}
      {w.state === 'ending' && <Badge tone="warning">{w.days === 0 ? 'Ends today' : `${w.days} days left`}</Badge>}
    </span>
  );
}

/* ================================================================== */
/* OTP input and sign-in (P02 §4.7, YX-SEC-21, YX-IAM-07)             */
/* ================================================================== */

export interface OtpInputProps {
  value: string;
  onChange: (v: string) => void;
  length?: number;
  invalid?: boolean;
  disabled?: boolean;
  label?: string;
}

/** One box per digit: typing moves forward, Backspace moves back, paste fills all boxes, arrows move. */
export function OtpInput({ value, onChange, length = OTP_LENGTH, invalid, disabled, label = 'Verification code' }: OtpInputProps) {
  const refs = useRef<(HTMLInputElement | null)[]>([]);
  const digits = Array.from({ length }, (_, i) => value[i] ?? '');
  const set = (i: number, d: string) => {
    const next = digits.slice();
    next[i] = d;
    onChange(cleanOtp(next.join(''), length));
  };
  const onKey = (i: number, e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Backspace' && !digits[i] && i > 0) {
      e.preventDefault();
      set(i - 1, '');
      refs.current[i - 1]?.focus();
    } else if (e.key === 'ArrowLeft' && i > 0) refs.current[i - 1]?.focus();
    else if (e.key === 'ArrowRight' && i < length - 1) refs.current[i + 1]?.focus();
  };
  return (
    <div className="yx-otp" role="group" aria-label={label} data-invalid={invalid || undefined}>
      {digits.map((d, i) => (
        <input
          key={i}
          ref={(el) => {
            refs.current[i] = el;
          }}
          className="yx-otp__box"
          inputMode="numeric"
          autoComplete={i === 0 ? 'one-time-code' : 'off'}
          aria-label={`Digit ${i + 1} of ${length}`}
          aria-invalid={invalid || undefined}
          disabled={disabled}
          maxLength={1}
          value={d}
          onKeyDown={(e) => onKey(i, e)}
          onPaste={(e) => {
            e.preventDefault();
            const p = cleanOtp(e.clipboardData.getData('text'), length);
            onChange(p);
            refs.current[Math.min(p.length, length - 1)]?.focus();
          }}
          onChange={(e) => {
            const v = e.target.value.replace(/\D/g, '');
            if (!v) return set(i, '');
            if (v.length > 1) {
              onChange(cleanOtp(digits.slice(0, i).join('') + v, length));
              refs.current[Math.min(i + v.length, length - 1)]?.focus();
              return;
            }
            set(i, v);
            if (i < length - 1) refs.current[i + 1]?.focus();
          }}
        />
      ))}
    </div>
  );
}

export type OtpStage = 'identify' | 'code' | 'locked' | 'link-expired' | 'no-access';

export interface OtpSignInProps {
  /** "Sign in to your joining checklist". */
  title: string;
  /** Who this is for, in one sentence. */
  intro: string;
  channel?: 'email' | 'mobile' | 'either';
  defaultStage?: OtpStage;
  /** The email or mobile the code was sent to (masked on screen). */
  destination?: string;
  defaultCode?: string;
  /** Wrong attempts already used. */
  defaultAttempts?: number;
  /** Seconds before Resend is allowed (0 = allowed now). */
  resendIn?: number;
  /** The code the demo accepts. Real codes are checked on the server. */
  demoCode?: string;
  /** Legal notice acknowledged at first sign-in (G-09 variant). */
  notice?: string;
  /** Extra factor for AAL2 portals (IC members, audit-committee chair). */
  secondFactor?: boolean;
  onSignedIn?: () => void;
  /** Contact for "no access" and lock messages. */
  helpContact?: string;
}

/**
 * External-portal sign-in: email or mobile → one-time code. No passwords (YX-SEC-21).
 * UI defaults (not set in the docs): 6-digit code valid 10 minutes, resend after 30 s, 5 wrong attempts lock sign-in for 15 minutes.
 */
export function OtpSignIn({
  title,
  intro,
  channel = 'email',
  defaultStage = 'identify',
  destination = '',
  defaultCode = '',
  defaultAttempts = 0,
  resendIn = 0,
  demoCode = '482913',
  notice,
  secondFactor,
  onSignedIn,
  helpContact = 'the HR team',
}: OtpSignInProps) {
  const [stage, setStage] = useState<OtpStage>(defaultStage);
  const [dest, setDest] = useState(destination);
  const [destError, setDestError] = useState<string | null>(null);
  const [code, setCode] = useState(defaultCode);
  const [attempts, setAttempts] = useState(defaultAttempts);
  const [ack, setAck] = useState(false);
  const [ackError, setAckError] = useState(false);
  const [done, setDone] = useState(false);
  const { phase, left } = otpPhase(attempts);
  const effectiveStage = phase === 'locked' && stage === 'code' ? 'locked' : stage;

  const send = () => {
    const email = /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(dest);
    const mobile = /^\d{10}$/.test(dest.replace(/\D/g, '').slice(-10)) && dest.replace(/\D/g, '').length >= 10;
    const ok = channel === 'email' ? email : channel === 'mobile' ? mobile : email || mobile;
    if (!ok) {
      setDestError(channel === 'mobile' ? 'Enter a 10-digit mobile number.' : 'Enter the email address the invitation was sent to.');
      return;
    }
    setDestError(null);
    setStage('code');
  };
  const verify = () => {
    if (notice && !ack) {
      setAckError(true);
      return;
    }
    if (code === demoCode) {
      setDone(true);
      onSignedIn?.();
      return;
    }
    setAttempts((a) => a + 1);
    setCode('');
  };

  if (done)
    return (
      <div className="yx-signin" role="status">
        <InlineAlert tone="success" title="You're signed in">
          {secondFactor ? 'Confirm with your passkey or authenticator app to open your cases.' : 'Opening your page.'}
        </InlineAlert>
      </div>
    );

  return (
    <div className="yx-signin">
      <div className="yx-signin__head">
        <h2 className="yx-signin__title">{title}</h2>
        <p className="yx-signin__intro">{intro}</p>
      </div>

      {effectiveStage === 'identify' && (
        <>
          <FormField
            label={channel === 'mobile' ? 'Mobile number' : channel === 'either' ? 'Email or mobile number' : 'Email address'}
            helper={channel === 'mobile' ? 'We send a code by SMS or WhatsApp.' : 'Use the address your invitation came to.'}
            error={destError}
            required
          >
            <TextField
              value={dest}
              onChange={setDest}
              type={channel === 'email' ? 'email' : 'text'}
              inputMode={channel === 'mobile' ? 'tel' : undefined}
              prefix={channel === 'mobile' ? '+91' : undefined}
              placeholder={channel === 'mobile' ? '98xxxxxxxx' : 'name@example.com'}
              autoComplete={channel === 'mobile' ? 'tel' : 'email'}
            />
          </FormField>
          <Button variant="primary" fullWidth onClick={send}>
            Send code
          </Button>
          <p className="yx-signin__fine">We never ask for a password here. Codes are valid for {OTP_VALID_MINUTES} minutes.</p>
        </>
      )}

      {effectiveStage === 'code' && (
        <>
          <p className="yx-signin__sent" aria-live="polite">
            We sent a {OTP_LENGTH}-digit code to <strong>{maskDestination(dest || 'name@example.com')}</strong>. It is valid for {OTP_VALID_MINUTES} minutes.
          </p>
          <FormField label="Verification code" hideLabel error={phase === 'wrong' ? `That code didn't match. ${left} attempts left.` : null}>
            <OtpInput value={code} onChange={setCode} invalid={phase === 'wrong'} />
          </FormField>
          {notice && (
            <Checkbox
              checked={ack}
              onChange={(c) => {
                setAck(c);
                setAckError(false);
              }}
              label={
                <>
                  I have read the <a href="#">{notice}</a>
                </>
              }
              description={ackError ? 'Confirm you have read the notice to continue.' : undefined}
            />
          )}
          <Button variant="primary" fullWidth onClick={verify} disabled={code.length < OTP_LENGTH}>
            Verify and continue
          </Button>
          <div className="yx-signin__row">
            <Button size="sm" disabled={resendIn > 0}>
              {resendLabel(resendIn)}
            </Button>
            <Button size="sm" onClick={() => setStage('identify')}>
              Change {channel === 'mobile' ? 'number' : 'address'}
            </Button>
          </div>
        </>
      )}

      {effectiveStage === 'locked' && (
        <InlineAlert tone="danger" title="Sign-in is paused for 15 minutes">
          There were {OTP_MAX_ATTEMPTS} wrong codes in a row, so we paused sign-in for {OTP_LOCK_MINUTES} minutes to protect your account. Try again after
          that, or contact {helpContact}.
        </InlineAlert>
      )}

      {effectiveStage === 'link-expired' && (
        <InlineAlert tone="warning" title="This invitation link has expired" actions={<Button size="sm">Send me a new link</Button>}>
          Links work for 7 days. We can send a fresh one to the same address.
        </InlineAlert>
      )}

      {effectiveStage === 'no-access' && (
        <InlineAlert tone="info" title="We couldn't find access for this address">
          If you expected an invitation, ask {helpContact} to check the address they used. For your privacy we don't say whether an account exists.
        </InlineAlert>
      )}
    </div>
  );
}

/** A portal's sign-in page: the tenant shell (narrow) with the OTP sign-in card. */
export function PortalSignInScreen({ tenant, portal, accent, whiteLabel, footer, signIn }: { tenant: string; portal: string; accent?: string; whiteLabel?: boolean; footer: FooterNotices; signIn: OtpSignInProps }) {
  return (
    <TenantPortal tenant={tenant} portal={portal} accent={accent} whiteLabel={whiteLabel} narrow access={{ kind: 'signin' }} footer={footer}>
      <OtpSignIn {...signIn} />
    </TenantPortal>
  );
}

/* ================================================================== */
/* Consent panel (DPDP notice + purposes)                              */
/* ================================================================== */

export interface ConsentPurpose {
  id: string;
  label: string;
  description?: string;
  required?: boolean;
}

export interface ConsentPanelProps {
  title: string;
  /** Plain summary of what happens with the data. */
  summary: ReactNode;
  purposes: ConsentPurpose[];
  noticeLabel: string;
  noticeVersion: string;
  acceptLabel: string;
  declineLabel?: string;
  onAccept?: (ids: string[]) => void;
  onDecline?: () => void;
  defaultChecked?: string[];
  /** Show the "you declined" outcome. */
  defaultDeclined?: boolean;
  declinedText?: ReactNode;
}

export function ConsentPanel({
  title,
  summary,
  purposes,
  noticeLabel,
  noticeVersion,
  acceptLabel,
  declineLabel = 'Not now',
  onAccept,
  onDecline,
  defaultChecked = [],
  defaultDeclined,
  declinedText,
}: ConsentPanelProps) {
  const [checked, setChecked] = useState<string[]>(defaultChecked);
  const [showErr, setShowErr] = useState(false);
  const [declined, setDeclined] = useState(!!defaultDeclined);
  const [accepted, setAccepted] = useState(false);
  const missing = purposes.filter((p) => p.required && !checked.includes(p.id));
  if (declined)
    return (
      <InlineAlert tone="info" title="You didn't give consent">
        {declinedText ?? 'Nothing was shared. You can come back to this link while it is valid.'}
      </InlineAlert>
    );
  if (accepted)
    return (
      <InlineAlert tone="success" title="Consent recorded">
        Recorded against notice {noticeVersion}. You can withdraw it at any time from the same link.
      </InlineAlert>
    );
  return (
    <section className="yx-consent" aria-label={title}>
      <h3 className="yx-consent__title">{title}</h3>
      <div className="yx-consent__summary">{summary}</div>
      <ul className="yx-consent__list">
        {purposes.map((p) => (
          <li key={p.id}>
            <Checkbox
              checked={checked.includes(p.id)}
              onChange={(c) => setChecked((xs) => (c ? [...xs, p.id] : xs.filter((x) => x !== p.id)))}
              label={
                <>
                  {p.label} {p.required ? <Badge>Needed</Badge> : <Badge tone="info">Optional</Badge>}
                </>
              }
              description={p.description}
            />
          </li>
        ))}
      </ul>
      {showErr && missing.length > 0 && (
        <InlineAlert tone="danger" title="Tick the items marked Needed to continue">
          {missing.map((m) => m.label).join(', ')}.
        </InlineAlert>
      )}
      <p className="yx-consent__notice">
        <Icon icon={ShieldCheck} /> Read the full <a href="#">{noticeLabel}</a> · version {noticeVersion}
      </p>
      <div className="yx-consent__actions">
        <Button
          onClick={() => {
            setDeclined(true);
            onDecline?.();
          }}
        >
          {declineLabel}
        </Button>
        <Button
          variant="primary"
          onClick={() => {
            if (missing.length) return setShowErr(true);
            setAccepted(true);
            onAccept?.(checked);
          }}
        >
          {acceptLabel}
        </Button>
      </div>
    </section>
  );
}

/* ================================================================== */
/* QR code (visual only; deterministic pattern from the payload)       */
/* ================================================================== */

function hashBits(text: string, n: number): boolean[] {
  let h = 2166136261;
  const out: boolean[] = [];
  for (let i = 0; i < n; i++) {
    h ^= text.charCodeAt(i % Math.max(1, text.length)) + i;
    h = Math.imul(h, 16777619) >>> 0;
    out.push((h & 8) === 8);
  }
  return out;
}

/** Stand-in QR drawing for passes and verify links. Real codes are rendered by the server. */
export function QrCode({ value, size = 160, label }: { value: string; size?: number; label: string }) {
  const n = 25;
  const bits = useMemo(() => hashBits(value, n * n), [value]);
  const finder = (x: number, y: number) => {
    const inBox = (ox: number, oy: number) => x >= ox && x < ox + 7 && y >= oy && y < oy + 7;
    const ring = (ox: number, oy: number) => {
      const dx = x - ox;
      const dy = y - oy;
      return dx === 0 || dy === 0 || dx === 6 || dy === 6 || (dx >= 2 && dx <= 4 && dy >= 2 && dy <= 4);
    };
    if (inBox(0, 0)) return ring(0, 0) ? 1 : 0;
    if (inBox(n - 7, 0)) return ring(n - 7, 0) ? 1 : 0;
    if (inBox(0, n - 7)) return ring(0, n - 7) ? 1 : 0;
    return -1;
  };
  const cells: ReactNode[] = [];
  for (let y = 0; y < n; y++)
    for (let x = 0; x < n; x++) {
      const f = finder(x, y);
      const on = f === -1 ? bits[y * n + x] : f === 1;
      if (on) cells.push(<rect key={`${x}-${y}`} x={x} y={y} width={1} height={1} />);
    }
  return (
    <svg className="yx-qr" viewBox={`-2 -2 ${n + 4} ${n + 4}`} width={size} height={size} role="img" aria-label={label}>
      <rect className="yx-qr__bg" x={-2} y={-2} width={n + 4} height={n + 4} />
      <g className="yx-qr__fg">{cells}</g>
    </svg>
  );
}

/* ================================================================== */
/* Camera frame (placeholder; no real camera in stories)               */
/* ================================================================== */

export type CameraState = 'idle' | 'live' | 'captured' | 'blurry' | 'blocked' | 'mismatch';

const CAMERA_TEXT: Record<CameraState, string> = {
  idle: 'Camera is off. Select Start camera when you are ready.',
  live: 'Camera on. Keep your face inside the oval, in good light.',
  captured: 'Photo taken. Check it is clear, then continue.',
  blurry: 'The photo is blurry. Hold still and take it again.',
  blocked: 'Camera access is blocked. Allow the camera in your browser settings, or upload a photo instead.',
  mismatch: "The selfie didn't match the ID photo. You can try once more or ask for a manual check.",
};

export function CameraFrame({ state, subject = 'face', label }: { state: CameraState; subject?: 'face' | 'id-card'; label: string }) {
  const tone = state === 'blocked' || state === 'mismatch' ? 'danger' : state === 'blurry' ? 'warning' : state === 'captured' ? 'success' : 'neutral';
  return (
    <figure className="yx-camera" data-state={state} aria-label={label}>
      <svg className="yx-camera__view" viewBox="0 0 320 200" role="img" aria-label={`${label}: ${CAMERA_TEXT[state]}`}>
        <rect className="yx-camera__bg" x="0" y="0" width="320" height="200" />
        {subject === 'face' ? (
          <>
            <ellipse className="yx-camera__guide" cx="160" cy="100" rx="58" ry="76" />
            {state !== 'idle' && state !== 'blocked' && (
              <g className="yx-camera__person">
                <circle cx="160" cy="84" r="30" />
                <path d="M104 176c6-34 30-52 56-52s50 18 56 52z" />
              </g>
            )}
          </>
        ) : (
          <>
            <rect className="yx-camera__guide" x="56" y="40" width="208" height="128" rx="8" />
            {state !== 'idle' && state !== 'blocked' && (
              <g className="yx-camera__person">
                <rect x="72" y="62" width="56" height="70" rx="4" />
                <rect x="140" y="66" width="104" height="10" rx="2" />
                <rect x="140" y="86" width="84" height="10" rx="2" />
                <rect x="140" y="106" width="96" height="10" rx="2" />
              </g>
            )}
          </>
        )}
      </svg>
      <figcaption className="yx-camera__caption">
        <Badge tone={tone}>{state === 'live' ? 'Live' : state === 'captured' ? 'Captured' : state === 'idle' ? 'Off' : state === 'blocked' ? 'Blocked' : state === 'blurry' ? 'Retake' : 'No match'}</Badge>
        <span aria-live="polite">{CAMERA_TEXT[state]}</span>
      </figcaption>
      {(state === 'idle' || state === 'blocked') && (
        <span className="yx-camera__icon" aria-hidden="true">
          <Icon icon={Camera} size="md" />
        </span>
      )}
    </figure>
  );
}

/* ================================================================== */
/* Uptime bar (status page)                                            */
/* ================================================================== */

export interface UptimeDay {
  date: Date;
  status: ComponentStatus;
  note?: string;
}

/** One bar per day, coloured by status with a text title per bar; a legend and the % sit beside it. */
export function UptimeBar({ days, percent, label }: { days: UptimeDay[]; percent: number; label: string }) {
  return (
    <div className="yx-uptime">
      <svg className="yx-uptime__bars" viewBox={`0 0 ${days.length * 4} 24`} preserveAspectRatio="none" role="img" aria-label={`${label}: ${percent}% uptime over ${days.length} days`}>
        {days.map((d, i) => (
          <rect key={i} x={i * 4} y={0} width={3} height={24} data-status={d.status}>
            <title>{`${formatDate(d.date)}: ${STATUS_LABEL[d.status]}${d.note ? ` · ${d.note}` : ''}`}</title>
          </rect>
        ))}
      </svg>
      <div className="yx-uptime__foot">
        <span>{days.length} days ago</span>
        <span>{percent}% uptime</span>
        <span>Today</span>
      </div>
    </div>
  );
}

export function StatusBadge({ status }: { status: ComponentStatus }) {
  const tone = status === 'operational' ? 'success' : status === 'maintenance' ? 'info' : status === 'degraded' ? 'warning' : 'danger';
  return <Badge tone={tone}>{STATUS_LABEL[status]}</Badge>;
}

/* ================================================================== */
/* Small layout helpers                                                */
/* ================================================================== */

/** Code sample block for the developer portal (mono, scrolls sideways, copy button). */
export function CodeBlock({ code, language }: { code: string; language: string }) {
  const [copied, setCopied] = useState(false);
  useEffect(() => {
    if (!copied) return;
    const t = setTimeout(() => setCopied(false), 2000);
    return () => clearTimeout(t);
  }, [copied]);
  return (
    <div className="yx-code">
      <div className="yx-code__head">
        <span>{language}</span>
        <Button
          size="sm"
          onClick={() => {
            navigator.clipboard?.writeText(code).catch(() => undefined);
            setCopied(true);
          }}
        >
          {copied ? 'Copied' : 'Copy'}
        </Button>
      </div>
      <pre className="yx-code__body" tabIndex={0} role="region" aria-label={`${language} code sample`}>
        <code>{code}</code>
      </pre>
    </div>
  );
}

/** Numbered step list for simple portal flows (not a full Stepper). */
export function StepDots({ steps, current }: { steps: string[]; current: number }) {
  return (
    <ol className="yx-stepdots" aria-label="Progress">
      {steps.map((s, i) => (
        <li key={s} data-state={i < current ? 'done' : i === current ? 'current' : 'todo'} aria-current={i === current ? 'step' : undefined}>
          <span className="yx-stepdots__n">{i < current ? <Icon icon={CheckCircle2} /> : i + 1}</span>
          <span>{s}</span>
        </li>
      ))}
    </ol>
  );
}

/** A labelled key figure for portal and console summaries (not a drillable KPI; use StatCard for those). */
export function Fact({ label, value, tone }: { label: string; value: ReactNode; tone?: 'danger' | 'warning' | 'success' }) {
  return (
    <div className="yx-fact" data-tone={tone}>
      <span className="yx-fact__label">{label}</span>
      <span className="yx-fact__value">{value}</span>
    </div>
  );
}

export function FactRow({ children, label }: { children: ReactNode; label?: string }) {
  return (
    <div className="yx-factrow" role="group" aria-label={label}>
      {children}
    </div>
  );
}

/** Two-column page body (main + aside) that stacks on phones. */
export function Split({ main, aside, className }: { main: ReactNode; aside: ReactNode; className?: string }) {
  return (
    <div className={cx('yx-split', className)}>
      <div className="yx-split__main">{main}</div>
      <aside className="yx-split__aside">{aside}</aside>
    </div>
  );
}

/** Warning line used where the docs name a hard block (e.g. "blocked after day 30"). */
export function BlockNote({ children }: { children: ReactNode }) {
  return (
    <p className="yx-blocknote">
      <Icon icon={TriangleAlert} /> {children}
    </p>
  );
}

