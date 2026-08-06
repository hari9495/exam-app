'use client';

import { useState } from 'react';
import Link from 'next/link';
import { motion, MotionConfig } from 'framer-motion';
import { Building2, Mail, AlertCircle } from 'lucide-react';
import { apiFetch } from '../../lib/api-client';
import { Button, Input } from '../../components/ui';
import { AuthPageLayout } from '../../components/AuthPageLayout';
import { useBranding } from '../../lib/hooks/useBranding';
import { useDocumentBranding } from '../../lib/hooks/useDocumentBranding';

const HIGHLIGHTS = [
  'AI-drafted question banks your team reviews before they go out',
  'Proctored, timed exams with integrity signals on every attempt',
  'Panel-ready reports the moment a candidate submits',
];

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
      <AuthPageLayout
        title="Forgot Password"
        logoUrl={branding?.logoUrl}
        logoLabel={branding?.name}
        panelHeading="Automate Early Screens."
        panelCopy="Focus human judgment on what matters. Prudent Hire runs the first round end to end, so your panel only meets the candidates worth meeting."
        panelHighlights={HIGHLIGHTS}
      >
        {submitted ? (
          <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.3, ease: 'easeOut' }}>
            <p className="mb-6 text-sm text-recruiter-text-secondary">
              If an account with that organization and email exists, we&apos;ve sent a reset link to that email.
            </p>
            <Link href="/login" className="text-sm font-medium text-primary hover:underline">
              Back to login
            </Link>
          </motion.div>
        ) : (
          <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.3, ease: 'easeOut' }}>
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
              <Button type="submit" loading={submitting} className="w-full rounded-lg py-3">
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
      </AuthPageLayout>
    </MotionConfig>
  );
}
