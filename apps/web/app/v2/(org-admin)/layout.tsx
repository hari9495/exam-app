'use client';

// v2 org-admin console shell. Mirrors app/v2/(recruiter)/layout.tsx (same AppShell, .v2 scope,
// org theming, OverLimitBanner) but with the org-admin nav and role gate. Pages live under this
// route group at /v2/settings/billing, /v2/settings/integrations, /v2/users, etc.
import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { MotionConfig } from 'framer-motion';
import { Users, History, TerminalSquare, ShieldCheck, CreditCard, Plug, Palette, KeyRound, GitPullRequestArrow, Kanban } from 'lucide-react';
import { useAuth } from '../../../lib/auth-context';
import { staffLandingPath } from '../../../lib/staff-landing';
import { useOrgBranding } from '../../../lib/hooks/useBranding';
import { useDocumentBranding } from '../../../lib/hooks/useDocumentBranding';
import { useCurrentUser } from '../../../lib/hooks/useCurrentUser';
import { AppShell } from '../../../components/ui-v2';
import { OverLimitBanner } from '../../../components/billing/OverLimitBanner';

// Org-admin surfaces rebuilt in v2 get a /v2 href; the rest stay on their old routes until ported.
const ORG_ADMIN_NAV = [
  { href: '/v2/settings/billing', label: 'Billing', icon: CreditCard },
  { href: '/v2/settings/integrations', label: 'Integrations', icon: Plug },
  { href: '/v2/settings/branding', label: 'Brand settings', icon: Palette },
  { href: '/v2/settings/sso', label: 'Single sign-on', icon: KeyRound },
  { href: '/v2/settings/approvals', label: 'Approvals', icon: GitPullRequestArrow },
  // Page lives under app/v2/(org-admin)/settings/pipelines so it renders inside THIS settings
  // layout (its sub-nav), matching approvals — the route group picks the layout even though it
  // doesn't change the /v2/settings/pipelines URL.
  { href: '/v2/settings/pipelines', label: 'Pipelines', icon: Kanban },
  { href: '/v2/users', label: 'Staff users', icon: Users },
  { href: '/v2/audit-log', label: 'Audit log', icon: History },
  { href: '/v2/system-logs', label: 'System logs', icon: TerminalSquare },
  { href: '/v2/data-rights', label: 'Candidate data rights', icon: ShieldCheck },
];

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

  // approvals:configure and pipelines:configure are both seeded only to org_admin, and
  // actingSuperAdmin bypasses every permission check server-side (see PermissionsGuard) — so this
  // is the same condition that already gates entry into this whole console, applied per-item to
  // these two nav links (a plain recruiter/panel account never reaches this layout at all, but a
  // recruiter *does* land in the sibling (recruiter) group, hence the pipelines page's own
  // in-page guard too).
  const canConfigureOrgSettings = role === 'org_admin' || actingSuperAdmin;
  const GATED_HREFS = new Set(['/v2/settings/approvals', '/v2/settings/pipelines']);
  const navItems = ORG_ADMIN_NAV.filter((item) => !GATED_HREFS.has(item.href) || canConfigureOrgSettings);

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
