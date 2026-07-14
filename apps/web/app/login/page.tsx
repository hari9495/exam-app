'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { apiFetch } from '../../lib/api-client';
import { useAuth } from '../../lib/auth-context';
import { decodeJwtPayload } from '../../lib/jwt';
import { Button, Input, Card } from '../../components/ui';
import { useBranding } from '../../lib/hooks/useBranding';

export default function LoginPage() {
  const router = useRouter();
  const { login } = useAuth();
  const [organizationSlug, setOrganizationSlug] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const { data: branding } = useBranding(organizationSlug || null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    try {
      const result = await apiFetch('/auth/staff/login', {
        method: 'POST',
        body: JSON.stringify({ organizationSlug: organizationSlug || undefined, email, password }),
      });
      login(organizationSlug, result.accessToken);
      const payload = decodeJwtPayload(result.accessToken);
      router.push(payload?.role === 'org_admin' ? '/users' : '/dashboard');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Login failed');
    }
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-gray-50">
      <Card className="w-full max-w-sm">
        {branding?.logoUrl && <img src={branding.logoUrl} alt="Organization logo" className="mb-4 max-h-14" />}
        <h1 className="mb-4 text-xl font-semibold" style={branding?.primaryColor ? { color: branding.primaryColor } : undefined}>
          Staff Login
        </h1>
        <form onSubmit={handleSubmit} className="flex flex-col gap-3">
          <Input label="Organization slug" value={organizationSlug} onChange={setOrganizationSlug} />
          <Input label="Email" type="email" value={email} onChange={setEmail} required />
          <Input label="Password" type="password" value={password} onChange={setPassword} required />
          <Button type="submit">Log in</Button>
          {error && (
            <p role="alert" className="text-sm text-red-600">
              {error}
            </p>
          )}
        </form>
      </Card>
    </main>
  );
}
