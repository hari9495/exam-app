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
import type { IncidentLiveRow, LiveIncidents } from './console-incidents-live';
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
export const YX10MaintenanceViewOnly: S = { name: 'Planned maintenance · Customer success sees the windows (staff roles)', render: () => mw({ canManage: false }) };
export const YX10BannerBefore: S = { name: 'What companies see · the day before (C-5)', render: () => <AvailabilityBanner kind="maintenance" live={MW_CURRENT} /> };
export const YX10BannerDuring: S = { name: 'What companies see · during the window (C-5)', render: () => <AvailabilityBanner kind="maintenance" live={{ ...MW_CURRENT, phase: 'now' }} /> };
// C-8 (YX-10, answer 1124): incidents, live.
const INC_ROWS: IncidentLiveRow[] = [
  {
    id: 'i1', ref: 'INC-044', title: 'Payslip PDFs slow to open', severity: 2, products: ['hrms'], status: 'open', stage: 'identified', openedAt: new Date(2026, 10, 12, 8, 51).toISOString(), openedBy: 'Anand Iyer', resolvedAt: null, securityBreach: false, breach: null,
    updates: [
      { id: 'u2', stage: 'monitoring', impact: 'Payslip PDFs open normally again for most companies.', action: 'No action needed.', nextUpdateAt: new Date(2026, 10, 12, 11, 0).toISOString(), payrollNote: false, status: 'pending', writtenBy: 'Joseph Thomas', mine: false, reviewedBy: null, reviewNote: null, createdAt: new Date(2026, 10, 12, 10, 0).toISOString() },
      { id: 'u1', stage: 'identified', impact: 'Payslip PDFs take up to 40 seconds to open. Figures in the app are correct.', action: 'No action needed. Publishing payslips still works.', nextUpdateAt: new Date(2026, 10, 12, 10, 30).toISOString(), payrollNote: true, status: 'posted', writtenBy: 'Anand Iyer', mine: true, reviewedBy: 'Farah Siddiqui', reviewNote: null, createdAt: new Date(2026, 10, 12, 9, 0).toISOString() },
    ],
  },
  {
    id: 'i2', ref: 'INC-043', title: 'Unusual sign-ins at one company', severity: 1, products: ['hrms'], status: 'open', stage: 'investigating', openedAt: new Date(2026, 10, 12, 6, 10).toISOString(), openedBy: 'Farah Siddiqui', resolvedAt: null, securityBreach: true,
    breach: { id: 'c1', company: 'Godavari Agro', containedAt: new Date(2026, 10, 12, 6, 0).toISOString(), certinDueAt: new Date(2026, 10, 12, 12, 0).toISOString(), dpdpDueAt: new Date(2026, 10, 15, 6, 0).toISOString(), open: true, certinRemindedAt: null, dpdpRemindedAt: null },
    updates: [{ id: 'u3', stage: 'investigating', impact: 'One company was contained after sign-ins from three countries.', action: 'Their admins were told directly.', nextUpdateAt: null, payrollNote: false, status: 'posted', writtenBy: 'Farah Siddiqui', mine: false, reviewedBy: 'Anand Iyer', reviewNote: null, createdAt: new Date(2026, 10, 12, 6, 20).toISOString() }],
  },
];
const inc = (o: Partial<LiveIncidents> = {}) => (
  <ConsoleShell active="incidents" name="Anand Iyer" email="anand.iyer@yukthix.test" securityHref="#" onSignOut={() => {}} onNavigate={() => {}}>
    <IncidentComposerScreen incidents={[]} me="Anand Iyer" now={MW_NOW} liveIncidents={{ state: 'ready', onRetry: () => {}, incidents: INC_ROWS, containments: [], products: [{ code: 'hrms', name: 'YukthiX HR' }, { code: 'hire', name: 'YukthiX Hire' }], settings: { leadHours: 1, leadHoursDefault: 1 }, onOpen: wait, onUpdate: wait, onReview: wait, onMarkBreach: wait, onSaveSettings: wait, ...o }} />
  </ConsoleShell>
);
export const YX10IncidentsLive: S = { name: 'Incidents · list and what companies see (C-8)', render: () => inc() };
export const YX10IncidentApproveLive: S = { name: 'Incident · another staff member approves the update (C-8)', render: () => inc({ defaultOpen: 'i1' }) };
export const YX10BreachLive: S = { name: 'Incident · security breach and its reminders (C-8)', render: () => inc({ defaultOpen: 'i2' }) };
export const YX10BannerIncident: S = { name: 'What companies see · an open incident (C-8)', render: () => <AvailabilityBanner kind="degraded" incident={{ title: 'Payslip PDFs slow to open', severity: 2, stage: 'identified', impact: 'Payslip PDFs take up to 40 seconds to open. Figures in the app are correct.', action: 'No action needed.', nextUpdateAt: new Date(2026, 10, 12, 10, 30).toISOString(), updatedAt: new Date(2026, 10, 12, 9, 0).toISOString() }} /> };
export const YX10Probes: S = { name: 'Probes', render: () => <ProbesScreen probes={D.PROBES} /> };
