'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { motion, MotionConfig } from 'framer-motion';
import { Eye, EyeOff, AlertCircle, Check } from 'lucide-react';
import { apiFetch } from '../../lib/api-client';
import { useAuth, SSO_PENDING_SLUG_KEY } from '../../lib/auth-context';
import { decodeJwtPayload } from '../../lib/jwt';
import { Button, Input } from '../../components/ui';
import { PrudentMark } from '../../components/PrudentMark';
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
      <main className="grid min-h-screen md:grid-cols-2">
        <div className="flex flex-col items-center justify-center bg-white px-6 py-8">
          <div className="w-full max-w-sm">
            <div className="mb-8 flex justify-center">
              {branding?.logoUrl ? (
                <div className="flex items-center gap-0">
                  <img src={branding.logoUrl} alt="Organization logo" className="max-h-20 object-contain" />
                  {branding?.name && (
                    <p className="-ml-6 text-center text-2xl font-medium tracking-tight text-brand-navy">{branding.name}</p>
                  )}
                </div>
              ) : (
                <div className="flex items-center gap-2.5">
                  <PrudentMark className="h-9 w-[4.9rem] text-brand-navy" />
                  <p className="text-2xl font-medium tracking-tight text-brand-navy">Prudent Hire</p>
                </div>
              )}
            </div>

            <div className="rounded-2xl border border-[#CDD8F0] bg-white p-7 shadow-[0_24px_72px_rgba(0,30,96,0.12)]">
              <h1 className="mb-6 text-center text-lg font-medium text-brand-navy">Staff Login</h1>

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
                    className="flex items-center justify-center rounded-lg bg-primary px-4 py-3 text-sm font-medium text-white transition-opacity hover:opacity-90"
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
                    <Button type="submit" loading={submitting} className="w-full rounded-lg py-3">
                      Log in
                    </Button>
                    <Link href="/forgot-password" className="text-sm font-medium text-primary hover:underline">
                      Forgot password?
                    </Link>
                  </>
                )}
              </form>
            </div>

            <p className="mt-6 text-center text-xs text-recruiter-text-tertiary">
              &copy; 2026 Prudent Consulting. All rights reserved.
            </p>
          </div>
        </div>

        <aside className="relative hidden overflow-hidden bg-brand-navy px-16 py-12 md:flex md:flex-col md:items-center md:justify-center md:gap-6">
          <div
            className="pointer-events-none absolute -right-24 -top-24 h-[420px] w-[420px] rounded-full"
            style={{ background: 'radial-gradient(circle, rgba(0,83,226,0.3) 0%, transparent 70%)' }}
            aria-hidden="true"
          />
          <PrudentMark className="pointer-events-none absolute -bottom-16 -left-16 h-64 w-[17.6rem] text-white/[0.05]" />
          <h2 className="relative max-w-md text-4xl font-medium leading-tight tracking-tight text-white">Automate early screens.</h2>
          <p className="relative max-w-md text-lg leading-relaxed text-white/60">
            Focus human judgment on what matters. Prudent Hire runs the first round end to end, so your panel only meets the
            candidates worth meeting.
          </p>
          <ul className="relative flex max-w-md flex-col gap-3">
            {HIGHLIGHTS.map((item) => (
              <li key={item} className="flex items-start gap-3 text-base text-white/70">
                <Check size={18} className="mt-1 shrink-0 text-brand-picton" />
                {item}
              </li>
            ))}
          </ul>
        </aside>
      </main>
    </MotionConfig>
  );
}
