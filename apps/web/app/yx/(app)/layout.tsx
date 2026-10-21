'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Database, FileText, Languages, ShieldCheck } from 'lucide-react';
import { Button, CommandPalette, InlineAlert, NoticeBar, NotificationCentre, ProfileMenu, ScopePicker, Spinner, ToastProvider, useCommandPaletteShortcut } from '@yukthix/ui';
import { useAppearance, type MfaStatus } from '@yukthix/ui/auth';
import { DesktopFrame, PALETTE_PLACEHOLDER, SCREEN_RAIL, type AreaId } from '@yukthix/ui/frame';
import type { LegalEntity } from '@yukthix/ui/org';
import type { TeamMember } from '@yukthix/ui/workforce';
import { apiFetch } from '../../../lib/api-client';
import { useAuth } from '../../../lib/auth-context';
import { useCurrentUser } from '../../../lib/hooks/useCurrentUser';
import { useMarkAllNotificationsRead, useMarkNotificationRead } from '../../../lib/hooks/useNotifications';
import { useBellItems } from '../../../lib/yx-bell';
import { useYxPalette } from '../../../lib/yx-palette';
import { decodeJwtPayload } from '../../../lib/jwt';
import { withNextHere } from '../../../lib/safe-next';
import { todayIst, useOrg, useYxPermissions, type Reference } from '../../../lib/yx-org';
import { hiddenToday, hideForToday, localStore } from '../../../lib/yx-notice';
import { usePeople } from '../../../lib/yx-people';
import { useLife } from '../../../lib/yx-lifecycle';
import { ME_SECURITY, activeLink, buildNav, type NavArea } from '../../../lib/yx-nav';
import { ScopeProvider, recentMonths, useScope, useWorkspaceCounts } from '../../../lib/yx-shell';
import { DeskHelp } from './desk-help';

// Pages outside the menu (a record, a sub-page) still light up their area.
const AREA_BY_PATH: [string, AreaId][] = [['/yx/people', 'people'], ['/yx/time', 'time'], ['/yx/payroll', 'pay'], ['/yx/expenses', 'pay'], ['/yx/hiring', 'hire'], ['/yx/performance', 'performance'], ['/yx/desk', 'helpdesk'], ['/yx/settings', 'settings'], ['/yx/admin', 'settings'], ['/yx/support', 'settings']];
const COLLAPSE_KEY = 'yx-panel-collapsed';

export default function YxAppLayout({ children }: { children: React.ReactNode }) {
  return (
    <ScopeProvider>
      {/* "Done" messages are the design system's toasts (5 s); errors stay until closed. */}
      <ToastProvider>
        <Frame>{children}</Frame>
      </ToastProvider>
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
  const [helpOpen, setHelpOpen] = useState(false);
  const bell = useBellItems(!actingSuperAdmin);
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
  // Ctrl K as designed (PLT-20): Recent, Actions, people, requests and tickets, pages when typed.
  const palette = useYxPalette({ nav, pathname, open: paletteOpen, userId: me.data?.id, orgId: me.data?.organizationId, waiting: counts.data?.approvals, self: employee && !support, help: !support, go: (href) => {
      setPaletteOpen(false); // whatever search opens, the search box closes first (founder, 19 Oct 2026)
      router.push(href);
    },
    openHelp: () => {
      setPaletteOpen(false);
      setHelpOpen(true);
    },
  });
  // Company / period button: people who read the structure, when there is more than one entity; the period for pay.
  const seesEntities = perms.has('org.structure.view') || perms.has('org.settings.manage');
  const entities = useOrg<LegalEntity[]>('/legal-entities', seesEntities);
  // The company list shows the state's name (Karnataka), as designed, not its code.
  const reference = useOrg<Reference>('/reference', seesEntities);
  const stateName = (code?: string | null) => (code ? (reference.data?.states.find((x) => x.code === code)?.name ?? code) : '');
  // The period is for pay, and for the month the HR Home counts (attendance exceptions, joining this month).
  const payPeriods = !support && (perms.has('payroll.run.view') || perms.has('payroll.run.prepare') || perms.has('payroll.run.approve') || perms.has('attendance.view'));

  // MFA notice: before the deadline the person may hide it until tomorrow (founder 20 Oct 2026); after it, it stays.
  const userId = me.data?.id;
  const [mfaHidden, setMfaHidden] = useState(false);
  useEffect(() => setMfaHidden(Boolean(userId) && hiddenToday(localStore(), 'mfa', userId!, todayIst())), [userId]);

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
      {mfaMissing && pathname !== ME_SECURITY && (mfaOverdue || !mfaHidden) && (
        <NoticeBar
          tone={mfaOverdue ? 'danger' : 'warning'}
          action={
            <Link className="yx-link" href={ME_SECURITY}>
              Set it up
            </Link>
          }
          onDismiss={
            mfaOverdue || !userId
              ? undefined
              : () => {
                  hideForToday(localStore(), 'mfa', userId, todayIst());
                  setMfaHidden(true);
                }
          }
        >
          {mfaOverdue ? 'Admin pages are paused until you add a passkey or an authenticator app.' : `Add a passkey or an authenticator app by ${mfaDue}. After that, admin pages pause.`}
        </NoticeBar>
      )}
    </>
  );

  const entityList = entities.data?.filter((e) => !e.archivedAt) ?? [];
  // Only Home reads the month (its counts); every other page shows the company alone, as designed (PLT-01, PPL-01).
  const showPeriod = payPeriods && pathname === '/yx/home';
  const scopePicker =
    entityList.length > 1 || showPeriod ? (
      <ScopePicker
        entities={entityList.length > 1 ? [{ id: 'all', name: `All entities (${entityList.length})`, gstin: '', state: '' }, ...entityList.map((e) => ({ id: e.id, name: e.name, gstin: e.gstin ?? '', state: stateName(e.registeredAddress?.state) }))] : []}
        entity={scope.entity ?? 'all'}
        onEntityChange={(id) => setScope({ ...scope, entity: !id || id === 'all' ? null : id })}
        periods={showPeriod ? recentMonths() : undefined}
        period={scope.period}
        onPeriodChange={(p) => p && setScope({ ...scope, period: p })}
      />
    ) : undefined;
  const meHref = (id: string) => nav.flatMap((a) => a.sections.flatMap((s) => s.items)).find((l) => l.id === id)?.href;
  const accountLinks = [
    ...(meHref('my-documents') ? [{ label: 'Documents & letters', icon: FileText, onSelect: () => go(meHref('my-documents')!) }] : []),
    ...(meHref('my-data') ? [{ label: 'My data', icon: Database, onSelect: () => go(meHref('my-data')!) }] : []),
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
            items={bell.items}
            loading={bell.loading}
            onMarkAllRead={() => markAll.mutate(undefined, { onSuccess: () => void qc.invalidateQueries({ queryKey: ['yx', 'workspace', 'counts'] }) })}
            onOpenItem={(it) => !it.read && markRead.mutate(it.id)}
            settingsHref="/yx/me/notifications"
            allHref="/yx/notifications"
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
              groups={palette.groups}
              open={paletteOpen}
              onOpenChange={(o) => {
                setPaletteOpen(o);
                if (!o) palette.reset();
              }}
              onQueryChange={palette.onQueryChange}
              loading={palette.loading}
              placeholder={PALETTE_PLACEHOLDER}
              onSelect={palette.onSelect}
              onClearRecent={palette.onClearRecent}
              onSearchAll={(q) => {
                setPaletteOpen(false);
                go(`/yx/search?q=${encodeURIComponent(q.trim().replace(/^[@#>?]\s*/, ''))}`);
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
