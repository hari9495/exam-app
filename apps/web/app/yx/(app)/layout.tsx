'use client';

import { useEffect } from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useQuery } from '@tanstack/react-query';
import { WorkspaceShell, type MfaStatus, type WorkspaceLink, type WorkspacePage } from '@yukthix/ui/auth';
import { Button, InlineAlert, Spinner } from '@yukthix/ui';
import { apiFetch } from '../../../lib/api-client';
import { useAuth } from '../../../lib/auth-context';
import { useCurrentUser } from '../../../lib/hooks/useCurrentUser';
import { roleToLandingPath } from '../../../lib/staff-routing';
import { decodeJwtPayload } from '../../../lib/jwt';
import { useLanding } from '../../../lib/yx-landing';
import { withNextHere } from '../../../lib/safe-next';
import { useOrgBranding } from '../../../lib/hooks/useBranding';
import { useYxPermissions } from '../../../lib/yx-org';
import { usePeople } from '../../../lib/yx-people';
import type { TeamMember } from '@yukthix/ui/workforce';

const ME: WorkspaceLink = { id: 'me', label: 'My security', href: '/yx/me/security', group: 'Me' };
const ACTIVITY: WorkspaceLink = { id: 'activity', label: 'Login activity', href: '/yx/admin/login-activity', group: 'Security' };
const SETTINGS: WorkspaceLink = { id: 'settings', label: 'Security settings', href: '/yx/settings/security', group: 'Security' };
const IDPS: WorkspaceLink = { id: 'identity-providers', label: 'Single sign-on providers', href: '/yx/settings/identity-providers', group: 'Security' };
const SMS: WorkspaceLink = { id: 'sms', label: 'Text messages (SMS)', href: '/yx/settings/sms', group: 'Security' };
const SUPPORT: WorkspaceLink = { id: 'support-access', label: 'Support access', href: '/yx/settings/support-access', group: 'Security' };
const EMAILS: WorkspaceLink = { id: 'emails', label: 'Emails', href: '/yx/settings/emails', group: 'Security' };
const ORG: WorkspaceLink[] = [
  { id: 'entities', label: 'Legal entities', href: '/yx/settings/legal-entities', group: 'Organisation' },
  { id: 'locations', label: 'Locations', href: '/yx/settings/locations', group: 'Organisation' },
  { id: 'structure', label: 'Structure', href: '/yx/settings/structure', group: 'Organisation' },
];
const COMPANY_RULES: WorkspaceLink = { id: 'company-rules', label: 'Company rules', href: '/yx/settings/company-rules', group: 'Organisation' };
const DIRECTORY: WorkspaceLink = { id: 'directory', label: 'Directory', href: '/yx/people/directory', group: 'People' };
const ORG_CHART: WorkspaceLink = { id: 'org-chart', label: 'Org chart', href: '/yx/people/org-chart', group: 'People' };
const TEAM: WorkspaceLink = { id: 'team', label: 'My team', href: '/yx/people/team', group: 'People' };
const HISTORY: WorkspaceLink = { id: 'job-history', label: 'Job history', href: '/yx/people/history', group: 'People' };
const CHANGES: WorkspaceLink = { id: 'job-changes', label: 'Job changes', href: '/yx/people/changes', group: 'People' };
const PROBATION: WorkspaceLink = { id: 'probation', label: 'Probation', href: '/yx/people/probation', group: 'People' };
const BULK: WorkspaceLink = { id: 'bulk-changes', label: 'Bulk changes', href: '/yx/people/bulk-changes', group: 'People' };
const PROFILE: WorkspaceLink = { id: 'profile', label: 'My profile', href: '/yx/people/profile', group: 'People' };
const ID_CHANGES: WorkspaceLink = { id: 'profile-requests', label: 'Identity and bank changes', href: '/yx/people/profile-requests', group: 'People' };
const ACCESS: WorkspaceLink = { id: 'access', label: 'Roles & access', href: '/yx/settings/access', group: 'Access' };
const ACCESS_SETTINGS: WorkspaceLink = { id: 'access-settings', label: 'Access and privacy', href: '/yx/settings/access-settings', group: 'Access' };
const PRIVACY: WorkspaceLink = { id: 'privacy', label: 'Who accessed my data', href: '/yx/me/privacy', group: 'Me' };

