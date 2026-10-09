import type { Meta, StoryObj } from '@storybook/react-vite';
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
  TenantDetailScreen,
  TenantsListScreen,
} from './console-ops';
import { CommissionsScreen, DirectoryModerationScreen, EInvoiceLogScreen, ExportBillingScreen, PartnerVerificationScreen, RegionCatalogueScreen } from './console-finance';
import * as D from './console-data';
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

export const YX04Tenants: S = { name: 'Tenants list', render: () => <TenantsListScreen tenants={D.TENANTS} /> };
export const YX04TenantsError: S = { name: 'Tenants list · error', render: () => <TenantsListScreen tenants={D.TENANTS} state="error" /> };
export const YX04Health: S = { name: 'Tenant health', render: () => <CustomerSuccessScreen tenants={D.TENANTS} alerts={D.CS_ALERTS} me="Kavitha Rao" /> };
export const YX04Alerts: S = { name: 'Churn-risk alerts', render: () => <CustomerSuccessScreen tenants={D.TENANTS} alerts={D.CS_ALERTS} tab="alerts" me="Kavitha Rao" /> };
export const YX04Composer: S = { name: 'Admin message composer (second approval)', render: () => <CustomerSuccessScreen tenants={D.TENANTS} alerts={D.CS_ALERTS} composerOpen me="Kavitha Rao" /> };
export const YX04Tenant: S = { name: 'Tenant detail', render: () => <TenantDetailScreen tenant={D.TENANTS[3]} now={TODAY} /> };
export const YX04SupportRequest: S = { name: 'Support access · request', render: () => <TenantDetailScreen tenant={D.TENANTS[1]} support="request-form" now={TODAY} /> };
export const YX04SupportWaiting: S = { name: 'Support access · waiting for tenant consent', render: () => <TenantDetailScreen tenant={D.TENANTS[1]} support="requested" now={TODAY} /> };
export const YX04SupportActive: S = { name: 'Support access · approved session', render: () => <TenantDetailScreen tenant={D.TENANTS[1]} support="approved" now={TODAY} /> };
export const YX04SupportDeclined: S = { name: 'Support access · declined', render: () => <TenantDetailScreen tenant={D.TENANTS[1]} support="declined" now={TODAY} /> };
export const YX04Flags: S = { name: 'Feature flags', render: () => <FeatureFlagsScreen flags={D.FLAGS} /> };
export const YX04KillSwitch: S = { name: 'Feature flags · kill switch', render: () => <FeatureFlagsScreen flags={D.FLAGS} killOpen /> };
