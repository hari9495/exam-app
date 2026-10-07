import { useState, type FormEvent } from 'react';
import { Button, Link } from '../../components/button';
import { InlineAlert } from '../../components/feedback';
import { FormField } from '../../components/field';
import { Text } from '../../components/foundations';
import { TextField } from '../../components/inputs';
import { Dialog } from '../../components/overlay';
import { MethodCards } from '../../components/choice';
import { Check, Copy } from 'lucide-react';
import { Spinner } from '../../components/foundations';
import { AuthFrame, RecoveryCodes, SecondFactorPanel, day, setupMethodOptions, useStep, type SecondFactorPanelProps, type SetupMethod } from './kit';

/* ---------- sign-in challenge ---------- */

export interface MfaChallengeScreenProps extends SecondFactorPanelProps {
  onStartAgain: () => void;
}

/** "Confirm it's you" after the password (YX-IAM-01/03); nothing is issued until this succeeds. */
export function MfaChallengeScreen({ onStartAgain, ...panel }: MfaChallengeScreenProps) {
  return (
    <AuthFrame title="Confirm it's you" subtitle="One more step to sign in." footer={<Button size="sm" onClick={onStartAgain}>Start again</Button>}>
      <SecondFactorPanel {...panel} />
    </AuthFrame>
  );
}

/* ---------- step-up ---------- */

export interface StepUpDialogProps {
  open: boolean;
  onCancel: () => void;
  /** Factor types the account holds; null while loading. */
  factors: string[] | null;
  getPasskey: SecondFactorPanelProps['getPasskey'];
  submit: SecondFactorPanelProps['submit'];
  /** Where to set up a sign-in method when the account has none. */
  setupHref: string;
}

/**
 * Re-verification before a sensitive change (YX-IAM-02). A texted code never counts as a step-up,
 * so only passkey, authenticator and recovery code are offered.
 */
export function StepUpDialog({ open, onCancel, factors, getPasskey, submit, setupHref }: StepUpDialogProps) {
  return (
    <Dialog
      open={open}
      onOpenChange={(o) => !o && onCancel()}
      title="Confirm it's you"
      description="This change needs you to confirm it's you again. It stays confirmed for 15 minutes."
    >
      {factors === null ? (
        <Spinner label="Loading your sign-in methods" />
      ) : factors.length === 0 ? (
        <InlineAlert tone="warning" title="Secure your account first">
          This change needs a passkey or authenticator app. <Link href={setupHref}>Set one up in My security</Link>.
        </InlineAlert>
      ) : (
        <SecondFactorPanel factors={factors.filter((f) => f !== 'otp')} getPasskey={getPasskey} submit={submit} />
      )}
    </Dialog>
  );
}

/* ---------- first-login enrolment ---------- */

export interface TotpSetup {
  /** Base32 key for manual entry. */
  secret: string;
  /** QR code of the otpauth:// link, as an image URL. */
  qrDataUrl: string;
}

export interface MfaEnrolScreenProps {
  /** Factor types the company allows ('passkey', 'totp'). */
  allowedFactors: string[];
  /** Grace deadline; after it sensitive actions are blocked. */
  dueAt: string;
  /** Adds a passkey (browser prompt + save); returns the first recovery codes. */
  onAddPasskey: () => Promise<{ recoveryCodes?: string[] }>;
  onStartTotp: () => Promise<TotpSetup>;
  onConfirmTotp: (code: string) => Promise<{ recoveryCodes?: string[] }>;
  /** Continue to the app (after enrolment, or "Remind me later" during the grace period). */
  onContinue: () => void;
  /** Fixed "today" for stories and tests. */
  now?: Date;
}

/**
 * P12 §6.1 steps 2–3, "Secure your account": a card per sign-in method (passkey recommended);
 * picking one goes straight into it. Then the recovery codes, once.
 */
