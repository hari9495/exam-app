import type { Meta, StoryObj } from '@storybook/react-vite';
import { ConsoleShell, type ConsolePageId } from './console-shell';
import { CompaniesScreen } from './companies';
import { CompanyScreen } from './company';
import { PlansScreen } from './plans';
import { SupportSessionsScreen } from './support';
import { PlatformAuditScreen } from './audit';
import { SupportAccessScreen } from '../access/support-access';
import { ACTIVITY, AUDIT, COMPANIES, COMPANY, NOW, PRODUCTS, REQUEST, SESSIONS, TODAY } from './data';

const meta: Meta = { title: 'Screens/YukthiX console/Platform console (step 3)', parameters: { layout: 'fullscreen' } };
export default meta;
type S = StoryObj;

const wait = (ms = 400) => new Promise<void>((r) => setTimeout(r, ms));
const shell = (active: ConsolePageId, children: React.ReactNode) => (
  <ConsoleShell active={active} name="Anand Iyer" email="anand.iyer@yukthix.test" securityHref="#" onSignOut={() => {}} onNavigate={() => {}}>
    {children}
  </ConsoleShell>
);

export const Companies: S = { name: 'Companies', render: () => shell('companies', <CompaniesScreen state="ready" companies={COMPANIES} products={PRODUCTS} canManage onOpen={() => {}} onCreate={() => wait()} />) };
export const CompaniesLoading: S = { name: 'Companies · loading', render: () => shell('companies', <CompaniesScreen state="loading" companies={[]} products={PRODUCTS} canManage onOpen={() => {}} onCreate={() => wait()} />) };

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
export const CompanyNoSession: S = { name: 'Company · ask for support access', render: () => company([]) };

export const Plans: S = { name: 'Plans and prices', render: () => shell('plans', <PlansScreen state="ready" products={PRODUCTS} canManage today={TODAY} onSchedule={() => wait()} onWithdraw={() => wait()} />) };
export const Support: S = { name: 'Support sessions', render: () => shell('support', <SupportSessionsScreen state="ready" sessions={SESSIONS} now={NOW} onOpenCompany={() => {}} onOpenSession={() => wait()} onEndSession={() => wait()} onWithdrawRequest={() => wait()} />) };
export const Audit: S = { name: 'Audit log', render: () => shell('audit', <PlatformAuditScreen state="ready" entries={AUDIT} includeReads={false} onIncludeReadsChange={() => {}} hasMore loadingMore={false} onLoadMore={() => {}} />) };

const access = (sessions = [REQUEST, ...SESSIONS.filter((s) => s.organizationId === 'c2')]) => (
  <div className="yx-auth__page">
    <SupportAccessScreen state="ready" sessions={sessions} now={NOW} onApprove={() => wait()} onDecline={() => wait()} onEnd={() => wait()} loadActivity={() => wait().then(() => ACTIVITY)} />
  </div>
);
export const CompanySupportAccess: S = { name: 'Company side · Support access (PLT-17)', render: () => access() };
export const CompanySupportAccessEmpty: S = { name: 'Company side · Support access · none yet', render: () => access([]) };
