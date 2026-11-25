import type { Meta, StoryObj } from '@storybook/react-vite';
import { userEvent, within } from 'storybook/test';
import { ToastProvider } from '../../components/notify';
import { CertificateRequest, CertificateRequestPhone, type LiveCertificateRequest } from './documents';
import { TODAY } from './people-data';

const meta: Meta = { title: 'Screens/People/PPL-31 · Certificate request', parameters: { layout: 'fullscreen' } };
export default meta;
type S = StoryObj;
const phone = { globals: { viewport: { value: 'mobile2', isRotated: false } } };

export const Request: S = { name: 'Employee · choose certificate', render: () => <CertificateRequest today={TODAY} /> };
export const Instant: S = { name: 'Generated instantly with QR code', render: () => <CertificateRequest today={TODAY} generated /> };
export const NeedsApproval: S = { name: 'NOC · needs HR approval', render: () => <CertificateRequest today={TODAY} type="noc" generated /> };
export const Phone: S = { name: '· phone', ...phone, render: () => <CertificateRequestPhone /> };

/** Generate / Send to HR are never disabled: on click they say, under the field, what is missing or already waiting. */
const kinds: LiveCertificateRequest['kinds'] = [
  { letterType: 'salary_certificate', name: 'Salary certificate', requiresApproval: false, pending: null },
  { letterType: 'noc', name: 'No objection certificate (NOC)', requiresApproval: true, pending: { requestedAt: '2026-09-26T04:30:00Z', approvers: ['Lakshmi Venkatesan'] } },
];
const none = async () => Promise.reject(new Error('Sample'));
const asking = (k: LiveCertificateRequest['kinds']): LiveCertificateRequest => ({ state: 'ready', onRetry: () => {}, kinds: k, backHref: '#', onRequest: none, onOpen: none, onDownload: none, onShare: none });
const press: S['play'] = async ({ canvasElement }) => {
  await userEvent.click(await within(canvasElement).findByRole('button', { name: /Generate certificate|Send to HR/ }));
};
export const NoPurpose: S = { name: '· Generate with no purpose: says so under the field', render: () => <ToastProvider><CertificateRequest today={TODAY} live={asking(kinds)} /></ToastProvider>, play: press };
export const AlreadyWaiting: S = { name: '· Send to HR for a certificate already waiting', render: () => <ToastProvider><CertificateRequest today={TODAY} live={asking([kinds[1]])} /></ToastProvider>, play: press };
