import { startAuthentication, startRegistration, type PublicKeyCredentialRequestOptionsJSON } from '@simplewebauthn/browser';
import QRCode from 'qrcode';
import { deviceLabel, type TotpSetup } from '@yukthix/ui/auth';
import { apiFetch } from './api-client';

// Browser and API glue for the YukthiX security screens (packages/yx-ui/src/screens/auth). The
// screens stay presentational; WebAuthn runs through @simplewebauthn/browser here.

export const post = (path: string, token?: string, body?: unknown) =>
  apiFetch(path, { method: 'POST', ...(body === undefined ? {} : { body: JSON.stringify(body) }) }, token);

/** Runs the browser passkey prompt for options the API issued (challenge kept server-side). */
export async function passkeyAssertion(getOptions: () => Promise<PublicKeyCredentialRequestOptionsJSON>) {
  return startAuthentication({ optionsJSON: await getOptions() });
}

/**
 * "Sign in with a passkey" (passwordless): a challenge for this device, then the browser's passkey
 * prompt -- or, with `autofill`, the work-email field's suggestions (conditional mediation; it waits
 * until the person picks one, and is cancelled when another ceremony starts).
 */
export async function passkeySignInAssertion(autofill = false, onPrompt?: () => void) {
  const optionsJSON: PublicKeyCredentialRequestOptionsJSON = await post('/auth/passkey/options');
  if (optionsJSON.rpId) lastRpId = optionsJSON.rpId;
  onPrompt?.(); // the browser is asked now (the options request above is not prompt time)
  return startAuthentication({ optionsJSON, useBrowserAutofill: autofill });
}

let lastRpId: string | undefined;

/**
 * The API does not know this passkey (it was deleted, or the account is gone): ask the browser's password manager to
 * remove it, so it is not offered again (WebAuthn signalUnknownCredential; browsers without it ignore this).
 */
export function forgetUnknownPasskey(credentialId: string): void {
  const signal = (globalThis.PublicKeyCredential as unknown as { signalUnknownCredential?: (o: { rpId: string; credentialId: string }) => Promise<void> } | undefined)?.signalUnknownCredential;
  const rpId = lastRpId ?? (typeof window === 'undefined' ? undefined : window.location.hostname);
  if (signal && rpId) void signal.call(globalThis.PublicKeyCredential, { rpId, credentialId }).catch(() => undefined);
}

/** Registers a passkey named after this browser; returns the first recovery codes when it is the first factor. */
export async function addPasskey(token?: string): Promise<{ recoveryCodes?: string[] }> {
  const credential = await startRegistration({ optionsJSON: await post('/auth/mfa/passkeys/registration-options', token) });
  const label = deviceLabel(typeof navigator === 'undefined' ? null : navigator.userAgent).slice(0, 64);
  return post('/auth/mfa/passkeys', token, { credential, label });
}

export async function startTotp(token?: string): Promise<TotpSetup> {
  const { secret, otpauthUrl } = await post('/auth/mfa/totp/setup', token);
  return { secret, qrDataUrl: await QRCode.toDataURL(otpauthUrl, { margin: 1, width: 176 }) };
}

export const confirmTotp = (code: string, token?: string): Promise<{ recoveryCodes?: string[] }> => post('/auth/mfa/totp/confirm', token, { code });

/** Query string from the defined values only. */
export function qs(params: Record<string, string | number | null | undefined>): string {
  const q = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) if (v !== null && v !== undefined && v !== '') q.set(k, String(v));
  const s = q.toString();
  return s ? `?${s}` : '';
}
