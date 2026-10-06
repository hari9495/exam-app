import type { Meta, StoryObj } from '@storybook/react-vite';
import { DirectoryPhone, DirectoryScreen } from './directory';
import { WORKFORCE } from './people-data';

const meta: Meta = { title: 'Screens/People/PPL-01 · Directory', parameters: { layout: 'fullscreen' } };
export default meta;
type S = StoryObj;
const phone = { globals: { viewport: { value: 'mobile2', isRotated: false } } };

export const HrEmployees: S = { name: 'HR · employees with workforce card', render: () => <DirectoryScreen persona="hr" rows={WORKFORCE} /> };
export const HrContractWorkers: S = { name: 'HR · contract workers', render: () => <DirectoryScreen persona="hr" rows={WORKFORCE} defaultFilter="Contract worker" /> };
export const HrAllPersons: S = { name: 'HR · all persons', render: () => <DirectoryScreen persona="hr" rows={WORKFORCE} defaultFilter="All persons" /> };
export const Employee: S = { name: 'Employee · public fields only', render: () => <DirectoryScreen persona="emp" rows={WORKFORCE} /> };
export const QuickView: S = { name: 'Quick view drawer', render: () => <DirectoryScreen persona="hr" rows={WORKFORCE} defaultOpenId="e2" /> };
export const Filtered: S = { name: '· filtered to nothing', render: () => <DirectoryScreen persona="hr" rows={WORKFORCE} defaultQuery="Zzz" /> };
export const Empty: S = { name: '· empty (first use)', render: () => <DirectoryScreen persona="hr" rows={[]} /> };
export const Loading: S = { name: '· loading', render: () => <DirectoryScreen persona="hr" rows={WORKFORCE} state="loading" /> };
export const LoadError: S = { name: '· error', render: () => <DirectoryScreen persona="hr" rows={WORKFORCE} state="error" /> };
export const Phone: S = { name: '· phone', ...phone, render: () => <DirectoryPhone rows={WORKFORCE} /> };
export const PhoneNoMatch: S = { name: '· phone, no match', ...phone, render: () => <DirectoryPhone rows={WORKFORCE} defaultQuery="Zzz" /> };
