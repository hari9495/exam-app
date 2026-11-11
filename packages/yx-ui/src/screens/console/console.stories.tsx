import type { Meta, StoryObj } from '@storybook/react-vite';
import { ConsoleShell, type ConsolePageId } from './console-shell';
import { CompaniesScreen } from './companies';
import { CompanyScreen } from './company';
import { CompanySettingsScreen } from './company-settings';
import { PlansScreen } from './plans';
import { WhatsNewConsoleScreen, type NewsEntryRow } from './whats-new';
import { SupportSessionsScreen } from './support';
import { PlatformAuditScreen } from './audit';
import { StaffRolesScreen } from './staff';
import { SupportAccessScreen } from '../access/support-access';
import { ACTIVITY, AUDIT, COMPANIES, COMPANY, COMPANY_SETTINGS, NOW, PRODUCTS, REQUEST, SESSIONS, STAFF, STAFF_ROLE_DEFS, TODAY } from './data';

const meta: Meta = { title: 'Screens/YukthiX console/Platform console (step 3)', parameters: { layout: 'fullscreen' } };
export default meta;
type S = StoryObj;

const wait = (ms = 400) => new Promise<void>((r) => setTimeout(r, ms));
const shell = (active: ConsolePageId, children: React.ReactNode) => (
  <ConsoleShell active={active} name="Anand Iyer" email="anand.iyer@yukthix.test" securityHref="#" onSignOut={() => {}} onNavigate={() => {}}>
    {children}
  </ConsoleShell>
);

export const Companies: S = { name: 'Companies', render: () => shell('companies', <CompaniesScreen state="ready" companies={COMPANIES} products={PRODUCTS} canManage onOpen={() => {}} onNew={() => {}} />) };
export const CompaniesLoading: S = { name: 'Companies · loading', render: () => shell('companies', <CompaniesScreen state="loading" companies={[]} products={PRODUCTS} canManage onOpen={() => {}} onNew={() => {}} />) };

const company = (sessions = SESSIONS.filter((s) => s.organizationId === 'c2')) =>
  shell(
    'companies',
    <CompanyScreen
      state="ready"
      company={COMPANY}
      sessions={sessions}
      canManage
      canSupport
      now={NOW}
      onBack={() => {}}
      onLifecycle={() => wait()}
      onExtendTrial={() => wait()}
      onRequestSupport={() => wait()}
      onOpenSession={() => wait()}
      onEndSession={() => wait()}
      onWithdrawRequest={() => wait()}
    />,
  );
export const Company: S = { name: 'Company · trial with an open support session', render: () => company() };
// C-5 (answer 1053): what is switched on for the company (plan products, plan features; C-4 switches join later).
export const CompanyFeatures: S = {
  name: 'Company · products and features (C-5)',
  render: () =>
    shell(
      'companies',
      <CompanyScreen
        state="ready"
        company={COMPANY}
        sessions={[]}
        canManage
        canSupport
        now={NOW}
        features={[
          { key: 'product:hrms', label: 'YukthiX HR', on: true, source: 'product' },
          { key: 'product:service_desk', label: 'YukthiX Service Desk', on: false, source: 'product', note: 'Not in the plan' },
          { key: 'setting:brand.white_label', label: 'White-label (your brand only)', on: false, source: 'setting' },
        ]}
        onBack={() => {}}
        onLifecycle={() => wait()}
        onExtendTrial={() => wait()}
        onRequestSupport={() => wait()}
        onOpenSession={() => wait()}
        onEndSession={() => wait()}
        onWithdrawRequest={() => wait()}
      />,
    ),
};
export const CompanyNoSession: S = { name: 'Company · ask for support access', render: () => company([]) };
// Careers answer 442: settings only YukthiX changes, each allowed by the company's plan.
export const CompanySettings: S = { name: 'Company settings · white-label in the plan', render: () => shell('companies', <CompanySettingsScreen state="ready" company={COMPANY_SETTINGS} canManage onBack={() => {}} onChange={() => wait()} />) };
export const CompanySettingsNotInPlan: S = {
  name: 'Company settings · not in the plan',
  render: () => shell('companies', <CompanySettingsScreen state="ready" company={{ ...COMPANY_SETTINGS, features: [], settings: COMPANY_SETTINGS.settings.map((s) => ({ ...s, included: false })) }} canManage onBack={() => {}} onChange={() => wait()} />),
};

