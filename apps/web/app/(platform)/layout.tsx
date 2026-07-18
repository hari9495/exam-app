'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { LogOut } from 'lucide-react';
import { useAuth } from '../../lib/auth-context';

export default function PlatformLayout({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const { accessToken, role, isLoading, logout } = useAuth();

  useEffect(() => {
    if (!isLoading && !accessToken) {
      router.push('/login');
    } else if (!isLoading && accessToken && role && role !== 'super_admin') {
      router.push('/login');
    }
  }, [isLoading, accessToken, role, router]);

  async function handleLogout() {
    await logout();
    router.push('/login');
  }

  if (isLoading || !accessToken || (role !== null && role !== 'super_admin')) {
    return <p className="p-8 text-sm text-gray-500">Loading…</p>;
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="flex items-center justify-between border-b border-gray-200 bg-white px-6 py-4">
        <span className="text-sm font-bold text-gray-900">Platform Admin</span>
        <button
          type="button"
          aria-label="Log out"
          onClick={handleLogout}
          className="rounded-md p-1.5 text-gray-500 hover:bg-gray-100 hover:text-gray-900"
        >
          <LogOut size={16} />
        </button>
      </div>
      <main className="p-8">{children}</main>
    </div>
  );
}
