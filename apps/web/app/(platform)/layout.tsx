'use client';

import { useEffect } from 'react';
import { useRouter, usePathname } from 'next/navigation';
import Link from 'next/link';
import { LogOut } from 'lucide-react';
import { MotionConfig } from 'framer-motion';
import clsx from 'clsx';
import { useAuth } from '../../lib/auth-context';
import { staffLandingPath } from '../../lib/staff-landing';
import { PrudentMark } from '../../components/PrudentMark';

const NAV_LINKS = [
  { href: '/organizations', label: 'Organizations' },
  { href: '/plans', label: 'Plans' },
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
      // Authenticated non-super on the platform console: route to their own console, not /login.
      router.push(staffLandingPath(role));
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
      <div className="min-h-screen bg-recruiter-bg-subtle">
        <div className="flex items-center justify-between bg-brand-navy px-6 py-4">
          <div className="flex items-center gap-8">
            <div className="flex items-center gap-2.5">
              <PrudentMark className="h-6 aspect-[100/148] text-white" />
              <span className="text-sm font-medium text-white">Platform Admin</span>
            </div>
            <nav className="flex items-center gap-5">
              {NAV_LINKS.map((link) => (
                <Link
                  key={link.href}
                  href={link.href}
                  className={clsx(
                    'text-sm font-medium transition-colors duration-150',
                    pathname === link.href ? 'text-brand-picton' : 'text-white/60 hover:text-white',
                  )}
                >
                  {link.label}
                </Link>
              ))}
            </nav>
          </div>
          <button
            type="button"
            aria-label="Log Out"
            onClick={handleLogout}
            className="flex items-center gap-2 rounded-md border border-white/20 px-3 py-1.5 text-sm font-medium text-white/70 transition-colors duration-150 hover:border-white/40 hover:bg-white/10 hover:text-white"
          >
            <LogOut size={15} />
            Logout
          </button>
        </div>
        <main className="p-8">{children}</main>
      </div>
    </MotionConfig>
  );
}
