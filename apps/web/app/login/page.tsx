'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { apiFetch } from '../../lib/api-client';
import { useAuth } from '../../lib/auth-context';

interface PublicBranding {
  logoUrl: string | null;
  primaryColor: string | null;
  accentColor: string | null;
}

export default function LoginPage() {
  const router = useRouter();
  const { setAccessToken } = useAuth();
  const [organizationSlug, setOrganizationSlug] = useState('demo-org');
  const [email, setEmail] = useState('admin@demo-org.test');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [branding, setBranding] = useState<PublicBranding | null>(null);

  async function handleSlugBlur() {
    if (!organizationSlug) {
      setBranding(null);
      return;
    }
    try {
      const result = await apiFetch(`/organizations/by-slug/${organizationSlug}/branding`);
      setBranding(result);
    } catch {
      setBranding(null);
    }
  }

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
      {branding?.logoUrl && <img src={branding.logoUrl} alt="Organization logo" style={{ maxHeight: 60 }} />}
      <h1 style={branding?.primaryColor ? { color: branding.primaryColor } : undefined}>Staff Login</h1>
      <form onSubmit={handleSubmit}>
        <label>
          Organization slug (leave blank for platform login)
          <input value={organizationSlug} onChange={(e) => setOrganizationSlug(e.target.value)} onBlur={handleSlugBlur} />
        </label>
        <label>
          Email
          <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
        </label>
        <label>
          Password
          <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} required />
        </label>
        <button type="submit" style={branding?.primaryColor ? { backgroundColor: branding.primaryColor } : undefined}>
          Log in
        </button>
      </form>
      {error && <p role="alert">{error}</p>}
    </main>
  );
}
