'use client';

import { useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { motion, MotionConfig } from 'framer-motion';
import { Lock, Eye, EyeOff, AlertCircle } from 'lucide-react';
import { apiFetch } from '../../../lib/api-client';
import { Button, Input } from '../../../components/ui';
import { AuthPageLayout } from '../../../components/AuthPageLayout';

const HIGHLIGHTS = [
  'AI-drafted question banks your team reviews before they go out',
  'Proctored, timed exams with integrity signals on every attempt',
  'Panel-ready reports the moment a candidate submits',
];

export default function ResetPasswordPage() {
  const { token } = useParams<{ token: string }>();
  const router = useRouter();
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  const passwordsMatch = newPassword.length > 0 && newPassword === confirmPassword;

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      await apiFetch('/auth/reset-password', {
        method: 'POST',
        body: JSON.stringify({ token, newPassword }),
      });
      setSuccess(true);
      setTimeout(() => router.push('/login'), 2000);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'This reset link is invalid or has expired.');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <MotionConfig reducedMotion="user">
      <AuthPageLayout
        title="Reset password"
        eyebrow="Account recovery"
        panelHeading="Automate early screens."
        panelCopy="Focus human judgment on what matters. Prudent Hire runs the first round end to end, so your panel only meets the candidates worth meeting."
        panelHighlights={HIGHLIGHTS}
      >
        {success ? (
          <motion.p
            className="text-sm text-muted"
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.3, ease: 'easeOut' }}
          >
            Your password has been reset. Redirecting to login&hellip;
          </motion.p>
        ) : (
          <motion.form
            onSubmit={handleSubmit}
            className="flex flex-col gap-3"
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.3, ease: 'easeOut' }}
          >
            <div className="relative">
              <Input
                label="New Password"
                type={showPassword ? 'text' : 'password'}
                value={newPassword}
                onChange={setNewPassword}
                required
                icon={<Lock size={16} />}
              />
              <button
                type="button"
                onClick={() => setShowPassword((prev) => !prev)}
                aria-label={showPassword ? 'Hide characters' : 'Show characters'}
                className="absolute bottom-2.5 right-3"
                style={{ color: 'var(--muted)' }}
              >
                {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
              </button>
            </div>
            <Input
              label="Confirm New Password"
              type={showPassword ? 'text' : 'password'}
              value={confirmPassword}
              onChange={setConfirmPassword}
              required
              icon={<Lock size={16} />}
            />
            <motion.div whileTap={{ scale: 0.97 }} transition={{ type: 'spring', stiffness: 500, damping: 30 }} className="w-full">
              <Button type="submit" loading={submitting} disabled={!passwordsMatch} className="w-full py-3">
                Reset password
              </Button>
            </motion.div>
            {!passwordsMatch && confirmPassword.length > 0 && (
              <p className="text-xs text-muted">Passwords must match.</p>
            )}
            {error && (
              <div className="inv-alert flex flex-col gap-2 rounded-md px-3 py-2 text-sm">
                <p role="alert" className="flex items-center gap-2">
                  <AlertCircle size={16} />
                  {error}
                </p>
                <Link href="/forgot-password" className="inv-link font-medium underline">
                  Request a new reset link
                </Link>
              </div>
            )}
          </motion.form>
        )}
      </AuthPageLayout>
    </MotionConfig>
  );
}