export const Plans: S = { name: 'Plans and prices', render: () => shell('plans', <PlansScreen state="ready" products={PRODUCTS} canManage today={TODAY} onSchedule={() => wait()} onWithdraw={() => wait()} />) };
// Help H-4 (answer 943): the What's new entries YukthiX staff write.
const NEWS_PRODUCTS = [{ code: 'hrms', name: 'YukthiX HR' }, { code: 'service_desk', name: 'YukthiX Service Desk' }];
const NEWS_ROWS: NewsEntryRow[] = [
  { id: 'n1', title: 'Comp-off expiry on the balance card', body: 'Employees now see when comp-off days lapse, on web and mobile.', products: ['hrms'], audiences: ['employee', 'manager'], publishOn: '2026-11-20', state: 'scheduled', version: 1 },
  { id: 'n2', title: 'Press ? for keyboard shortcuts', body: 'Every page lists the shortcuts that work for you.', products: ['hrms', 'service_desk'], audiences: ['everyone'], publishOn: '2026-11-12', state: 'published', version: 2 },
  { id: 'n3', title: 'Variance check explains each change', body: 'Payroll sees why a net pay moved more than the threshold.', products: ['hrms'], audiences: ['payroll'], publishOn: '2026-10-30', state: 'withdrawn', version: 3 },
];
const news = (extra: Partial<Parameters<typeof WhatsNewConsoleScreen>[0]> = {}) => shell('whats-new', <WhatsNewConsoleScreen state="ready" entries={NEWS_ROWS} products={NEWS_PRODUCTS} today="2026-11-12" canManage onCreate={() => wait()} onUpdate={() => wait()} onWithdraw={() => wait()} {...extra} />);
export const WhatsNew: S = { name: "What's new · entries", render: () => news() };
export const WhatsNewAdd: S = { name: "What's new · new entry", render: () => news({ defaultNew: true }) };
export const WhatsNewEmpty: S = { name: "What's new · none yet", render: () => news({ entries: [] }) };
export const Support: S = { name: 'Support sessions', render: () => shell('support', <SupportSessionsScreen state="ready" sessions={SESSIONS} now={NOW} onOpenCompany={() => {}} onOpenSession={() => wait()} onEndSession={() => wait()} onWithdrawRequest={() => wait()} />) };
export const Audit: S = { name: 'Audit log', render: () => shell('audit', <PlatformAuditScreen state="ready" entries={AUDIT} includeReads={false} onIncludeReadsChange={() => {}} hasMore loadingMore={false} onLoadMore={() => {}} />) };

const access = (sessions = [REQUEST, ...SESSIONS.filter((s) => s.organizationId === 'c2')], messages?: { id: string; subject: string; body: string; sentAt: string }[]) => (
  <div className="yx-auth__page">
    <SupportAccessScreen state="ready" sessions={sessions} now={NOW} onApprove={() => wait()} onDecline={() => wait()} onEnd={() => wait()} loadActivity={() => wait().then(() => ACTIVITY)} messages={messages} />
  </div>
);
export const CompanySupportAccess: S = { name: 'Company side · Support access (PLT-17)', render: () => access() };
// Answer 1048: the messages YukthiX staff sent this company's System Admins.
export const CompanySupportAccessMessages: S = {
  name: 'Company side · Support access · messages from YukthiX (C-2)',
  render: () => access(undefined, [{ id: 'cm1', subject: 'Payroll readiness before 25 Nov', body: 'Twelve employees have no verified bank details.\n\nFix them in People › Bank details before the run.', sentAt: '2026-11-12T09:30:00Z' }]),
};
export const CompanySupportAccessEmpty: S = { name: 'Company side · Support access · none yet', render: () => access([]) };
// Staff roles (answers 1058, 1086): drawn first; who holds what, and a Security lead changing another's roles.
export const StaffRoles: S = { name: 'Staff and roles', render: () => shell('staff', <StaffRolesScreen state="ready" roles={STAFF_ROLE_DEFS} staff={STAFF} onSave={() => wait()} onInvite={() => wait()} onDeactivate={() => wait()} />) };
export const StaffRolesChange: S = { name: 'Staff and roles · change roles', render: () => shell('staff', <StaffRolesScreen state="ready" roles={STAFF_ROLE_DEFS} staff={STAFF} onSave={() => wait()} defaultOpenId="st3" />) };
export const StaffRolesLastLead: S = {
  name: 'Staff and roles · the last Security lead',
  render: () => shell('staff', <StaffRolesScreen state="ready" roles={STAFF_ROLE_DEFS} staff={STAFF.map((s) => (s.id === 'st2' ? { ...s, lastLead: true } : s.id === 'st1' ? { ...s, roles: ['support_agent' as const] } : s))} onSave={() => wait()} defaultOpenId="st2" />),
};
export const StaffRolesNoKey: S = { name: 'Staff and roles · not a Security lead', render: () => shell('staff', <StaffRolesScreen state="no-access" roles={[]} staff={[]} onSave={() => wait()} />) };
// Answer 1164: add staff (an invitation; no role until one is given) and deactivate.
export const StaffAdd: S = { name: 'Staff and roles · add staff', render: () => shell('staff', <StaffRolesScreen state="ready" roles={STAFF_ROLE_DEFS} staff={STAFF} onSave={() => wait()} onInvite={() => wait()} onDeactivate={() => wait()} defaultInvite />) };

