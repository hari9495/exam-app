'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { apiFetch } from '../../lib/api-client';
import { useAuth } from '../../lib/auth-context';

interface UserRow {
  id: string;
  email: string;
  role: string;
}

interface Branding {
  logoUrl: string | null;
  primaryColor: string | null;
  accentColor: string | null;
}

export default function DashboardPage() {
  const router = useRouter();
  const { accessToken } = useAuth();
  const [users, setUsers] = useState<UserRow[] | null>(null);
  const [branding, setBranding] = useState<Branding | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!accessToken) {
      router.push('/login');
      return;
    }
    apiFetch('/users', {}, accessToken)
      .then(setUsers)
      .catch((err) => setError(err instanceof Error ? err.message : 'Failed to load users'));
    apiFetch('/organizations/branding', {}, accessToken)
      .then(setBranding)
      .catch(() => setBranding(null));
  }, [accessToken, router]);

  if (error) {
    return <p role="alert">{error}</p>;
  }

  return (
    <main>
      <header>
        {branding?.logoUrl && <img src={branding.logoUrl} alt="Organization logo" style={{ maxHeight: 48 }} />}
        <h1 style={branding?.primaryColor ? { color: branding.primaryColor } : undefined}>Dashboard</h1>
        <Link href="/settings/branding">Branding settings</Link>
      </header>
      <ul>
        {users?.map((user) => (
          <li key={user.id}>
            {user.email} — {user.role}
          </li>
        ))}
      </ul>
    </main>
  );
}
