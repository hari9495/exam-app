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
  const cancelChallenge = () => {
    setChallenge(null);
    setPassword('');
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
    challenge, verifySecondFactor, secondFactorPasskeyOptions, cancelChallenge,
  };
}
