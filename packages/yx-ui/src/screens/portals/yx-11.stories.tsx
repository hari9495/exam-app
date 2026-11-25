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
import type { HelpDetail, HelpRow, LiveHelpCentre } from './console-helpcentre-live';
import { TODAY } from './t9-data';
import type { ActivityEntry } from '../../components/timeline';

const meta: Meta = { title: 'Screens/YukthiX console/YX-11 · Help-centre editor', parameters: { layout: 'fullscreen' } };
export default meta;
type S = StoryObj;
const at = (h: number, m: number, day = 29) => new Date(2026, 8, day, h, m);
const AI_HISTORY: ActivityEntry[] = [
  { id: 'h1', kind: 'approval', actor: { name: 'Farah Siddiqui' }, at: at(9, 5), text: 'approved docs.ocr 2.0 at the promotion gate' },
  { id: 'h2', kind: 'change', actor: null, at: at(2, 0), text: 'ran the weekly drift check', changes: [{ field: 'helpdesk.answer drift', from: '0.19', to: '0.24' }] },
  { id: 'h3', kind: 'comment', actor: { name: 'Anand Iyer' }, at: at(17, 40, 28), text: 'Rerun bias on 1.7 after the rubric fix.' },
];

export const YX11List: S = { name: 'Help articles and no-result searches', render: () => <HelpEditorScreen articles={D.HELP_ARTICLES_ADMIN} noResults={D.NO_RESULT_SEARCHES} today={TODAY} /> };
// C-8 (answer 1057): the help-centre editor, live.
const HC_ROWS: HelpRow[] = [
  { id: 'h1', number: 12, title: 'Approve and lock a payroll run', state: 'published', pages: ['/yx/payroll/runs'], publishedAt: '2026-11-02T09:00:00Z', updatedAt: '2026-11-02T09:00:00Z' },
  { id: 'h2', number: 13, title: 'Apply for leave', state: 'in_review', pages: ['/yx/time/leave'], publishedAt: null, updatedAt: '2026-11-12T08:00:00Z' },
];
const HC_DETAIL: HelpDetail = { id: 'h2', title: 'Apply for leave', summary: 'Pick the days and the type.', pages: ['/yx/time/leave'], state: 'in_review', publicUrl: null, versions: [{ version: 2, title: 'Apply for leave', summary: 'Pick the days and the type.', bodyHtml: '<p>Open Time › Leave and press Apply.</p>', author: 'Joseph Thomas', mine: false, reviewNote: null, state: 'in_review' }] };
const hcWait = () => new Promise<HelpDetail>((r) => setTimeout(() => r(HC_DETAIL), 400));
const hc = (o: Partial<LiveHelpCentre> = {}) => (
  <ConsoleShell active="help-centre" name="Anand Iyer" email="anand.iyer@yukthix.test" securityHref="#" onSignOut={() => {}} onNavigate={() => {}}>
    <HelpEditorScreen articles={[]} noResults={[]} today={TODAY} live={{ state: 'ready', onRetry: () => {}, articles: HC_ROWS, gaps: [{ query: 'esi challan', companies: 7, times: 31 }], settings: [{ key: 'helpcentre.gaps_min_companies', label: 'Show a no-result search once this many companies searched it', value: 5, default: 5, min: 5, max: 100 }, { key: 'helpcentre.gaps_days', label: 'No-result searches over the last (days)', value: 30, default: 30, min: 7, max: 180 }], loadArticle: hcWait, onCreate: hcWait, onSave: hcWait, onSubmit: hcWait, onReview: hcWait, onOpenPlatformSettings: () => {}, ...o }} />
  </ConsoleShell>
);
export const YX11ListLive: S = { name: 'Help articles and no-result searches (C-8)', render: () => hc() };
export const YX11ReviewLive: S = { name: 'Article · another staff member publishes it (C-8)', render: () => hc({ defaultOpen: HC_DETAIL }) };
// Answer 1203: a published article another staff member asked to retire; you approve it.
const HC_PUBLISHED: HelpDetail = { ...HC_DETAIL, id: 'h1', title: 'Approve and lock a payroll run', state: 'published', publicUrl: '/yx/help/yukthix/yukthix-help/approve-and-lock', versions: [{ ...HC_DETAIL.versions[0]!, title: 'Approve and lock a payroll run', state: 'published' }], retire: { requestedBy: 'Joseph Thomas', mine: false, reason: 'Replaced by the new payroll run guide', at: '2026-11-12T08:00:00Z' } };
export const YX11RetireLive: S = { name: 'Article · retire waiting for you to approve (1203)', render: () => hc({ defaultOpen: HC_PUBLISHED, onRetire: hcWait, onApproveRetire: hcWait }) };
export const YX11RetireMineLive: S = { name: 'Article · your retire request, withdraw it (1263)', render: () => hc({ defaultOpen: { ...HC_PUBLISHED, retire: { requestedBy: 'You', mine: true, reason: 'Replaced by the new payroll guide', at: '2026-11-12T08:00:00Z' } }, onRetire: hcWait, onApproveRetire: hcWait, onWithdrawRetire: hcWait }) };
// Answer 2116: "Use in assistant answers" switched off for one article.
export const YX11AssistantOffLive: S = { name: 'Article · not used in assistant answers (2116)', render: () => hc({ defaultOpen: { ...HC_PUBLISHED, assistantUse: false } }) };
export const YX11Edit: S = { name: 'Article editor', render: () => <HelpEditorScreen articles={D.HELP_ARTICLES_ADMIN} noResults={D.NO_RESULT_SEARCHES} today={TODAY} editing /> };
