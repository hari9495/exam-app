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

const ME: SecurityShellLink = { id: 'me', label: 'My security', href: '/yx/me/security' };
const ACTIVITY: SecurityShellLink = { id: 'activity', label: 'Login activity', href: '/yx/admin/login-activity' };
const SETTINGS: SecurityShellLink = { id: 'settings', label: 'Security settings', href: '/yx/settings/security' };

// Links follow the role; the API still checks every permission (audit:view, org:manage_users,
// org:manage_settings) and the pages show "no access" on a 403.
function linksFor(role: string | null, acting: boolean): SecurityShellLink[] {
  if (acting || role === 'org_admin') return [ME, ACTIVITY, SETTINGS];
  if (role === 'auditor') return [ME, ACTIVITY];
  return [ME];
}

export default function YxAppLayout({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const { accessToken, role, actingSuperAdmin, isLoading, logout } = useAuth();
  const me = useCurrentUser();
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

  const links = linksFor(role, actingSuperAdmin);
  const active: SecurityPage = links.find((l) => pathname?.startsWith(l.href))?.id ?? 'me';
  return (
    <SecurityShell
      active={active}
      links={links}
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
