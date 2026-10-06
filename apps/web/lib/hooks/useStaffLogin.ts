'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { apiFetch } from '../api-client';
import { botChallengeToken } from '../bot-challenge';
import { useAuth, SSO_PENDING_SLUG_KEY, YX_SSO_RETURN_KEY } from '../auth-context';
import { decodeJwtPayload } from '../jwt';
import { useBranding } from './useBranding';
import { useDocumentBranding } from './useDocumentBranding';
import { roleToLandingPath } from '../staff-routing';
import type { MfaProof } from '../../components/auth/SecondFactorForm';

export interface StaffLoginBranding {
  name?: string;
  logoUrl?: string;
  primaryColor?: string;
  textColor?: string;
  loginWatermarkEnabled?: boolean;
}

// The password was right and a second factor is owed (P12 YX-IAM-01); no session exists yet.
export interface MfaChallenge {
  mfaRequired: true;
  mfaToken: string;
  factors: string[];
}

export interface SsoProvider {
  id: string;
  name: string;
  type: 'saml' | 'oidc_google' | 'oidc_entra' | 'oidc_generic';
}

interface SignedIn {
  accessToken: string;
  // Set when this account must enrol a second factor (by enrolmentDueAt).
  mfa?: { required: boolean; enrolmentDueAt: string };
}

