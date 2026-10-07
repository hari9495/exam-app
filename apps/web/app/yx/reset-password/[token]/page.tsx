'use client';

import { useState } from 'react';
import { useParams } from 'next/navigation';
import { ResetPasswordScreen } from '@yukthix/ui/auth';
import { apiFetch } from '../../../../lib/api-client';

// The link in the YukthiX reset email (P12 §6.1): a new password twice. The API checks the company's
// minimum length and the breach list, and signs the person out everywhere.
export default function YxResetPasswordPage() {
  const { token } = useParams<{ token: string }>();
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [done, setDone] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async () => {
    setError(null);
    setBusy(true);
    try {
      await apiFetch('/auth/reset-password', { method: 'POST', body: JSON.stringify({ token, newPassword: password }) });
      setDone(true);
    } catch (err) {
      setError(err instanceof Error && err.message ? err.message : 'This reset link is invalid or has expired');
    } finally {
      setBusy(false);
    }
  };

  return (
    <ResetPasswordScreen
      password={password}
      confirm={confirm}
      onPasswordChange={setPassword}
      onConfirmChange={setConfirm}
      onSubmit={() => void submit()}
      done={done}
      busy={busy}
      error={error}
      signInHref="/yx/sign-in"
      forgotHref="/yx/forgot-password"
    />
  );
}
