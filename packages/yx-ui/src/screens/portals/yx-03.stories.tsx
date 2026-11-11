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
import * as L from './console-rules-samples';
import { TODAY } from './t9-data';
import type { ActivityEntry } from '../../components/timeline';

const meta: Meta = { title: 'Screens/YukthiX console/YX-03 · Publish scheduler', parameters: { layout: 'fullscreen' } };
export default meta;
type S = StoryObj;
const at = (h: number, m: number, day = 29) => new Date(2026, 8, day, h, m);
const AI_HISTORY: ActivityEntry[] = [
  { id: 'h1', kind: 'approval', actor: { name: 'Farah Siddiqui' }, at: at(9, 5), text: 'approved docs.ocr 2.0 at the promotion gate' },
  { id: 'h2', kind: 'change', actor: null, at: at(2, 0), text: 'ran the weekly drift check', changes: [{ field: 'helpdesk.answer drift', from: '0.19', to: '0.24' }] },
  { id: 'h3', kind: 'comment', actor: { name: 'Anand Iyer' }, at: at(17, 40, 28), text: 'Rerun bias on 1.7 after the rubric fix.' },
];

export const YX03Version: S = { name: 'Publish · version', render: () => <PublishSchedulerScreen /> };
export const YX03Impact: S = { name: 'Publish · tenant impact', render: () => <PublishSchedulerScreen current="impact" /> };
export const YX03PastDated: S = { name: 'Publish · past-dated (arrears proposals)', render: () => <PublishSchedulerScreen current="date" pastDated /> };
export const YX03Review: S = { name: 'Publish · review', render: () => <PublishSchedulerScreen current="review" /> };
export const YX03Done: S = { name: 'Published and scheduled', render: () => <PublishSchedulerScreen done /> };

// Console C-1 (answers 1041, 1044): the live states, drawn in the same screen. The impact is numbers only.
const live = (over: Partial<PublishLive> = {}): PublishLive => ({ state: 'ready', choices: [L.LIVE_ROWS[0]!], chosen: 'r1', onChoose: () => {}, detail: L.LIVE_DETAIL, impact: L.LIVE_IMPACT, onPublish: async () => {}, published: null, ...over });
type PublishLive = NonNullable<Parameters<typeof PublishSchedulerScreen>[0]['live']>;
export const YX03LiveImpact: S = { name: 'C-1 · Impact · companies and employees (numbers only)', render: () => <PublishSchedulerScreen current="impact" live={live()} /> };
export const YX03LiveNotCountable: S = { name: 'C-1 · Impact · a jurisdiction that cannot be counted', render: () => <PublishSchedulerScreen current="impact" live={live({ impact: { countable: false, companies: null, employees: null, bySize: [], pastDated: false, validFrom: '2027-04-01' } })} /> };
export const YX03LiveNothing: S = { name: 'C-1 · Version · nothing to publish', render: () => <PublishSchedulerScreen live={live({ choices: [], chosen: null, detail: null, impact: null })} /> };
export const YX03LiveDone: S = { name: 'C-1 · Published', render: () => <PublishSchedulerScreen live={live({ published: L.LIVE_ROWS[0]! })} /> };
