'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { FileText, Languages, ShieldCheck, UserRound } from 'lucide-react';
import { Button, CommandPalette, InlineAlert, NotificationCentre, ProfileMenu, ScopePicker, Spinner, useCommandPaletteShortcut, type PaletteGroup, type PaletteItem } from '@yukthix/ui';
import { useAppearance, type MfaStatus } from '@yukthix/ui/auth';
import { DesktopFrame, PALETTE_PLACEHOLDER, SCREEN_RAIL, type AreaId } from '@yukthix/ui/frame';
import type { LegalEntity } from '@yukthix/ui/org';
import type { TeamMember } from '@yukthix/ui/workforce';
import { apiFetch } from '../../../lib/api-client';
import { useAuth } from '../../../lib/auth-context';
import { useCurrentUser } from '../../../lib/hooks/useCurrentUser';
import { useNotifications, useMarkAllNotificationsRead, useMarkNotificationRead } from '../../../lib/hooks/useNotifications';
import { notificationText } from '../../../lib/notification-text';
import { decodeJwtPayload } from '../../../lib/jwt';
import { withNextHere } from '../../../lib/safe-next';
import { useOrg, useYxPermissions } from '../../../lib/yx-org';
import { usePeople } from '../../../lib/yx-people';
import { useLife } from '../../../lib/yx-lifecycle';
import { ME_SECURITY, activeLink, buildNav, type NavArea } from '../../../lib/yx-nav';
import { ScopeProvider, recentMonths, useScope, useWorkspaceCounts, useWorkspaceSearch } from '../../../lib/yx-shell';
import { DeskHelp } from './desk-help';

// Pages outside the menu (a record, a sub-page) still light up their area.
const AREA_BY_PATH: [string, AreaId][] = [['/yx/people', 'people'], ['/yx/time', 'time'], ['/yx/payroll', 'pay'], ['/yx/expenses', 'pay'], ['/yx/hiring', 'hire'], ['/yx/performance', 'performance'], ['/yx/desk', 'helpdesk'], ['/yx/settings', 'settings'], ['/yx/admin', 'settings'], ['/yx/support', 'settings']];
const COLLAPSE_KEY = 'yx-panel-collapsed';
const SEARCH_GROUPS = [
  ['people', 'People', '@'],
  ['requests', 'Requests', '#'],
  ['tickets', 'Tickets', '#'],
  ['candidates', 'Candidates', '@'],
] as const;

export default function YxAppLayout({ children }: { children: React.ReactNode }) {
  return (
    <ScopeProvider>
      <Frame>{children}</Frame>
    </ScopeProvider>
  );
}

