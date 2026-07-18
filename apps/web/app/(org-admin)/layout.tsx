'use client';

import { useEffect } from 'react';
import { useRouter, usePathname } from 'next/navigation';
import Link from 'next/link';
import clsx from 'clsx';
import { Users, History, ShieldCheck, Settings, LogOut } from 'lucide-react';
import { useAuth } from '../../lib/auth-context';
import { useBranding } from '../../lib/hooks/useBranding';
import { useCurrentUser } from '../../lib/hooks/useCurrentUser';

const NAV_ITEMS = [
  { href: '/users', label: 'Staff Users', icon: Users },
  { href: '/audit-log', label: 'Audit Log', icon: History },
  { href: '/data-rights', label: 'Candidate Data Rights', icon: ShieldCheck },
  { href: '/settings/branding', label: 'Org Settings', icon: Settings },
];

export default function OrgAdminLayout({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const { accessToken, organizationSlug, role, isLoading, logout } = useAuth();
  const { data: branding } = useBranding(organizationSlug);
  const { data: currentUser } = useCurrentUser();

  useEffect(() => {
    if (!isLoading && !accessToken) {
      router.push('/login');
    } else if (!isLoading && accessToken && role && role !== 'org_admin') {
      router.push('/login');
    }
  }, [isLoading, accessToken, role, router]);

  const themeStyle = {
    ...(branding?.primaryColor ? { '--color-primary': branding.primaryColor } : {}),
    ...(branding?.accentColor ? { '--color-accent': branding.accentColor } : {}),
  } as React.CSSProperties;

  async function handleLogout() {
    await logout();
    router.push('/login');
  }

  if (isLoading || !accessToken || (role !== null && role !== 'org_admin')) {
    return <p className="p-8 text-sm text-recruiter-text-tertiary">Loading…</p>;
  }

  // Real name from useCurrentUser() once loaded; falls back to a per-role
  // placeholder only while loading or if the user has never set one.
  const displayName = currentUser?.name || 'Org Admin';
  const initials = displayName
    .split(' ')
    .map((part) => part[0])
    .slice(0, 2)
    .join('')
    .toUpperCase();
  // ponytail: BrandingResponse has no organizationName field; fall back to the org slug.
  const orgInitial = (organizationSlug ?? 'O')[0]?.toUpperCase();

  return (
    <div style={themeStyle} className="flex min-h-screen">
      <nav className="flex w-56 shrink-0 flex-col border-r border-recruiter-border bg-white">
        <div className="flex items-center gap-2 border-b border-recruiter-border px-4 py-4">
          {branding?.logoUrl ? (
            <img src={branding.logoUrl} alt="Organization logo" className="max-h-7 max-w-7 rounded" />
          ) : (
            <div className="flex h-7 w-7 items-center justify-center rounded-md bg-primary text-xs font-bold text-white">
              {orgInitial}
            </div>
          )}
          <span className="truncate text-sm font-bold text-recruiter-text">{organizationSlug}</span>
        </div>
        <ul className="flex flex-1 flex-col gap-0.5 p-2.5">
          {NAV_ITEMS.map((item) => {
            const Icon = item.icon;
            const isActive = pathname?.startsWith(item.href) ?? false;
            return (
              <li key={item.href}>
                <Link
                  href={item.href}
                  className={clsx(
                    'flex items-center gap-2.5 rounded-md px-2.5 py-2 text-sm font-medium',
                    isActive
                      ? 'border-l-[3px] border-primary pl-[7px] font-semibold text-primary'
                      : 'text-recruiter-text-secondary hover:bg-recruiter-bg-subtle',
                  )}
                  style={
                    isActive
                      ? { backgroundColor: 'color-mix(in srgb, var(--color-primary, #1a73e8) 12%, white)' }
                      : undefined
                  }
                >
                  <Icon size={16} />
                  {item.label}
                </Link>
              </li>
            );
          })}
        </ul>
        <div className="flex items-center justify-between gap-2 border-t border-recruiter-border px-3.5 py-3">
          <Link
            href="/profile"
            className="flex min-w-0 items-center gap-2 rounded-md px-1 py-0.5 hover:bg-recruiter-bg-subtle"
          >
            <div className="flex h-7 w-7 items-center justify-center rounded-full bg-primary text-[11px] font-semibold text-white">
              {initials}
            </div>
            <div className="min-w-0">
              <p className="truncate text-xs font-semibold text-recruiter-text">{displayName}</p>
              <p className="text-[10.5px] text-recruiter-text-tertiary">Org Admin</p>
            </div>
          </Link>
          <button
            type="button"
            aria-label="Log out"
            onClick={handleLogout}
            className="shrink-0 rounded-md p-1.5 text-recruiter-text-tertiary hover:bg-recruiter-bg-subtle hover:text-recruiter-text"
          >
            <LogOut size={16} />
          </button>
        </div>
      </nav>
      <main className="flex-1 p-8">{children}</main>
    </div>
  );
}