export function MfaEnrolScreen({ allowedFactors, dueAt, onAddPasskey, onStartTotp, onConfirmTotp, onContinue, now = new Date() }: MfaEnrolScreenProps) {
  const [totp, setTotp] = useState<TotpSetup | null>(null);
  const [pending, setPending] = useState<SetupMethod | null>(null);
  const [code, setCode] = useState('');
  const [codes, setCodes] = useState<string[] | null>(null);
  const { busy, error, setError, run } = useStep();
  const overdue = new Date(dueAt) <= now;

  const finish = (r: { recoveryCodes?: string[] }) => (r.recoveryCodes?.length ? setCodes(r.recoveryCodes) : onContinue());
  const confirm = (e: FormEvent) => {
    e.preventDefault();
    void run(async () => finish(await onConfirmTotp(code.trim())));
  };
  const pick = (method: SetupMethod) => {
    setPending(method);
    void run(async () => (method === 'passkey' ? finish(await onAddPasskey()) : setTotp(await onStartTotp()))).finally(() => setPending(null));
  };

  if (codes) {
    return (
      <AuthFrame title="Your account is secure" subtitle="Last step: keep a way back in.">
        <RecoveryCodes codes={codes} onDone={onContinue} doneLabel="Continue" />
      </AuthFrame>
    );
  }

  return (
    <AuthFrame
      title="Secure your account"
      subtitle={overdue ? 'Your role needs it before you can continue.' : `Your role needs it. Set it up by ${day(dueAt)}.`}
      footer={overdue ? undefined : <Button size="sm" onClick={onContinue}>Remind me later</Button>}
    >
      {totp ? (
        <TotpConfirm
          setup={totp}
          code={code}
          onCode={setCode}
          onSubmit={confirm}
          busy={busy}
          error={error}
          cancelLabel="Choose another way"
          onCancel={() => {
            setTotp(null);
            setCode('');
            setError(null);
          }}
        />
      ) : (
        <div className="yx-auth__form">
          <MethodCards aria-label="Ways to sign in" options={setupMethodOptions(allowedFactors)} onSelect={(m) => pick(m as SetupMethod)} busy={pending} />
          {error && <InlineAlert tone="danger">{error}</InlineAlert>}
        </div>
      )}
    </AuthFrame>
  );
}

/** The manual authenticator key, in groups of four, with a copy button. */
function SecretKey({ secret }: { secret: string }) {
  const [copied, setCopied] = useState(false);
  const copy = () => void navigator.clipboard?.writeText(secret).then(() => setCopied(true));
  return (
    <div className="yx-auth__keyrow">
      <span className="yx-mono yx-auth__key">{secret.match(/.{1,4}/g)?.join(' ')}</span>
      <Button size="sm" icon={copied ? Check : Copy} onClick={copy}>{copied ? 'Copied' : 'Copy key'}</Button>
    </div>
  );
}

/** QR code, the manual key and the first code. Shared by enrolment and My security. */
export function TotpConfirm({ setup, code, onCode, onSubmit, busy, error, onCancel, cancelLabel = 'Cancel' }: {
  setup: TotpSetup;
  code: string;
  onCode: (v: string) => void;
  onSubmit: (e: FormEvent) => void;
  busy: boolean;
  error: string | null;
  onCancel?: () => void;
  cancelLabel?: string;
}) {
  return (
    <form className="yx-auth__form" onSubmit={onSubmit} noValidate>
      <Text as="p">Scan this with your authenticator app, then enter the 6-digit code it shows.</Text>
      <img className="yx-auth__qr" src={setup.qrDataUrl} alt="QR code for your authenticator app" />
      <Text as="p" tone="secondary" size="sm">Can't scan it? Enter this key in the app instead:</Text>
      <SecretKey secret={setup.secret} />
      <FormField label="6-digit code" required>
        <TextField value={code} onChange={onCode} autoComplete="one-time-code" inputMode="numeric" maxLength={6} />
      </FormField>
      {error && <InlineAlert tone="danger">{error}</InlineAlert>}
      <div className="yx-auth__row">
        <Button type="submit" variant="primary" loading={busy} disabled={code.trim().length < 6}>Turn on</Button>
        {onCancel && <Button disabled={busy} onClick={onCancel}>{cancelLabel}</Button>}
      </div>
    </form>
  );
}