// The YukthiX app frame (design audit step 1): the designed DesktopFrame with the live menu, search, bell, scope,
// help and account menu. Links follow the person's grants; the API still checks every call and pages show "no access"
// on a 403. Platform staff outside any company use the platform console (/staff).
function Frame({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const pathname = usePathname() ?? '';
  const qc = useQueryClient();
  const { accessToken, role, actingSuperAdmin, actingOrgName, isLoading, signedOut, logout, switchOutOfOrg } = useAuth();
  const me = useCurrentUser();
  const perms = useYxPermissions();
  const appearance = useAppearance();
  const { scope, setScope } = useScope();
  // Job history is for HR, and for anyone with an employee record (themselves and their team, P02 §4.3).
  const people = usePeople<unknown[]>('/employees');
  // My team and team probations appear for managers (P02 Q2, M01 §3.10).
  const team = usePeople<{ managerId: string | null; members: TeamMember[] }>('/team');
  // Checklist tasks reach IT, Admin and managers too (founder D1): the menu shows them to whoever has some.
  const myTasks = useLife<{ tasks: unknown[] }>('/lifecycle/my-tasks');
  const myClearance = useLife<{ rows: unknown[] }>('/lifecycle/clearance/mine');
  const firstDays = useLife<{ card: unknown }>('/lifecycle/me/first-30-days');
  const counts = useWorkspaceCounts();
  // Shares the cache with My security, so the banner clears as soon as a factor is added there.
  const mfa = useQuery<MfaStatus>({ queryKey: ['yx', 'mfa'], queryFn: () => apiFetch('/auth/mfa', {}, accessToken ?? undefined), enabled: Boolean(accessToken) });
  const [paletteOpen, setPaletteOpen] = useState(false);
  const [typed, setTyped] = useState('');
  const search = useWorkspaceSearch(paletteOpen ? typed : '');
  const [helpOpen, setHelpOpen] = useState(false);
  const notifications = useNotifications();
  const markRead = useMarkNotificationRead();
  const markAll = useMarkAllNotificationsRead();
  const [collapsed, setCollapsedState] = useState(false);
  useEffect(() => {
    try {
      setCollapsedState(window.localStorage.getItem(COLLAPSE_KEY) === '1');
    } catch {
      /* private window */
    }
  }, []);
  const setCollapsed = (c: boolean) => {
    setCollapsedState(c);
    try {
      window.localStorage.setItem(COLLAPSE_KEY, c ? '1' : '0');
    } catch {
      /* private window: this visit only */
    }
  };
  useCommandPaletteShortcut(() => setPaletteOpen((o) => !o));

  const support = actingSuperAdmin;
  const employee = Boolean(team.data?.managerId);
  const nav = useMemo(
    () =>
      buildNav({
        has: (k) => perms.has(k as never),
        role,
        support,
        employee,
        manager: Boolean(team.data?.members.length),
        history: Boolean(people.data?.length),
        clearance: Boolean(myClearance.data?.rows.length),
        tasks: Boolean(myTasks.data?.tasks.length),
        firstDays: Boolean(firstDays.data?.card),
      }),
    // perms.data drives perms.has
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [perms.data, role, support, employee, team.data, people.data, myClearance.data, myTasks.data, firstDays.data],
  );
  // Company / period button: people who read the structure, when there is more than one entity; the period for pay.
  const seesEntities = perms.has('org.structure.view') || perms.has('org.settings.manage');
  const entities = useOrg<LegalEntity[]>('/legal-entities', seesEntities);
  const payPeriods = !support && (perms.has('payroll.run.view') || perms.has('payroll.run.prepare') || perms.has('payroll.run.approve'));

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

  const hit = activeLink(nav, pathname);
  const areaId: AreaId = hit?.area.id ?? AREA_BY_PATH.find(([p]) => pathname.startsWith(p))?.[1] ?? 'home';
  const area: NavArea = nav.find((a) => a.id === areaId) ?? nav[0];
  const first = (a: NavArea) => a.sections[0].items[0];
  const rail = SCREEN_RAIL.flatMap((r) => {
    const a = nav.find((x) => x.id === r.id);
    return a ? [{ ...r, href: first(a).href }] : [];
  });
  const panel = area.sections.map((s) => ({
    label: s.label,
    items: s.items.map((l) => ({ label: l.label, href: l.href, active: l.id === hit?.link.id, count: l.count ? counts.data?.[l.count] : undefined })),
  }));
  // Breadcrumbs below the top level (founder decision 15 Oct 2026): Area › Page.
  const crumbs = hit && (hit.link.id !== first(hit.area).id || pathname !== hit.link.href) ? [{ label: hit.area.title, href: first(hit.area).href }, { label: hit.link.label }] : undefined;
  const go = (href: string) => router.push(href);

  const mfaMissing = Boolean(mfa.data?.required && mfa.data.factors.length === 0);
  const mfaOverdue = mfaMissing && new Date(mfa.data!.enrolmentDueAt) <= new Date();
  const mfaDue = mfa.data ? new Date(mfa.data.enrolmentDueAt).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' }) : '';
  const supportEndsAt = support ? (decodeJwtPayload(accessToken)?.supportEndsAt as string | undefined) : undefined;
  const banner = (
    <>
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
      {/* Everywhere except My security itself, where it is set up. */}
      {mfaMissing && pathname !== ME_SECURITY && (
        <InlineAlert
          tone="warning"
          title="Secure your account"
          actions={
            <Button asChild size="sm">
              <Link href={ME_SECURITY}>Set it up now</Link>
            </Button>
          }
        >
          {mfaOverdue
            ? 'Your role needs a passkey or an authenticator app. Admin pages are paused until you add one.'
            : `Your role needs a passkey or an authenticator app. Set it up by ${mfaDue}; after that, admin pages pause until you add one.`}
        </InlineAlert>
      )}
    </>
  );

  // Search: the server's people, requests, tickets and candidates (each only what the person may open), and every page
  // in their menu as an action.
  const hrefs = new Map<string, string>();
  const groups: PaletteGroup[] = [
    ...SEARCH_GROUPS.flatMap(([key, heading, prefix]) => {
      const hits = search.data?.[key] ?? [];
      return hits.length ? [{ heading, prefix, items: hits.map((h) => (hrefs.set(`${key}:${h.id}`, h.href), { id: `${key}:${h.id}`, label: h.label, secondary: h.secondary, keywords: [typed.replace(/^[@#>?]\s*/, '')] })) }] : [];
    }),
    {
      heading: 'Go to',
      prefix: '>',
      items: nav.flatMap((a) => a.sections.flatMap((s) => s.items.map((l) => (hrefs.set(`go:${l.href}`, l.href), { id: `go:${l.href}`, label: l.label, secondary: a.title, keywords: [s.label ?? ''] })))),
    },
  ];
  const entityList = entities.data?.filter((e) => !e.archivedAt) ?? [];
  const scopePicker =
    entityList.length > 1 || payPeriods ? (
      <ScopePicker
        entities={entityList.length > 1 ? [{ id: 'all', name: `All entities (${entityList.length})`, gstin: '', state: '' }, ...entityList.map((e) => ({ id: e.id, name: e.name, gstin: '', state: e.registeredAddress?.state ?? '' }))] : []}
        entity={scope.entity ?? 'all'}
        onEntityChange={(id) => setScope({ ...scope, entity: !id || id === 'all' ? null : id })}
        periods={payPeriods ? recentMonths() : undefined}
        period={scope.period}
        onPeriodChange={(p) => p && setScope({ ...scope, period: p })}
      />
    ) : undefined;
  const meHref = (id: string) => nav.flatMap((a) => a.sections.flatMap((s) => s.items)).find((l) => l.id === id)?.href;
  const accountLinks = [
    ...(meHref('my-documents') ? [{ label: 'Documents & letters', icon: FileText, onSelect: () => go(meHref('my-documents')!) }] : []),
    ...(meHref('my-data') ? [{ label: 'My data', icon: UserRound, onSelect: () => go(meHref('my-data')!) }] : []),
    ...(meHref('my-language') ? [{ label: 'Language', icon: Languages, onSelect: () => go(meHref('my-language')!) }] : []),
    { label: 'My security', icon: ShieldCheck, onSelect: () => go(ME_SECURITY) },
  ];
  const profileHref = meHref('profile') ?? '/profile';

  return (
    <DesktopFrame
      area={area.id}
      panelTitle={area.title}
      panel={panel}
      railItems={rail}
      live={{
        onNavigate: go,
        onSearch: () => setPaletteOpen(true),
        onHelp: support ? undefined : () => setHelpOpen(true),
        scope: scopePicker,
        notifications: (
          <NotificationCentre
            items={(notifications.data ?? []).map((n) => ({ id: n.id, actor: { name: n.actorName ?? 'YukthiX' }, text: notificationText(n), at: new Date(n.createdAt), read: Boolean(n.readAt), href: n.linkPath }))}
            loading={notifications.isLoading}
            onMarkAllRead={() => markAll.mutate(undefined, { onSuccess: () => void qc.invalidateQueries({ queryKey: ['yx', 'workspace', 'counts'] }) })}
            onOpenItem={(it) => !it.read && markRead.mutate(it.id)}
            settingsHref="/profile"
          />
        ),
        profile: (
          <ProfileMenu
            name={me.data?.name || me.data?.email || 'Your account'}
            email={me.data?.email}
            onProfile={() => go(profileHref)}
            onPreferences={() => go('/profile')}
            links={accountLinks}
            onSignOut={() => void logout().then((to) => router.push(to))}
            theme={appearance.theme}
            onThemeChange={appearance.setTheme}
            density={appearance.density}
            onDensityChange={appearance.setDensity}
          />
        ),
        banner,
        breadcrumbs: crumbs,
        panelCollapsed: collapsed,
        onPanelCollapsedChange: setCollapsed,
        tabs: { home: '/yx/home', ...(support ? {} : { requests: '/yx/approvals' }), ...(employee && !support ? { time: '/yx/time/attendance', pay: '/yx/me/payslips' } : {}), me: profileHref },
        overlays: (
          <>
            <CommandPalette
              groups={groups}
              open={paletteOpen}
              onOpenChange={(o) => {
                setPaletteOpen(o);
                if (!o) setTyped('');
              }}
              onQueryChange={setTyped}
              loading={search.loading}
              placeholder={PALETTE_PLACEHOLDER}
              onSelect={(item: PaletteItem) => {
                const href = hrefs.get(item.id);
                if (href) go(href);
              }}
            />
            {!support && <DeskHelp open={helpOpen} onOpenChange={setHelpOpen} />}
          </>
        ),
      }}
    >
      {children}
    </DesktopFrame>
  );
}
