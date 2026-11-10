import type { Meta, StoryObj } from '@storybook/react-vite';
import { WorkersScreen } from './contract';
import { CONTRACTORS, WORKERS } from './contract-data';
import { TODAY } from '../_kit/data';

const meta: Meta = { title: 'Screens/Contract labour/CLB-02 · Contract workers register', parameters: { layout: 'fullscreen' } };
export default meta;
type S = StoryObj;
const base = { workers: WORKERS, contractors: CONTRACTORS, today: TODAY };

export const Register: S = { render: () => <WorkersScreen {...base} /> };
export const Deploy: S = { name: 'Deploy · checks pass', render: () => <WorkersScreen {...base} deploy="ok" /> };
export const LicenceFull: S = { name: 'Deploy · licence maximum reached', render: () => <WorkersScreen {...base} deploy="limit" /> };
export const Underage: S = { name: 'Deploy · under 18 blocked', render: () => <WorkersScreen {...base} deploy="underage" /> };
export const OutOfScope: S = { name: 'Deploy · licence scope excludes Kerala', render: () => <WorkersScreen {...base} deploy="scope" /> };
export const Empty: S = { render: () => <WorkersScreen {...base} workers={[]} state="empty" /> };
export const Error: S = { render: () => <WorkersScreen {...base} state="error" /> };
export const Duplicate: S = { name: 'Deploy · same ID already deployed (CL-2)', render: () => <WorkersScreen {...base} deploy="duplicate" /> };
export const Threshold: S = { name: 'Deploy · registration threshold warning (CL-2)', render: () => <WorkersScreen {...base} deploy="threshold" /> };
export const Approve: S = { name: 'Site approval · induction and gate pass (CL-2)', render: () => <WorkersScreen {...base} sheet={{ kind: 'approve', id: 'w6' }} /> };
export const Release: S = { name: 'Release a worker (CL-2)', render: () => <WorkersScreen {...base} sheet={{ kind: 'release', id: 'w1' }} /> };
export const ReadOnly: S = { name: 'Read only (view key, CL-2)', render: () => <WorkersScreen {...base} readOnly /> };
