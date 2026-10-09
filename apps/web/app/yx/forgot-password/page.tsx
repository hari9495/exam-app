'use client';

import { useState } from 'react';
import { ForgotPasswordScreen } from '@yukthix/ui/auth';
import { apiFetch } from '../../../lib/api-client';

// "Forgot your password?" from the YukthiX sign-in: the work email only (no company code). The API
// sends one link per company account with that email and answers the same either way.
export default function YxForgotPasswordPage() {
  const [email, setEmail] = useState('');
  const [sent, setSent] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async () => {
    setError(null);
    setBusy(true);
    try {
      await apiFetch('/auth/forgot-password', { method: 'POST', body: JSON.stringify({ email: email.trim() }) });
      setSent(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong. Try again.');
    } finally {
      setBusy(false);
    }
  };

  return <ForgotPasswordScreen email={email} onEmailChange={setEmail} onSubmit={() => void submit()} sent={sent} busy={busy} error={error} signInHref="/yx/sign-in" />;
}
