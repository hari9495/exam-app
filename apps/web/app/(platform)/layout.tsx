'use client';

import { useEffect } from 'react';
import { useRouter, usePathname } from 'next/navigation';
import Link from 'next/link';
import { LogOut } from 'lucide-react';
import { MotionConfig } from 'framer-motion';
import clsx from 'clsx';
import { useAuth } from '../../lib/auth-context';

const NAV_LINKS = [
  { href: '/organizations', label: 'Organizations' },
  { href: '/platform-admins', label: 'Platform Admins' },
  { href: '/all-users', label: 'All Users' },
];

export default function PlatformLayout({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
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
    <MotionConfig reducedMotion="user">
      <div className="min-h-screen bg-gray-50">
        <div className="flex items-center justify-between border-b border-gray-200 bg-white px-6 py-4">
          <div className="flex items-center gap-6">
            <span className="text-sm font-bold text-gray-900">Platform Admin</span>
            <nav className="flex items-center gap-4">
              {NAV_LINKS.map((link) => (
                <Link
                  key={link.href}
                  href={link.href}
                  className={clsx(
                    'text-sm font-medium transition-colors duration-150',
                    pathname === link.href ? 'text-primary' : 'text-gray-500 hover:text-gray-900',
                  )}
                >
                  {link.label}
                </Link>
              ))}
            </nav>
          </div>
          <button
            type="button"
            aria-label="Log out"
            onClick={handleLogout}
            className="rounded-md p-1.5 text-gray-500 transition-colors duration-150 hover:bg-gray-100 hover:text-gray-900"
          >
            <LogOut size={16} />
          </button>
        </div>
        <main className="p-8">{children}</main>
      </div>
    </MotionConfig>
  );
}
