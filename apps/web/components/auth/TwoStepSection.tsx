'use client';

import { FormEvent, useCallback, useEffect, useState } from 'react';
import QRCode from 'qrcode';
import { startRegistration } from '@simplewebauthn/browser';
import { apiFetch } from '../../lib/api-client';
import { useAuth } from '../../lib/auth-context';
import { Button, CollapsibleSection, Input } from '../ui';

interface Factor {
  id: string;
  type: 'passkey' | 'totp';
  label: string;
  createdAt: string;
  lastUsedAt: string | null;
}

interface MfaStatus {
  factors: Factor[];
  recoveryCodesRemaining: number;
  required: boolean;
  enrolmentDueAt: string;
  allowedFactors: string[];
}

const dateOf = (iso: string) => new Date(iso).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' });

// Me › Security › Two-step verification (P12 §7, YX-IAM-01/03/11): passkeys, an authenticator app,
// recovery codes. Removing a factor and new recovery codes are step-up actions; apiFetch prompts.
export function TwoStepSection() {
  const { accessToken } = useAuth();
  const token = accessToken ?? undefined;
  const [status, setStatus] = useState<MfaStatus | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [totpSetup, setTotpSetup] = useState<{ secret: string; qr: string } | null>(null);
  const [code, setCode] = useState('');
  const [recoveryCodes, setRecoveryCodes] = useState<string[] | null>(null);
  const [busy, setBusy] = useState(false);
  // Sign-in sends accounts that must enrol here with ?mfa=setup: announce the requirement.
  const [prompt, setPrompt] = useState(false);
  useEffect(() => setPrompt(new URLSearchParams(window.location.search).get('mfa') === 'setup'), []);

  const load = useCallback(() => apiFetch('/auth/mfa', {}, token).then(setStatus).catch((e: Error) => setError(e.message)), [token]);
  useEffect(() => {
    void load();
  }, [load]);

  async function run(step: () => Promise<void>) {
    setError(null);
    setBusy(true);
    try {
      await step();
      await load();
    } catch (err) {
      setError(err instanceof Error && err.name !== 'NotAllowedError' ? err.message : 'That did not work. Try again.');
    } finally {
      setBusy(false);
    }
  }

  const post = (path: string, body?: unknown) =>
    apiFetch(path, { method: 'POST', ...(body ? { body: JSON.stringify(body) } : {}) }, token);

  const addPasskey = () =>
    run(async () => {
      const credential = await startRegistration({ optionsJSON: await post('/auth/mfa/passkeys/registration-options') });
      const result = await post('/auth/mfa/passkeys', { credential, label: 'Passkey' });
      if (result.recoveryCodes) setRecoveryCodes(result.recoveryCodes);
    });

  const startTotp = () =>
    run(async () => {
      const { secret, otpauthUrl } = await post('/auth/mfa/totp/setup');
      setTotpSetup({ secret, qr: await QRCode.toDataURL(otpauthUrl, { margin: 1, width: 168 }) });
      setCode('');
    });

  const confirmTotp = (e: FormEvent) => {
    e.preventDefault();
    void run(async () => {
      const result = await post('/auth/mfa/totp/confirm', { code: code.trim() });
      setTotpSetup(null);
      if (result.recoveryCodes) setRecoveryCodes(result.recoveryCodes);
    });
  };

  const remove = (factor: Factor) =>
    run(async () => {
      await apiFetch(`/auth/mfa/authenticators/${factor.id}`, { method: 'DELETE' }, token);
    });

  const newCodes = () =>
    run(async () => {
      setRecoveryCodes((await post('/auth/mfa/recovery-codes')).recoveryCodes);
    });

  const allowed = status?.allowedFactors ?? [];
  const hasTotp = status?.factors.some((f) => f.type === 'totp');

  return (
    <CollapsibleSection title="Two-step verification">
      <div className="flex flex-col gap-4 sm:col-span-2">
        {status && status.required && status.factors.length === 0 && (
          <p role={prompt ? 'alert' : undefined} className="rounded-md border border-rule bg-ground px-3 py-2 text-sm">
            Your role needs two-step verification. Set it up by <span className="font-medium">{dateOf(status.enrolmentDueAt)}</span>
            {new Date(status.enrolmentDueAt) <= new Date() ? ' — sensitive actions are paused until you do.' : '.'}
          </p>
        )}

        {status?.factors.length ? (
          <ul className="flex flex-col divide-y divide-rule rounded-md border border-rule">
            {status.factors.map((f) => (
              <li key={f.id} className="flex items-center justify-between gap-3 px-3 py-2 text-sm">
                <span>
                  <span className="font-medium">{f.type === 'passkey' ? f.label : 'Authenticator app'}</span>
                  <span className="block text-xs text-muted">
                    Added {dateOf(f.createdAt)}
                    {f.lastUsedAt ? ` · last used ${dateOf(f.lastUsedAt)}` : ''}
                  </span>
                </span>
                <Button type="button" size="sm" variant="secondary" disabled={busy} onClick={() => remove(f)} aria-label={`Remove ${f.type === 'passkey' ? f.label : 'authenticator app'}`}>
                  Remove
                </Button>
              </li>
            ))}
          </ul>
        ) : (
          status && <p className="text-sm text-muted">No second factor yet. A passkey is the quickest and the hardest to phish.</p>
        )}

        {recoveryCodes && (
          <div className="rounded-md border border-rule bg-ground p-3">
            <p className="text-sm font-medium">Recovery codes</p>
            <p className="mb-2 text-xs text-muted">Each works once if you lose your phone or passkey. Save them somewhere safe: they are not shown again.</p>
            <ul className="grid grid-cols-2 gap-1 font-mono text-sm tabular-nums" aria-label="Recovery codes">
              {recoveryCodes.map((c) => (
                <li key={c}>{c}</li>
              ))}
            </ul>
            <div className="mt-2 flex gap-2">
              <Button type="button" size="sm" variant="secondary" onClick={() => void navigator.clipboard?.writeText(recoveryCodes.join('\n'))}>
                Copy
              </Button>
              <Button type="button" size="sm" onClick={() => setRecoveryCodes(null)}>
                I have saved them
              </Button>
            </div>
          </div>
        )}

        {totpSetup && (
          <form onSubmit={confirmTotp} className="flex flex-col gap-3 rounded-md border border-rule p-3">
            <p className="text-sm">Scan this with your authenticator app, then enter the 6-digit code it shows.</p>
            <img src={totpSetup.qr} alt="QR code for your authenticator app" width={168} height={168} />
            <p className="text-xs text-muted">
              Can&apos;t scan? Enter this key: <code className="font-mono">{totpSetup.secret}</code>
            </p>
            <Input label="6-digit code" value={code} onChange={setCode} inputMode="numeric" autoComplete="one-time-code" maxLength={6} required />
            <div className="flex gap-2">
              <Button type="submit" loading={busy}>Turn on</Button>
              <Button type="button" variant="secondary" onClick={() => setTotpSetup(null)}>Cancel</Button>
            </div>
          </form>
        )}

        {error && (
          <p role="alert" className="text-sm text-status-danger">
            {error}
          </p>
        )}

        {status && !totpSetup && (
          <div className="flex flex-wrap gap-2">
            {allowed.includes('passkey') && (
              <Button type="button" onClick={addPasskey} loading={busy}>
                Add a passkey
              </Button>
            )}
            {allowed.includes('totp') && !hasTotp && (
              <Button type="button" variant="secondary" onClick={startTotp} disabled={busy}>
                Use an authenticator app
              </Button>
            )}
            {status.factors.length > 0 && (
              <Button type="button" variant="secondary" onClick={newCodes} disabled={busy}>
                New recovery codes ({status.recoveryCodesRemaining} left)
              </Button>
            )}
          </div>
        )}
      </div>
    </CollapsibleSection>
  );
}
