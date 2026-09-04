'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { MotionConfig } from 'framer-motion';
import { useAuth } from '../../../lib/auth-context';
import { staffLandingPath } from '../../../lib/staff-landing';
import { buildStaffNav } from '../../../lib/staff-nav';
import { useOrgBranding } from '../../../lib/hooks/useBranding';
import { useDocumentBranding } from '../../../lib/hooks/useDocumentBranding';
import { useCurrentUser } from '../../../lib/hooks/useCurrentUser';
import { AppShell } from '../../../components/ui-v2';
import { OverLimitBanner } from '../../../components/billing/OverLimitBanner';

// The sidebar (nav items, /v2 prefixing, role gating) is built by the shared buildStaffNav so this
// group and the (org-admin) group render the IDENTICAL standard sidebar -- opening a settings page
// never swaps the nav. A super_admin acting into an org sees the complete feature nav, not this
// shell's scoped subset, so nothing is hidden by which console they're on.

export default function RecruiterLayout({ children }: { children: React.ReactNode }) {
  const router = useRouter();
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
    } else if (!isLoading && accessToken && role && role !== 'recruiter' && role !== 'org_admin' && !actingSuperAdmin) {
      // Authenticated but wrong console (e.g. returning from impersonation while still mounted
      // here): route to the role's own console instead of bouncing to /login.
      router.push(staffLandingPath(role));
    }
  }, [isLoading, accessToken, role, actingSuperAdmin, router]);

  const orgVars = {
    ['--org-primary']: branding?.primaryColor || '#3b5fe3',
    ['--org-on-primary']: branding?.textColor || '#ffffff',
  } as React.CSSProperties;

  async function handleLogout() {
    await logout();
    router.push('/login');
  }

  if (isLoading || !accessToken || (role !== null && role !== 'recruiter' && role !== 'org_admin' && !actingSuperAdmin)) {
    return <p className="p-8 text-sm text-muted">Loading…</p>;
  }

  // org_admin is a full org-scoped superuser, so it sees the complete feature nav everywhere,
  // just like an acting super_admin.
  const navItems = buildStaffNav(role, actingSuperAdmin);

  // This layout also mounts for org_admin (and an acting super_admin) -- see navItems above --
  // so the profile label has to reflect the real role instead of hardcoding "Recruiter".
  const roleLabel =
    actingSuperAdmin || role === 'org_admin'
      ? 'Org Admin'
      : role === 'super_admin'
        ? 'Super Admin'
        : 'Recruiter';
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
      <div className="v2" style={{ minHeight: '100vh', ...orgVars }}>
        <AppShell
          navItems={navItems}
          orgName={orgName}
          orgLogoUrl={branding?.logoUrl ?? undefined}
          orgInitial={orgInitial}
          roleLabel={roleLabel}
          displayName={displayName}
          initials={initials}
          avatarUrl={currentUser?.avatarUrl ?? undefined}
          onLogout={handleLogout}
        >
          <OverLimitBanner />
          {children}
        </AppShell>
      </div>
    </MotionConfig>
  );
}
