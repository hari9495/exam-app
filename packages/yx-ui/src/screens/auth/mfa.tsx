import { useState, type FormEvent } from 'react';
import { Button, Link } from '../../components/button';
import { InlineAlert } from '../../components/feedback';
import { FormField } from '../../components/field';
import { Text } from '../../components/foundations';
import { TextField } from '../../components/inputs';
import { Dialog } from '../../components/overlay';
import { Segment } from '../../components/segment';
import { Spinner } from '../../components/foundations';
import { AuthFrame, RecoveryCodes, SecondFactorPanel, day, useStep, type SecondFactorPanelProps } from './kit';

/* ---------- sign-in challenge ---------- */

export interface MfaChallengeScreenProps extends SecondFactorPanelProps {
  onStartAgain: () => void;
}

/** Second step of sign-in (YX-IAM-01/03): the password was right; nothing is issued until this succeeds. */
export function MfaChallengeScreen({ onStartAgain, ...panel }: MfaChallengeScreenProps) {
  return (
    <AuthFrame title="Confirm it's you" subtitle="Your account uses two-step verification." footer={<Button size="sm" onClick={onStartAgain}>Start again</Button>}>
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
  /** Where to set up a second step when the account has none. */
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
      description="This change needs your second step again. It stays confirmed for 15 minutes."
    >
      {factors === null ? (
        <Spinner label="Loading your sign-in methods" />
      ) : factors.length === 0 ? (
        <InlineAlert tone="warning" title="Set up two-step verification first">
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

/** P12 §6.1 steps 2–3: set up a passkey (suggested) or an authenticator app, then see the recovery codes once. */
export function MfaEnrolScreen({ allowedFactors, dueAt, onAddPasskey, onStartTotp, onConfirmTotp, onContinue, now = new Date() }: MfaEnrolScreenProps) {
  const kinds = (['passkey', 'totp'] as const).filter((k) => allowedFactors.includes(k));
  const [kind, setKind] = useState<'passkey' | 'totp'>(kinds[0] ?? 'passkey');
  const [totp, setTotp] = useState<TotpSetup | null>(null);
  const [code, setCode] = useState('');
  const [codes, setCodes] = useState<string[] | null>(null);
  const { busy, error, setError, run } = useStep();
  const overdue = new Date(dueAt) <= now;

  const finish = (r: { recoveryCodes?: string[] }) => (r.recoveryCodes?.length ? setCodes(r.recoveryCodes) : onContinue());
  const confirm = (e: FormEvent) => {
    e.preventDefault();
    void run(async () => finish(await onConfirmTotp(code.trim())));
  };

  if (codes) {
    return (
      <AuthFrame title="Two-step verification is on" subtitle="Last step: keep a way back in.">
        <RecoveryCodes codes={codes} onDone={onContinue} doneLabel="Continue" />
      </AuthFrame>
    );
  }

  return (
    <AuthFrame
      title="Set up two-step verification"
      subtitle={overdue ? 'Your role needs it before you can continue.' : `Your role needs it. Set it up by ${day(dueAt)}.`}
      footer={overdue ? undefined : <Button size="sm" onClick={onContinue}>Remind me later</Button>}
    >
      <div className="yx-auth__form">
        {kinds.length > 1 && (
          <Segment
            label="Second step"
            options={kinds.map((k) => ({ value: k, label: k === 'passkey' ? 'Passkey (recommended)' : 'Authenticator app' }))}
            value={kind}
            onChange={(k) => {
              setKind(k);
              setError(null);
            }}
          />
        )}
        {kind === 'passkey' ? (
          <>
            <Text as="p" tone="secondary">A passkey uses this device's fingerprint, face or screen lock. It is the quickest and can't be phished.</Text>
            {error && <InlineAlert tone="danger">{error}</InlineAlert>}
            <Button variant="primary" fullWidth loading={busy} onClick={() => void run(async () => finish(await onAddPasskey()))}>Add a passkey</Button>
          </>
        ) : !totp ? (
          <>
            <Text as="p" tone="secondary">Use an authenticator app on your phone. It shows a new 6-digit code every 30 seconds.</Text>
            {error && <InlineAlert tone="danger">{error}</InlineAlert>}
            <Button variant="primary" fullWidth loading={busy} onClick={() => void run(async () => setTotp(await onStartTotp()))}>Show the QR code</Button>
          </>
        ) : (
          <TotpConfirm setup={totp} code={code} onCode={setCode} onSubmit={confirm} busy={busy} error={error} />
        )}
      </div>
    </AuthFrame>
  );
}

/** QR code, the manual key and the first code. Shared by enrolment and My security. */
export function TotpConfirm({ setup, code, onCode, onSubmit, busy, error, onCancel }: {
  setup: TotpSetup;
  code: string;
  onCode: (v: string) => void;
  onSubmit: (e: FormEvent) => void;
  busy: boolean;
  error: string | null;
  onCancel?: () => void;
}) {
  return (
    <form className="yx-auth__form" onSubmit={onSubmit} noValidate>
      <Text as="p">Scan this with your authenticator app, then enter the 6-digit code it shows.</Text>
      <img className="yx-auth__qr" src={setup.qrDataUrl} alt="QR code for your authenticator app" />
      <Text as="p" tone="secondary" size="sm">
        Can't scan it? Enter this key: <span className="yx-mono yx-auth__key">{setup.secret}</span>
      </Text>
      <FormField label="6-digit code" required>
        <TextField value={code} onChange={onCode} autoComplete="one-time-code" inputMode="numeric" maxLength={6} />
      </FormField>
      {error && <InlineAlert tone="danger">{error}</InlineAlert>}
      <div className="yx-auth__row">
        <Button type="submit" variant="primary" loading={busy} disabled={code.trim().length < 6}>Turn on</Button>
        {onCancel && <Button onClick={onCancel}>Cancel</Button>}
      </div>
    </form>
  );
}
