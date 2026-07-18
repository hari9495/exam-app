'use client';

import { useEffect } from 'react';
import { useRouter, usePathname } from 'next/navigation';
import Link from 'next/link';
import clsx from 'clsx';
import { LogOut } from 'lucide-react';
import { useAuth } from '../../lib/auth-context';
import { useBranding } from '../../lib/hooks/useBranding';
import { useCurrentUser } from '../../lib/hooks/useCurrentUser';

const NAV_ITEMS = [{ href: '/reports', label: 'Exams' }];

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
    <div style={themeStyle} className="flex min-h-screen">
      <nav className="flex w-56 shrink-0 flex-col border-r border-gray-200 bg-gray-50">
        <div className="p-4">
          {branding?.logoUrl && <img src={branding.logoUrl} alt="Organization logo" className="mb-4 max-h-10" />}
        </div>
        <ul className="flex flex-1 flex-col gap-1 px-4">
          {NAV_ITEMS.map((item) => (
            <li key={item.href}>
              <Link
                href={item.href}
                className={clsx(
                  'block rounded px-3 py-2 text-sm font-medium',
                  pathname?.startsWith(item.href) ? 'bg-primary text-white' : 'text-gray-700 hover:bg-gray-100',
                )}
              >
                {item.label}
              </Link>
            </li>
          ))}
        </ul>
        <div className="flex items-center justify-between gap-2 border-t border-gray-200 px-3.5 py-3">
          <Link href="/profile" className="flex min-w-0 items-center gap-2 rounded-md px-1 py-0.5 hover:bg-gray-100">
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
            className="shrink-0 rounded-md p-1.5 text-gray-500 hover:bg-gray-100 hover:text-gray-900"
          >
            <LogOut size={16} />
          </button>
        </div>
      </nav>
      <main className="flex-1 p-8">{children}</main>
    </div>
  );
}