// enrolPath: where an account that must still set up a second step goes after signing in.
// yx: the YukthiX sign-in page, so the SSO callback finishes in the YukthiX screens too.
export function useStaffLogin({ enrolPath = '/profile?mfa=setup', yx = false }: { enrolPath?: string; yx?: boolean } = {}) {
  const router = useRouter();
  const { login } = useAuth();
  const [organizationSlug, setOrganizationSlug] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  // The company's active sign-in providers (P12 YX-IAM-04): one "Continue with ..." button each.
  const [ssoProviders, setSsoProviders] = useState<SsoProvider[]>([]);
  const [debouncedSlug, setDebouncedSlug] = useState('');
  const [challenge, setChallenge] = useState<MfaChallenge | null>(null);
  // Sign-in with a one-time code (P12 §3; M04 Q2): otpMode shows that form; otpSent holds the
  // token the API returned for the code just sent.
  const [otpMode, setOtpMode] = useState(false);
  const [identifier, setIdentifier] = useState('');
  const [otpCode, setOtpCode] = useState('');
  const [otpSent, setOtpSent] = useState<{ otpToken: string; identifier: string } | null>(null);

  const { data } = useBranding(debouncedSlug || null);
  const branding = data as StaffLoginBranding | undefined;
  useDocumentBranding(branding?.name, branding?.logoUrl);

  useEffect(() => {
    const handle = setTimeout(() => setDebouncedSlug(organizationSlug.trim()), 350);
    return () => clearTimeout(handle);
  }, [organizationSlug]);

  useEffect(() => {
    if (!debouncedSlug) {
      setSsoProviders([]);
      return;
    }
    let active = true;
    apiFetch(`/auth/sso/${encodeURIComponent(debouncedSlug)}/providers`)
      .then((result) => {
        if (active) setSsoProviders(Array.isArray(result) ? result : []);
      })
      .catch(() => {
        if (active) setSsoProviders([]);
      });
    return () => {
      active = false;
    };
  }, [debouncedSlug]);

  async function handleSubmit(e?: React.FormEvent) {
    e?.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      const challengeToken = await botChallengeToken();
      const result = await apiFetch('/auth/staff/login', {
        method: 'POST',
        body: JSON.stringify({
          organizationSlug: organizationSlug || undefined,
          email,
          password,
          ...(challengeToken ? { challengeToken } : {}),
        }),
      });
      if (result.mfaRequired) {
        setChallenge(result as MfaChallenge);
        setSubmitting(false);
        return;
      }
      finish(result as SignedIn);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Login failed');
      setSubmitting(false);
    }
  }

  const fail = (err: unknown, fallback: string) => {
    setError(err instanceof Error ? err.message : fallback);
    setSubmitting(false);
  };

  async function sendOtp(channel?: 'sms' | 'whatsapp') {
    setError(null);
    setSubmitting(true);
    try {
      const challengeToken = await botChallengeToken();
      const sent = await apiFetch('/auth/otp/start', {
        method: 'POST',
        body: JSON.stringify({ organizationSlug, identifier: identifier.trim(), ...(channel ? { channel } : {}), ...(challengeToken ? { challengeToken } : {}) }),
      });
      setOtpSent({ otpToken: sent.otpToken, identifier: identifier.trim() });
      setOtpCode('');
      setSubmitting(false);
    } catch (err) {
      fail(err, 'Could not send a code');
    }
  }

  async function verifyOtp(e?: React.FormEvent) {
    e?.preventDefault();
    if (!otpSent) return;
    setError(null);
    setSubmitting(true);
    try {
      const result = await apiFetch('/auth/otp/verify', {
        method: 'POST',
        body: JSON.stringify({ organizationSlug, identifier: otpSent.identifier, otpToken: otpSent.otpToken, code: otpCode.trim() }),
      });
      if (result.mfaRequired) {
        setChallenge(result as MfaChallenge);
        setSubmitting(false);
        return;
      }
      finish(result as SignedIn);
    } catch (err) {
      fail(err, 'Sign-in failed');
    }
  }

  // Back to "send a code" without leaving one-time-code mode.
  const resetOtp = () => {
    setOtpSent(null);
    setOtpCode('');
    setError(null);
  };

  const toggleOtpMode = () => {
    setOtpMode(!otpMode);
    setOtpSent(null);
    setOtpCode('');
    setError(null);
  };

  // Accounts that must enrol MFA are taken to set it up first (P12 §8: prompted at sign-in).
  function finish(result: SignedIn) {
    login(organizationSlug, result.accessToken);
    const payload = decodeJwtPayload(result.accessToken);
    router.push(result.mfa?.required ? enrolPath : roleToLandingPath(payload?.role as string | undefined));
  }

  const mfaPost = (path: string, body: object) =>
    apiFetch(path, { method: 'POST', body: JSON.stringify({ mfaToken: challenge?.mfaToken, ...body }) });
  const verifySecondFactor = async (proof: MfaProof) => finish(await mfaPost('/auth/mfa/verify', proof));
  const secondFactorPasskeyOptions = () => mfaPost('/auth/mfa/passkey-options', {});
  // The OTP fallback second factor (YX-IAM-03), offered only when the API lists 'otp'.
  const sendSecondFactorCode = async (channel: 'sms' | 'whatsapp') => {
    await mfaPost('/auth/mfa/otp/send', { channel });
  };
  const cancelChallenge = () => {
    setChallenge(null);
    setPassword('');
    setOtpSent(null);
    setOtpCode('');
  };

  // The API picks the provider (or the one owning the typed email's domain) and, for OIDC, binds
  // the sign-in to this browser before handing back the identity provider's URL.
  // No providerId: the API picks the provider that owns the email's domain.
  const startSso = async (providerId?: string) => {
    setError(null);
    setSubmitting(true);
    try {
      window.sessionStorage.setItem(SSO_PENDING_SLUG_KEY, organizationSlug);
      if (yx) window.sessionStorage.setItem(YX_SSO_RETURN_KEY, '1');
      else window.sessionStorage.removeItem(YX_SSO_RETURN_KEY);
      const { url } = await apiFetch('/auth/sso/start', {
        method: 'POST',
        body: JSON.stringify({ organizationSlug, providerId, ...(email.includes('@') ? { email } : {}) }),
      });
      window.location.assign(url);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Single sign-on is not available right now');
      setSubmitting(false);
    }
  };
  const ssoEnabled = ssoProviders.length > 0;

  return {
    organizationSlug, setOrganizationSlug,
    email, setEmail,
    password, setPassword,
    error, submitting, ssoEnabled,
    branding,
    orgPrimary: branding?.primaryColor || '#3b5fe3',
    orgOnPrimary: branding?.textColor || '#ffffff',
    ssoProviders, startSso,
    handleSubmit,
    challenge, verifySecondFactor, secondFactorPasskeyOptions, sendSecondFactorCode, cancelChallenge,
    otpMode, toggleOtpMode, resetOtp, identifier, setIdentifier, otpCode, setOtpCode, otpSent, sendOtp, verifyOtp,
  };
}
