'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { Building2, Mail, Lock, Eye, EyeOff, AlertCircle } from 'lucide-react';
import { apiFetch } from '../../lib/api-client';
import { useAuth } from '../../lib/auth-context';
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
  const { data: branding } = useBranding(organizationSlug || null);

  const primaryColor = branding?.primaryColor ?? undefined;
  const accentColor = branding?.accentColor ?? undefined;

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
    <main className="grid md:min-h-screen md:grid-cols-2">
      <div
        className="relative hidden overflow-hidden md:flex md:flex-col md:items-start md:justify-center md:gap-4 md:px-16 md:py-12"
        style={{
          backgroundImage: `linear-gradient(135deg, ${primaryColor ?? 'var(--color-primary, #1a73e8)'}, ${accentColor ?? 'var(--color-accent, #fbbc04)'})`,
        }}
      >
        <div
          className="pointer-events-none absolute -right-24 -top-24 h-72 w-72 rounded-full bg-white/10"
          aria-hidden="true"
        />
        <div
          className="pointer-events-none absolute -bottom-32 -left-16 h-96 w-96 rounded-full bg-white/10"
          aria-hidden="true"
        />
        {branding?.logoUrl ? (
          <img src={branding.logoUrl} alt="Organization logo" className="relative z-10 max-h-14" />
        ) : (
          <p className="relative z-10 text-2xl font-bold text-white">Examination Platform</p>
        )}
        <p className="relative z-10 max-w-sm text-sm text-white/90">
          Sign in to manage exams, candidates, and results.
        </p>
      </div>

      <div className="flex flex-col items-center justify-center gap-4 bg-white px-6 py-12 md:hidden">
        {branding?.logoUrl ? (
          <img src={branding.logoUrl} alt="Organization logo" className="max-h-10" />
        ) : (
          <p className="text-lg font-bold text-primary">Examination Platform</p>
        )}
      </div>

      <div className="flex flex-1 items-center justify-center bg-white px-6 py-12">
        <div className="w-full max-w-sm">
          <h1 className="mb-6 text-xl font-semibold text-gray-900">Staff Login</h1>
          <form onSubmit={handleSubmit} className="flex flex-col gap-3">
            <Input
              label="Organization slug"
              value={organizationSlug}
              onChange={setOrganizationSlug}
              icon={<Building2 size={16} />}
            />
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
                className="absolute bottom-2 right-3 text-gray-400 hover:text-gray-600"
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
            {error && (
              <p role="alert" className="flex items-center gap-2 rounded-md bg-status-danger-bg px-3 py-2 text-sm text-status-danger">
                <AlertCircle size={16} />
                {error}
              </p>
            )}
          </form>
        </div>
      </div>
    </main>
  );
}
