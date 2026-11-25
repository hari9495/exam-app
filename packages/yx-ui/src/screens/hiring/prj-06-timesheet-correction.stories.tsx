import type { Meta, StoryObj } from '@storybook/react-vite';
import { TimesheetCorrectionScreen } from './projects-billing';
import { PD } from './projects-data';
import type { LiveCorrection } from './billing-live';
import { LIVE_CORRECTION_FACTS, LIVE_CORRECTION_LINES } from './projects-live-fixtures';

const meta: Meta = { title: 'Screens/Projects/PRJ-06 · Timesheet correction and credit note', parameters: { layout: 'fullscreen' } };
export default meta;
type S = StoryObj;

const base = {
  person: 'Rohit Bhat',
  project: 'NRP-WEB',
  week: 'Week of 10 Aug 2026',
  invoiceNo: 'KF/TN/26-27/0151',
  invoiceDate: PD(2026, 9, 1),
  invoicedHours: 44,
  rate: 1_600,
  costRate: 720,
  monthRevenue: 9_40_000,
  monthCost: 6_10_000,
};

export const CreditWithRecovery: S = { name: 'PM · down 8 h, credit note and pay recovery', render: () => <TimesheetCorrectionScreen {...base} defaultCorrected={36} policy="recovery" /> };
export const CreditNoRecovery: S = { name: 'Finance · credit note, policy none', render: () => <TimesheetCorrectionScreen {...base} defaultCorrected={36} policy="none" /> };
export const Supplementary: S = { name: 'Up 4 h · supplementary invoice', render: () => <TimesheetCorrectionScreen {...base} defaultCorrected={48} policy="none" /> };
export const Locked: S = { name: 'Period locked · adjustment line', render: () => <TimesheetCorrectionScreen {...base} defaultCorrected={36} policy="recovery" periodLocked /> };
export const Review: S = { name: 'Review documents', render: () => <TimesheetCorrectionScreen {...base} defaultCorrected={36} policy="recovery" defaultStep="review" /> };

// Projects P-6 live (answer 1416): pick the line, then correct it; the document follows from the hours.
const live = (over: Partial<LiveCorrection> = {}): LiveCorrection => ({
  state: 'ready',
  pick: { projects: [{ id: 'p1', label: 'NRP-WEB · Nilgiri web store' }], projectId: 'p1', onProject: () => {}, months: ['2026-08', '2026-07'], month: '2026-08', onMonth: () => {}, lines: LIVE_CORRECTION_LINES, onPick: () => {} },
  facts: LIVE_CORRECTION_FACTS,
  onCorrect: async () => ({ adjustment: false, document: { kind: 'credit_note', number: 'KF/TN/CN12' }, recoveryHours: 0 }),
  onBack: () => {},
  ...over,
});
export const LivePick: S = { name: 'Live · choose the line', render: () => <TimesheetCorrectionScreen live={live({ facts: null })} /> };
export const LiveCredit: S = { name: 'Live · down 8 h, credit note', render: () => <TimesheetCorrectionScreen live={live({ defaultHours: 36, defaultReason: 'Stand-up booked twice on 14 Aug' })} /> };
export const LiveRecovery: S = { name: 'Live · credit note and pay recovery', render: () => <TimesheetCorrectionScreen live={live({ facts: { ...LIVE_CORRECTION_FACTS, recovery: true }, defaultHours: 36, defaultReason: 'Stand-up booked twice on 14 Aug' })} /> };
export const LiveSupplementary: S = { name: 'Live · up 4 h, supplementary invoice', render: () => <TimesheetCorrectionScreen live={live({ defaultHours: 48, defaultReason: 'Client workshop not booked' })} /> };
export const LiveLocked: S = { name: 'Live · month locked, adjustment', render: () => <TimesheetCorrectionScreen live={live({ facts: { ...LIVE_CORRECTION_FACTS, locked: true }, defaultHours: 36, defaultReason: 'Stand-up booked twice on 14 Aug' })} /> };
export const LiveNoAccess: S = { name: 'Live · no access', render: () => <TimesheetCorrectionScreen live={live({ state: 'no-access', facts: null })} /> };
