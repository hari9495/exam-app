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

const meta: Meta = { title: 'Screens/YukthiX console/YX-05 · AI governance console', parameters: { layout: 'fullscreen' } };
export default meta;
type S = StoryObj;
const at = (h: number, m: number, day = 29) => new Date(2026, 8, day, h, m);
const AI_HISTORY: ActivityEntry[] = [
  { id: 'h1', kind: 'approval', actor: { name: 'Farah Siddiqui' }, at: at(9, 5), text: 'approved docs.ocr 2.0 at the promotion gate' },
  { id: 'h2', kind: 'change', actor: null, at: at(2, 0), text: 'ran the weekly drift check', changes: [{ field: 'helpdesk.answer drift', from: '0.19', to: '0.24' }] },
  { id: 'h3', kind: 'comment', actor: { name: 'Anand Iyer' }, at: at(17, 40, 28), text: 'Rerun bias on 1.7 after the rubric fix.' },
];

export const YX05Registry: S = { name: 'AI registry', render: () => <AiGovernanceScreen registry={D.AI_REGISTRY} drift={D.AI_DRIFT} bias={D.AI_BIAS} redTeam={D.RED_TEAM} history={AI_HISTORY} /> };
export const YX05Gate: S = { name: 'Promotion gate blocked', render: () => <AiGovernanceScreen registry={D.AI_REGISTRY} drift={D.AI_DRIFT} bias={D.AI_BIAS} redTeam={D.RED_TEAM} history={AI_HISTORY} gateOpen /> };
export const YX05Drift: S = { name: 'Drift', render: () => <AiGovernanceScreen registry={D.AI_REGISTRY} drift={D.AI_DRIFT} bias={D.AI_BIAS} redTeam={D.RED_TEAM} history={AI_HISTORY} tab="drift" /> };
export const YX05Bias: S = { name: 'Bias (4/5ths)', render: () => <AiGovernanceScreen registry={D.AI_REGISTRY} drift={D.AI_DRIFT} bias={D.AI_BIAS} redTeam={D.RED_TEAM} history={AI_HISTORY} tab="bias" /> };
export const YX05RedTeam: S = { name: 'Red-team log', render: () => <AiGovernanceScreen registry={D.AI_REGISTRY} drift={D.AI_DRIFT} bias={D.AI_BIAS} redTeam={D.RED_TEAM} history={AI_HISTORY} tab="redteam" /> };
