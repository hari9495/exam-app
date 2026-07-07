'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { apiFetch } from '../../lib/api-client';
import { useAuth } from '../../lib/auth-context';

export default function LoginPage() {
  const router = useRouter();
  const { setAccessToken } = useAuth();
  const [organizationSlug, setOrganizationSlug] = useState('demo-org');
  const [email, setEmail] = useState('admin@demo-org.test');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    try {
      const result = await apiFetch('/auth/staff/login', {
        method: 'POST',
        body: JSON.stringify({ organizationSlug: organizationSlug || undefined, email, password }),
      });
      setAccessToken(result.accessToken);
      router.push('/dashboard');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Login failed');
    }
  }

  return (
    <main>
      <h1>Staff Login</h1>
      <form onSubmit={handleSubmit}>
        <label>
          Organization slug (leave blank for platform login)
          <input value={organizationSlug} onChange={(e) => setOrganizationSlug(e.target.value)} />
        </label>
        <label>
          Email
          <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
        </label>
        <label>
          Password
          <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} required />
        </label>
        <button type="submit">Log in</button>
      </form>
      {error && <p role="alert">{error}</p>}
    </main>
  );
}
