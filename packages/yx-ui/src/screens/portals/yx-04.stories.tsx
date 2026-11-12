import type { Meta, StoryObj } from '@storybook/react-vite';
import { CONTAIN_LIFT, CONTAIN_OPEN, CONTAIN_READY, liveContain, liveFlags } from './console-c4-data';
import { AiGovernanceScreen, GoldenCasesScreen, PublishSchedulerScreen, RuleSetEditorScreen } from './console-rules';
import {
  ContainTenantScreen,
  CostPerTenantScreen,
  CustomerSuccessScreen,
  FeatureFlagsScreen,
  HelpEditorScreen,
  IncidentComposerScreen,
  NudgeEditorScreen,
  ProbesScreen,
  ProductAnalyticsScreen,
  SalesAssistScreen,
} from './console-ops';
import { CommissionsScreen, DirectoryModerationScreen, EInvoiceLogScreen, ExportBillingScreen, PartnerVerificationScreen, RegionCatalogueScreen } from './console-finance';
import * as D from './console-data';
import { CompaniesScreen } from '../console/companies';
import { CompanyScreen } from '../console/company';
import { ConsoleShell } from '../console/console-shell';
import { COMPANIES, COMPANY, NOW, PRODUCTS, SESSIONS } from '../console/data';
import type { CsFollowup, CsHealthRow, CsMessageRow, CsSettingRow, LiveCustomerSuccess } from './console-cs-live';
import type { SupportSession } from '../console/types';
import { TODAY } from './t9-data';
import type { ActivityEntry } from '../../components/timeline';

const meta: Meta = { title: 'Screens/YukthiX console/YX-04 · Customer-success console and tenants', parameters: { layout: 'fullscreen' } };
export default meta;
type S = StoryObj;
const at = (h: number, m: number, day = 29) => new Date(2026, 8, day, h, m);
const AI_HISTORY: ActivityEntry[] = [
  { id: 'h1', kind: 'approval', actor: { name: 'Farah Siddiqui' }, at: at(9, 5), text: 'approved docs.ocr 2.0 at the promotion gate' },
  { id: 'h2', kind: 'change', actor: null, at: at(2, 0), text: 'ran the weekly drift check', changes: [{ field: 'helpdesk.answer drift', from: '0.19', to: '0.24' }] },
  { id: 'h3', kind: 'comment', actor: { name: 'Anand Iyer' }, at: at(17, 40, 28), text: 'Rerun bias on 1.7 after the rubric fix.' },
];

