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
} from './console-ops';
import { CommissionsScreen, DirectoryModerationScreen, EInvoiceLogScreen, ExportBillingScreen, PartnerVerificationScreen, RegionCatalogueScreen } from './console-finance';
import * as D from './console-data';
import { ConsoleShell } from '../console/console-shell';
import type { LiveAnalytics } from './console-analytics-live';
import { TODAY } from './t9-data';
import type { ActivityEntry } from '../../components/timeline';

const meta: Meta = { title: 'Screens/YukthiX console/YX-09 · Product analytics', parameters: { layout: 'fullscreen' } };
export default meta;
type S = StoryObj;
const at = (h: number, m: number, day = 29) => new Date(2026, 8, day, h, m);
const AI_HISTORY: ActivityEntry[] = [
  { id: 'h1', kind: 'approval', actor: { name: 'Farah Siddiqui' }, at: at(9, 5), text: 'approved docs.ocr 2.0 at the promotion gate' },
  { id: 'h2', kind: 'change', actor: null, at: at(2, 0), text: 'ran the weekly drift check', changes: [{ field: 'helpdesk.answer drift', from: '0.19', to: '0.24' }] },
  { id: 'h3', kind: 'comment', actor: { name: 'Anand Iyer' }, at: at(17, 40, 28), text: 'Rerun bias on 1.7 after the rubric fix.' },
];

const pa = { funnel: D.FUNNEL, cohorts: D.COHORTS, adoption: D.ADOPTION, quickstart: D.QUICKSTART };
export const YX09: S = { name: 'Product analytics', render: () => <ProductAnalyticsScreen {...pa} /> };
// C-8 (YX-09): which features companies use, live.
const AN: LiveAnalytics = {
  state: 'ready',
  onRetry: () => {},
  windowDays: 30,
  minCompanies: 5,
  totalCompanies: 64,
  areas: [{ key: 'people', label: 'People' }, { key: 'time', label: 'Time and leave' }, { key: 'payroll', label: 'Payroll' }, { key: 'hiring', label: 'Hiring' }],
  byFeature: [
    { area: 'people', label: 'People', companies: 58, actions: 9120 },
    { area: 'time', label: 'Time and leave', companies: 41, actions: 22400 },
    { area: 'payroll', label: 'Payroll', companies: 19, actions: 3110 },
    { area: 'hiring', label: 'Hiring', companies: null, actions: null },
  ],
  bySize: {
    bands: [{ label: 'Under 200 employees', companies: 49 }, { label: '200+ employees', companies: 15 }],
    adoption: [
      { area: 'people', label: 'People', pct: [90, 93] },
      { area: 'time', label: 'Time and leave', pct: [59, 80] },
      { area: 'payroll', label: 'Payroll', pct: [22, 53] },
      { area: 'hiring', label: 'Hiring', pct: [null, null] },
    ],
  },
  byCompany: [
    { id: 'c1', company: 'Coromandel Logistics', band: '200+ employees', areas: { people: 410, time: 1820, payroll: 96 }, lastActive: new Date(2026, 10, 12).toISOString() },
    { id: 'c2', company: 'Kaveri Foods', band: 'Under 200 employees', areas: { people: 120, time: 640 }, lastActive: new Date(2026, 10, 11).toISOString() },
  ],
};
const an = (o: Partial<LiveAnalytics> = {}) => (
  <ConsoleShell active="analytics" name="Anand Iyer" email="anand.iyer@yukthix.test" securityHref="#" onSignOut={() => {}} onNavigate={() => {}}>
    <ProductAnalyticsScreen {...pa} live={{ ...AN, ...o }} />
  </ConsoleShell>
);
export const YX09Live: S = { name: 'Which features companies use (C-8)', render: () => an() };
export const YX09SmallGroupsLive: S = { name: 'Small groups hidden (C-8)', render: () => an({ bySize: { bands: [{ label: 'Under 200 employees', companies: 49 }, { label: '200+ employees', companies: null }], adoption: AN.bySize.adoption.map((a) => ({ ...a, pct: [a.pct[0] ?? null, null] })) } }) };
export const YX09Loading: S = { name: 'Product analytics · loading', render: () => <ProductAnalyticsScreen {...pa} loading /> };
export const YX09NoAccess: S = { name: 'No product analytics role', render: () => <ProductAnalyticsScreen {...pa} noAccess /> };
