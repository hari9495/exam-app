'use client';

import { FormEvent, useState } from 'react';
import { startAuthentication, type PublicKeyCredentialRequestOptionsJSON } from '@simplewebauthn/browser';
import { Button, Input } from '../ui';

// One second-factor proof (P12 YX-IAM-03), as the API's /auth/mfa/verify and /auth/mfa/step-up take it.
export type MfaProof = { factor: 'totp' | 'recovery_code'; code: string } | { factor: 'passkey'; credential: unknown };

// The second step of sign-in, and the step-up prompt: a passkey (preferred) or a code from the
// authenticator app, with a recovery code as the way out when neither is to hand.
export function SecondFactorForm({
  factors,
  getPasskeyOptions,
  submit,
}: {
  factors: string[];
  getPasskeyOptions: () => Promise<PublicKeyCredentialRequestOptionsJSON>;
  submit: (proof: MfaProof) => Promise<void>;
}) {
  const hasTotp = factors.includes('totp');
  const [mode, setMode] = useState<'totp' | 'recovery_code'>(hasTotp ? 'totp' : 'recovery_code');
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
          label={mode === 'totp' ? 'Code from your authenticator app' : 'Recovery code'}
          value={code}
          onChange={setCode}
          autoComplete="one-time-code"
          inputMode={mode === 'totp' ? 'numeric' : 'text'}
          maxLength={mode === 'totp' ? 6 : 40}
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
    </div>
  );
}
