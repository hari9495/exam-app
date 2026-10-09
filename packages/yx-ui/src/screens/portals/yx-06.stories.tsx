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

const meta: Meta = { title: 'Screens/YukthiX console/YX-06 · Partner verification', parameters: { layout: 'fullscreen' } };
export default meta;
type S = StoryObj;
const at = (h: number, m: number, day = 29) => new Date(2026, 8, day, h, m);
const AI_HISTORY: ActivityEntry[] = [
  { id: 'h1', kind: 'approval', actor: { name: 'Farah Siddiqui' }, at: at(9, 5), text: 'approved docs.ocr 2.0 at the promotion gate' },
  { id: 'h2', kind: 'change', actor: null, at: at(2, 0), text: 'ran the weekly drift check', changes: [{ field: 'helpdesk.answer drift', from: '0.19', to: '0.24' }] },
  { id: 'h3', kind: 'comment', actor: { name: 'Anand Iyer' }, at: at(17, 40, 28), text: 'Rerun bias on 1.7 after the rubric fix.' },
];

export const YX06Queue: S = { name: 'Partner applications', render: () => <PartnerVerificationScreen apps={D.PARTNER_APPS} partners={D.PARTNERS} /> };
export const YX06Review: S = { name: 'Application review (ICAI pending)', render: () => <PartnerVerificationScreen apps={D.PARTNER_APPS} partners={D.PARTNERS} openId="p1" /> };
export const YX06Partners: S = { name: 'Partner list and hierarchy', render: () => <PartnerVerificationScreen apps={D.PARTNER_APPS} partners={D.PARTNERS} tab="partners" /> };
export const YX06Suspend: S = { name: 'Suspend partner', render: () => <PartnerVerificationScreen apps={D.PARTNER_APPS} partners={D.PARTNERS} tab="partners" suspendOpen /> };
export const YX06Empty: S = { name: 'No applications', render: () => <PartnerVerificationScreen apps={[]} partners={D.PARTNERS} /> };
