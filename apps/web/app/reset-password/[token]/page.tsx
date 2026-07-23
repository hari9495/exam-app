'use client';

import { useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { motion, MotionConfig } from 'framer-motion';
import { Lock, Eye, EyeOff, AlertCircle } from 'lucide-react';
import { apiFetch } from '../../../lib/api-client';
import { Button, Input } from '../../../components/ui';

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
      <main className="grid md:min-h-screen md:grid-cols-2">
        <div className="relative hidden flex-col items-start justify-center gap-12 border-r border-recruiter-border bg-white px-16 py-12 md:flex">
          <div className="flex items-center gap-4">
            <img src="/logo.png" alt="Prudent Hire" className="h-16 w-16 object-contain" />
            <p className="text-4xl font-bold tracking-tight text-recruiter-text">Prudent Hire</p>
          </div>
          <blockquote className="max-w-md border-l-2 border-primary pl-5">
            <p className="text-xl font-medium leading-relaxed text-recruiter-text">
              Great hires start with great signal.
            </p>
            <p className="mt-1 text-base text-recruiter-text-secondary">We help you see it clearly.</p>
          </blockquote>
        </div>

        <div className="flex flex-col items-center justify-center gap-3 bg-white px-6 py-12 md:hidden">
          <div className="flex items-center gap-3">
            <img src="/logo.png" alt="Prudent Hire" className="h-10 w-10 object-contain" />
            <p className="text-2xl font-bold tracking-tight text-recruiter-text">Prudent Hire</p>
          </div>
        </div>

        <div className="flex flex-1 items-center justify-center bg-white px-6 py-12">
          <div className="w-full max-w-sm">
            <h1 className="mb-6 text-xl font-semibold text-recruiter-text">Reset password</h1>
            {success ? (
              <motion.p
                className="text-sm text-recruiter-text-secondary"
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
                    label="New password"
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
                    className="absolute bottom-2 right-3 text-recruiter-text-tertiary hover:text-recruiter-text"
                  >
                    {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                  </button>
                </div>
                <Input
                  label="Confirm new password"
                  type={showPassword ? 'text' : 'password'}
                  value={confirmPassword}
                  onChange={setConfirmPassword}
                  required
                  icon={<Lock size={16} />}
                />
                <Button type="submit" loading={submitting} disabled={!passwordsMatch}>
                  Reset password
                </Button>
                {!passwordsMatch && confirmPassword.length > 0 && (
                  <p className="text-xs text-recruiter-text-tertiary">Passwords must match.</p>
                )}
                {error && (
                  <div className="flex flex-col gap-2 rounded-md bg-status-danger-bg px-3 py-2 text-sm text-status-danger">
                    <p role="alert" className="flex items-center gap-2">
                      <AlertCircle size={16} />
                      {error}
                    </p>
                    <Link href="/forgot-password" className="font-medium underline">
                      Request a new reset link
                    </Link>
                  </div>
                )}
              </motion.form>
            )}
          </div>
        </div>
      </main>
    </MotionConfig>
  );
}
