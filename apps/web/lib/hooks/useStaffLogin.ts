'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { apiFetch } from '../api-client';
import { useAuth, SSO_PENDING_SLUG_KEY } from '../auth-context';
import { decodeJwtPayload } from '../jwt';
import { useBranding } from './useBranding';
import { useDocumentBranding } from './useDocumentBranding';
import { roleToLandingPath } from '../staff-routing';

const API_BASE = process.env.NEXT_PUBLIC_API_BASE ?? 'http://localhost:3001/api/v1';

export interface StaffLoginBranding {
  name?: string;
  logoUrl?: string;
  primaryColor?: string;
  textColor?: string;
  loginWatermarkEnabled?: boolean;
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
      login(organizationSlug, result.accessToken);
      const payload = decodeJwtPayload(result.accessToken);
      router.push(roleToLandingPath(payload?.role as string | undefined));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Login failed');
      setSubmitting(false);
    }
  }

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
    orgPrimary: branding?.primaryColor || '#0053e2',
    orgOnPrimary: branding?.textColor || '#ffffff',
    ssoLoginHref, onSsoClick,
    handleSubmit,
  };
}
