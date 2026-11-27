import type { Meta, StoryObj } from '@storybook/react-vite';
import { ModulesScreen, type ModuleRow } from './modules';

const meta: Meta = { title: 'Screens/Platform/Modules', parameters: { layout: 'fullscreen' } };
export default meta;
type S = StoryObj;

// T2-G 41 (answer 2746): the rail's modules in the company's order; People, Payroll and Compliance always on.
const MODULES: ModuleRow[] = [
  { id: 'people', label: 'People', on: true, locked: true },
  { id: 'time', label: 'Time & Leave', on: true, locked: false },
  { id: 'pay', label: 'Payroll', on: true, locked: true },
  { id: 'compliance', label: 'Compliance', on: true, locked: true },
  { id: 'contract', label: 'Contract labour', on: false, locked: false },
  { id: 'hire', label: 'Hiring', on: true, locked: false },
  { id: 'projects', label: 'Projects', on: false, locked: false },
  { id: 'performance', label: 'Performance', on: true, locked: false },
  { id: 'learning', label: 'Learning', on: true, locked: false },
  { id: 'helpdesk', label: 'Helpdesk', on: true, locked: false },
  { id: 'engage', label: 'Engage', on: true, locked: false },
  { id: 'visitors', label: 'Visitors', on: false, locked: false },
  { id: 'analytics', label: 'Analytics', on: true, locked: false },
];

export const Modules: S = { name: 'Modules · on, off and order', render: () => <ModulesScreen modules={MODULES} /> };
export const ModulesReadOnly: S = { name: 'Modules · read-only', render: () => <ModulesScreen modules={MODULES} canEdit={false} /> };
export const ModulesLive: S = { name: 'Modules · live', render: () => <ModulesScreen modules={MODULES} live={{ state: 'ready', onRetry: () => {}, onSave: () => new Promise((r) => setTimeout(r, 400)) }} /> };
export const ModulesLoading: S = { name: 'Modules · loading', render: () => <ModulesScreen modules={[]} live={{ state: 'loading', onRetry: () => {}, onSave: async () => {} }} /> };
export const ModulesError: S = { name: 'Modules · error', render: () => <ModulesScreen modules={[]} live={{ state: 'error', onRetry: () => {}, onSave: async () => {} }} /> };
