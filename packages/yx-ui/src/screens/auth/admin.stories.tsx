import type { Meta, StoryObj } from '@storybook/react-vite';
import { useState } from 'react';
import { LoginActivityScreen, NO_FILTERS, type LoginActivityFilters, type LoginActivityScreenProps } from './login-activity';
import { SecuritySettingsScreen, type SecuritySettingsScreenProps } from './security-settings';
import { SecurityShell, type SecurityPage } from './shell';
import { ADMINS, FLOOR, IDPS, ORG_EVENTS, ORG_SESSIONS, PEOPLE, POLICY } from './data';

const meta: Meta = { title: 'Screens/Security/Admin', parameters: { layout: 'fullscreen' } };
export default meta;
type S = StoryObj;

const wait = (ms = 600) => new Promise<void>((r) => setTimeout(r, ms));
const LINKS = [
  { id: 'me' as const, label: 'My security', href: '#me' },
  { id: 'activity' as const, label: 'Login activity', href: '#activity' },
  { id: 'settings' as const, label: 'Security settings', href: '#settings' },
];
const Shell = ({ active, children }: { active: SecurityPage; children: React.ReactNode }) => (
  <SecurityShell active={active} links={LINKS} homeHref="#home" profileHref="#profile" name="Arjun Kulkarni" email="arjun.k@kaverifoods.in" onSignOut={() => {}}>
    {children}
  </SecurityShell>
);

function Activity(over: Partial<LoginActivityScreenProps>) {
  const [tab, setTab] = useState<'events' | 'sessions'>(over.tab ?? 'events');
  const [filters, setFilters] = useState<LoginActivityFilters>(NO_FILTERS);
  const events = { ...ORG_EVENTS, data: ORG_EVENTS.data.filter((e) => (!filters.result || e.result === filters.result) && (!filters.method || e.method === filters.method)) };
  return (
    <Shell active="activity">
      <LoginActivityScreen
        events={events}
        eventsState="ready"
        filters={filters}
        onFiltersChange={setFilters}
        onEventsPage={() => {}}
        failedLast24h={2}
        people={PEOPLE}
        sessions={ORG_SESSIONS}
        sessionsState="ready"
        onSessionsPage={() => {}}
        onRevokeSession={() => wait()}
        onUnlock={() => wait()}
        {...over}
        tab={tab}
        onTabChange={setTab}
      />
    </Shell>
  );
}

export const LoginActivity: S = { name: 'Login activity · attempts', render: () => <Activity /> };
export const LoginActivityUnlock: S = {
  name: 'Login activity · unlock a locked account',
  render: () => <Activity />,
  play: async ({ canvasElement }) => {
    const button = canvasElement.querySelector<HTMLButtonElement>('button[aria-label^="Unlock "]');
    button?.click();
  },
};
export const LoginActivityUnlockRefused: S = {
  name: 'Login activity · unlock refused',
  render: () => (
    <Activity
      onUnlock={async () => {
        await wait(300);
        throw new Error('User not found');
      }}
    />
  ),
};
export const LoginActivitySpike: S = { name: 'Login activity · many failed attempts', render: () => <Activity failedLast24h={46} /> };
export const LoginActivitySessions: S = { name: 'Login activity · signed in now', render: () => <Activity tab="sessions" /> };
export const LoginActivityLoading: S = { name: 'Login activity · loading', render: () => <Activity events={null} eventsState="loading" failedLast24h={null} /> };
export const LoginActivityError: S = { name: 'Login activity · could not load', render: () => <Activity events={null} eventsState="error" onRetry={() => {}} /> };
export const LoginActivityEmpty: S = {
  name: 'Login activity · nothing yet',
  render: () => <Activity events={{ data: [], total: 0, page: 1, pageSize: 25 }} failedLast24h={0} sessions={{ data: [], total: 0, page: 1, pageSize: 25 }} />,
};
export const LoginActivityPhone: S = { name: 'Login activity · phone', globals: { viewport: { value: 'phone' } }, render: () => <Activity /> };
export const LoginActivitySessionsPhone: S = { name: 'Login activity · signed in now · phone', globals: { viewport: { value: 'phone' } }, render: () => <Activity tab="sessions" /> };

function Settings(over: Partial<SecuritySettingsScreenProps>) {
  return (
    <Shell active="settings">
      <SecuritySettingsScreen
        state="ready"
        policy={POLICY}
        floor={FLOOR}
        updatedAt="2026-09-04T18:00:00+05:30"
        providers={IDPS}
        admins={ADMINS}
        providersHref="#identity-providers"
        onSave={() => wait()}
        {...over}
      />
    </Shell>
  );
}

export const SecuritySettings: S = { name: '2.3 Security', render: () => <Settings /> };
export const SecuritySettingsSsoOnly: S = {
  name: '2.3 Security · single sign-on only',
  render: () => <Settings policy={{ ...POLICY, ssoOnly: true, breakGlassUserIds: [ADMINS[0].id], mfaScope: 'all', sessionIdleMinutes: 15 }} />,
};
export const SecuritySettingsStrictLockout: S = {
  name: '2.3 Security · strict lockout',
  render: () => <Settings policy={{ ...POLICY, maxFailedAttempts: 3, lockMinutes: 60 }} />,
};
export const SecuritySettingsSaveFails: S = {
  name: '2.3 Security · save refused',
  render: () => (
    <Settings
      onSave={async () => {
        await wait(300);
        throw new Error('203.0.113.0/33 is not a valid IP address or range.');
      }}
    />
  ),
};
export const SecuritySettingsNoProviders: S = { name: '2.3 Security · no identity providers', render: () => <Settings providers={[]} /> };
export const SecuritySettingsLoading: S = { name: '2.3 Security · loading', render: () => <Settings state="loading" policy={null} floor={null} /> };
export const SecuritySettingsError: S = { name: '2.3 Security · could not load', render: () => <Settings state="error" policy={null} floor={null} onRetry={() => {}} /> };
export const SecuritySettingsNoAccess: S = { name: '2.3 Security · no access', render: () => <Settings state="no-access" policy={null} floor={null} /> };
export const SecuritySettingsPhone: S = { name: '2.3 Security · phone', globals: { viewport: { value: 'phone' } }, render: () => <Settings /> };
