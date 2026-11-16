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
import type { LiveSales, SalesLiveRow } from './console-sales-live';
import { TalkToUsLiveDialog } from '../platform-b/growth-screens';
import { TODAY } from './t9-data';
import type { ActivityEntry } from '../../components/timeline';

const meta: Meta = { title: 'Screens/YukthiX console/YX-13 · Sales-assist queue', parameters: { layout: 'fullscreen' } };
export default meta;
type S = StoryObj;
const at = (h: number, m: number, day = 29) => new Date(2026, 8, day, h, m);
const AI_HISTORY: ActivityEntry[] = [
  { id: 'h1', kind: 'approval', actor: { name: 'Farah Siddiqui' }, at: at(9, 5), text: 'approved docs.ocr 2.0 at the promotion gate' },
  { id: 'h2', kind: 'change', actor: null, at: at(2, 0), text: 'ran the weekly drift check', changes: [{ field: 'helpdesk.answer drift', from: '0.19', to: '0.24' }] },
  { id: 'h3', kind: 'comment', actor: { name: 'Anand Iyer' }, at: at(17, 40, 28), text: 'Rerun bias on 1.7 after the rubric fix.' },
];

export const YX13: S = { name: 'Sales-assist queue', render: () => <SalesAssistScreen rows={D.SALES_QUEUE} now={TODAY} /> };
// C-8 (YX-13, answer 1210): the queue, live.
const SA_NOW = new Date(2026, 10, 13, 10, 0);
const SA_ROWS: SalesLiveRow[] = [
  { id: 'r1', ref: 'SA-012', company: 'Coromandel Logistics', band: '200–500', why: 'Talk to us: Access requests · payroll parallel run', setupPct: 40, owner: null, mine: false, dueAt: new Date(2026, 10, 13, 16, 0).toISOString(), status: 'open', requestedBy: 'Meena Pillai', phone: '9845012345', note: 'Two entities from April.', outcomeNote: null, createdAt: new Date(2026, 10, 12, 16, 0).toISOString(), version: 1 },
  { id: 'r2', ref: 'SA-011', company: 'Hampi Hotels Group', band: '500–1,000', why: 'Talk to us: First-run tours · pricing for their size', setupPct: 70, owner: 'Anand Iyer', mine: true, dueAt: new Date(2026, 10, 12, 15, 0).toISOString(), status: 'open', requestedBy: 'Ravi Kumar', phone: '9900112233', note: null, outcomeNote: null, createdAt: new Date(2026, 10, 11, 15, 0).toISOString(), version: 2 },
  { id: 'r3', ref: 'SA-009', company: 'Pennar Engineering', band: '200–500', why: 'Talk to us: Write policies with AI · moving data', setupPct: 10, owner: 'Kavitha Rao', mine: false, dueAt: new Date(2026, 10, 10, 11, 0).toISOString(), status: 'converted', requestedBy: 'Sita Rao', phone: '9123456780', note: null, outcomeNote: 'Signed for HR.', createdAt: new Date(2026, 10, 9, 11, 0).toISOString(), version: 3 },
];
const saWait = () => new Promise<void>((r) => setTimeout(r, 400));
const sa = (o: Partial<LiveSales> = {}) => (
  <ConsoleShell active="sales" name="Anand Iyer" email="anand.iyer@yukthix.test" securityHref="#" onSignOut={() => {}} onNavigate={() => {}}>
    <SalesAssistScreen rows={[]} now={SA_NOW} live={{ state: 'ready', onRetry: () => {}, now: SA_NOW, rows: SA_ROWS, onTake: saWait, onOutcome: saWait, ...o }} />
  </ConsoleShell>
);
export const YX13Live: S = { name: 'Sales-assist queue · Talk to us requests (C-8)', render: () => sa() };
export const YX13OutcomeLive: S = { name: 'Request · the owner records the outcome (C-8)', render: () => sa({ defaultOpen: 'r2' }) };
// Answer 2112: a request sent from an Ask YukthiX chat about buying, with the chat (phones and emails hidden).
const SA_CHAT: SalesLiveRow = { id: 'r4', ref: 'SA-013', company: 'Kaveri Foods', band: '200–500', why: 'Ask YukthiX: a buying question · pricing for their size', setupPct: null, owner: 'Anand Iyer', mine: true, dueAt: new Date(2026, 10, 14, 10, 0).toISOString(), status: 'open', requestedBy: 'Lakshmi Rao', phone: '9845012345', note: 'About 300 people from April.', chat: 'From Ask YukthiX (the in-app help assistant):\n\nAsked: How much is the Pro plan for 300 people? Call me on [phone hidden].\n\nAsk YukthiX: YukthiX sales can help with plans and prices for your size.', outcomeNote: null, createdAt: new Date(2026, 10, 13, 9, 0).toISOString(), version: 1 };
export const YX13FromChatLive: S = { name: 'Request · sent from an Ask YukthiX chat (2112)', render: () => sa({ rows: [SA_CHAT, ...SA_ROWS], defaultOpen: 'r4' }) };
export const YX13TalkToUs: S = { name: 'Talk to us from a nudge card (C-8)', render: () => <TalkToUsLiveDialog about="Access requests" onSend={async () => ({ dueAt: new Date(2026, 10, 14, 10, 0).toISOString() })} onClose={() => {}} /> };
export const YX13Empty: S = { name: 'Sales-assist queue · empty', render: () => <SalesAssistScreen rows={[]} now={TODAY} /> };
