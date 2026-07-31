'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { motion, MotionConfig } from 'framer-motion';
import { Eye, EyeOff, AlertCircle } from 'lucide-react';
import { apiFetch } from '../../lib/api-client';
import { useAuth, SSO_PENDING_SLUG_KEY } from '../../lib/auth-context';
import { decodeJwtPayload } from '../../lib/jwt';
import { Button, Input } from '../../components/ui';
import { AuthPageLayout } from '../../components/AuthPageLayout';
import { useBranding } from '../../lib/hooks/useBranding';
import { useDocumentBranding } from '../../lib/hooks/useDocumentBranding';

const HIGHLIGHTS = [
  'AI-drafted question banks your team reviews before they go out',
  'Proctored, timed exams with integrity signals on every attempt',
  'Panel-ready reports the moment a candidate submits',
];

export default function LoginPage() {
  const router = useRouter();
  const { login } = useAuth();
  const [organizationSlug, setOrganizationSlug] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [ssoEnabled, setSsoEnabled] = useState(false);
  // Debounce the slug so branding + SSO detection fire while the user types,
  // without hitting the API on every keystroke -- no blur/Tab needed.
  const [debouncedSlug, setDebouncedSlug] = useState('');
  const { data: branding } = useBranding(debouncedSlug || null);
  useDocumentBranding(branding?.name, branding?.logoUrl);

  useEffect(() => {
    const handle = setTimeout(() => setDebouncedSlug(organizationSlug.trim()), 350);
    return () => clearTimeout(handle);
  }, [organizationSlug]);

  // Auto-detect SSO for the typed org. Guarded against out-of-order responses so
  // a slow earlier request can't overwrite the answer for the current slug.
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
      router.push(
        payload?.role === 'super_admin'
          ? '/organizations'
          : payload?.role === 'org_admin'
            ? '/users'
            : payload?.role === 'panel'
              ? '/reports'
              : '/dashboard',
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Login failed');
      setSubmitting(false);
    }
  }

  return (
    <MotionConfig reducedMotion="user">
      <AuthPageLayout
        title="Staff Login"
        logoUrl={branding?.logoUrl}
        logoLabel={branding?.name}
        panelHeading="Automate early screens."
        panelCopy="Focus human judgment on what matters. Prudent Hire runs the first round end to end, so your panel only meets the candidates worth meeting."
        panelHighlights={HIGHLIGHTS}
      >
        {error && (
          <p
            role="alert"
            className="mb-4 flex items-center gap-2 rounded-md bg-status-danger-bg px-3 py-2 text-sm text-status-danger"
          >
            <AlertCircle size={16} className="shrink-0" />
            {error}
          </p>
        )}

        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
          <Input
            label="Organization Slug"
            value={organizationSlug}
            onChange={setOrganizationSlug}
          />
          {ssoEnabled ? (
            // SSO-enabled orgs are SSO-only: no password fallback is offered.
            <motion.a
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.3, ease: 'easeOut' }}
              href={`${process.env.NEXT_PUBLIC_API_BASE ?? 'http://localhost:3001/api/v1'}/auth/saml/${organizationSlug}/login`}
              onClick={() => window.sessionStorage.setItem(SSO_PENDING_SLUG_KEY, organizationSlug)}
              className="flex items-center justify-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-white transition-opacity hover:opacity-90"
            >
              Log in with SSO
            </motion.a>
          ) : (
            <>
              <Input label="Email" type="email" value={email} onChange={setEmail} required />
              <div className="relative">
                <Input
                  label="Password"
                  type={showPassword ? 'text' : 'password'}
                  value={password}
                  onChange={setPassword}
                  required
                />
                <button
                  type="button"
                  onClick={() => setShowPassword((prev) => !prev)}
                  aria-label={showPassword ? 'Hide characters' : 'Show characters'}
                  className="absolute bottom-2 right-3 text-recruiter-text-tertiary hover:text-recruiter-text"
                >
                  {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                </button>
              </div>
              <Button type="submit" loading={submitting} className="w-full">
                Log in
              </Button>
              <Link href="/forgot-password" className="text-sm font-medium text-primary hover:underline">
                Forgot password?
              </Link>
            </>
          )}
        </form>
      </AuthPageLayout>
    </MotionConfig>
  );
}
