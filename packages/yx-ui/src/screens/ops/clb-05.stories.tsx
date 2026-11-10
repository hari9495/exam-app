import type { Meta, StoryObj } from '@storybook/react-vite';
import { ConvertWorkerScreen, WorkersView } from './contract';
import { CONTRACTORS, WORKERS } from './contract-data';

const meta: Meta = { title: 'Screens/Contract labour/CLB-05 · Convert worker to employee', parameters: { layout: 'fullscreen' } };
export default meta;
type S = StoryObj;

export const SamePerson: S = { name: 'Same person kept', render: () => <ConvertWorkerScreen worker={WORKERS[0]} /> };
export const EndRole: S = { name: 'End contract role', render: () => <ConvertWorkerScreen worker={WORKERS[0]} current="end" /> };
export const Employee: S = { name: 'Employee details', render: () => <ConvertWorkerScreen worker={WORKERS[0]} current="employee" /> };
export const CarryOver: S = { name: 'Identity and documents carried over', render: () => <ConvertWorkerScreen worker={WORKERS[0]} current="carry" /> };
export const Review: S = { name: 'Review and create', render: () => <ConvertWorkerScreen worker={WORKERS[0]} current="review" /> };
// CL-7 (answer 637): HR with the onboarding key starts the conversion from a deployed worker in the contract workers list.
export const Start: S = {
  name: 'Start · Make employee on a deployed worker',
  render: () => <WorkersView workers={WORKERS} contractors={CONTRACTORS.map((c) => ({ id: c.id, name: c.name }))} locations={[{ id: 'hsr', name: 'Hosur plant', state: 'TN' }]} today={new Date(2026, 8, 29)} state="ready" sheet={null} canManage inductionRequired inductionMonths={12} onConvert={() => {}} />,
};
