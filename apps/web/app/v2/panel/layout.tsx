'use client';

// v2 panel/interviewer console shell. Uses a REAL `panel/` path segment (not a route group) so its
// routes live at /v2/panel/* — this avoids colliding with the recruiter console's /v2/reports (two
// route groups can't own the same URL). Nav is the panel-scoped subset (Results + Interviews);
// admitted roles match the old (panel) layout: panel, recruiter, org_admin, or acting super_admin.
import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { MotionConfig } from 'framer-motion';
import { BarChart3, CalendarClock } from 'lucide-react';
import { useAuth } from '../../../lib/auth-context';
import { signInPath } from '../../../lib/api-client';
import { staffLandingPath } from '../../../lib/staff-landing';
import { useOrgBranding } from '../../../lib/hooks/useBranding';
import { useDocumentBranding } from '../../../lib/hooks/useDocumentBranding';
import { useCurrentUser } from '../../../lib/hooks/useCurrentUser';
import { AppShell } from '../../../components/ui-v2';
import { useLanding } from '../../../lib/yx-landing';

// Each item shows only with the permission its screen needs (an HR permission profile on role 'panel'
// holds neither, and is sent to YukthiX instead).
const PANEL_NAV = [
  { href: '/v2/panel/reports', label: 'Results', icon: BarChart3, permission: 'results:view' },
  { href: '/v2/panel/interviews', label: 'Interviews', icon: CalendarClock, permission: 'interview:view_assigned' },
];
const ALLOWED_ROLES = ['panel', 'recruiter', 'org_admin'];

export default function PanelV2Layout({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const { accessToken, organizationSlug, role, actingSuperAdmin, isLoading, logout } = useAuth();
  const { data: branding } = useOrgBranding();
  useDocumentBranding(branding?.name, branding?.logoUrl);
  const { data: currentUser } = useCurrentUser();
  const access = useLanding();
  const noExamAts = access.ready && !access.examAts && !actingSuperAdmin;

  useEffect(() => {
    if (!isLoading && !accessToken) {
      router.push(signInPath());
    } else if (!isLoading && accessToken && role && !ALLOWED_ROLES.includes(role) && !actingSuperAdmin) {
      router.push(staffLandingPath(role));
    } else if (noExamAts) {
      router.replace(access.landing);
    }
  }, [isLoading, accessToken, role, actingSuperAdmin, router, noExamAts, access.landing]);

  const orgVars = {
    ['--org-primary']: branding?.primaryColor || '#3b5fe3',
    ['--org-on-primary']: branding?.textColor || '#ffffff',
  } as React.CSSProperties;

  async function handleLogout() {
    router.push(await logout());
  }

  if (isLoading || !accessToken || (role !== null && !ALLOWED_ROLES.includes(role) && !actingSuperAdmin) || !access.ready || noExamAts) {
    return <p className="p-8 text-sm text-muted">Loading…</p>;
  }

  const roleLabel = actingSuperAdmin ? 'Super Admin' : role === 'org_admin' ? 'Org Admin' : role === 'recruiter' ? 'Recruiter' : 'Panelist';
  const displayName = currentUser?.name || roleLabel;
  const initials = displayName.split(' ').map((part) => part[0]).slice(0, 2).join('').toUpperCase();
  const orgName = branding?.name || organizationSlug || 'Organization';
  const orgInitial = orgName[0]?.toUpperCase();

  return (
    <MotionConfig reducedMotion="user">
      <div className="v2" style={{ minHeight: '100vh', ...orgVars }}>
        <AppShell
          navItems={PANEL_NAV.filter((item) => actingSuperAdmin || access.has(item.permission)).map(({ permission: _permission, ...item }) => item)}
          orgName={orgName}
          orgLogoUrl={branding?.logoUrl ?? undefined}
          orgInitial={orgInitial}
          roleLabel={roleLabel}
          displayName={displayName}
          initials={initials}
          avatarUrl={currentUser?.avatarUrl ?? undefined}
          onLogout={handleLogout}
        >
          {children}
        </AppShell>
      </div>
    </MotionConfig>
  );
}
