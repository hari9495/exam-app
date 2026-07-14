'use client';

import { useEffect } from 'react';
import { useRouter, usePathname } from 'next/navigation';
import Link from 'next/link';
import clsx from 'clsx';
import { useAuth } from '../../lib/auth-context';
import { useBranding } from '../../lib/hooks/useBranding';

const NAV_ITEMS = [
  { href: '/users', label: 'Staff Users' },
  { href: '/settings/branding', label: 'Org Settings' },
  { href: '/audit-log', label: 'Audit Log' },
  { href: '/data-rights', label: 'Candidate Data Rights' },
];

export default function OrgAdminLayout({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const { accessToken, organizationSlug, role, isLoading } = useAuth();
  const { data: branding } = useBranding(organizationSlug);

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

  if (isLoading || !accessToken || (role !== null && role !== 'org_admin')) {
    return <p className="p-8 text-sm text-gray-500">Loading…</p>;
  }

  return (
    <div style={themeStyle} className="flex min-h-screen">
      <nav className="w-56 shrink-0 border-r border-gray-200 bg-gray-50 p-4">
        {branding?.logoUrl && <img src={branding.logoUrl} alt="Organization logo" className="mb-4 max-h-10" />}
        <ul className="flex flex-col gap-1">
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
      </nav>
      <main className="flex-1 p-8">{children}</main>
    </div>
  );
}
