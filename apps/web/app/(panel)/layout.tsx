'use client';

import { useEffect } from 'react';
import { useRouter, usePathname } from 'next/navigation';
import Link from 'next/link';
import { MotionConfig } from 'framer-motion';
import clsx from 'clsx';
import { LayoutDashboard, FileText, BookOpen, Users, BarChart3, LogOut } from 'lucide-react';
import { useAuth } from '../../lib/auth-context';
import { staffLandingPath } from '../../lib/staff-landing';
import { SUPER_ADMIN_FULL_NAV } from '../../lib/super-admin-nav';
import { useOrgBranding } from '../../lib/hooks/useBranding';
import { useDocumentBranding } from '../../lib/hooks/useDocumentBranding';
import { useCurrentUser } from '../../lib/hooks/useCurrentUser';

// This route group serves /reports (Results). It shares the same left-sidebar shell as the
// recruiter/org-admin consoles so navigating to Results never jumps to a different chrome.

// A recruiter admitted here sees their own recruiter console nav (results:view lives on /reports,
// which is served by this group). Mirrors the recruiter shell's BASE_NAV_ITEMS.
const RECRUITER_NAV = [
  { href: '/dashboard', label: 'Dashboard', icon: LayoutDashboard },
  { href: '/exams', label: 'Exams', icon: FileText },
  { href: '/questions', label: 'Question Bank', icon: BookOpen },
  { href: '/candidates', label: 'Candidates', icon: Users },
  { href: '/reports', label: 'Results', icon: BarChart3 },
];

// A plain panel member can only reach /reports; a one-item sidebar keeps the chrome consistent.
const PANEL_NAV = [{ href: '/reports', label: 'Results', icon: BarChart3 }];

// org_admin is a full org-scoped superuser and so is admitted to the panel/reports console too.
const ALLOWED_ROLES = ['panel', 'recruiter', 'org_admin'];

export default function PanelLayout({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const { accessToken, organizationSlug, role, actingSuperAdmin, isLoading, logout } = useAuth();
  // Token-scoped: every session that mounts this layout is org-scoped
  // (recruiter/panel/org_admin/acting super_admin). The slug-gated hook
  // never resolved for email-only logins and switch-into -- the sidebar
  // showed a literal "O", no org name, and no theme colors.
  const { data: branding } = useOrgBranding();
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

  async function handleLogout() {
    await logout();
    router.push('/login');
  }

  if (isLoading || !accessToken || (role !== null && !ALLOWED_ROLES.includes(role) && !actingSuperAdmin)) {
    return <p className="p-8 text-sm text-recruiter-text-tertiary">Loading…</p>;
  }

  // org_admin / acting super_admin see the complete feature union; a recruiter sees the recruiter
  // console; a panel member sees just Results.
  const navItems =
    actingSuperAdmin || role === 'org_admin' ? SUPER_ADMIN_FULL_NAV : role === 'recruiter' ? RECRUITER_NAV : PANEL_NAV;

  const roleLabel =
    role === 'super_admin'
      ? 'Super Admin'
      : role === 'org_admin'
        ? 'Org Admin'
        : role === 'recruiter'
          ? 'Recruiter'
          : 'Panel';
  // Real name from useCurrentUser() once loaded; falls back to the role label while loading or if
  // the user has never set one.
  const displayName = currentUser?.name || roleLabel;
  const initials = displayName
    .split(' ')
    .map((part) => part[0])
    .slice(0, 2)
    .join('')
    .toUpperCase();
  // BrandingResponse.name is the real org name; slug only as a fallback while loading.
  const orgName = branding?.name || organizationSlug || 'Organization';
  const orgInitial = orgName[0]?.toUpperCase();

  return (
    <MotionConfig reducedMotion="user">
      <div style={themeStyle} className="flex min-h-screen">
        {/* print:hidden so a printed report doesn't carry the sidebar. */}
        <nav className="sticky top-0 flex h-screen w-56 shrink-0 flex-col border-r border-recruiter-border bg-white print:hidden">
          <div className="flex items-center gap-2 border-b border-recruiter-border px-4 py-4">
            {branding?.logoUrl ? (
              <img src={branding.logoUrl} alt="Organization logo" className="max-h-7 max-w-7 rounded" />
            ) : (
              <div className="flex h-7 w-7 items-center justify-center rounded-md bg-primary text-xs font-bold text-white">
                {orgInitial}
              </div>
            )}
            <span className="truncate text-sm font-bold text-recruiter-text">{orgName}</span>
          </div>
          <ul className="flex flex-1 flex-col gap-0.5 p-2.5">
            {navItems.map((item) => {
              const Icon = item.icon;
              const isActive = pathname?.startsWith(item.href) ?? false;
              return (
                <li key={item.href}>
                  <Link
                    href={item.href}
                    className={clsx(
                      'flex items-center gap-2.5 rounded-md px-2.5 py-2 text-sm font-medium transition-colors duration-150',
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
              className="flex min-w-0 items-center gap-2 rounded-md px-1 py-0.5 transition-colors duration-150 hover:bg-recruiter-bg-subtle"
            >
              <div className="flex h-7 w-7 items-center justify-center rounded-full bg-primary text-[11px] font-semibold text-white">
                {initials}
              </div>
              <div className="min-w-0">
                <p className="truncate text-xs font-semibold text-recruiter-text">{displayName}</p>
                <p className="text-[10.5px] text-recruiter-text-tertiary">{roleLabel}</p>
              </div>
            </Link>
            <button
              type="button"
              aria-label="Log out"
              onClick={handleLogout}
              className="shrink-0 rounded-md p-1.5 text-recruiter-text-tertiary transition-colors duration-150 hover:bg-recruiter-bg-subtle hover:text-recruiter-text"
            >
              <LogOut size={16} />
            </button>
          </div>
        </nav>
        <main className="flex-1 p-8">{children}</main>
      </div>
    </MotionConfig>
  );
}
