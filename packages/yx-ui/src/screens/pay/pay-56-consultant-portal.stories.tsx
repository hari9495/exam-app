import type { Meta, StoryObj } from '@storybook/react-vite';
import { ConsultantPortalScreen } from './consultants';

const meta: Meta<typeof ConsultantPortalScreen> = { title: 'Screens/Pay/PAY-56 · Consultant portal', component: ConsultantPortalScreen, render: (args) => <ConsultantPortalScreen {...args} />, parameters: { layout: 'fullscreen' } };
export default meta;
type S = StoryObj<typeof ConsultantPortalScreen>;

export const Invoices: S = { name: 'Your invoices · advices and certificates' };
export const Upload: S = { name: 'Send an invoice', args: { dialog: 'upload' } };
export const UploadClosed: S = { name: 'Sign in again to send', args: { upload: 'closed' } };
export const NoPan: S = { name: 'No working PAN', args: { pan: 'missing' } };
export const Empty: S = { name: 'Empty', args: { state: 'empty' } };
export const Loading: S = { name: 'Loading', args: { state: 'loading' } };
export const LoadError: S = { name: 'Error · retry', args: { state: 'error' } };
export const NoAccess: S = { name: 'No access', args: { state: 'no-access' } };
