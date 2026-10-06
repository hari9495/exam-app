import type { Meta, StoryObj } from '@storybook/react-vite';
import { PoshComplaintScreen } from './posh';
import { TODAY } from '../_kit/data';

const meta: Meta = { title: 'Screens/Compliance/CMP-10 · POSH complaint filing', parameters: { layout: 'fullscreen' } };
export default meta;
type S = StoryObj;
const PHONE = { viewport: { value: 'mobile2', isRotated: false } };

export const Default: S = { name: 'File a complaint', render: () => <PoshComplaintScreen today={TODAY} incidentDate={new Date(2026, 8, 18)} /> };
export const OnBehalf: S = { name: 'On her behalf', render: () => <PoshComplaintScreen today={TODAY} incidentDate={new Date(2026, 8, 18)} onBehalf /> };
export const ExtensionNeeded: S = { name: 'After 3 months · reason needed', render: () => <PoshComplaintScreen today={TODAY} incidentDate={new Date(2026, 4, 10)} /> };
export const OutOfWindow: S = { name: 'After 6 months · blocked', render: () => <PoshComplaintScreen today={TODAY} incidentDate={new Date(2026, 1, 2)} /> };
export const Alumni: S = { name: 'Ex-employee (alumni login)', render: () => <PoshComplaintScreen today={TODAY} incidentDate={new Date(2026, 7, 20)} alumni /> };
export const Filed: S = { name: 'Filed · statutory clock', render: () => <PoshComplaintScreen today={TODAY} filed /> };
export const Phone: S = { name: 'File a complaint · phone', globals: PHONE, render: () => <PoshComplaintScreen device="phone" today={TODAY} incidentDate={new Date(2026, 8, 18)} /> };
export const PhoneFiled: S = { name: 'Filed · phone', globals: PHONE, render: () => <PoshComplaintScreen device="phone" today={TODAY} filed /> };
