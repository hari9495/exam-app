'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { apiFetch } from '../../lib/api-client';
import { useAuth } from '../../lib/auth-context';

interface UserRow {
  id: string;
  email: string;
  role: string;
}

export default function DashboardPage() {
  const router = useRouter();
  const { accessToken } = useAuth();
  const [users, setUsers] = useState<UserRow[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!accessToken) {
      router.push('/login');
      return;
    }
    apiFetch('/users', {}, accessToken)
      .then(setUsers)
      .catch((err) => setError(err instanceof Error ? err.message : 'Failed to load users'));
  }, [accessToken, router]);

  if (error) {
    return <p role="alert">{error}</p>;
  }

  return (
    <main>
      <h1>Dashboard</h1>
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
