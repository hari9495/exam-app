import { useState, type FormEvent, type ReactNode } from 'react';
import { Logo } from '../../components/brand';
import { Button } from '../../components/button';
import { Checkbox } from '../../components/choice';
import { InlineAlert } from '../../components/feedback';
import { FormField } from '../../components/field';
import { Heading, Text } from '../../components/foundations';
import { TextField } from '../../components/inputs';
import { Segment } from '../../components/segment';
import type { BadgeTone } from '../../components/display';
import type { LoginResult, MfaProof } from './types';

/* ---------- words ---------- */

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/** "6 Oct 2026, 10:14 AM" in the viewer's time zone (IST for every company today). */
export function when(iso: string): string {
  const d = new Date(iso);
  const h = d.getHours();
  const time = `${h % 12 || 12}:${String(d.getMinutes()).padStart(2, '0')} ${h < 12 ? 'AM' : 'PM'}`;
  return `${d.getDate()} ${MONTHS[d.getMonth()]} ${d.getFullYear()}, ${time}`;
}

export function day(iso: string): string {
  const d = new Date(iso);
  return `${d.getDate()} ${MONTHS[d.getMonth()]} ${d.getFullYear()}`;
}

/** "Chrome on Windows" from a user-agent string; display only, never used for a decision. */
export function deviceLabel(ua: string | null | undefined): string {
  if (!ua) return 'Unknown device';
  const browser = /Edg\//.test(ua) ? 'Edge' : /OPR\//.test(ua) ? 'Opera' : /Firefox\//.test(ua) ? 'Firefox' : /Chrome\//.test(ua) ? 'Chrome' : /Safari\//.test(ua) ? 'Safari' : null;
  const os = /Windows/.test(ua) ? 'Windows' : /Android/.test(ua) ? 'Android' : /iPhone|iPad/.test(ua) ? 'iOS' : /Mac OS X/.test(ua) ? 'macOS' : /Linux/.test(ua) ? 'Linux' : null;
  if (browser && os) return `${browser} on ${os}`;
  return browser ?? os ?? 'Unknown device';
}

const METHODS: Record<string, string> = {
  password: 'Password',
  saml: 'Single sign-on',
  oidc: 'Single sign-on',
  google: 'Google',
  microsoft: 'Microsoft',
  otp_email: 'Code by email',
  otp_sms: 'Code by SMS',
  otp_whatsapp: 'Code on WhatsApp',
  passkey: 'Passkey',
  totp: 'Authenticator app',
  recovery_code: 'Recovery code',
  otp: 'Code by text',
  admin: 'Admin',
};
export const methodLabel = (m: string) => METHODS[m] ?? m;

export const RESULTS: Record<LoginResult, { label: string; tone: BadgeTone }> = {
  success: { label: 'Signed in', tone: 'success' },
  failed: { label: 'Failed', tone: 'danger' },
  locked: { label: 'Blocked', tone: 'warning' },
  mfa_failed: { label: 'Wrong second step', tone: 'danger' },
  unlocked: { label: 'Unlocked by admin', tone: 'info' },
};

/** A thrown error as one sentence; a cancelled or timed-out passkey prompt is not the person's fault. */
export function errorText(err: unknown): string {
  if (err instanceof Error && (err.name === 'NotAllowedError' || err.name === 'AbortError')) {
    return 'The passkey prompt was closed or timed out. Try again.';
  }
  return err instanceof Error && err.message ? err.message : 'That did not work. Try again.';
}

/** Runs one async step with a busy flag and an error message. */
export function useStep() {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const run = async (step: () => Promise<unknown>) => {
    setError(null);
    setBusy(true);
    try {
      await step();
      return true;
    } catch (err) {
      setError(errorText(err));
      return false;
    } finally {
      setBusy(false);
    }
  };
  return { busy, error, setError, run };
}

/* ---------- sign-in frame ---------- */

/** Centred sign-in card: logo, one h1, the form. No side art; fits 390 px phones. */
export function AuthFrame({ title, subtitle, children, footer }: { title: string; subtitle?: ReactNode; children: ReactNode; footer?: ReactNode }) {
  return (
    <div className="yx-auth">
      <main className="yx-auth__card" aria-labelledby="yx-auth-title">
        <Logo size="lg" />
        <div className="yx-auth__head">
          <Heading level={1} id="yx-auth-title">{title}</Heading>
          {subtitle && <Text as="p" tone="secondary" className="yx-auth__sub">{subtitle}</Text>}
        </div>
        {children}
      </main>
      {footer && <div className="yx-auth__foot">{footer}</div>}
    </div>
  );
}

/* ---------- second factor (sign-in challenge and step-up) ---------- */

type CodeFactor = 'totp' | 'recovery_code' | 'otp';
type Choice = 'passkey' | CodeFactor;

const CHOICE_LABEL: Record<Choice, string> = { passkey: 'Passkey', totp: 'Authenticator app', otp: 'Text message', recovery_code: 'Recovery code' };
const CODE_LABEL: Record<CodeFactor, string> = { totp: '6-digit code from your authenticator app', otp: '6-digit code we sent to your phone', recovery_code: 'Recovery code' };

