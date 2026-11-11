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
import { AvailabilityBanner } from '../settings/help';
import type { LiveMaintenance, MaintenanceRow } from './console-maintenance-live';
import { TODAY } from './t9-data';
import type { ActivityEntry } from '../../components/timeline';

const meta: Meta = { title: 'Screens/YukthiX console/YX-10 · Incidents, status admin and probes', parameters: { layout: 'fullscreen' } };
export default meta;
type S = StoryObj;
const at = (h: number, m: number, day = 29) => new Date(2026, 8, day, h, m);
const AI_HISTORY: ActivityEntry[] = [
  { id: 'h1', kind: 'approval', actor: { name: 'Farah Siddiqui' }, at: at(9, 5), text: 'approved docs.ocr 2.0 at the promotion gate' },
  { id: 'h2', kind: 'change', actor: null, at: at(2, 0), text: 'ran the weekly drift check', changes: [{ field: 'helpdesk.answer drift', from: '0.19', to: '0.24' }] },
  { id: 'h3', kind: 'comment', actor: { name: 'Anand Iyer' }, at: at(17, 40, 28), text: 'Rerun bias on 1.7 after the rubric fix.' },
];

export const YX10List: S = { name: 'Incidents and maintenance', render: () => <IncidentComposerScreen incidents={D.INCIDENTS_ADMIN} me="Anand Iyer" now={TODAY} /> };
export const YX10Compose: S = { name: 'Incident update composer', render: () => <IncidentComposerScreen incidents={D.INCIDENTS_ADMIN} mode="incident" me="Anand Iyer" now={TODAY} /> };
export const YX10Maintenance: S = { name: 'Maintenance · passes checks', render: () => <IncidentComposerScreen incidents={D.INCIDENTS_ADMIN} mode="maintenance" me="Anand Iyer" now={TODAY} /> };
export const YX10MaintenanceBlocked: S = { name: 'Maintenance · payroll window blocked', render: () => <IncidentComposerScreen incidents={D.INCIDENTS_ADMIN} mode="maintenance" maintenanceStart={new Date(2026, 9, 3, 1, 0)} me="Anand Iyer" now={TODAY} /> };
// C-5 (answers 948, 1053): planned maintenance, live; and the 6.5 banner every company sees.
const MW_SETTINGS = {
  numbers: [
    { key: 'maintenance.notice_hours', label: 'Notice before a window (hours)', value: 72, default: 72, min: 24, max: 720 },
    { key: 'maintenance.banner_hours', label: 'Show the banner this long before (hours)', value: 24, default: 24, min: 1, max: 168 },
    { key: 'maintenance.max_hours', label: 'Longest window (hours)', value: 4, default: 4, min: 1, max: 12 },
    { key: 'maintenance.block_first_days', label: 'No windows in the first days of the month', value: 7, default: 7, min: 0, max: 10 },
    { key: 'maintenance.block_last_days', label: 'No windows in the last days of the month', value: 3, default: 3, min: 0, max: 10 },
  ],
  blockDates: [7, 15, 20],
};
const MW_NOW = new Date(2026, 10, 12, 10, 0);
const MW_ROWS: MaintenanceRow[] = [
  { id: 'w1', title: 'Database upgrade', startsAt: new Date(2026, 10, 18, 1, 0).toISOString(), endsAt: new Date(2026, 10, 18, 3, 0).toISOString(), status: 'pending_approval', writtenBy: 'Joseph Thomas', mine: false, decidedBy: null, cancelledBy: null, cancelReason: null, version: 1 },
  { id: 'w2', title: 'Search index rebuild', startsAt: new Date(2026, 10, 13, 1, 0).toISOString(), endsAt: new Date(2026, 10, 13, 2, 0).toISOString(), status: 'scheduled', writtenBy: 'Anand Iyer', mine: true, decidedBy: 'Farah Siddiqui', cancelledBy: null, cancelReason: null, version: 2 },
];
const MW_CURRENT = { phase: 'upcoming' as const, title: 'Search index rebuild', startsAt: MW_ROWS[1]!.startsAt, endsAt: MW_ROWS[1]!.endsAt };
const wait = () => new Promise<void>((r) => setTimeout(r, 400));
const mw = (o: Partial<LiveMaintenance> = {}) => (
  <ConsoleShell active="maintenance" name="Anand Iyer" email="anand.iyer@yukthix.test" securityHref="#" onSignOut={() => {}} onNavigate={() => {}}>
    <IncidentComposerScreen incidents={[]} me="Anand Iyer" now={MW_NOW} live={{ state: 'ready', onRetry: () => {}, now: MW_NOW, windows: MW_ROWS, settings: MW_SETTINGS, current: MW_CURRENT, onSchedule: wait, onApprove: wait, onCancel: wait, onSaveSettings: wait, ...o }} />
  </ConsoleShell>
);
export const YX10MaintenanceLive: S = { name: 'Planned maintenance · schedule and approve (C-5)', render: () => mw({ defaultStart: new Date(2026, 10, 18, 1, 0) }) };
export const YX10MaintenanceTooSoon: S = { name: 'Planned maintenance · too little notice (C-5)', render: () => mw({ defaultStart: new Date(2026, 10, 13, 1, 0) }) };
export const YX10BannerBefore: S = { name: 'What companies see · the day before (C-5)', render: () => <AvailabilityBanner kind="maintenance" live={MW_CURRENT} /> };
export const YX10BannerDuring: S = { name: 'What companies see · during the window (C-5)', render: () => <AvailabilityBanner kind="maintenance" live={{ ...MW_CURRENT, phase: 'now' }} /> };
export const YX10Probes: S = { name: 'Probes', render: () => <ProbesScreen probes={D.PROBES} /> };
