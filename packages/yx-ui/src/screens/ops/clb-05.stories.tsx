import type { Meta, StoryObj } from '@storybook/react-vite';
import { ConvertWorkerScreen } from './contract';
import { WORKERS } from './contract-data';

const meta: Meta = { title: 'Screens/Contract labour/CLB-05 · Convert worker to employee', parameters: { layout: 'fullscreen' } };
export default meta;
type S = StoryObj;

export const SamePerson: S = { name: 'Same person kept', render: () => <ConvertWorkerScreen worker={WORKERS[0]} /> };
export const EndRole: S = { name: 'End contract role', render: () => <ConvertWorkerScreen worker={WORKERS[0]} current="end" /> };
export const Employee: S = { name: 'Employee details', render: () => <ConvertWorkerScreen worker={WORKERS[0]} current="employee" /> };
export const CarryOver: S = { name: 'Identity and documents carried over', render: () => <ConvertWorkerScreen worker={WORKERS[0]} current="carry" /> };
export const Review: S = { name: 'Review and create', render: () => <ConvertWorkerScreen worker={WORKERS[0]} current="review" /> };
