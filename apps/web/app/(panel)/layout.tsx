'use client';

import { useEffect } from 'react';
import { useRouter, usePathname } from 'next/navigation';
import Link from 'next/link';
import clsx from 'clsx';
import { MotionConfig } from 'framer-motion';
import { LogOut, LayoutDashboard, BookOpen, Users, History, ShieldCheck, Settings, KeyRound, FileText } from 'lucide-react';
import { useAuth } from '../../lib/auth-context';
import { staffLandingPath } from '../../lib/staff-landing';
import { SUPER_ADMIN_FULL_NAV } from '../../lib/super-admin-nav';
import { useBranding } from '../../lib/hooks/useBranding';
import { useDocumentBranding } from '../../lib/hooks/useDocumentBranding';
import { useCurrentUser } from '../../lib/hooks/useCurrentUser';

// A super_admin acting into an org sees the complete feature nav (SUPER_ADMIN_FULL_NAV) here too, so
// nothing is hidden by which console they landed on. It already includes /reports, so the top
// Results/Exams link below is gated to non-acting users to avoid a duplicate.

// Recruiters need the results/reports console too (they hold results:view), but the
// /reports routes live in this route group, and a URL can only be served by one group --
// so recruiters are admitted here rather than duplicating every reports page. These links
// give them their own console back, since this shell replaces the recruiter sidebar.
const RECRUITER_NAV_ITEMS = [
  { href: '/dashboard', label: 'Dashboard', icon: LayoutDashboard },
  { href: '/exams', label: 'Exams', icon: FileText },
  { href: '/candidates', label: 'Candidates', icon: Users },
];

// org_admin is a full org-scoped superuser and so is admitted to the panel/reports console too.
const ALLOWED_ROLES = ['panel', 'recruiter', 'org_admin'];

export default function PanelLayout({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const { accessToken, organizationSlug, role, actingSuperAdmin, isLoading, logout } = useAuth();
  const { data: branding } = useBranding(organizationSlug);
  useDocumentBranding(branding?.name, branding?.logoUrl);
  const { data: currentUser } = useCurrentUser();

  useEffect(() => {
    if (!isLoading && !accessToken) {
      router.push('/login');
    } else if (!isLoading && accessToken && role && !ALLOWED_ROLES.includes(role) && !actingSuperAdmin) {
      // Authenticated but wrong console (e.g. returning from impersonation while still mounted
      // here): route to the role's own console instead of bouncing to /login.
      router.push(staffLandingPath(role));
    }
  }, [isLoading, accessToken, role, actingSuperAdmin, router]);

  const themeStyle = {
    ...(branding?.primaryColor ? { '--color-primary': branding.primaryColor } : {}),
    ...(branding?.accentColor ? { '--color-accent': branding.accentColor } : {}),
  } as React.CSSProperties;

  if (isLoading || !accessToken || (role !== null && !ALLOWED_ROLES.includes(role) && !actingSuperAdmin)) {
    return <p className="p-8 text-sm text-gray-500">Loading…</p>;
  }

  async function handleLogout() {
    await logout();
    router.push('/login');
  }

  // Real name from useCurrentUser() once loaded; falls back to a per-role
  // placeholder only while loading or if the user has never set one.
  const displayName = currentUser?.name || (role === 'recruiter' ? 'Recruiter' : 'Panel');
  const roleLabel = role === 'recruiter' ? 'Recruiter' : 'Panel';
  const initials = displayName
    .split(' ')
    .map((part) => part[0])
    .slice(0, 2)
    .join('')
    .toUpperCase();

  return (
    <MotionConfig reducedMotion="user">
      <div style={themeStyle} className="min-h-screen bg-gray-50">
        <div className="flex items-center justify-between border-b border-gray-200 bg-white px-6 py-4 print:hidden">
          <div className="flex items-center gap-4">
            {branding?.logoUrl && <img src={branding.logoUrl} alt="Organization logo" className="max-h-8" />}
            {!actingSuperAdmin && role !== 'org_admin' && (
              <Link
                href="/reports"
                className={clsx(
                  'rounded px-3 py-2 text-sm font-medium transition-colors duration-150',
                  pathname?.startsWith('/reports') ? 'bg-primary text-white' : 'text-gray-700 hover:bg-gray-100',
                )}
              >
                {/* This link goes to /reports. "Exams" reads fine for a panel member browsing
                    exams to review, but a recruiter arriving here wants results -- and would
                    otherwise see two different links both labelled "Exams". */}
                {role === 'recruiter' ? 'Results' : 'Exams'}
              </Link>
            )}
            {!actingSuperAdmin && role === 'recruiter' &&
              RECRUITER_NAV_ITEMS.map((item) => (
                <Link
                  key={item.href}
                  href={item.href}
                  className={clsx(
                    'rounded px-3 py-2 text-sm font-medium transition-colors duration-150',
                    pathname?.startsWith(item.href) ? 'bg-primary text-white' : 'text-gray-700 hover:bg-gray-100',
                  )}
                >
                  {item.label}
                </Link>
              ))}
            {(actingSuperAdmin || role === 'org_admin') &&
              SUPER_ADMIN_FULL_NAV.map((item) => (
                <Link
                  key={item.href}
                  href={item.href}
                  className={clsx(
                    'rounded px-3 py-2 text-sm font-medium transition-colors duration-150',
                    pathname?.startsWith(item.href) ? 'bg-primary text-white' : 'text-gray-700 hover:bg-gray-100',
                  )}
                >
                  {item.label}
                </Link>
              ))}
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
                <p className="text-[10.5px] text-gray-500">{roleLabel}</p>
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
