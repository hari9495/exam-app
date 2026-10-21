import type { Meta, StoryObj } from '@storybook/react-vite';
import { ReverificationCycles, type ReverifData, type ReverifRow } from './reverification';
import { REVERIF_ROWS, REVERIF_RULES } from './people-data';

const meta: Meta = { title: 'Screens/People/PPL-42 · Re-verification cycles', parameters: { layout: 'fullscreen' } };
export default meta;
type S = StoryObj;

const today = '2026-09-29';
const data: ReverifData = {
  rules: [...REVERIF_RULES],
  rows: REVERIF_ROWS as unknown as ReverifRow[],
  types: [
    { value: 'pan_card', label: 'PAN card' },
    { value: 'bgv_report', label: 'Background check report' },
    { value: 'bank_proof', label: 'Bank proof (cancelled cheque or passbook)' },
  ],
  entities: [
    { value: 'kf', label: 'Kaveri Foods Pvt Ltd' },
    { value: 'kftn', label: 'Kaveri Foods Pvt Ltd (Tamil Nadu)' },
  ],
  departments: ['Finance', 'Payroll', 'Quality', 'Production'].map((d) => ({ value: d, label: d })),
  designations: ['Accountant', 'Payroll Executive', 'QA Inspector'].map((d) => ({ value: d, label: d })),
  canManageCompany: true,
};
const wait = async () => undefined;

export const Default: S = { name: 'HR · due list', render: () => <ReverificationCycles today={today} data={data} onAddRule={wait} onEndRule={wait} onAsk={wait} /> };
export const Rules: S = { name: 'HR · rules', render: () => <ReverificationCycles today={today} data={data} tab="rules" onAddRule={wait} onEndRule={wait} /> };
export const AddRule: S = { name: 'HR · add a rule', render: () => <ReverificationCycles today={today} data={data} startAdding onAddRule={wait} /> };
export const Ask: S = { name: 'HR · ask for a fresh copy', render: () => <ReverificationCycles today={today} data={data} startAsking="rv2" onAsk={wait} /> };
export const Empty: S = { name: '· empty', render: () => <ReverificationCycles today={today} data={{ ...data, rules: [], rows: [] }} /> };
export const Loading: S = { name: '· loading', render: () => <ReverificationCycles today={today} data={null} state="loading" /> };
