'use client';

import { useEffect } from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useQuery } from '@tanstack/react-query';
import { SecurityShell, type MfaStatus, type SecurityPage, type SecurityShellLink } from '@yukthix/ui/auth';
import { Button, InlineAlert, Spinner } from '@yukthix/ui';
import { apiFetch } from '../../../lib/api-client';
import { useAuth } from '../../../lib/auth-context';
import { useCurrentUser } from '../../../lib/hooks/useCurrentUser';
import { roleToLandingPath } from '../../../lib/staff-routing';
import { useYxPermissions } from '../../../lib/yx-org';
import { usePeople } from '../../../lib/yx-people';
import type { TeamMember } from '@yukthix/ui/workforce';

const ME: SecurityShellLink = { id: 'me', label: 'My security', href: '/yx/me/security' };
const ACTIVITY: SecurityShellLink = { id: 'activity', label: 'Login activity', href: '/yx/admin/login-activity' };
const SETTINGS: SecurityShellLink = { id: 'settings', label: 'Security settings', href: '/yx/settings/security' };
const SMS: SecurityShellLink = { id: 'sms', label: 'Text messages (SMS)', href: '/yx/settings/sms' };
const ORG: SecurityShellLink[] = [
  { id: 'entities', label: 'Legal entities', href: '/yx/settings/legal-entities', group: 'Organisation' },
  { id: 'locations', label: 'Locations', href: '/yx/settings/locations', group: 'Organisation' },
  { id: 'structure', label: 'Structure', href: '/yx/settings/structure', group: 'Organisation' },
];
const DIRECTORY: SecurityShellLink = { id: 'directory', label: 'Directory', href: '/yx/people/directory', group: 'People' };
const ORG_CHART: SecurityShellLink = { id: 'org-chart', label: 'Org chart', href: '/yx/people/org-chart', group: 'People' };
const TEAM: SecurityShellLink = { id: 'team', label: 'My team', href: '/yx/people/team', group: 'People' };
const HISTORY: SecurityShellLink = { id: 'job-history', label: 'Job history', href: '/yx/people/history', group: 'People' };
const CHANGES: SecurityShellLink = { id: 'job-changes', label: 'Job changes', href: '/yx/people/changes', group: 'People' };
const PROBATION: SecurityShellLink = { id: 'probation', label: 'Probation', href: '/yx/people/probation', group: 'People' };
const BULK: SecurityShellLink = { id: 'bulk-changes', label: 'Bulk changes', href: '/yx/people/bulk-changes', group: 'People' };

// Links follow the role; the API still checks every permission (audit:view, org:manage_users,
// org:manage_settings) and the pages show "no access" on a 403. Platform staff outside any company
// manage the YukthiX shared SMS account.
function linksFor(role: string | null, acting: boolean): SecurityShellLink[] {
  if (acting || role === 'org_admin') return [ME, ACTIVITY, SETTINGS, SMS];
  if (role === 'super_admin') return [ME, SMS];
  if (role === 'auditor') return [ME, ACTIVITY];
  return [ME];
}

export default function YxAppLayout({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const { accessToken, role, actingSuperAdmin, isLoading, logout } = useAuth();
  const me = useCurrentUser();
  const perms = useYxPermissions();
  // Job history is for HR, and for anyone with an employee record (themselves and their team, P02 §4.3).
  const people = usePeople<unknown[]>('/employees');
  // My team and team probations appear for managers (P02 Q2, M01 §3.10).
  const team = usePeople<{ managerId: string | null; members: TeamMember[] }>('/team');
  // Shares the cache with My security, so the banner clears as soon as a factor is added there.
  const mfa = useQuery<MfaStatus>({ queryKey: ['yx', 'mfa'], queryFn: () => apiFetch('/auth/mfa', {}, accessToken ?? undefined), enabled: Boolean(accessToken) });
  const mfaOverdue = mfa.data?.required && mfa.data.factors.length === 0 && new Date(mfa.data.enrolmentDueAt) <= new Date();

  useEffect(() => {
    if (!isLoading && !accessToken) router.replace('/yx/sign-in');
  }, [isLoading, accessToken, router]);

  if (isLoading || !accessToken) {
    return (
      <div className="yx-auth">
        <Spinner label="Loading" size="md" />
      </div>
    );
  }

  // Organisation pages follow the person's grants (a Payroll Admin profile may hold them without an admin role).
  const org = perms.has('org.structure.view') || perms.has('org.settings.manage') || perms.has('pay.range.view') ? ORG : [];
  const hr = perms.has('employee.profile.view') || perms.has('employee.change.manage') || perms.has('employee.change.approve');
  const employee = Boolean(team.data?.managerId);
  const manager = Boolean(team.data?.members.length);
  const bulk = perms.has('employee.change.manage') || perms.has('employee.change.approve');
  const staff = [
    ...(hr || employee ? [DIRECTORY, ORG_CHART] : []),
    ...(manager ? [TEAM] : []),
    ...(hr || people.data?.length ? [HISTORY] : []),
    ...(hr || perms.has('request.raise_on_behalf') ? [CHANGES] : []),
    ...(hr || manager ? [PROBATION] : []),
    ...(bulk ? [BULK] : []),
    ...org,
  ];
  const security = linksFor(role, actingSuperAdmin);
  const links = staff.length ? [...security.map((l) => ({ ...l, group: 'Security' })), ...staff] : security;
  const active: SecurityPage = links.find((l) => pathname?.startsWith(l.href))?.id ?? 'me';
  return (
    <SecurityShell
      active={active}
      links={links}
      title={staff.length ? 'Settings' : 'Security'}
      homeHref={roleToLandingPath(role ?? undefined)}
      profileHref="/profile"
      name={me.data?.name || me.data?.email || 'Your account'}
      email={me.data?.email}
      onNavigate={(href) => router.push(href)}
      onSignOut={() => void logout().then(() => router.push('/yx/sign-in'))}
    >
      <div className="yx-auth__page">
        {mfaOverdue && active !== 'me' && (
          <InlineAlert
            tone="warning"
            title="Set up two-step verification"
            actions={
              <Button asChild size="sm">
                <Link href={ME.href}>Set it up now</Link>
              </Button>
            }
          >
            Your role needs a second sign-in step. Admin pages are paused until you add one.
          </InlineAlert>
        )}
        {children}
      </div>
    </SecurityShell>
  );
}
