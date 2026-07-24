'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { motion, MotionConfig } from 'framer-motion';
import { Building2, Mail, Lock, Eye, EyeOff, AlertCircle } from 'lucide-react';
import { apiFetch } from '../../lib/api-client';
import { useAuth, SSO_PENDING_SLUG_KEY } from '../../lib/auth-context';
import { decodeJwtPayload } from '../../lib/jwt';
import { Button, Input } from '../../components/ui';
import { useBranding } from '../../lib/hooks/useBranding';

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
  const [usePasswordInstead, setUsePasswordInstead] = useState(false);
  const { data: branding } = useBranding(organizationSlug || null);

  async function handleSlugBlur() {
    setUsePasswordInstead(false);
    if (!organizationSlug) {
      setSsoEnabled(false);
      return;
    }
    try {
      const result = await apiFetch(`/auth/saml/${organizationSlug}/status`);
      setSsoEnabled(result.enabled);
    } catch {
      setSsoEnabled(false);
    }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      const result = await apiFetch('/auth/staff/login', {
        method: 'POST',
        body: JSON.stringify({ organizationSlug: organizationSlug || undefined, email, password }),
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
      <main className="grid md:min-h-screen md:grid-cols-2">
        <div className="relative hidden flex-col items-center justify-center gap-6 border-r border-recruiter-border bg-white px-16 py-12 md:flex">
          {branding?.logoUrl ? (
            <img src={branding.logoUrl} alt="Organization logo" className="max-h-16" />
          ) : (
            <div className="flex items-center gap-4">
              <img src="/logo.png" alt="Prudent Hire" className="h-16 w-16 object-contain" />
              <p className="text-4xl font-bold tracking-tight text-recruiter-text">Prudent Hire</p>
            </div>
          )}
          <blockquote className="max-w-md border-l-2 border-primary pl-5">
            <p className="text-xl font-medium leading-relaxed text-recruiter-text">Automate early screens.</p>
            <p className="mt-1 text-base text-recruiter-text-secondary">Focus human judgment on what matters.</p>
          </blockquote>
        </div>

        <div className="flex flex-col items-center justify-center gap-3 bg-white px-6 py-12 md:hidden">
          {branding?.logoUrl ? (
            <img src={branding.logoUrl} alt="Organization logo" className="max-h-12" />
          ) : (
            <div className="flex items-center gap-3">
              <img src="/logo.png" alt="Prudent Hire" className="h-10 w-10 object-contain" />
              <p className="text-2xl font-bold tracking-tight text-recruiter-text">Prudent Hire</p>
            </div>
          )}
        </div>

        <div className="flex flex-1 items-center justify-center bg-white px-6 py-12">
          <motion.div
            className="w-full max-w-sm"
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.3, ease: 'easeOut' }}
          >
            <h1 className="mb-6 text-xl font-semibold text-recruiter-text">Staff Login</h1>
            <form onSubmit={handleSubmit} className="flex flex-col gap-3">
              <Input
                label="Organization slug"
                value={organizationSlug}
                onChange={setOrganizationSlug}
                onBlur={handleSlugBlur}
                icon={<Building2 size={16} />}
              />
              {ssoEnabled && !usePasswordInstead ? (
                <>
                  <motion.a
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.3, ease: 'easeOut' }}
                    href={`${process.env.NEXT_PUBLIC_API_BASE ?? 'http://localhost:3001/api/v1'}/auth/saml/${organizationSlug}/login`}
                    onClick={() => window.sessionStorage.setItem(SSO_PENDING_SLUG_KEY, organizationSlug)}
                    className="flex items-center justify-center rounded-md border border-recruiter-border py-2 text-sm font-medium text-recruiter-text hover:bg-recruiter-bg-subtle"
                  >
                    Log in with SSO
                  </motion.a>
                  <button
                    type="button"
                    onClick={() => setUsePasswordInstead(true)}
                    className="text-center text-sm font-medium text-primary hover:underline"
                  >
                    Log in with password instead
                  </button>
                </>
              ) : (
                <>
                  <Input label="Email" type="email" value={email} onChange={setEmail} required icon={<Mail size={16} />} />
                  <div className="relative">
                    <Input
                      label="Password"
                      type={showPassword ? 'text' : 'password'}
                      value={password}
                      onChange={setPassword}
                      required
                      icon={<Lock size={16} />}
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
                  <Link href="/forgot-password" className="text-right text-sm font-medium text-primary hover:underline">
                    Forgot password?
                  </Link>
                  <Button type="submit" loading={submitting}>
                    Log in
                  </Button>
                  {ssoEnabled && (
                    <button
                      type="button"
                      onClick={() => setUsePasswordInstead(false)}
                      className="text-center text-sm font-medium text-recruiter-text-secondary hover:underline"
                    >
                      Back to SSO login
                    </button>
                  )}
                </>
              )}
              {error && (
                <p role="alert" className="flex items-center gap-2 rounded-md bg-status-danger-bg px-3 py-2 text-sm text-status-danger">
                  <AlertCircle size={16} />
                  {error}
                </p>
              )}
            </form>
          </motion.div>
        </div>
      </main>
    </MotionConfig>
  );
}
