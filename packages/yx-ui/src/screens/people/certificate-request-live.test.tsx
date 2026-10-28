import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { ToastProvider } from '../../components/notify';
import { CertificateRequest, type LiveCertificateRequest, type MyCertificateKind } from './documents';
import type { Letter } from './live/types';

// PPL-31 live: the kinds the company switched on (instant or HR first), purpose and addressee, the issued certificate
// with its number and check code, the NOC sent to HR with who holds it, and one waiting request at a time.

vi.mock('../../components/document', async (orig) => ({ ...(await orig<object>()), PdfPages: ({ label }: { label: string }) => <p>{`PDF ${label}`}</p> }));

const ue = userEvent.setup({ pointerEventsCheck: 0 });
const KINDS: MyCertificateKind[] = [
  { letterType: 'salary_certificate', name: 'Salary certificate', requiresApproval: false, pending: null },
  { letterType: 'employment_certificate', name: 'Employment certificate', requiresApproval: false, pending: null },
  { letterType: 'noc', name: 'No objection certificate (NOC)', requiresApproval: true, pending: null },
];
const letter = (over: Partial<Letter>): Letter => ({ id: 'l9', title: 'Salary certificate: Divya', letterType: 'salary_certificate', personId: 'p', referenceNo: 'KF/SALA/2026/000001', verifyCode: '7QM2-XK9P', status: 'issued', renderError: null, issuedAt: '2026-10-26T05:00:00Z', personSigns: false, acceptedAt: null, signature: null, supersededById: null, ...over });

function page(over: Partial<LiveCertificateRequest> = {}) {
  const live: LiveCertificateRequest = {
    state: 'ready',
    onRetry: vi.fn(),
    kinds: KINDS,
    backHref: '/yx/me/documents',
    onRequest: vi.fn(async () => letter({})),
    onOpen: vi.fn(async () => 'blob:pdf'),
    onDownload: vi.fn(async () => {}),
    onShare: vi.fn(async () => 'https://api.example.test/public/shares/o/t'),
    ...over,
  };
  const view = render(
    <ToastProvider>
      <CertificateRequest today={new Date('2026-10-26T10:00:00')} live={live} />
    </ToastProvider>,
  );
  return { live, view };
}
const pickPurpose = async (name: string) => {
  await ue.click(screen.getByRole('combobox', { name: 'Purpose' }));
  await ue.click(await screen.findByRole('option', { name }));
};

describe('PPL-31 request a certificate, live', () => {
  it('offers the switched-on kinds, says which are instant, and needs a purpose', () => {
    page();
    expect(screen.getByRole('heading', { name: 'Request a certificate' })).toBeInTheDocument();
    expect(screen.getByText('Salary certificate and employment certificate are generated instantly with the company signatory and a QR code anyone can verify.')).toBeInTheDocument();
    expect(screen.getByRole('radio', { name: 'Salary certificate' })).toBeChecked();
    expect(screen.getByText('Needs HR approval (company setting)')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Generate certificate' })).toBeDisabled();
    expect(screen.getByRole('link', { name: 'Cancel' })).toHaveAttribute('href', '/yx/me/documents');
  });

  it('generates a certificate at once: number, check code, preview, download and share', async () => {
    const { live } = page();
    await pickPurpose('Home loan');
    await ue.type(screen.getByRole('textbox', { name: 'Addressed to' }), '  The Branch Manager, Canara Bank, Hosur ');
    await ue.click(screen.getByRole('button', { name: 'Generate certificate' }));
    expect(live.onRequest).toHaveBeenCalledWith({ letterType: 'salary_certificate', purpose: 'Home loan', addressedTo: 'The Branch Manager, Canara Bank, Hosur' });
    expect(await screen.findByText('Salary certificate ready · KF/SALA/2026/000001')).toBeInTheDocument();
    expect(screen.getByText(/Verification code 7QM2-XK9P/)).toBeInTheDocument();
    expect(within(screen.getByRole('region', { name: 'Certificate preview' })).getByText('PDF Salary certificate KF/SALA/2026/000001')).toBeInTheDocument();
    expect(screen.getAllByText('Salary certificate ready').length).toBeGreaterThan(0);
    await ue.click(screen.getByRole('button', { name: 'Download PDF' }));
    expect(live.onDownload).toHaveBeenCalledWith(expect.objectContaining({ id: 'l9' }));
    await ue.click(screen.getByRole('button', { name: 'Share a link' }));
    await ue.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Copy link' }));
    expect(live.onShare).toHaveBeenCalledWith('letter', 'l9', 7);
  });

  it('sends a NOC to HR and shows who holds it; a waiting kind cannot be asked again', async () => {
    const pending: MyCertificateKind = { ...KINDS[2], pending: { requestedAt: '2026-10-26T04:30:00Z', approvers: ['Lakshmi Venkatesan'] } };
    const { live, view } = page({ onRequest: vi.fn(async () => letter({ letterType: 'noc', status: 'pending_approval', referenceNo: null, verifyCode: null })) });
    await ue.click(screen.getByRole('radio', { name: 'No objection certificate (NOC)' }));
    await pickPurpose('Visa application');
    await ue.click(screen.getByRole('button', { name: 'Send to HR' }));
    expect(live.onRequest).toHaveBeenCalledWith({ letterType: 'noc', purpose: 'Visa application' });
    expect(await screen.findByText('NOC request sent')).toBeInTheDocument();
    view.rerender(
      <ToastProvider>
        <CertificateRequest today={new Date('2026-10-26T10:00:00')} live={{ ...live, kinds: [KINDS[0], KINDS[1], pending] }} />
      </ToastProvider>,
    );
    expect(screen.getByText('Lakshmi Venkatesan')).toBeInTheDocument();
    view.unmount();
    page({ kinds: [pending] });
    expect(screen.getByRole('radio', { name: 'No objection certificate (NOC)' })).toBeDisabled();
    expect(screen.getByText(/Waiting for Lakshmi Venkatesan/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Send to HR' })).toBeDisabled();
  });

  it('shows the refusal from the API in place, and plain states for no kinds or no job', async () => {
    const { view } = page({ onRequest: vi.fn(async () => Promise.reject(new Error('This letter cannot be made yet. Missing: gross monthly salary (current).'))) });
    await pickPurpose('Home loan');
    await ue.click(screen.getByRole('button', { name: 'Generate certificate' }));
    expect(await screen.findByText(/Missing: gross monthly salary/)).toBeInTheDocument();
    view.unmount();
    const empty = page({ kinds: [] });
    expect(screen.getByText('No certificates to ask for yet')).toBeInTheDocument();
    empty.view.unmount();
    page({ state: 'no-access', kinds: [] });
    expect(screen.getByText('Certificates are for current employees')).toBeInTheDocument();
  });
});
