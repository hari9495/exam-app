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

const meta: Meta = { title: 'Screens/YukthiX console/YX-02 · Golden-case runner and review', parameters: { layout: 'fullscreen' } };
export default meta;
type S = StoryObj;
const at = (h: number, m: number, day = 29) => new Date(2026, 8, day, h, m);
const AI_HISTORY: ActivityEntry[] = [
  { id: 'h1', kind: 'approval', actor: { name: 'Farah Siddiqui' }, at: at(9, 5), text: 'approved docs.ocr 2.0 at the promotion gate' },
  { id: 'h2', kind: 'change', actor: null, at: at(2, 0), text: 'ran the weekly drift check', changes: [{ field: 'helpdesk.answer drift', from: '0.19', to: '0.24' }] },
  { id: 'h3', kind: 'comment', actor: { name: 'Anand Iyer' }, at: at(17, 40, 28), text: 'Rerun bias on 1.7 after the rubric fix.' },
];

export const YX02Runner: S = { name: 'Golden cases · 2 failing', render: () => <GoldenCasesScreen cases={D.GOLDEN_CASES} queue={D.REVIEW_QUEUE} me="Farah Siddiqui" maker="Anand Iyer" /> };
export const YX02Running: S = { name: 'Golden cases · running', render: () => <GoldenCasesScreen cases={D.GOLDEN_CASES} queue={D.REVIEW_QUEUE} running me="Farah Siddiqui" maker="Anand Iyer" /> };
export const YX02Queue: S = { name: 'Review queue', render: () => <GoldenCasesScreen cases={D.GOLDEN_CASES} queue={D.REVIEW_QUEUE} tab="queue" me="Farah Siddiqui" maker="Anand Iyer" /> };
export const YX02Review: S = { name: 'Review drawer (checker)', render: () => <GoldenCasesScreen cases={D.GOLDEN_CASES} queue={D.REVIEW_QUEUE} tab="queue" defaultReviewOpen me="Farah Siddiqui" maker="Anand Iyer" /> };
export const YX02SelfReview: S = { name: 'Maker cannot review own change', render: () => <GoldenCasesScreen cases={D.GOLDEN_CASES} queue={D.REVIEW_QUEUE} tab="queue" defaultReviewOpen me="Anand Iyer" maker="Anand Iyer" /> };