export interface SecondFactorPanelProps {
  /** Factor types the account holds, from the API ('passkey', 'totp', and 'otp' when a text code may be sent). */
  factors: string[];
  /** Runs the browser passkey prompt and returns the credential. */
  getPasskey: () => Promise<unknown>;
  submit: (proof: MfaProof) => Promise<void>;
  /** Sends a code by SMS or WhatsApp; omit where a text code is not allowed (step-up). */
  sendCode?: (channel: 'sms' | 'whatsapp') => Promise<void>;
}

/** Passkey first, then an authenticator code, a texted code where allowed, and a recovery code as the way out. */
export function SecondFactorPanel({ factors, getPasskey, submit, sendCode }: SecondFactorPanelProps) {
  const choices: Choice[] = [
    ...(factors.includes('passkey') ? (['passkey'] as const) : []),
    ...(factors.includes('totp') ? (['totp'] as const) : []),
    ...(sendCode && factors.includes('otp') ? (['otp'] as const) : []),
    'recovery_code' as const,
  ];
  const [choice, setChoice] = useState<Choice>(choices[0]);
  const [code, setCode] = useState('');
  const [sent, setSent] = useState<'sms' | 'whatsapp' | null>(null);
  const { busy, error, setError, run } = useStep();

  const pick = (c: Choice) => {
    setChoice(c);
    setCode('');
    setError(null);
  };
  const onSubmit = (e: FormEvent) => {
    e.preventDefault();
    if (choice === 'passkey') return void run(async () => submit({ factor: 'passkey', credential: await getPasskey() }));
    void run(() => submit({ factor: choice, code: code.trim() }));
  };
  const text = (channel: 'sms' | 'whatsapp') =>
    void run(async () => {
      await sendCode!(channel);
      setSent(channel);
    });

  return (
    <form className="yx-auth__form" onSubmit={onSubmit} noValidate>
      {choices.length > 1 && <Segment label="Confirm with" options={choices.map((c) => ({ value: c, label: CHOICE_LABEL[c] }))} value={choice} onChange={pick} />}
      {choice === 'passkey' ? (
        <Text as="p" tone="secondary">Use the fingerprint, face or screen lock on this device, or your security key.</Text>
      ) : (
        <>
          {choice === 'otp' && (
            <div className="yx-auth__row">
              <Button size="sm" loading={busy && !sent} onClick={() => text('sms')}>{sent ? 'Send a new code' : 'Text me a code'}</Button>
              <Button size="sm" onClick={() => text('whatsapp')} disabled={busy}>Send on WhatsApp</Button>
            </div>
          )}
          {choice === 'otp' && sent && <Text as="p" tone="secondary" role="status">We sent a code by {sent === 'sms' ? 'SMS' : 'WhatsApp'}. It expires in 5 minutes.</Text>}
          <FormField label={CODE_LABEL[choice]} required helper={choice === 'recovery_code' ? 'Each recovery code works once.' : undefined}>
            <TextField
              value={code}
              onChange={setCode}
              autoComplete="one-time-code"
              inputMode={choice === 'recovery_code' ? 'text' : 'numeric'}
              maxLength={choice === 'recovery_code' ? 40 : 6}
              spellCheck={false}
            />
          </FormField>
        </>
      )}
      {error && <InlineAlert tone="danger">{error}</InlineAlert>}
      <Button type="submit" variant="primary" fullWidth loading={busy} disabled={choice !== 'passkey' && !code.trim()}>
        {choice === 'passkey' ? 'Use my passkey' : 'Confirm'}
      </Button>
    </form>
  );
}

/* ---------- recovery codes (shown once) ---------- */

/** The new recovery codes, shown once. Continue stays disabled until the person says they saved them. */
export function RecoveryCodes({ codes, onDone, doneLabel = 'Done' }: { codes: string[]; onDone: () => void; doneLabel?: string }) {
  const [saved, setSaved] = useState(false);
  const [copied, setCopied] = useState(false);
  const copy = () => {
    void navigator.clipboard?.writeText(codes.join('\n')).then(() => setCopied(true));
  };
  return (
    <div className="yx-auth__codes">
      <InlineAlert tone="warning" title="Save these recovery codes now">
        Each code works once, if you lose your passkey or phone. We won't show them again.
      </InlineAlert>
      <ol className="yx-auth__code-list yx-mono" aria-label="Recovery codes">
        {codes.map((c) => (
          <li key={c}>{c}</li>
        ))}
      </ol>
      <div className="yx-auth__row">
        <Button size="sm" onClick={copy}>{copied ? 'Copied' : 'Copy codes'}</Button>
        {copied && <span className="yx-visually-hidden" role="status">Codes copied</span>}
      </div>
      <Checkbox checked={saved} onChange={setSaved} label="I have saved my recovery codes" />
      <Button variant="primary" disabled={!saved} onClick={onDone}>{doneLabel}</Button>
    </div>
  );
}
