'use client';

import { useEffect } from 'react';
import { useRouter, usePathname } from 'next/navigation';
import { MotionConfig } from 'framer-motion';
import { Users, History, ShieldCheck, Settings, Plug, KeyRound, TerminalSquare, QrCode } from 'lucide-react';
import { useAuth } from '../../lib/auth-context';
import { staffLandingPath } from '../../lib/staff-landing';
import { SUPER_ADMIN_FULL_NAV } from '../../lib/super-admin-nav';
import { useOrgBranding } from '../../lib/hooks/useBranding';
import { useDocumentBranding } from '../../lib/hooks/useDocumentBranding';
import { useCurrentUser } from '../../lib/hooks/useCurrentUser';
import { StaffSidebar } from '../../components/StaffSidebar';
import { StaffTopBar } from '../../components/StaffTopBar';
import { OverLimitBanner } from '../../components/billing/OverLimitBanner';

const BASE_NAV_ITEMS = [
  { href: '/users', label: 'Staff Users', icon: Users },
  { href: '/audit-log', label: 'Audit Log', icon: History },
  { href: '/system-logs', label: 'System Logs', icon: TerminalSquare },
  { href: '/data-rights', label: 'Candidate Data Rights', icon: ShieldCheck },
  { href: '/settings/branding', label: 'Brand Settings', icon: Settings },
  { href: '/settings/integrations', label: 'Integrations', icon: Plug },
  { href: '/settings/sso', label: 'Single Sign-On', icon: KeyRound },
  { href: '/walk-in-groups', label: 'Walk-in Groups', icon: QrCode },
];

// A super_admin acting into an org sees the complete feature nav (SUPER_ADMIN_FULL_NAV), not this
// shell's scoped subset, so nothing is hidden by which console they're on.

export default function OrgAdminLayout({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const { accessToken, organizationSlug, role, actingSuperAdmin, isLoading, logout } = useAuth();
  // Token-scoped: this layout is only ever mounted for org_admin / acting
  // super_admin, both of which hold org:manage_settings. The slug-based
  // useBranding() never resolved for sessions without a slug (email-only
  // login, switch-into), which left the sidebar showing a literal "O" and
  // no org name, and skipped theming entirely.
  const { data: branding } = useOrgBranding();
  useDocumentBranding(branding?.name, branding?.logoUrl);
  const { data: currentUser } = useCurrentUser();

  useEffect(() => {
    if (!isLoading && !accessToken) {
      router.push('/login');
    } else if (!isLoading && accessToken && role && role !== 'org_admin' && !actingSuperAdmin) {
      // Authenticated but on the wrong console (e.g. mid Login-as / return-to-admin, when the
      // role flips while still mounted here): send them to their own console, not to /login.
      router.push(staffLandingPath(role));
    }
  }, [isLoading, accessToken, role, actingSuperAdmin, router]);

  const themeStyle = {
    ...(branding?.primaryColor ? { '--color-primary': branding.primaryColor } : {}),
    ...(branding?.accentColor ? { '--color-accent': branding.accentColor } : {}),
    ...(branding?.textColor ? { '--color-primary-text': branding.textColor } : {}),
  } as React.CSSProperties;

  async function handleLogout() {
    await logout();
    router.push('/login');
  }

  if (isLoading || !accessToken || (role !== null && role !== 'org_admin' && !actingSuperAdmin)) {
    return <p className="p-8 text-sm text-recruiter-text-tertiary">Loading…</p>;
  }

  // org_admin is a full org-scoped superuser: it sees the complete feature nav (recruiter/panel
  // features included), the same union an acting super_admin sees.
  const navItems = actingSuperAdmin || role === 'org_admin' ? SUPER_ADMIN_FULL_NAV : BASE_NAV_ITEMS;

  // This layout is only ever mounted for org_admin / acting super_admin (see the guard above),
  // so this always resolves to 'Org Admin' -- kept as a real derivation rather than a hardcoded
  // string so it stays correct if that guard is ever loosened, and matches the sibling layouts.
  const roleLabel = role === 'super_admin' ? 'Super Admin' : 'Org Admin';
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
        <StaffTopBar displayName={displayName} initials={initials} roleLabel={roleLabel} avatarUrl={currentUser?.avatarUrl} onLogout={handleLogout} />
        <OverLimitBanner />
        <main className="flex-1 p-8">{children}</main>
      </div>
    </div>
    </MotionConfig>
  );
}
