import type { Meta, StoryObj } from '@storybook/react-vite';
import { useState } from 'react';
import { LoginActivityScreen, NO_FILTERS, type AccountFilter, type AccountRow, type LoginActivityFilters, type LoginActivityScreenProps, type LoginActivityTab } from './login-activity';
import { SecuritySettingsScreen, type SecuritySettingsScreenProps } from './security-settings';
import { LinksFrame, type StoryLink } from '../_kit/story-frame';
import { ADMINS, FLOOR, IDPS, ORG_EVENTS, ORG_SESSIONS, PEOPLE, POLICY } from './data';

const meta: Meta = { title: 'Screens/Security/Admin', parameters: { layout: 'fullscreen' } };
export default meta;
type S = StoryObj;

const wait = (ms = 600) => new Promise<void>((r) => setTimeout(r, ms));
const ACCOUNT_ROWS: AccountRow[] = [
  { id: 'u1', name: 'Lakshmi Venkatesan', email: 'lakshmi@kaverifoods.in', roleLabel: 'System Admin', status: 'active', lastLoginAt: '2026-11-17T09:12:00+05:30', twoStep: true, self: true },
  { id: 'u2', name: 'Ravi Kumar', email: 'ravi.kumar@kaverifoods.in', roleLabel: 'Employee', status: 'active', lastLoginAt: '2026-11-16T18:40:00+05:30', twoStep: false },
  { id: 'u3', name: 'Meena Iyer', email: 'meena.iyer@kaverifoods.in', roleLabel: 'HR', status: 'invited', lastLoginAt: null, twoStep: false },
  { id: 'u4', name: 'Suresh Pillai', email: 'suresh.pillai@kaverifoods.in', roleLabel: 'Payroll Admin', status: 'active', lastLoginAt: '2026-11-15T10:05:00+05:30', twoStep: true },
  { id: 'u5', name: 'Kavya Reddy', email: 'kavya.reddy@kaverifoods.in', roleLabel: 'Manager', status: 'off', lastLoginAt: '2026-10-10T17:30:00+05:30', twoStep: true },
];
const ACCOUNTS = { data: ACCOUNT_ROWS, total: ACCOUNT_ROWS.length, page: 1, pageSize: 25 };
const LINKS: StoryLink[] = [
  { id: 'activity', label: 'Login activity', href: '#activity', group: 'Security' },
  { id: 'settings', label: 'Security settings', href: '#settings', group: 'Security' },
  { id: 'me', label: 'My security', href: '#me', group: 'Me' },
];
const Shell = ({ active, children }: { active: string; children: React.ReactNode }) => (
  <LinksFrame active={active} links={LINKS}>
    {children}
  </LinksFrame>
);

function Activity(over: Partial<LoginActivityScreenProps>) {
  const [tab, setTab] = useState<LoginActivityTab>(over.tab ?? 'events');
  const [filters, setFilters] = useState<LoginActivityFilters>(NO_FILTERS);
  const [accountFilter, setAccountFilter] = useState<AccountFilter>('all');
  const [accountSearch, setAccountSearch] = useState('');
  const accounts = over.accounts === undefined ? { ...ACCOUNTS, data: ACCOUNTS.data.filter((a) => (accountFilter === 'all' || a.status === accountFilter) && `${a.name} ${a.email}`.toLowerCase().includes(accountSearch.toLowerCase())) } : over.accounts;
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
        accountsState="ready"
        accountFilter={accountFilter}
        onAccountFilter={setAccountFilter}
        accountSearch={accountSearch}
        onAccountSearch={setAccountSearch}
        onSetSignIn={() => wait()}
        onResendLink={() => wait()}
        {...over}
        accounts={accounts}
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
// Admin A6 (batch B item 20): everyone with an account, whether they can sign in, last sign-in, two-step.
export const LoginActivityAccounts: S = { name: 'Login activity · accounts (who can sign in)', render: () => <Activity tab="accounts" /> };
export const LoginActivityAccountsTurnOff: S = {
  name: 'Login activity · accounts · turn off sign-in',
  render: () => <Activity tab="accounts" />,
  play: async ({ canvasElement }) => canvasElement.querySelector<HTMLButtonElement>('button[aria-label="Turn off sign-in for Ravi Kumar"]')?.click(),
};
export const LoginActivityAccountsRefused: S = {
  name: 'Login activity · accounts · turn off refused',
  render: () => (
    <Activity
      tab="accounts"
      onSetSignIn={async () => {
        await wait(300);
        throw new Error('Keep at least one other active System Admin first.');
      }}
    />
  ),
};
export const LoginActivityAccountsLoading: S = { name: 'Login activity · accounts · loading', render: () => <Activity tab="accounts" accounts={null} accountsState="loading" /> };
export const LoginActivityAccountsError: S = { name: 'Login activity · accounts · could not load', render: () => <Activity tab="accounts" accounts={null} accountsState="error" onRetry={() => {}} /> };
export const LoginActivityAccountsEmpty: S = { name: 'Login activity · accounts · nobody matches', render: () => <Activity tab="accounts" accounts={{ data: [], total: 0, page: 1, pageSize: 25 }} /> };
export const LoginActivityAccountsPhone: S = { name: 'Login activity · accounts · phone', globals: { viewport: { value: 'phone' } }, render: () => <Activity tab="accounts" /> };
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
export const SecuritySettingsDomains: S = {
  name: '2.3 Security · email domains to verify',
  render: () => (
    <Settings
      domains={[
        { domain: 'kaverifoods.in', verifiedAt: '2026-09-20T10:00:00+05:30', txtRecord: { name: 'kaverifoods.in', value: 'yukthix-domain-verification=4f1c9a07b2d84e6c9e31a5d0c7b8f612' } },
        { domain: 'kaveri.co.in', verifiedAt: null, txtRecord: { name: 'kaveri.co.in', value: 'yukthix-domain-verification=9b2e71c04d5a46f8a1c3e7d2b6f09a35' } },
        { domain: 'kaveri-exports.com', verifiedAt: null, lapsedAt: '2026-10-05T12:00:00+05:30', txtRecord: { name: 'kaveri-exports.com', value: 'yukthix-domain-verification=0c6d2e9f81a74b35b7e4f1a2d9c8e053' } },
      ]}
      onVerifyDomain={async () => {
        await new Promise((r) => setTimeout(r, 600));
        throw new Error('No TXT record on kaveri.co.in yet. DNS changes can take a few hours; try again later.');
      }}
    />
  ),
};
export const SecuritySettingsNoProviders: S = { name: '2.3 Security · no identity providers', render: () => <Settings providers={[]} /> };
export const SecuritySettingsLoading: S = { name: '2.3 Security · loading', render: () => <Settings state="loading" policy={null} floor={null} /> };
export const SecuritySettingsError: S = { name: '2.3 Security · could not load', render: () => <Settings state="error" policy={null} floor={null} onRetry={() => {}} /> };
export const SecuritySettingsNoAccess: S = { name: '2.3 Security · no access', render: () => <Settings state="no-access" policy={null} floor={null} /> };
export const SecuritySettingsPhone: S = { name: '2.3 Security · phone', globals: { viewport: { value: 'phone' } }, render: () => <Settings /> };
