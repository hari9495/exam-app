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
import { TODAY } from './t9-data';
import type { ActivityEntry } from '../../components/timeline';

const meta: Meta = { title: 'Screens/YukthiX console/YX-18 · Contain tenant', parameters: { layout: 'fullscreen' } };
export default meta;
type S = StoryObj;
const at = (h: number, m: number, day = 29) => new Date(2026, 8, day, h, m);
const AI_HISTORY: ActivityEntry[] = [
  { id: 'h1', kind: 'approval', actor: { name: 'Farah Siddiqui' }, at: at(9, 5), text: 'approved docs.ocr 2.0 at the promotion gate' },
  { id: 'h2', kind: 'change', actor: null, at: at(2, 0), text: 'ran the weekly drift check', changes: [{ field: 'helpdesk.answer drift', from: '0.19', to: '0.24' }] },
  { id: 'h3', kind: 'comment', actor: { name: 'Anand Iyer' }, at: at(17, 40, 28), text: 'Rerun bias on 1.7 after the rubric fix.' },
];

export const YX18StepUp: S = { name: 'Contain tenant · step-up needed', render: () => <ContainTenantScreen stepUpAt={null} now={TODAY} /> };
export const YX18Ready: S = { name: 'Contain tenant · ready', render: () => <ContainTenantScreen stepUpAt={at(9, 35)} now={TODAY} /> };
export const YX18Contained: S = { name: 'Contained + tenant banner', render: () => <ContainTenantScreen state="contained" stepUpAt={at(9, 35)} now={TODAY} /> };
export const YX18Lift: S = { name: 'Lift (two people)', render: () => <ContainTenantScreen state="lift" stepUpAt={at(9, 35)} now={TODAY} /> };

// Console C-4 (answer 1050): the live screen, before, during and with a lift waiting for a second person.
export const YX18LiveReady: S = { name: 'Contain company · live, ready', render: () => <ContainTenantScreen stepUpAt={null} now={TODAY} live={liveContain(CONTAIN_READY)} /> };
export const YX18LiveContained: S = { name: 'Contain company · live, contained', render: () => <ContainTenantScreen stepUpAt={null} now={TODAY} live={liveContain(CONTAIN_OPEN)} /> };
export const YX18LiveLift: S = { name: 'Contain company · live, lift waiting for you', render: () => <ContainTenantScreen stepUpAt={null} now={TODAY} live={liveContain(CONTAIN_LIFT)} /> };
