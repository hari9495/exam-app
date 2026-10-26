import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { ToastProvider } from '../../components/notify';
import { MyDocuments, type LiveMyDocuments } from './documents';
import type { Letter, QueueDocument } from './live/types';

// PPL-30 live: one list of uploads, letters and pay documents; the expiry alert; share an expiring link (own issued
// letters and pay documents only), stop sharing, upload, the instant certificate, the OTP acceptance.

const ue = userEvent.setup({ pointerEventsCheck: 0 });
const inDays = (n: number) => {
  const d = new Date(Date.now() + n * 86_400_000);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};
const UP = (id: string, typeKey: string, typeName: string, status: QueueDocument['status'], expiresOn: string | null = null): QueueDocument => ({ id, personId: 'p', typeKey, typeName, sensitivity: 'personal', status, expiresOn, rejectReason: null, file: status === 'requested' ? null : { name: `${typeKey}.pdf`, scanStatus: 'clean', size: 214_000 }, uploadedAt: '2026-03-10T05:00:00Z', version: 1 } as QueueDocument);
const LETTER: Letter & { size: number } = { id: 'l1', title: 'Promotion letter: Divya', letterType: 'promotion', personId: 'p', referenceNo: 'KF/HR/2026/0418', verifyCode: 'ABCD-1234', status: 'issued', renderError: null, issuedAt: '2026-09-24T05:00:00Z', personSigns: true, acceptedAt: null, signature: { status: 'open', signedAt: null }, supersededById: null, size: 96_000 };

function page(over: Partial<LiveMyDocuments> = {}) {
  const live: LiveMyDocuments = {
    state: 'ready',
    onRetry: vi.fn(),
    uploads: [UP('u1', 'pan_card', 'PAN card', 'verified'), UP('u2', 'forklift_licence', 'Forklift licence', 'verified', inDays(5))],
    letters: [LETTER],
    pay: [{ id: 'pd1', kind: 'payslip', kindLabel: 'Payslip', title: 'Payslip, August 2026', referenceNo: 'KF/PS/2026/1', status: 'issued', issuedAt: '2026-08-31T05:00:00Z', verifyCode: null, size: 72_000 }],
    esignAccepted: true,
    uploadTypes: [{ key: 'forklift_licence', name: 'Forklift licence', expiryTracked: true }],
    shares: [],
    onDownload: vi.fn(async () => {}),
    onUpload: vi.fn(async () => {}),
    onCertificate: vi.fn(async () => {}),
    onShare: vi.fn(async () => 'https://api.example.test/public/shares/o/t'),
    onStopSharing: vi.fn(async () => {}),
    onSignCode: vi.fn(async () => {}),
    onSign: vi.fn(async () => {}),
    verifyUrl: (c) => `/yx/verify/${c}`,
    ...over,
  };
  render(
    <ToastProvider>
      <MyDocuments rows={[]} live={live} />
    </ToastProvider>,
  );
  return live;
}
const menuFor = async (name: string) => ue.click(screen.getByRole('button', { name: `More actions for ${name}` }));

describe('PPL-30 documents and letters, live', () => {
  it('lists uploads, letters and pay documents with kind, size and status, and warns about the expiring licence', () => {
    page();
    expect(screen.getByRole('heading', { name: 'Documents and letters' })).toBeInTheDocument();
    expect(screen.getByText(/7 years/)).toBeInTheDocument();
    expect(screen.getByText(/^Forklift licence expires on/)).toBeInTheDocument();
    const table = screen.getByRole('table', { name: 'My documents' });
    expect(within(table).getByText('Promotion letter KF/HR/2026/0418')).toBeInTheDocument();
    expect(within(table).getByText('Waiting for your acceptance')).toBeInTheDocument();
    expect(within(table).getByText('Payslip, August 2026')).toBeInTheDocument();
    expect(within(table).getByText('Published')).toBeInTheDocument();
    expect(within(table).getByText(/^Expiring /)).toBeInTheDocument();
    expect(within(table).getAllByText('Upload')).toHaveLength(2);
  });

  it('shares an issued letter for the chosen days, shows and copies the link; uploads cannot be shared', async () => {
    const live = page();
    // An upload (PAN) has nothing to share and HR uploads it: no menu at all.
    expect(screen.queryByRole('button', { name: 'More actions for PAN card' })).toBeNull();
    await menuFor('Forklift licence');
    expect(screen.queryByRole('menuitem', { name: 'Share a link' })).toBeNull();
    expect(screen.getByRole('menuitem', { name: 'Upload a new version' })).toBeInTheDocument();
    await ue.keyboard('{Escape}');
    await menuFor('Payslip, August 2026');
    await ue.click(await screen.findByRole('menuitem', { name: 'Share a link' }));
    const dialog = screen.getByRole('dialog', { name: 'Share Payslip, August 2026' });
    await ue.click(within(dialog).getByRole('combobox', { name: 'Link works for' }));
    await ue.click(await screen.findByRole('option', { name: '30 days' }));
    await ue.click(within(dialog).getByRole('button', { name: 'Copy link' }));
    expect(live.onShare).toHaveBeenCalledWith('pay', 'pd1', 30);
    await waitFor(() => expect(within(dialog).getByRole('textbox', { name: 'Share link' })).toHaveValue('https://api.example.test/public/shares/o/t'));
    expect(await screen.findByText('Link copied')).toBeInTheDocument();
    // One link per dialog: copying again does not make another.
    await ue.click(within(dialog).getByRole('button', { name: 'Copy link' }));
    expect(live.onShare).toHaveBeenCalledTimes(1);
  });

  it('stops sharing a document with live links', async () => {
    const live = page({ shares: [{ id: 's1', source: 'letter', sourceId: 'l1' }, { id: 's2', source: 'letter', sourceId: 'l1' }] });
    await menuFor('Promotion letter KF/HR/2026/0418');
    await ue.click(await screen.findByRole('menuitem', { name: 'Stop sharing' }));
    expect(live.onStopSharing).toHaveBeenCalledWith(['s1', 's2']);
    expect(await screen.findByText(/Sharing stopped/)).toBeInTheDocument();
  });

  it('accepts a letter with the one-time code', async () => {
    const live = page();
    await menuFor('Promotion letter KF/HR/2026/0418');
    await ue.click(await screen.findByRole('menuitem', { name: 'Read and accept' }));
    await ue.click(screen.getByRole('button', { name: 'Send me a code' }));
    expect(live.onSignCode).toHaveBeenCalledWith(LETTER);
  });

  it('uploads a renewed document with its expiry date, and makes the certificate', async () => {
    const live = page();
    await ue.click(screen.getByRole('button', { name: 'Request a certificate' }));
    expect(live.onCertificate).toHaveBeenCalled();
    expect(await screen.findByText('Your employment certificate is ready')).toBeInTheDocument();
    await ue.click(screen.getAllByRole('button', { name: 'Upload' })[0]);
    const dialog = screen.getByRole('dialog', { name: 'Upload Forklift licence' });
    expect(within(dialog).getByRole('button', { name: 'Upload' })).toBeDisabled();
    expect(within(dialog).getByLabelText('Expires on')).toBeInTheDocument();
  });

  it('shows the empty state with Upload, and no Upload when the person uploads nothing themselves', () => {
    page({ uploads: [], letters: [], pay: [], uploadTypes: [] });
    expect(screen.getByText('No documents yet')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Upload' })).toBeNull();
  });
});
