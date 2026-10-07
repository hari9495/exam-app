'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import type { CompanyOption, SignInFields, SignInOptions, SignInStep, SocialProvider, SsoProviderOption } from '@yukthix/ui/auth';
import { apiFetch, YX_SESSION_KEY } from '../api-client';
import { goTo } from '../navigate';
import { botChallengeToken } from '../bot-challenge';
import { useAuth, YX_SSO_RETURN_KEY } from '../auth-context';
import { decodeJwtPayload } from '../jwt';
import { yxLandingPath } from '../yx-landing';
import type { MfaProof } from '../../components/auth/SecondFactorForm';
import type { MfaChallenge } from './useStaffLogin';

type Company = Omit<CompanyOption, 'id'>;
interface SignedIn {
  accessToken: string;
  mfa?: { required: boolean; enrolmentDueAt: string };
}
type Outcome = SignedIn | MfaChallenge | { selectionRequired: true; selectionToken: string; companies: CompanyOption[] };

const post = (path: string, body: object) => apiFetch(path, { method: 'POST', body: JSON.stringify(body) });
// The API's words, in YukthiX's plain voice (P12 still reveals nothing: same text for a wrong
// password and an unknown email).
const PLAIN: Record<string, string> = {
  'Invalid credentials': 'Wrong email or password. Try again.',
  'Too many sign-in attempts. Please wait and try again.': 'Too many tries. Wait a few minutes and try again.',
};
const message = (err: unknown, fallback: string) => {
  const text = err instanceof Error && err.message ? err.message : fallback;
  return PLAIN[text] ?? text;
};
const PROVIDER_NAME: Record<SocialProvider, string> = { google: 'Google', microsoft: 'Microsoft' };
// The same words whatever the reason (no account, address not verified, method off ...): nothing to enumerate.
export const SOCIAL_FAILED = "We couldn't sign you in with that account. Try another way, or ask your admin.";

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
  const [providers, setProviders] = useState<SsoProviderOption[]>([]);
  const [companies, setCompanies] = useState<CompanyOption[]>([]);
  const [selectionToken, setSelectionToken] = useState<string | null>(null);
  const [otpToken, setOtpToken] = useState<string | null>(null);
  const [codeChannel, setCodeChannel] = useState<'sms' | 'whatsapp' | undefined>(undefined);
  const [redirectingTo, setRedirectingTo] = useState<string | undefined>(undefined);
  const [challenge, setChallenge] = useState<MfaChallenge | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const identifier = fields.identifier.trim();
  const mobile = fields.mobile.trim();
  // Codes go to the mobile number on the mobile steps, else to the work email.
  const codeTo = step === 'mobile' || step === 'mobile-code' ? mobile : identifier;

  // A busy moment (429) or a blip must not leave the screen without its "Continue with …" buttons:
  // try again after 2 s, 5 s and 10 s before giving up.
  const loadOptions = (attempt = 0): Promise<void> =>
    apiFetch('/auth/sign-in-options')
      .then((o) => setOptions(o ?? undefined))
      .catch(() => {
        const wait = [2000, 5000, 10000][attempt];
        if (wait === undefined) return setOptions(undefined);
        return new Promise<void>((r) => setTimeout(r, wait)).then(() => loadOptions(attempt + 1));
      });

  useEffect(() => {
    apiFetch('/auth/remembered-company')
      .then((r) => setCompany(r?.company ?? null))
      .catch(() => setCompany(null));
    void loadOptions();
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

  // Lands in YukthiX unless the person holds exam/ATS permissions (then their role's console, as before).
  async function finish(result: SignedIn) {
    login('', result.accessToken);
    window.sessionStorage.setItem(YX_SESSION_KEY, '1');
    const role = decodeJwtPayload(result.accessToken)?.role as string | undefined;
    router.push(result.mfa?.required ? '/yx/setup-mfa' : await yxLandingPath(result.accessToken, role));
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
    if (!to) window.sessionStorage.setItem(YX_SSO_RETURN_KEY, '1');
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

  return {
    step,
    fields,
    company,
    options,
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
    verifySecondFactor: async (proof: MfaProof) => finish(await post('/auth/mfa/verify', { mfaToken: challenge?.mfaToken, ...proof })),
    sendSecondFactorCode: async (channel: 'sms' | 'whatsapp') => {
      await post('/auth/mfa/otp/send', { mfaToken: challenge?.mfaToken, channel });
    },
    cancelChallenge: () => {
      setChallenge(null);
      setStep('identify');
      setFields((f) => ({ ...f, password: '', code: '' }));
    },
  };
}
