import type { Meta, StoryObj } from '@storybook/react-vite';
import { ProfileChangePhone, ProfileChangeRequest } from './selfservice';
import { TODAY } from './people-data';

const meta: Meta = { title: 'Screens/People/PPL-32 · Profile change request', parameters: { layout: 'fullscreen' } };
export default meta;
type S = StoryObj;
const phone = { globals: { viewport: { value: 'mobile2', isRotated: false } } };

export const Bank: S = { name: 'Employee · bank account (old to new, proof, cooling period)', render: () => <ProfileChangeRequest today={TODAY} /> };
export const LegalName: S = { name: 'Legal name (dated)', render: () => <ProfileChangeRequest today={TODAY} kind="legal-name" /> };
export const PanInvalid: S = { name: 'PAN · invalid format', render: () => <ProfileChangeRequest today={TODAY} kind="pan" defaultValue="BRGPR7712" /> };
export const Submitted: S = { name: 'Submitted · approved, cooling period', render: () => <ProfileChangeRequest today={TODAY} submitted /> };
export const Phone: S = { name: '· phone', ...phone, render: () => <ProfileChangePhone /> };
export const PhonePan: S = { name: '· phone, PAN invalid', ...phone, render: () => <ProfileChangePhone kind="pan" /> };
