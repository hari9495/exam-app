'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { apiFetch } from '../api-client';
import { useAuth, SSO_PENDING_SLUG_KEY } from '../auth-context';
import { decodeJwtPayload } from '../jwt';
import { useBranding } from './useBranding';
import { useDocumentBranding } from './useDocumentBranding';
import { roleToLandingPath } from '../staff-routing';
import type { MfaProof } from '../../components/auth/SecondFactorForm';

const API_BASE = process.env.NEXT_PUBLIC_API_BASE ?? 'http://localhost:3001/api/v1';

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

interface SignedIn {
  accessToken: string;
  // Set when this account must enrol a second factor (by enrolmentDueAt).
  mfa?: { required: boolean; enrolmentDueAt: string };
}

export function useStaffLogin() {
  const router = useRouter();
  const { login } = useAuth();
  const [organizationSlug, setOrganizationSlug] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [ssoEnabled, setSsoEnabled] = useState(false);
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
      setSsoEnabled(false);
      return;
    }
    let active = true;
    apiFetch(`/auth/saml/${debouncedSlug}/status`)
      .then((result) => {
        if (active) setSsoEnabled(Boolean(result.enabled));
      })
      .catch(() => {
        if (active) setSsoEnabled(false);
      });
    return () => {
      active = false;
    };
  }, [debouncedSlug]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      const result = await apiFetch('/auth/staff/login', {
        method: 'POST',
        body: JSON.stringify({
          organizationSlug: organizationSlug || undefined,
          email,
          password,
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
      const sent = await apiFetch('/auth/otp/start', {
        method: 'POST',
        body: JSON.stringify({ organizationSlug, identifier: identifier.trim(), ...(channel ? { channel } : {}) }),
      });
      setOtpSent({ otpToken: sent.otpToken, identifier: identifier.trim() });
      setOtpCode('');
      setSubmitting(false);
    } catch (err) {
      fail(err, 'Could not send a code');
    }
  }

  async function verifyOtp(e: React.FormEvent) {
    e.preventDefault();
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
    router.push(result.mfa?.required ? '/profile?mfa=setup' : roleToLandingPath(payload?.role as string | undefined));
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

  const ssoLoginHref = ssoEnabled
    ? `${API_BASE}/auth/saml/${organizationSlug}/login`
    : null;
  const onSsoClick = () => window.sessionStorage.setItem(SSO_PENDING_SLUG_KEY, organizationSlug);

  return {
    organizationSlug, setOrganizationSlug,
    email, setEmail,
    password, setPassword,
    error, submitting, ssoEnabled,
    branding,
    orgPrimary: branding?.primaryColor || '#3b5fe3',
    orgOnPrimary: branding?.textColor || '#ffffff',
    ssoLoginHref, onSsoClick,
    handleSubmit,
    challenge, verifySecondFactor, secondFactorPasskeyOptions, sendSecondFactorCode, cancelChallenge,
    otpMode, toggleOtpMode, identifier, setIdentifier, otpCode, setOtpCode, otpSent, sendOtp, verifyOtp,
  };
}
