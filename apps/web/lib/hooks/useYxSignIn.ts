'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import type { CompanyOption, SignInFields, SignInStep, SsoProviderOption } from '@yukthix/ui/auth';
import { apiFetch } from '../api-client';
import { goTo } from '../navigate';
import { botChallengeToken } from '../bot-challenge';
import { useAuth, YX_SSO_RETURN_KEY } from '../auth-context';
import { decodeJwtPayload } from '../jwt';
import { roleToLandingPath } from '../staff-routing';
import type { MfaProof } from '../../components/auth/SecondFactorForm';
import type { MfaChallenge } from './useStaffLogin';

type Company = Omit<CompanyOption, 'id'>;
interface SignedIn {
  accessToken: string;
  mfa?: { required: boolean; enrolmentDueAt: string };
}
type Outcome = SignedIn | MfaChallenge | { selectionRequired: true; selectionToken: string; companies: CompanyOption[] };

const post = (path: string, body: object) => apiFetch(path, { method: 'POST', body: JSON.stringify(body) });
const message = (err: unknown, fallback: string) => (err instanceof Error && err.message ? err.message : fallback);

// YukthiX sign-in without a company code (founder decision 7 Oct 2026). The API decides the company:
// the web address, the company this device signed in to last (an HttpOnly cookie it reads itself),
// or the credential (email-first, with a company choice when it opens several).
export function useYxSignIn() {
  const router = useRouter();
  const { login } = useAuth();
  const [step, setStep] = useState<SignInStep>('identify');
  const [fields, setFields] = useState<SignInFields>({ identifier: '', password: '', code: '' });
  const [company, setCompany] = useState<Company | null>(null);
  const [providers, setProviders] = useState<SsoProviderOption[]>([]);
  const [companies, setCompanies] = useState<CompanyOption[]>([]);
  const [selectionToken, setSelectionToken] = useState<string | null>(null);
  const [otpToken, setOtpToken] = useState<string | null>(null);
  const [challenge, setChallenge] = useState<MfaChallenge | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const identifier = fields.identifier.trim();

  useEffect(() => {
    apiFetch('/auth/remembered-company')
      .then((r) => setCompany(r?.company ?? null))
      .catch(() => setCompany(null));
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

  function finish(result: SignedIn) {
    login('', result.accessToken);
    const role = decodeJwtPayload(result.accessToken)?.role as string | undefined;
    router.push(result.mfa?.required ? '/yx/setup-mfa' : roleToLandingPath(role));
  }

  function settle(outcome: Outcome) {
    if ('mfaRequired' in outcome) return setChallenge(outcome);
    if ('selectionRequired' in outcome) {
      setSelectionToken(outcome.selectionToken);
      setCompanies(outcome.companies);
      return setStep('choose-company');
    }
    finish(outcome);
  }

  const goToIdp = (url: string) => {
    window.sessionStorage.setItem(YX_SSO_RETURN_KEY, '1');
    setStep('redirecting');
    goTo(url);
  };

  return {
    step,
    fields,
    company,
    providers,
    companies,
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
        settle(await post('/auth/staff/login', { identifier, password: fields.password, ...(challengeToken ? { challengeToken } : {}) }));
      }),

    sendCode: (channel?: 'sms' | 'whatsapp') =>
      run('Could not send a code', async () => {
        const challengeToken = await botChallengeToken();
        const sent = await post('/auth/otp/start', { identifier, ...(channel ? { channel } : {}), ...(challengeToken ? { challengeToken } : {}) });
        setOtpToken(sent.otpToken);
        setFields((f) => ({ ...f, code: '' }));
        setStep('code');
      }),

    verifyCode: () =>
      run('Sign-in failed', async () => {
        settle(await post('/auth/otp/verify', { identifier, otpToken, code: fields.code.trim() }));
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

    forgetCompany: () =>
      run('Something went wrong. Try again.', async () => {
        await apiFetch('/auth/remembered-company', { method: 'DELETE' });
        setCompany(null);
        setProviders([]);
      }),

    restart: () => {
      setStep('identify');
      setFields((f) => ({ ...f, password: '', code: '' }));
      setSelectionToken(null);
      setOtpToken(null);
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
