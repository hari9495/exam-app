import type { Meta, StoryObj } from '@storybook/react-vite';
import { CertificateRequest, CertificateRequestPhone } from './documents';
import { TODAY } from './people-data';

const meta: Meta = { title: 'Screens/People/PPL-31 · Certificate request', parameters: { layout: 'fullscreen' } };
export default meta;
type S = StoryObj;
const phone = { globals: { viewport: { value: 'mobile2', isRotated: false } } };

export const Request: S = { name: 'Employee · choose certificate', render: () => <CertificateRequest today={TODAY} /> };
export const Instant: S = { name: 'Generated instantly with QR code', render: () => <CertificateRequest today={TODAY} generated /> };
export const NeedsApproval: S = { name: 'NOC · needs HR approval', render: () => <CertificateRequest today={TODAY} type="noc" generated /> };
export const Phone: S = { name: '· phone', ...phone, render: () => <CertificateRequestPhone /> };
