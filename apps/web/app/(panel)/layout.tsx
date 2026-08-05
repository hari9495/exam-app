'use client';

import { useEffect } from 'react';
import { useRouter, usePathname } from 'next/navigation';
import { MotionConfig } from 'framer-motion';
import { LayoutDashboard, FileText, BookOpen, Users, BarChart3 } from 'lucide-react';
import { useAuth } from '../../lib/auth-context';
import { staffLandingPath } from '../../lib/staff-landing';
import { SUPER_ADMIN_FULL_NAV } from '../../lib/super-admin-nav';
import { useOrgBranding } from '../../lib/hooks/useBranding';
import { useDocumentBranding } from '../../lib/hooks/useDocumentBranding';
import { useCurrentUser } from '../../lib/hooks/useCurrentUser';
import { StaffSidebar } from '../../components/StaffSidebar';
import { StaffTopBar } from '../../components/StaffTopBar';

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
        <StaffSidebar
          navItems={navItems}
          pathname={pathname}
          orgName={orgName}
          orgLogoUrl={branding?.logoUrl}
          orgInitial={orgInitial}
        />
        <div className="flex flex-1 flex-col">
          <StaffTopBar displayName={displayName} initials={initials} roleLabel={roleLabel} onLogout={handleLogout} />
          <main className="flex-1 p-8">{children}</main>
        </div>
      </div>
    </MotionConfig>
  );
}
