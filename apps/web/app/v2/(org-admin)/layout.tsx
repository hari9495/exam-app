'use client';

// v2 org-admin console shell. Mirrors app/v2/(recruiter)/layout.tsx (same AppShell, .v2 scope,
// org theming, OverLimitBanner) but with a stricter org-admin-only role gate. Pages live under this
// route group at /v2/settings/billing, /v2/settings/integrations, /v2/users, etc. The sidebar is
// built by the shared buildStaffNav -- the SAME nav the (recruiter) group renders for org_admin --
// so opening a settings page keeps the one standard sidebar instead of swapping to a settings sub-nav.
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

export default function OrgAdminV2Layout({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const { accessToken, organizationSlug, role, actingSuperAdmin, isLoading, logout } = useAuth();
  const { data: branding } = useOrgBranding();
  useDocumentBranding(branding?.name, branding?.logoUrl);
  const { data: currentUser } = useCurrentUser();

  useEffect(() => {
    if (!isLoading && !accessToken) {
      router.push('/login');
    } else if (!isLoading && accessToken && role && role !== 'org_admin' && !actingSuperAdmin) {
      router.push(staffLandingPath(role));
    }
  }, [isLoading, accessToken, role, actingSuperAdmin, router]);

  const orgVars = {
    ['--org-primary']: branding?.primaryColor || '#3b5fe3',
    ['--org-on-primary']: branding?.textColor || '#ffffff',
  } as React.CSSProperties;

  // Only org_admin / acting super_admin reach this layout (see the guard below), which is exactly
  // who holds approvals:configure / pipelines:configure, so the settings items in the standard nav
  // need no extra per-item gating here.
  const navItems = buildStaffNav(role, actingSuperAdmin);

  async function handleLogout() {
    await logout();
    router.push('/login');
  }

  if (isLoading || !accessToken || (role !== null && role !== 'org_admin' && !actingSuperAdmin)) {
    return <p className="p-8 text-sm text-muted">Loading…</p>;
  }

  const roleLabel = role === 'super_admin' || actingSuperAdmin ? 'Super Admin' : 'Org Admin';
  const displayName = currentUser?.name || roleLabel;
  const initials = displayName.split(' ').map((part) => part[0]).slice(0, 2).join('').toUpperCase();
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
