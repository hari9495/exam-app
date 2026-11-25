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
import { TODAY } from './t9-data';
import { ConsoleShell } from '../console/console-shell';
import { NudgeCard, type LiveNudges, type NudgeRow } from './console-nudges-live';
import type { ActivityEntry } from '../../components/timeline';

const meta: Meta = { title: 'Screens/YukthiX console/YX-12 · Nudge and switch-on copy editor', parameters: { layout: 'fullscreen' } };
export default meta;
type S = StoryObj;
const at = (h: number, m: number, day = 29) => new Date(2026, 8, day, h, m);
const AI_HISTORY: ActivityEntry[] = [
  { id: 'h1', kind: 'approval', actor: { name: 'Farah Siddiqui' }, at: at(9, 5), text: 'approved docs.ocr 2.0 at the promotion gate' },
  { id: 'h2', kind: 'change', actor: null, at: at(2, 0), text: 'ran the weekly drift check', changes: [{ field: 'helpdesk.answer drift', from: '0.19', to: '0.24' }] },
  { id: 'h3', kind: 'comment', actor: { name: 'Anand Iyer' }, at: at(17, 40, 28), text: 'Rerun bias on 1.7 after the rubric fix.' },
];

export const YX12Nudges: S = { name: 'Trial nudges', render: () => <NudgeEditorScreen nudges={D.NUDGES} me="Joseph Thomas" editing /> };
// C-8 (YX-12): nudges per feature switch, live.
const NG_FEATURES = [
  { key: 'access.requests', label: 'Access requests', killed: false },
  { key: 'help.tours', label: 'First-run tours', killed: false },
  { key: 'policy.ai_writer', label: 'Write policies with AI', killed: true },
];
const NG_ROWS: NudgeRow[] = [
  { id: 'n1', featureKey: 'access.requests', kind: 'switch_on', heading: 'Let people ask for access', body: 'Switch on access requests so people can ask for a page they cannot open, with a reason and how long.', status: 'live', writtenBy: 'Joseph Thomas', mine: false, reviewedBy: 'Anand Iyer', reviewNote: null, createdAt: new Date(2026, 10, 10).toISOString() },
  { id: 'n2', featureKey: 'help.tours', kind: 'switch_on', heading: 'Show new people around', body: 'Switch on first-run tours: each short tour starts once, the first time someone reaches its page.', status: 'pending', writtenBy: 'Joseph Thomas', mine: false, reviewedBy: null, reviewNote: null, createdAt: new Date(2026, 10, 12).toISOString() },
  { id: 'n3', featureKey: 'policy.ai_writer', kind: 'switch_on', heading: 'Draft policies faster', body: 'Switch on Write policies with AI to start each policy from a draft in your words.', status: 'pending', writtenBy: 'Anand Iyer', mine: true, reviewedBy: null, reviewNote: null, createdAt: new Date(2026, 10, 12).toISOString() },
];
const ngWait = () => new Promise<void>((r) => setTimeout(r, 400));
const ng = (o: Partial<LiveNudges> = {}) => (
  <ConsoleShell active="nudges" name="Anand Iyer" email="anand.iyer@yukthix.test" securityHref="#" onSignOut={() => {}} onNavigate={() => {}}>
    <NudgeEditorScreen nudges={[]} me="Anand Iyer" live={{ state: 'ready', onRetry: () => {}, features: NG_FEATURES, nudges: NG_ROWS, weeklyLimit: 2, onWrite: ngWait, onReview: ngWait, onRetire: ngWait, ...o }} />
  </ConsoleShell>
);
export const YX12NudgesLive: S = { name: 'Switch-on cards and suggestions (C-8)', render: () => ng() };
export const YX12WriteLive: S = { name: 'New switch-on card · preview (C-8)', render: () => ng({ defaultWriting: 'switch_on' }) };
export const YX12CardLive: S = { name: 'What a company admin sees (C-8)', render: () => <div style={{ maxWidth: 420, padding: 24 }}><NudgeCard heading="Let people ask for access" body="Switch on access requests so people can ask for a page they cannot open, with a reason and how long." switchHref="#" onDismiss={() => {}} /></div> };
export const YX12SelfApprove: S = { name: 'Switch-on copy · approver is author', render: () => <NudgeEditorScreen nudges={D.NUDGES} me="Anand Iyer" /> };
