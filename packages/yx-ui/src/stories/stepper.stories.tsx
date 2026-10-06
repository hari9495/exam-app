import '../components/stepper.css';
import type { Meta, StoryObj } from '@storybook/react-vite';
import { createElement, useState, type ReactElement } from 'react';
import { QuickStartLane, SetupChecklist, Stepper, type ChecklistSection, type StepperStep } from '../components/stepper';
import { FormField } from '../components/field';
import { TextField } from '../components/inputs';
import { DescriptionList } from '../components/shell';

const meta: Meta = { title: 'Workflow/Stepper and setup', parameters: { layout: 'padded' } };
export default meta;
type S = StoryObj;

const field = (label: string, defaultValue = '', required = true) => (
  <FormField label={label} required={required}>
    <TextField defaultValue={defaultValue} />
  </FormField>
);
const form = (...children: ReactElement[]) => createElement('div', { style: { display: 'flex', flexDirection: 'column', gap: 16 } }, ...children);

function steps(errorOnBank = false, lockDocs = false): StepperStep[] {
  return [
    {
      id: 'personal',
      title: 'Personal details',
      description: 'Name, date of birth, contact',
      content: form(field('Full name', 'Meera Krishnan'), field('Personal email', 'meera.k@example.in'), field('Mobile', '+91 98450 12345')),
      summary: <DescriptionList items={[{ label: 'Full name', value: 'Meera Krishnan' }, { label: 'Personal email', value: 'meera.k@example.in' }, { label: 'Mobile', value: '+91 98450 12345' }]} />,
    },
    {
      id: 'job',
      title: 'Job details',
      description: 'Role, department, manager',
      content: form(field('Designation', 'Senior Accountant'), field('Department', 'Finance'), field('Reporting manager', 'Anita Rao')),
      summary: <DescriptionList items={[{ label: 'Designation', value: 'Senior Accountant' }, { label: 'Department', value: 'Finance' }, { label: 'Date of joining', value: '05 Oct 2026' }]} />,
    },
    {
      id: 'bank',
      title: 'Bank details',
      description: 'Salary account',
      status: errorOnBank ? 'error' : undefined,
      statusNote: errorOnBank ? 'Enter a valid IFSC like HDFC0001234' : undefined,
      content: form(field('Account holder', 'Meera Krishnan'), field('Account number', '50100234567812'), field('IFSC', errorOnBank ? 'HDFC01234' : 'HDFC0001234')),
      summary: <DescriptionList items={[{ label: 'Account', value: 'Kaveri Co-operative Bank ···7812', mono: true }, { label: 'IFSC', value: 'HDFC0001234', mono: true }]} />,
    },
    {
      id: 'docs',
      title: 'Documents',
      description: 'PAN, Aadhaar, offer letter',
      status: lockDocs ? 'locked' : undefined,
      statusNote: lockDocs ? 'Finish bank details first' : undefined,
      content: form(field('PAN', 'ABCPK1234F'), field('Aadhaar', 'XXXX XXXX 4821')),
      summary: <DescriptionList items={[{ label: 'PAN', value: 'ABCPK1234F', mono: true }, { label: 'Aadhaar', value: 'XXXX XXXX 4821', mono: true }]} />,
    },
  ];
}

const wizard = (current: string, opts: { error?: boolean; lock?: boolean; mobile?: boolean } = {}) => (
  <Stepper
    title="Add employee"
    steps={steps(opts.error, opts.lock)}
    defaultCurrent={current}
    review={{ description: 'Check everything before you add Meera' }}
    finishLabel="Add employee"
    onSaveAndExit={() => {}}
    layout={opts.mobile ? 'mobile' : 'auto'}
  />
);

export const FirstStep: S = { name: 'Stepper, first step', render: () => wizard('personal') };
export const MiddleStep: S = { name: 'Stepper, step 3 of 5', render: () => wizard('bank') };
export const ErrorStep: S = { name: 'Stepper, step with errors', render: () => wizard('bank', { error: true }) };
export const LockedStep: S = { name: 'Stepper, locked step', render: () => wizard('bank', { lock: true }) };
export const ReviewStep: S = { name: 'Stepper, review step', render: () => wizard('review') };
export const Mobile: S = {
  name: 'Stepper, mobile',
  globals: { viewport: { value: 'mobile2', isRotated: false } },
  render: () => wizard('bank', { mobile: true }),
};
export const Focus: S = { name: 'Stepper, focus on a step', parameters: { pseudo: { focusVisible: ['.yx-stepper__step'] } }, render: () => wizard('job') };

