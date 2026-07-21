'use client';

import { useEffect } from 'react';
import { useRouter, usePathname } from 'next/navigation';
import Link from 'next/link';
import clsx from 'clsx';
import { MotionConfig } from 'framer-motion';
import { LogOut } from 'lucide-react';
import { useAuth } from '../../lib/auth-context';
import { useBranding } from '../../lib/hooks/useBranding';
import { useCurrentUser } from '../../lib/hooks/useCurrentUser';

export default function PanelLayout({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const { accessToken, organizationSlug, role, isLoading, logout } = useAuth();
  const { data: branding } = useBranding(organizationSlug);
  const { data: currentUser } = useCurrentUser();

  useEffect(() => {
    if (!isLoading && !accessToken) {
      router.push('/login');
    } else if (!isLoading && accessToken && role && role !== 'panel') {
      router.push('/login');
    }
  }, [isLoading, accessToken, role, router]);

  const themeStyle = {
    ...(branding?.primaryColor ? { '--color-primary': branding.primaryColor } : {}),
    ...(branding?.accentColor ? { '--color-accent': branding.accentColor } : {}),
  } as React.CSSProperties;

  if (isLoading || !accessToken || (role !== null && role !== 'panel')) {
    return <p className="p-8 text-sm text-gray-500">Loading…</p>;
  }

  async function handleLogout() {
    await logout();
    router.push('/login');
  }

  // Real name from useCurrentUser() once loaded; falls back to a per-role
  // placeholder only while loading or if the user has never set one.
  const displayName = currentUser?.name || 'Panel';
  const initials = displayName
    .split(' ')
    .map((part) => part[0])
    .slice(0, 2)
    .join('')
    .toUpperCase();

  return (
    <MotionConfig reducedMotion="user">
      <div style={themeStyle} className="min-h-screen bg-gray-50">
        <div className="flex items-center justify-between border-b border-gray-200 bg-white px-6 py-4">
          <div className="flex items-center gap-4">
            {branding?.logoUrl && <img src={branding.logoUrl} alt="Organization logo" className="max-h-8" />}
            <Link
              href="/reports"
              className={clsx(
                'rounded px-3 py-2 text-sm font-medium transition-colors duration-150',
                pathname?.startsWith('/reports') ? 'bg-primary text-white' : 'text-gray-700 hover:bg-gray-100',
              )}
            >
              Exams
            </Link>
          </div>
          <div className="flex items-center gap-3">
            <Link
              href="/profile"
              className="flex min-w-0 items-center gap-2 rounded-md px-1 py-0.5 transition-colors duration-150 hover:bg-gray-100"
            >
              <div className="flex h-7 w-7 items-center justify-center rounded-full bg-primary text-[11px] font-semibold text-white">
                {initials}
              </div>
              <div className="min-w-0">
                <p className="truncate text-xs font-semibold text-gray-900">{displayName}</p>
                <p className="text-[10.5px] text-gray-500">Panel</p>
              </div>
            </Link>
            <button
              type="button"
              aria-label="Log out"
              onClick={handleLogout}
              className="shrink-0 rounded-md p-1.5 text-gray-500 transition-colors duration-150 hover:bg-gray-100 hover:text-gray-900"
            >
              <LogOut size={16} />
            </button>
          </div>
        </div>
        <main className="p-8">{children}</main>
      </div>
    </MotionConfig>
  );
}
