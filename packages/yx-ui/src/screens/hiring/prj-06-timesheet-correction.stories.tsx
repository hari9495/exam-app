import type { Meta, StoryObj } from '@storybook/react-vite';
import { TimesheetCorrectionScreen } from './projects-billing';
import { PD } from './projects-data';

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
