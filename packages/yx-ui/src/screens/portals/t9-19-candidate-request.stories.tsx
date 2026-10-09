import type { Meta, StoryObj } from '@storybook/react-vite';
import { CandidateRequestScreen } from './t9-candidate';
import { KAVERI_ACCENT, TENANT, TODAY } from './t9-data';

const meta: Meta = { title: 'Screens/Portals/T9-19 · Alternative process and deletion request', parameters: { layout: 'fullscreen' } };
export default meta;
type S = StoryObj;
const base = { tenant: TENANT, accent: KAVERI_ACCENT, today: TODAY };

export const Form: S = { name: 'Request form', render: () => <CandidateRequestScreen {...base} state="form" /> };
export const FormPhone: S = { name: 'Request form · phone', globals: { viewport: { value: 'mobile2', isRotated: false } }, render: () => <CandidateRequestScreen {...base} state="form" /> };
export const Received: S = { name: 'Received · complete-by date', render: () => <CandidateRequestScreen {...base} state="received" /> };
export const Completed: S = { name: 'Deletion completed', render: () => <CandidateRequestScreen {...base} state="completed" /> };
export const Hold: S = { name: 'Legal hold applied', render: () => <CandidateRequestScreen {...base} state="hold" /> };