// Links follow the role; the API still checks every permission (audit:view, org:manage_users,
// org:manage_settings) and the pages show "no access" on a 403. Platform staff outside any company use the
// platform console (/staff), where the YukthiX shared SMS account now lives.
function linksFor(role: string | null, acting: boolean): WorkspaceLink[] {
  if (acting || role === 'org_admin') return [ACTIVITY, SETTINGS, IDPS, SMS, ME];
  // The shared SMS account moved to the platform console (step 3).
  if (role === 'super_admin') return [ME];
  if (role === 'auditor') return [ACTIVITY, ME];
  return [ME];
}

export default function YxAppLayout({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const { accessToken, role, actingSuperAdmin, actingOrgName, isLoading, signedOut, logout, switchOutOfOrg } = useAuth();
  const me = useCurrentUser();
  const perms = useYxPermissions();
  // The hiring and assessment app (/v2) is offered only to people who hold its permissions.
  const access = useLanding();
  const branding = useOrgBranding();
  // Job history is for HR, and for anyone with an employee record (themselves and their team, P02 §4.3).
  const people = usePeople<unknown[]>('/employees');
  // My team and team probations appear for managers (P02 Q2, M01 §3.10).
  const team = usePeople<{ managerId: string | null; members: TeamMember[] }>('/team');
  // Shares the cache with My security, so the banner clears as soon as a factor is added there.
  const mfa = useQuery<MfaStatus>({ queryKey: ['yx', 'mfa'], queryFn: () => apiFetch('/auth/mfa', {}, accessToken ?? undefined), enabled: Boolean(accessToken) });
  // A sensitive role with no second step: a reminder during the grace period, a pause after it.
  const mfaMissing = Boolean(mfa.data?.required && mfa.data.factors.length === 0);
  const mfaOverdue = mfaMissing && new Date(mfa.data!.enrolmentDueAt) <= new Date();
  const mfaDue = mfa.data ? new Date(mfa.data.enrolmentDueAt).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' }) : '';

  useEffect(() => {
    // A lapsed session comes back here after sign-in; a deliberate sign-out does not (the next person is someone else).
    if (!isLoading && !accessToken && !signedOut) router.replace(withNextHere('/yx/sign-in'));
  }, [isLoading, accessToken, signedOut, router]);

  if (isLoading || !accessToken) {
    return (
      <div className="yx-auth">
        <Spinner label="Loading" size="md" />
      </div>
    );
  }

  // Organisation pages follow the person's grants (a Payroll Admin profile may hold them without an admin role).
  // Settings are read with the structure (GET /org/settings), not with pay-range access alone.
  // Admin menus only for people who can change them (founder review 7 Oct 2026): a manager may READ the structure
  // (department and location pickers use it) but gets no Organisation / Access settings in the menu.
  // YukthiX staff on a support session (P02 Q8) see the company's pages read-only; the API refuses every change.
  const support = actingSuperAdmin;
  const settingsAdmin = perms.has('org.settings.manage');
  const hr = support || perms.has('employee.profile.view') || perms.has('employee.change.manage') || perms.has('employee.change.approve');
  // HR reads the structure it hires into (read-only pages; changes stay with org.settings.manage). A manager who
  // only reads it for pickers still gets no Organisation menu (founder review 8 Oct 2026).
  const org = settingsAdmin || perms.has('pay.range.view') || support || (hr && perms.has('org.structure.view')) ? [...ORG, ...(settingsAdmin ? [COMPANY_RULES] : [])] : [];
  const employee = Boolean(team.data?.managerId);
  const manager = Boolean(team.data?.members.length);
  const bulk = perms.has('employee.change.manage') || perms.has('employee.change.approve');
  // P02 §4.4–4.5: one's own profile (or HR's view of others); the identity / bank queue for those who raise or decide.
  const idDesk = perms.has('employee.identity.approve') || perms.has('employee.identity.manage');
  const staff = [
    ...(hr || employee ? [PROFILE] : []),
    ...(hr || employee ? [DIRECTORY, ORG_CHART] : []),
    ...(manager ? [TEAM] : []),
    ...(hr || people.data?.length ? [HISTORY] : []),
    ...(hr || perms.has('request.raise_on_behalf') ? [CHANGES] : []),
    ...(hr || manager ? [PROBATION] : []),
    ...(bulk ? [BULK] : []),
    ...(idDesk ? [ID_CHANGES] : []),
    ...org,
    ...(perms.has('access.role.manage') ? [ACCESS] : []),
    // Read by anyone who reads the structure; changed with org.settings.manage (+ access.role.manage for guarded keys).
    ...(settingsAdmin ? [ACCESS_SETTINGS] : []),
  ];
  // P04 Q5: the company's email branding and wording, for those who hold the key (read-only in a support session).
  const emails = perms.has('notification.template.manage') || support ? [EMAILS] : [];
  const security = [...linksFor(role, actingSuperAdmin), ...emails, ...(perms.has('org.support_access.approve') && !support ? [SUPPORT] : []), ...(employee ? [PRIVACY] : [])];
  const supportEndsAt = support ? (decodeJwtPayload(accessToken)?.supportEndsAt as string | undefined) : undefined;
  const links = [...staff, ...security];
  // The link whose page this is, or one of its sub-pages: /yx/people/profile-requests is not My profile.
  const active: WorkspacePage = links.find((l) => pathname === l.href || pathname?.startsWith(`${l.href}/`))?.id ?? 'me';
  return (
    <WorkspaceShell
      active={active}
      links={links}
      company={branding.data?.name || undefined}
      hiringHref={access.examAts && !support ? roleToLandingPath(role ?? undefined) : undefined}
      // The account menu's "My profile" is the same page as the menu link, where the person has it.
      profileHref={links.includes(PROFILE) ? PROFILE.href : '/profile'}
      name={me.data?.name || me.data?.email || 'Your account'}
      email={me.data?.email}
      onNavigate={(href) => router.push(href)}
      onSignOut={() => void logout().then((to) => router.push(to))}
    >
      <div className="yx-auth__page">
        {support && (
          <InlineAlert
            tone="warning"
            title={`Support session in ${actingOrgName ?? 'this company'}${supportEndsAt ? ` until ${new Date(supportEndsAt).toLocaleString('en-IN', { day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' })}` : ''}`}
            actions={
              <Button size="sm" onClick={() => void switchOutOfOrg().then(() => router.push('/staff/support'))}>
                Leave the company
              </Button>
            }
          >
            Read-only. Pay, identity and bank details are hidden, and the company sees every page you open.
          </InlineAlert>
        )}
        {/* Everywhere except My security itself, where it is set up (pages outside the menu fall back to 'me'). */}
        {mfaMissing && pathname !== ME.href && (
          <InlineAlert
            tone="warning"
            title="Secure your account"
            actions={
              <Button asChild size="sm">
                <Link href={ME.href}>Set it up now</Link>
              </Button>
            }
          >
            {mfaOverdue
              ? 'Your role needs a passkey or an authenticator app. Admin pages are paused until you add one.'
              : `Your role needs a passkey or an authenticator app. Set it up by ${mfaDue}; after that, admin pages pause until you add one.`}
          </InlineAlert>
        )}
        {children}
      </div>
    </WorkspaceShell>
  );
}
