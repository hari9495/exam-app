'use client';

import { useEffect } from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useQuery } from '@tanstack/react-query';
import { ConsoleShell, CONSOLE_LINKS, type ConsolePageId } from '@yukthix/ui/console';
import type { MfaStatus } from '@yukthix/ui/auth';
import { Button, InlineAlert, Spinner, ToastProvider } from '@yukthix/ui';
import { STAFF_SIGN_IN, apiFetch } from '../../../lib/api-client';
import { useAuth } from '../../../lib/auth-context';
import { useCurrentUser } from '../../../lib/hooks/useCurrentUser';
import { withNextHere } from '../../../lib/safe-next';

const SECURITY = '/staff/security';

interface StaffNotices {
  unread: number;
  items: { id: string; kind: string; title: string; body: string; linkPath: string | null; at: string; read: boolean }[];
}

// The YukthiX platform console (P14 §7): YukthiX staff only, on their own platform session (never from inside a
// company), with a security key (P12 Q7). The API checks all of this on every call; this only routes and explains.
export default function ConsoleLayout({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const { accessToken, role, actingSuperAdmin, actingOrgName, isLoading, signedOut, logout, switchOutOfOrg } = useAuth();
  const me = useCurrentUser();
  const staff = role === 'super_admin' && !actingSuperAdmin;
  const mfa = useQuery<MfaStatus>({ queryKey: ['yx', 'mfa'], queryFn: () => apiFetch('/auth/mfa', {}, accessToken ?? undefined), enabled: Boolean(accessToken) && staff });
  // Answer 2093: the staff member's own notices (the bell), checked every minute once the security key is there.
  const notices = useQuery<StaffNotices>({
    queryKey: ['platform', 'notices'],
    queryFn: () => apiFetch('/platform/notices', {}, accessToken ?? undefined) as Promise<StaffNotices>,
    enabled: Boolean(accessToken) && staff && Boolean(mfa.data && mfa.data.factors.length > 0),
    refetchInterval: 60_000,
  });
  const post = (path: string) => apiFetch(path, { method: 'POST' }, accessToken ?? undefined).then(() => notices.refetch());

  useEffect(() => {
    if (isLoading) return;
    if (!accessToken) router.replace(signedOut ? STAFF_SIGN_IN : withNextHere(STAFF_SIGN_IN));
    else if (role && role !== 'super_admin') router.replace('/yx/me/security');
  }, [isLoading, accessToken, signedOut, role, router]);

  if (isLoading || !accessToken || (role && role !== 'super_admin')) {
    return (
      <div className="yx-auth">
        <Spinner label="Loading" size="md" />
      </div>
    );
  }

  const active: ConsolePageId = CONSOLE_LINKS.find((l) => pathname?.startsWith(l.href))?.id ?? 'companies';
  const noKey = Boolean(mfa.data && mfa.data.factors.length === 0);
  // Screens say "done" with a toast (the SMS settings among them), as in the company app.
  return (
    <ToastProvider>
      <ConsoleShell
        active={active}
        name={me.data?.name || me.data?.email || 'YukthiX staff'}
        email={me.data?.email}
        securityHref={SECURITY}
        onNavigate={(href) => router.push(href)}
        onSignOut={() => void logout().then((to) => router.push(to))}
        notices={
          notices.data
            ? {
                items: notices.data.items.map((n) => ({ id: n.id, system: true, actor: { name: 'YukthiX' }, text: `${n.title}. ${n.body}`, at: new Date(n.at), read: n.read, href: n.linkPath ?? undefined })),
                unread: notices.data.unread,
                onMarkAllRead: () => void post('/platform/notices/read-all'),
                // The notice's own link opens its page; opening it marks it read.
                onOpenItem: (it) => {
                  if (!it.read) void post(`/platform/notices/${encodeURIComponent(it.id)}/read`);
                },
              }
            : undefined
        }
      >
        <div className="yx-auth__page">
          {actingSuperAdmin ? (
            <InlineAlert
              tone="warning"
              title={`You are inside ${actingOrgName ?? 'a company'} on a support session`}
              actions={
                <Button size="sm" onClick={() => void switchOutOfOrg()}>
                  Leave the company
                </Button>
              }
            >
              Leave it to use the console.
            </InlineAlert>
          ) : noKey && pathname !== SECURITY ? (
            <InlineAlert
              tone="warning"
              title="Add your security key first"
              actions={
                <Button asChild size="sm">
                  <Link href={SECURITY}>Add a security key</Link>
                </Button>
              }
            >
              YukthiX staff use the console only with a hardware security key. Sign in again with it after adding it.
            </InlineAlert>
          ) : (
            children
          )}
        </div>
      </ConsoleShell>
    </ToastProvider>
  );
}
