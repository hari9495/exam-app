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

const meta: Meta = { title: 'Screens/YukthiX console/YX-01 · Rule-set editor', parameters: { layout: 'fullscreen' } };
export default meta;
type S = StoryObj;
const at = (h: number, m: number, day = 29) => new Date(2026, 8, day, h, m);
const AI_HISTORY: ActivityEntry[] = [
  { id: 'h1', kind: 'approval', actor: { name: 'Farah Siddiqui' }, at: at(9, 5), text: 'approved docs.ocr 2.0 at the promotion gate' },
  { id: 'h2', kind: 'change', actor: null, at: at(2, 0), text: 'ran the weekly drift check', changes: [{ field: 'helpdesk.answer drift', from: '0.19', to: '0.24' }] },
  { id: 'h3', kind: 'comment', actor: { name: 'Anand Iyer' }, at: at(17, 40, 28), text: 'Rerun bias on 1.7 after the rubric fix.' },
];

export const YX01List: S = { name: 'Rule sets list', render: () => <RuleSetEditorScreen sets={D.RULE_SETS} slabs={D.PT_KA_DRAFT} today={TODAY} /> };
export const YX01Loading: S = { name: 'Rule sets list · loading', render: () => <RuleSetEditorScreen sets={D.RULE_SETS} slabs={D.PT_KA_DRAFT} today={TODAY} state="loading" /> };
export const YX01Draft: S = { name: 'Slab editor · draft', render: () => <RuleSetEditorScreen sets={D.RULE_SETS} openId="rs1" slabs={D.PT_KA_DRAFT} today={TODAY} /> };
export const YX01Invalid: S = { name: 'Slab editor · overlap, no source', render: () => <RuleSetEditorScreen sets={D.RULE_SETS} openId="rs1" slabs={D.PT_KA_BROKEN} withSource={false} today={TODAY} /> };
export const YX01Published: S = { name: 'Published version (locked)', render: () => <RuleSetEditorScreen sets={D.RULE_SETS} openId="rs2" slabs={[{ from: 0, to: 24_999, amount: 0 }, { from: 25_000, to: null, amount: 200 }]} today={TODAY} /> };
