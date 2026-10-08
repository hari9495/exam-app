'use client';

import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import type { CompanyOption, MfaProof, SignInFields, SignInOptions, SignInStep, SocialProvider, SsoProviderOption } from '@yukthix/ui/auth';
import { apiFetch } from '../api-client';
import { goTo } from '../navigate';
import { botChallengeToken } from '../bot-challenge';
import { useAuth } from '../auth-context';
import { decodeJwtPayload } from '../jwt';
import { yxLandingPath } from '../yx-landing';
import { keepNextForRoundTrip, takeNext } from '../safe-next';
import { yxAuthMessage, yxProofError } from '../yx-auth-messages';
import { WebAuthnAbortService, browserSupportsWebAuthn, browserSupportsWebAuthnAutofill } from '@simplewebauthn/browser';
import { passkeySignInAssertion } from '../yx-security';

// The first step was right and a second factor is owed (P12 YX-IAM-01); no session exists yet.
export interface MfaChallenge {
  mfaRequired: true;
  mfaToken: string;
  factors: string[];
}

type Company = Omit<CompanyOption, 'id'>;
interface SignedIn {
  accessToken: string;
  mfa?: { required: boolean; enrolmentDueAt: string };
}
type Outcome = SignedIn | MfaChallenge | { selectionRequired: true; selectionToken: string; companies: CompanyOption[] };

const post = (path: string, body: object) => apiFetch(path, { method: 'POST', body: JSON.stringify(body) });
// The API's words, in YukthiX's plain voice (lib/yx-auth-messages).
export const message = yxAuthMessage;
// "Continue with ..." buttons: retried with backoff for about a minute (2 + 4 + 8 + 16 + 30 s) before
// the screen says it could not load them.
export const OPTIONS_RETRY_MS = [2000, 4000, 8000, 16000, 30000];
// Google / Microsoft codes already traded in this tab: each is single-use, so a second exchange
// (a remount, React Strict Mode) could only fail and be logged as a failed sign-in.
const redeemedSocialCodes = new Set<string>();
const PROVIDER_NAME: Record<SocialProvider, string> = { google: 'Google', microsoft: 'Microsoft' };
// The same words whatever the reason (no account, address not verified, method off ...): nothing to enumerate.
export const SOCIAL_FAILED = "We couldn't sign you in with that account. Try another way, or ask your admin.";
/** Under the API's 5-minute passkey challenge (mfa.service CHALLENGE_TTL_SECONDS). */
const AUTOFILL_RENEW_MS = 4 * 60 * 1000;
export const PASSKEY_FAILED = "We couldn't sign you in with that passkey. Try another way, or ask your admin.";
// The person closed the passkey prompt, or another ceremony replaced it: not an error to show.
const isCancelled = (err: unknown) => err instanceof Error && (err.name === 'NotAllowedError' || err.name === 'AbortError');

