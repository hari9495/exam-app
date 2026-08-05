'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { KeyRound, Mail, Lock, AlertCircle } from 'lucide-react';
import { apiFetch } from '../../lib/api-client';
import { Button, Input } from '../../components/ui';

export default function SetupPage() {
  const router = useRouter();
  const [checking, setChecking] = useState(true);
  const [token, setToken] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  useEffect(() => {
    apiFetch('/setup/status')
      .then((result: { needsSetup: boolean }) => {
        if (!result.needsSetup) {
          router.push('/login');
        } else {
          setChecking(false);
        }
      })
      .catch(() => setChecking(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      await apiFetch('/setup/complete', { method: 'POST', body: JSON.stringify({ token, email, password }) });
      setSuccess(true);
      setTimeout(() => router.push('/login'), 2000);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Setup failed. Please try again.');
    } finally {
      setSubmitting(false);
    }
  }

  if (checking) {
    return <p className="p-8 text-sm text-gray-500">Loading…</p>;
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-white px-6 py-12">
      <div className="w-full max-w-sm">
        <h1 className="mb-2 text-xl font-semibold text-gray-900">Platform Setup</h1>
        <p className="mb-6 text-sm text-gray-600">
          Create the first platform administrator account. Use the one-time token printed to the server log at startup.
        </p>
        {success ? (
          <p className="text-sm text-gray-600">Setup complete. Redirecting to login&hellip;</p>
        ) : (
          <form onSubmit={handleSubmit} className="flex flex-col gap-3">
            <Input label="Setup Token" value={token} onChange={setToken} required icon={<KeyRound size={16} />} />
            <Input label="Email" type="email" value={email} onChange={setEmail} required icon={<Mail size={16} />} />
            <Input
              label="Password"
              type="password"
              value={password}
              onChange={setPassword}
              required
              icon={<Lock size={16} />}
            />
            <Button type="submit" loading={submitting}>
              Complete setup
            </Button>
            {error && (
              <p role="alert" className="flex items-center gap-2 text-sm text-status-danger">
                <AlertCircle size={16} />
                {error}
              </p>
            )}
          </form>
        )}
      </div>
    </main>
  );
}