/* Setup checklist */
const SECTIONS: ChecklistSection[] = [
  {
    id: 'company',
    title: 'Company',
    tasks: [
      { id: 'profile', title: 'Add company details', description: 'Legal name, PAN, TAN and registered address', estimate: '5 min', status: 'done' },
      { id: 'entities', title: 'Add legal entities', estimate: '5 min', status: 'done' },
      { id: 'locations', title: 'Add work locations', description: 'Offices and plants with their states', estimate: '5 min', status: 'done' },
      { id: 'logo', title: 'Upload your logo', estimate: '1 min', status: 'todo', optional: true },
    ],
  },
  {
    id: 'people',
    title: 'People',
    tasks: [
      { id: 'departments', title: 'Set up departments', estimate: '5 min', status: 'done' },
      { id: 'import', title: 'Import employees', description: 'Upload the Excel template or connect your old HRMS', estimate: '15 min', status: 'in-progress' },
      { id: 'invite', title: 'Invite employees', estimate: '2 min', status: 'blocked', blockedReason: 'Import employees first' },
    ],
  },
  {
    id: 'payroll',
    title: 'Payroll',
    tasks: [
      { id: 'bank', title: 'Add company bank account', estimate: '3 min', status: 'done' },
      { id: 'structure', title: 'Create salary structures', estimate: '10 min', status: 'done' },
      { id: 'pf', title: 'Set up PF and ESI', estimate: '5 min', status: 'done' },
      { id: 'pt', title: 'Set up professional tax', estimate: '3 min', status: 'todo' },
      { id: 'lwf', title: 'Set up labour welfare fund', estimate: '3 min', status: 'todo' },
      { id: 'run', title: 'Run a test payroll', estimate: '10 min', status: 'blocked', blockedReason: 'Import employees first' },
    ],
  },
];
const allDone = SECTIONS.map((s) => ({ ...s, tasks: s.tasks.map((t) => ({ ...t, status: 'done' as const })) }));

export const ChecklistPartial: S = { name: 'Setup checklist, partly done', render: () => <SetupChecklist sections={SECTIONS} onStart={() => {}} onSkip={() => {}} /> };
export const ChecklistShowDone: S = { name: 'Setup checklist, done tasks shown', render: () => <SetupChecklist sections={SECTIONS} onStart={() => {}} onSkip={() => {}} defaultShowDone /> };
export const ChecklistAllDone: S = { name: 'Setup checklist, all done', render: () => <SetupChecklist sections={allDone} /> };
export const ChecklistMobile: S = {
  name: 'Setup checklist, mobile',
  globals: { viewport: { value: 'mobile2', isRotated: false } },
  render: () => <SetupChecklist sections={SECTIONS} onStart={() => {}} onSkip={() => {}} />,
};

/* Quick-start lane */
const LANE = [
  { id: 'company', title: 'Add your company', description: 'Name, PAN and address', estimate: '1 min' },
  { id: 'people', title: 'Add 5 employees', description: 'Or import a spreadsheet', estimate: '2 min' },
  { id: 'leave', title: 'Pick a leave policy', description: 'Start from the Karnataka template', estimate: '1 min' },
  { id: 'apply', title: 'Apply a test leave', description: 'See the approval flow end to end', estimate: '1 min' },
];
function LaneDemo() {
  const [current, setCurrent] = useState('people');
  const i = LANE.findIndex((s) => s.id === current);
  return <QuickStartLane title="Your first 5 minutes with Leave" steps={LANE} current={current} onAction={() => setCurrent(LANE[Math.min(i + 1, LANE.length - 1)].id)} />;
}
export const QuickStart: S = { name: 'Quick-start lane', render: () => <LaneDemo /> };
export const QuickStartFirst: S = { name: 'Quick-start lane, first step', render: () => <QuickStartLane steps={LANE.slice(0, 3)} current="company" onAction={() => {}} /> };
export const QuickStartMobile: S = {
  name: 'Quick-start lane, mobile',
  globals: { viewport: { value: 'mobile2', isRotated: false } },
  render: () => <LaneDemo />,
};
