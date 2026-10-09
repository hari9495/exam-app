'use client';

import { FormEvent, useState } from 'react';
import { startAuthentication, type PublicKeyCredentialRequestOptionsJSON } from '@simplewebauthn/browser';
import { Button, Input } from '../ui';

// One second-factor proof (P12 YX-IAM-03), as the API's /auth/mfa/verify and /auth/mfa/step-up take it.
export type MfaProof = { factor: 'totp' | 'recovery_code' | 'otp'; code: string } | { factor: 'passkey'; credential: unknown };

const LABELS = { totp: 'Code from your authenticator app', recovery_code: 'Recovery code', otp: 'Code we sent to your phone' } as const;

// The second step of sign-in, and the step-up prompt: a passkey (preferred) or a code from the
// authenticator app, with a recovery code as the way out when neither is to hand. At sign-in the
// API may also offer a code by text message ('otp', a fallback only); sendCode sends it.
export function SecondFactorForm({
  factors,
  getPasskeyOptions,
  submit,
  sendCode,
}: {
  factors: string[];
  getPasskeyOptions: () => Promise<PublicKeyCredentialRequestOptionsJSON>;
  submit: (proof: MfaProof) => Promise<void>;
  sendCode?: (channel: 'sms' | 'whatsapp') => Promise<void>;
}) {
  const hasTotp = factors.includes('totp');
  const canText = Boolean(sendCode) && factors.includes('otp');
  const [mode, setMode] = useState<'totp' | 'recovery_code' | 'otp'>(hasTotp ? 'totp' : 'recovery_code');
  const [code, setCode] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function run(step: () => Promise<void>) {
    setError(null);
    setBusy(true);
    try {
      await step();
    } catch (err) {
      setError(err instanceof Error && err.name !== 'NotAllowedError' ? err.message : 'That did not work. Try again.');
    } finally {
      setBusy(false);
    }
  }

  const usePasskey = () =>
    run(async () => {
      const credential = await startAuthentication({ optionsJSON: await getPasskeyOptions() });
      await submit({ factor: 'passkey', credential });
    });

  const textMe = (channel: 'sms' | 'whatsapp') =>
    run(async () => {
      await sendCode!(channel);
      setMode('otp');
      setCode('');
    });

  const onSubmit = (e: FormEvent) => {
    e.preventDefault();
    void run(() => submit({ factor: mode, code: code.trim() }));
  };

  return (
    <div className="flex flex-col gap-3">
      {factors.includes('passkey') && (
        <Button type="button" onClick={usePasskey} loading={busy}>
          Use your passkey
        </Button>
      )}
      <form onSubmit={onSubmit} className="flex flex-col gap-3">
        <Input
          label={LABELS[mode]}
          value={code}
          onChange={setCode}
          autoComplete="one-time-code"
          inputMode={mode === 'recovery_code' ? 'text' : 'numeric'}
          maxLength={mode === 'recovery_code' ? 40 : 6}
          required
        />
        {error && (
          <p role="alert" className="text-sm text-status-danger">
            {error}
          </p>
        )}
        <Button type="submit" variant={factors.includes('passkey') ? 'secondary' : 'primary'} loading={busy}>
          Verify
        </Button>
      </form>
      {hasTotp && (
        <button
          type="button"
          className="self-start text-sm text-primary hover:underline"
          onClick={() => {
            setMode(mode === 'totp' ? 'recovery_code' : 'totp');
            setCode('');
          }}
        >
          {mode === 'totp' ? 'Use a recovery code instead' : 'Use your authenticator app instead'}
        </button>
      )}
      {canText && (
        <div className="flex flex-wrap gap-x-4 gap-y-1 text-sm">
          <button type="button" className="text-primary hover:underline" disabled={busy} onClick={() => void textMe('sms')}>
            {mode === 'otp' ? 'Text me a new code' : 'Text me a code instead'}
          </button>
          <button type="button" className="text-primary hover:underline" disabled={busy} onClick={() => void textMe('whatsapp')}>
            Send it on WhatsApp
          </button>
        </div>
      )}
    </div>
  );
}
