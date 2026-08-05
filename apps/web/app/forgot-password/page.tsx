'use client';

import { useState } from 'react';
import Link from 'next/link';
import { motion, MotionConfig } from 'framer-motion';
import { Building2, Mail, AlertCircle } from 'lucide-react';
import { apiFetch } from '../../lib/api-client';
import { Button, Input } from '../../components/ui';
import { useBranding } from '../../lib/hooks/useBranding';
import { useDocumentBranding } from '../../lib/hooks/useDocumentBranding';

export default function ForgotPasswordPage() {
  const [organizationSlug, setOrganizationSlug] = useState('');
  const [email, setEmail] = useState('');
  const [submitted, setSubmitted] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const { data: branding } = useBranding(organizationSlug || null);
  useDocumentBranding(branding?.name, branding?.logoUrl);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      await apiFetch('/auth/forgot-password', {
        method: 'POST',
        body: JSON.stringify({ organizationSlug, email }),
      });
      setSubmitted(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong. Please try again.');
    } finally {
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
          <div className="w-full max-w-sm">
            <h1 className="mb-2 text-xl font-semibold text-recruiter-text">Forgot Password</h1>
            {submitted ? (
              <motion.div
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.3, ease: 'easeOut' }}
              >
                <p className="mb-6 text-sm text-recruiter-text-secondary">
                  If an account with that organization and email exists, we&apos;ve sent a reset link to that email.
                </p>
                <Link href="/login" className="text-sm font-medium text-primary hover:underline">
                  Back to login
                </Link>
              </motion.div>
            ) : (
              <motion.div
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.3, ease: 'easeOut' }}
              >
                <p className="mb-6 text-sm text-recruiter-text-secondary">
                  Enter your organization slug and email, and we&apos;ll send you a link to reset your password.
                </p>
                <form onSubmit={handleSubmit} className="flex flex-col gap-3">
                  <Input
                    label="Organization Slug"
                    value={organizationSlug}
                    onChange={setOrganizationSlug}
                    required
                    icon={<Building2 size={16} />}
                  />
                  <Input label="Email" type="email" value={email} onChange={setEmail} required icon={<Mail size={16} />} />
                  <Button type="submit" loading={submitting}>
                    Send reset link
                  </Button>
                  {error && (
                    <p role="alert" className="flex items-center gap-2 rounded-md bg-status-danger-bg px-3 py-2 text-sm text-status-danger">
                      <AlertCircle size={16} />
                      {error}
                    </p>
                  )}
                </form>
                <Link href="/login" className="mt-4 inline-block text-sm font-medium text-primary hover:underline">
                  Back to login
                </Link>
              </motion.div>
            )}
          </div>
        </div>
      </main>
    </MotionConfig>
  );
}
