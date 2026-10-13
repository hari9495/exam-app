import type { Meta, StoryObj } from '@storybook/react-vite';
import { HiringJobsScreen, type HiringJobsScreenProps } from './jobs';

// Recruitment, wired (batch AT1; M10-BUILD-DESIGN §3). In the affordance guard set ('screens-hiring-live').
const meta: Meta = { title: 'Screens/Hiring/Live · Jobs', parameters: { layout: 'fullscreen' } };
export default meta;
type S = StoryObj;

const ok = async () => ({});
const noop = () => undefined;
const props: HiringJobsScreenProps = {
  state: 'ready',
  jobs: [
    { id: 'j1', title: 'Senior accountant', status: 'open', createdAt: '2026-10-01T09:00:00Z', stageSummary: '6 Applied · 2 Interview · 1 Offer' },
    { id: 'j2', title: 'Plant supervisor', status: 'pending_approval', createdAt: '2026-10-08T09:00:00Z', stageSummary: 'No candidates yet' },
    { id: 'j3', title: 'Sales executive', status: 'closed', createdAt: '2026-08-12T09:00:00Z', stageSummary: '14 rejected · 2 hired' },
  ],
  filter: 'all',
  onFilter: noop,
  canManage: true,
  onOpen: noop,
  onCreate: ok,
  onDelete: ok,
  onDraftDescription: async () => 'We are looking for…',
  departments: [{ value: 'd1', label: 'Finance' }, { value: 'd2', label: 'Operations' }],
  locations: [{ value: 'l1', label: 'Chennai' }],
  designations: [{ value: 'x1', label: 'Senior accountant' }],
  managers: [{ value: 'u1', label: 'Priya Nair' }],
  pipelines: [{ value: 'p1', label: 'Standard', isDefault: true }],
  customFields: [{ id: 'cf1', label: 'Cost centre', fieldType: 'text', options: null, required: false }],
};

export const List: S = { render: () => <HiringJobsScreen {...props} /> };
export const ReadOnly: S = { render: () => <HiringJobsScreen {...props} canManage={false} /> };
export const Empty: S = { render: () => <HiringJobsScreen {...props} jobs={[]} /> };
export const NoMasters: S = { render: () => <HiringJobsScreen {...props} departments={[]} locations={[]} designations={[]} /> };