// YukthiX sign-in without a company code (founder decision 7 Oct 2026). The API decides the company:
// the web address, the company this device signed in to last (an HttpOnly cookie it reads itself),
// or the credential (email-first, with a company choice when it opens several). Besides the work
// email: a mobile number, and Google / Microsoft -- only those the API says are on.
export function useYxSignIn() {
  const router = useRouter();
  const { login } = useAuth();
  const [step, setStep] = useState<SignInStep>('identify');
  const [fields, setFields] = useState<SignInFields>({ identifier: '', mobile: '', password: '', code: '' });
  const [company, setCompany] = useState<Company | null>(null);
  const [options, setOptions] = useState<SignInOptions | undefined>(undefined);
  const [optionsFailed, setOptionsFailed] = useState(false);
  const mounted = useRef(true);
  const [providers, setProviders] = useState<SsoProviderOption[]>([]);
  const [companies, setCompanies] = useState<CompanyOption[]>([]);
  const [selectionToken, setSelectionToken] = useState<string | null>(null);
  const [otpToken, setOtpToken] = useState<string | null>(null);
  const [codeChannel, setCodeChannel] = useState<'sms' | 'whatsapp' | undefined>(undefined);
  const [redirectingTo, setRedirectingTo] = useState<string | undefined>(undefined);
  const [challenge, setChallenge] = useState<MfaChallenge | null>(null);
  // This browser can use passkeys (decides whether "Sign in with a passkey" is shown); re-arms the autofill request.
  const [passkeyCapable, setPasskeyCapable] = useState(false);
  const [autofillRound, setAutofillRound] = useState(0);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const identifier = fields.identifier.trim();
  const mobile = fields.mobile.trim();
  // Codes go to the mobile number on the mobile steps, else to the work email.
  const codeTo = step === 'mobile' || step === 'mobile-code' ? mobile : identifier;

  // A busy moment (429) or a blip must not leave the screen without its "Continue with …" buttons:
  // keep trying for about a minute, then say so (with "Try again") instead of hiding them.
  const loadOptions = (attempt = 0): Promise<void> =>
    apiFetch('/auth/sign-in-options')
      .then((o) => {
        setOptions(o ?? undefined);
        setOptionsFailed(false);
      })
      .catch(() => {
        const wait = OPTIONS_RETRY_MS[attempt];
        if (wait === undefined || !mounted.current) return setOptionsFailed(true);
        return new Promise<void>((r) => setTimeout(r, wait)).then(() => (mounted.current ? loadOptions(attempt + 1) : undefined));
      });

  useEffect(() => {
    mounted.current = true;
    apiFetch('/auth/remembered-company')
      .then((r) => setCompany(r?.company ?? null))
      .catch(() => setCompany(null));
    void loadOptions();
    return () => {
      mounted.current = false;
    };
  }, []);

  const run = async (fallback: string, task: () => Promise<void>, onError?: () => void) => {
    setError(null);
    setBusy(true);
    try {
      await task();
    } catch (err) {
      setError(message(err, fallback));
      onError?.();
    } finally {
      setBusy(false);
    }
  };

  // Back to a validated same-site `next` (the page whose session ran out, or an old /login?next= link;
  // kept across a Google / Microsoft / company sign-in round trip); else YukthiX, unless the person
  // holds exam/ATS permissions (then their role's console, as before).
  async function finish(result: SignedIn) {
    login('', result.accessToken);
    const next = takeNext();
    if (result.mfa?.required) return router.push(next ? `/yx/setup-mfa?next=${encodeURIComponent(next)}` : '/yx/setup-mfa');
    const role = decodeJwtPayload(result.accessToken)?.role as string | undefined;
    router.push(next ?? (await yxLandingPath(result.accessToken, role)));
  }

  async function settle(outcome: Outcome) {
    if ('mfaRequired' in outcome) return setChallenge(outcome);
    if ('selectionRequired' in outcome) {
      setSelectionToken(outcome.selectionToken);
      setCompanies(outcome.companies);
      return setStep('choose-company');
    }
    await finish(outcome);
  }

  const goToIdp = (url: string, to?: string) => {
    keepNextForRoundTrip();
    setRedirectingTo(to);
    setStep('redirecting');
    goTo(url);
  };

  const restart = () => {
    setStep('identify');
    setFields((f) => ({ ...f, password: '', code: '' }));
    setSelectionToken(null);
    setOtpToken(null);
    setCodeChannel(undefined);
    setRedirectingTo(undefined);
  };

  // "Sign in with a passkey" (founder decision 7 Oct 2026): the passkey is the whole sign-in (AAL2),
  // so it lands where any finished sign-in does.
  async function finishPasskey(credential: unknown) {
    setError(null);
    setBusy(true);
    try {
      await settle(await post('/auth/passkey/verify', { credential }));
    } finally {
      setBusy(false);
    }
  }

  useEffect(() => {
    setPasskeyCapable(browserSupportsWebAuthn());
  }, []);

  // On the first screen, where the company allows passkeys, the work-email field's autofill offers
  // this site's passkeys too (WebAuthn conditional mediation). Silent until the person picks one;
  // cancelled when the screen moves on or the button starts its own prompt, re-armed after that.
  useEffect(() => {
    if (step !== 'identify' || !options?.passkey) return;
    let live = true;
    // The server's challenge lasts 5 minutes but the autofill waits for ever: re-arm it before the challenge lapses.
    const renew = setTimeout(() => setAutofillRound((n) => n + 1), AUTOFILL_RENEW_MS);
    void browserSupportsWebAuthnAutofill().then(async (ok) => {
      if (!ok || !live) return;
      let credential: unknown;
      try {
        credential = await passkeySignInAssertion(true);
      } catch {
        return; // not offered, closed, or replaced by the button's prompt: nothing to say
      }
      if (live) await finishPasskey(credential).catch((err) => setError(message(err, PASSKEY_FAILED)));
    });
    return () => {
      live = false;
      clearTimeout(renew);
      WebAuthnAbortService.cancelCeremony();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [step, options?.passkey, autofillRound]);

  return {
    step,
    fields,
    company,
    options,
    optionsFailed,
    retryOptions: () => {
      setOptionsFailed(false);
      void loadOptions();
    },
    providers,
    companies,
    codeChannel,
    redirectingTo,
    busy,
    error,
    challenge,
    setField: (field: keyof SignInFields, value: string) => setFields((f) => ({ ...f, [field]: value })),

    identify: () =>
      run('Something went wrong. Try again.', async () => {
        const next = await post('/auth/identify', { identifier });
        if (next.next === 'sso') return goToIdp(next.url);
        setProviders(next.providers ?? []);
        setStep('password');
      }),

    signIn: () =>
      run('Sign-in failed', async () => {
        const challengeToken = await botChallengeToken();
        await settle(await post('/auth/staff/login', { identifier, password: fields.password, ...(challengeToken ? { challengeToken } : {}) }));
      }),

    // "Sign in with a passkey": shown where this browser can and the company allows it (options.passkey).
    passkeyCapable,
    passkey: () =>
      run(PASSKEY_FAILED, async () => {
        let credential: unknown;
        try {
          credential = await passkeySignInAssertion(false);
        } catch (err) {
          setAutofillRound((n) => n + 1); // offer passkeys in the autofill again
          if (!isCancelled(err)) throw err;
          return; // the person closed the prompt: not an error
        }
        await finishPasskey(credential).catch((err) => {
          setAutofillRound((n) => n + 1);
          throw err;
        });
      }),

    // "Continue with mobile": the number, then a code by SMS or WhatsApp.
    startMobile: () => {
      setError(null);
      setFields((f) => ({ ...f, code: '' }));
      setStep('mobile');
    },

    sendCode: (channel?: 'sms' | 'whatsapp') =>
      run('Could not send a code', async () => {
        const challengeToken = await botChallengeToken();
        const to = channel ? mobile : identifier;
        const sent = await post('/auth/otp/start', { identifier: to, ...(channel ? { channel } : {}), ...(challengeToken ? { challengeToken } : {}) });
        setOtpToken(sent.otpToken);
        setCodeChannel(channel);
        setFields((f) => ({ ...f, code: '' }));
        setStep(channel ? 'mobile-code' : 'code');
      }),

    verifyCode: () =>
      run('Sign-in failed', async () => {
        await settle(await post('/auth/otp/verify', { identifier: codeTo, otpToken, code: fields.code.trim() }));
      }),

    // The choice is single-use: if it fails (expired, another device), the person signs in again.
    pickCompany: (organizationId: string) =>
      run('Sign-in failed', async () => settle(await post('/auth/staff/select-company', { selectionToken, organizationId })), () => {
        setSelectionToken(null);
        setFields((f) => ({ ...f, password: '', code: '' }));
        setStep('identify');
      }),

    sso: (providerId: string) =>
      run('Single sign-on is not available right now', async () => {
        const { url } = await post('/auth/sso/start', { providerId, ...(identifier.includes('@') ? { email: identifier } : {}) });
        goToIdp(url);
      }),

    // "Continue with Google / Microsoft": to the provider; it comes back to /yx/sign-in/callback.
    social: (provider: SocialProvider) =>
      run(`Sign-in with ${PROVIDER_NAME[provider]} is not available right now`, async () => {
        const { url } = await post(`/auth/social/${provider}/start`, {});
        goToIdp(url, PROVIDER_NAME[provider]);
      }),

    // The callback page: trade the single-use code for the outcome (signed in, second step, or the
    // company picker); any failure is the same message and back to the start.
    redeemSocial: (code: string | null) => {
      if (code && redeemedSocialCodes.has(code)) return Promise.resolve();
      if (code) redeemedSocialCodes.add(code);
      setRedirectingTo(undefined);
      setStep('redirecting');
      return run(
        SOCIAL_FAILED,
        async () => {
          if (!code) throw new Error(SOCIAL_FAILED);
          try {
            await settle(await post('/auth/social/exchange', { code }));
          } catch {
            throw new Error(SOCIAL_FAILED);
          }
        },
        () => setStep('identify'),
      );
    },

    forgetCompany: () =>
      run('Something went wrong. Try again.', async () => {
        await apiFetch('/auth/remembered-company', { method: 'DELETE' });
        setCompany(null);
        setProviders([]);
        await loadOptions();
      }),

    restart: () => {
      restart();
      setError(null);
    },

    // Second step (P12 YX-IAM-01/03), for whichever account the first step opened.
    secondFactorPasskeyOptions: () => post('/auth/mfa/passkey-options', { mfaToken: challenge?.mfaToken }),
    verifySecondFactor: async (proof: MfaProof) => {
      let outcome: SignedIn;
      try {
        outcome = await post('/auth/mfa/verify', { mfaToken: challenge?.mfaToken, ...proof });
      } catch (err) {
        throw yxProofError(err, proof.factor);
      }
      await finish(outcome);
    },
    sendSecondFactorCode: async (channel: 'sms' | 'whatsapp') => {
      await post('/auth/mfa/otp/send', { mfaToken: challenge?.mfaToken, channel }).catch((err) => {
        throw new Error(yxAuthMessage(err, 'Could not send a code'));
      });
    },
    cancelChallenge: () => {
      setChallenge(null);
      setStep('identify');
      setFields((f) => ({ ...f, password: '', code: '' }));
    },
  };
}