// Answer 1045: one version. The tenants list and one tenant are the live Companies pages.
const wait = () => new Promise<void>((r) => setTimeout(r, 400));
const shell = (children: React.ReactNode) => (
  <ConsoleShell active="companies" name="Kavitha Rao" email="kavitha.rao@yukthix.test" securityHref="#" onSignOut={() => {}} onNavigate={() => {}}>
    {children}
  </ConsoleShell>
);
const companies = (state: 'ready' | 'error') => shell(<CompaniesScreen state={state} onRetry={() => {}} companies={COMPANIES} products={PRODUCTS} canManage onOpen={() => {}} onNew={() => {}} />);
const SESSION = SESSIONS[0]!;
const company = (sessions: SupportSession[]) =>
  shell(
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
export const YX04Tenants: S = { name: 'Tenants list', render: () => companies('ready') };
export const YX04TenantsError: S = { name: 'Tenants list · error', render: () => companies('error') };
export const YX04Health: S = { name: 'Tenant health', render: () => <CustomerSuccessScreen tenants={D.TENANTS} alerts={D.CS_ALERTS} me="Kavitha Rao" /> };
export const YX04Alerts: S = { name: 'Churn-risk alerts', render: () => <CustomerSuccessScreen tenants={D.TENANTS} alerts={D.CS_ALERTS} tab="alerts" me="Kavitha Rao" /> };
export const YX04Composer: S = { name: 'Admin message composer (second approval)', render: () => <CustomerSuccessScreen tenants={D.TENANTS} alerts={D.CS_ALERTS} composerOpen me="Kavitha Rao" /> };
export const YX04Tenant: S = { name: 'Tenant detail', render: () => company([]) };
export const YX04SupportRequest: S = { name: 'Support access · request', render: () => company([]) };
export const YX04SupportWaiting: S = { name: 'Support access · waiting for tenant consent', render: () => company([{ ...SESSION, id: 'w1', status: 'requested', decidedBy: null, decidedAt: null, startsAt: null, endsAt: null }]) };
export const YX04SupportActive: S = { name: 'Support access · approved session', render: () => company([SESSION]) };
export const YX04SupportDeclined: S = { name: 'Support access · declined', render: () => company([{ ...SESSION, id: 'd1', status: 'declined', startsAt: null, endsAt: null, decisionNote: 'Not during payroll week' }]) };
// C-2 (answers 1047, 1048): the designed screen with the console's own data.
const CS_ROWS: CsHealthRow[] = [
  { id: 'c1', name: 'Kaveri Foods', slug: 'kaveri-foods', lifecycle: 'active', products: ['hrms'], health: 80, factors: [], adminLastSignIn: '2026-11-11T09:00:00Z', openTickets: 1, alerts: [] },
  { id: 'c2', name: 'Godavari Agro', slug: 'godavari-agro', lifecycle: 'trial', products: ['hrms'], health: 60, factors: ['No admin sign-in for 30 days', 'In trial'], adminLastSignIn: '2026-10-01T09:00:00Z', openTickets: 0, alerts: ['No System Admin sign-in for 42 days'] },
  { id: 'c3', name: 'Narmada Textiles', slug: 'narmada-textiles', lifecycle: 'active', products: ['hrms', 'service_desk'], health: 35, factors: ['Billing or account is not in good standing', '5 open tickets'], adminLastSignIn: '2026-11-09T09:00:00Z', openTickets: 5, alerts: ['Health score below 50'] },
];
const CS_MESSAGES: CsMessageRow[] = [
  { id: 'm1', subject: 'Payroll readiness before 25 Nov', body: 'Twelve employees have no verified bank details.', companyIds: ['c2', 'c3'], status: 'pending_approval', writtenBy: 'Joseph Thomas', mine: false, decidedBy: null, decidedAt: null, decisionNote: null, sentAt: null, createdAt: '2026-11-12T08:00:00Z', version: 1 },
  { id: 'm2', subject: 'Your trial ends next week', body: 'Here is how to switch on.', companyIds: ['c2'], status: 'sent', writtenBy: 'Kavitha Rao', mine: true, decidedBy: null, decidedAt: null, decisionNote: null, sentAt: '2026-11-10T08:00:00Z', createdAt: '2026-11-10T08:00:00Z', version: 2 },
];
const CS_SETTINGS: CsSettingRow[] = [
  { key: 'cs.alert.health_below', label: 'Alert when the health score is below', value: 50, default: 50, min: 1, max: 99 },
  { key: 'cs.alert.admin_idle_days', label: 'Alert when no System Admin has signed in for (days)', value: 30, default: 30, min: 7, max: 365 },
];
const cs = (o: Partial<LiveCustomerSuccess> = {}) => (
  <ConsoleShell active="customers" name="Kavitha Rao" email="kavitha.rao@yukthix.test" securityHref="#" onSignOut={() => {}} onNavigate={() => {}}>
    <CustomerSuccessScreen tenants={[]} alerts={[]} me="Kavitha Rao" live={{ state: 'ready', onRetry: () => {}, rows: CS_ROWS, messages: CS_MESSAGES, settings: CS_SETTINGS, canManage: true, onWrite: wait, onApprove: wait, onReject: wait, ...o }} />
  </ConsoleShell>
);
export const YX04HealthLive: S = { name: 'Tenant health · from account signals (C-2)', render: () => cs() };
export const YX04AlertRules: S = { name: 'Churn-risk alerts · rules from platform settings (C-2)', render: () => cs({ tab: 'alerts' }) };
export const YX04MessagesWaiting: S = { name: 'Messages · waiting for a second staff member (C-2)', render: () => cs({ tab: 'messages' }) };
// Answer 1087: the writer withdraws their own message while it waits.
export const YX04MessagesMine: S = { name: 'Messages · my message waiting, Withdraw (1087)', render: () => cs({ tab: 'messages', messages: [{ ...CS_MESSAGES[0]!, mine: true, writtenBy: 'Kavitha Rao' }, { ...CS_MESSAGES[1]!, id: 'm3', subject: 'PF set-up check', status: 'withdrawn' }], onWithdraw: wait }) };
// Answers 1082, 1083 (1165): the drawn 30-day change, churn risk and CS owner; alert follow-up with Log outreach.
const CS_OWNERS = [{ id: 'u-kavitha', name: 'Kavitha Rao' }, { id: 'u-joseph', name: 'Joseph Thomas' }];
const CS_HISTORY = CS_ROWS.map((r, i) => ({ ...r, trend: [-12, 4, null][i % 3] ?? null, churn: (r.health >= 70 ? 'low' : r.health >= 45 ? 'medium' : 'high') as 'low' | 'medium' | 'high', owner: i % 2 ? CS_OWNERS[0]! : null }));
const CS_FOLLOWUPS: CsFollowup[] = [
  { id: 'a1', organizationId: 'c2', company: 'Godavari Agro', rule: 'admin_idle', text: 'No System Admin has ever signed in', status: 'contacted', owner: { id: 'u-kavitha', name: 'Kavitha Rao' }, openedAt: '2026-11-08T20:00:00Z', resolvedAt: null, autoResolved: false, version: 2, notes: [{ id: 'n1', note: 'Called the HR head; sign-in planned this week.', by: 'Kavitha Rao', at: '2026-11-10T06:00:00Z' }] },
  { id: 'a2', organizationId: 'c2', company: 'Godavari Agro', rule: 'health_below', text: 'Health score below 50', status: 'open', owner: null, openedAt: '2026-11-11T20:00:00Z', resolvedAt: null, autoResolved: false, version: 1, notes: [] },
  { id: 'a3', organizationId: 'c3', company: 'Kaveri Foods', rule: 'admin_idle', text: 'No System Admin sign-in for 31 days', status: 'resolved', owner: { id: 'u-joseph', name: 'Joseph Thomas' }, openedAt: '2026-10-20T20:00:00Z', resolvedAt: '2026-11-02T20:00:00Z', autoResolved: true, version: 3, notes: [] },
];
const followup = { owners: CS_OWNERS, onSetOwner: wait, onUpdateAlert: wait, onOutreach: wait };
export const YX04HealthHistory: S = { name: 'Tenant health · 30-day change, churn risk and CS owner (1165)', render: () => cs({ rows: CS_HISTORY, ...followup, followups: CS_FOLLOWUPS }) };
export const YX04AlertFollowUp: S = { name: 'Churn-risk alerts · owner, status and Log outreach (1165)', render: () => cs({ tab: 'alerts', rows: CS_HISTORY, ...followup, followups: CS_FOLLOWUPS }) };
// Answer 1223: an owner who left, listed for reassignment.
export const YX04OwnerLeft: S = { name: 'Tenant health · Owner left, listed for reassignment (1223)', render: () => cs({ rows: CS_HISTORY.map((r, i) => (i === 1 ? { ...r, owner: { id: 'u-ravi', name: 'Ravi Menon', left: true } } : r)), ...followup, followups: CS_FOLLOWUPS }) };
export const YX04ComposerTwo: S = { name: 'Message composer · two companies need approval (C-2)', render: () => cs({ composerFor: ['c2', 'c3'] }) };
export const YX04Flags: S = { name: 'Feature flags', render: () => <FeatureFlagsScreen flags={D.FLAGS} /> };
export const YX04KillSwitch: S = { name: 'Feature flags · kill switch', render: () => <FeatureFlagsScreen flags={D.FLAGS} killOpen /> };

// Console C-4 (answer 1049): the live switches, one with the kill switch engaged by someone else.
export const YX04FlagsLive: S = { name: 'Feature flags · live (kill switch engaged)', render: () => <FeatureFlagsScreen flags={[]} live={liveFlags()} /> };
