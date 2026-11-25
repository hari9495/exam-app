import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { ConsultantPortalScreen, ConsultantsScreen, SAMPLE_BATCHES, SAMPLE_CONSULTANTS, SAMPLE_INVOICES, invoiceInput, paise, sumMoney, type LiveConsultantPortal, type LiveConsultants } from './consultants';

// PAY-55 / PAY-56 with the live app's data: what the live pages must do (moved from live/pay-5h-live.test.tsx).

const ue = userEvent.setup({ pointerEventsCheck: 0 });
const fn = () => vi.fn(async () => ({}));
const live = (over: Partial<LiveConsultants> = {}): LiveConsultants => ({
  state: 'ready',
  onRetry: vi.fn(),
  entities: [{ id: 'e1', name: 'Kaveri Foods Pvt Ltd', shortName: 'KFPL', keys: [] }],
  consultants: SAMPLE_CONSULTANTS,
  invoices: SAMPLE_INVOICES,
  batches: SAMPLE_BATCHES,
  can: { manage: true, release: true },
  onCreate: fn(),
  onBankCheck: fn(),
  onCertificate: fn(),
  onInvoice: fn(),
  onInvoiceFile: fn(),
  onAdvice: fn(),
  onPayout: fn(),
  onDownloadBatch: fn(),
  onRelease: fn(),
  onResults: fn(),
  ...over,
});
const drawer = () => screen.getByRole('dialog');

describe('money stays exact', () => {
  it('adds decimal strings in paise and splits GST with the odd paisa to CGST', () => {
    expect(sumMoney(['47200.00', '34300.00', null, '0.10', '0.20'])).toBe('81500.30');
    expect(paise('12.5')).toBe(1250n);
    expect(invoiceInput({ no: 'A1', date: '2026-10-01', period: '2026-09', taxable: '1000', gstKind: 'split', gst: '180.01' })).toEqual({ invoiceNo: 'A1', invoiceDate: '2026-10-01', period: '2026-09', taxableValue: '1000.00', cgst: '90.01', sgst: '90.00' });
    expect(invoiceInput({ no: 'A1', date: '2026-10-01', period: '2026-09', taxable: '1000.5', gstKind: 'igst', gst: '180' })).toMatchObject({ taxableValue: '1000.50', igst: '180.00' });
  });
});

describe('PAY-55 Consultants, live', () => {
  it('shows loading, could not load (Retry calls the page) and no access', async () => {
    const v = live({ state: 'loading' });
    const { rerender } = render(<ConsultantsScreen live={v} />);
    expect(screen.getByRole('status', { name: 'Loading consultants' })).toBeInTheDocument();
    rerender(<ConsultantsScreen live={{ ...v, state: 'error' }} />);
    await ue.click(screen.getByRole('button', { name: 'Retry' }));
    expect(v.onRetry).toHaveBeenCalled();
    rerender(<ConsultantsScreen live={{ ...v, state: 'no-access' }} />);
    expect(screen.getByText(/You don't have access to consultants/)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Add consultant' })).not.toBeInTheDocument();
  });

  it('empty: says how invoices arrive', () => {
    render(<ConsultantsScreen live={live({ consultants: [], invoices: [], batches: [] })} />);
    expect(screen.getByText('No invoices yet')).toBeInTheDocument();
  });

  it('only approved or failed invoices can be picked; the bank file gets the exact ids and account', async () => {
    const v = live();
    render(<ConsultantsScreen live={v} />);
    expect(screen.getByRole('checkbox', { name: /NW-77/ })).toBeDisabled();
    await ue.click(screen.getByRole('checkbox', { name: /INV-001/ }));
    await ue.click(screen.getByRole('checkbox', { name: /NW-76/ }));
    expect(screen.getByText('₹81,500.00 to pay')).toBeInTheDocument();
    await ue.click(screen.getByRole('button', { name: 'Make bank file' }));
    await ue.click(within(drawer()).getByRole('button', { name: 'Make bank file' }));
    expect(within(drawer()).getByText(/6 to 20 digits/)).toBeInTheDocument();
    expect(screen.getByRole('textbox', { name: /Pay from account/ })).toHaveFocus();
    expect(v.onPayout).not.toHaveBeenCalled();
    await ue.type(screen.getByRole('textbox', { name: /Pay from account/ }), '123456789012');
    await ue.click(within(drawer()).getByRole('button', { name: 'Make bank file' }));
    await waitFor(() => expect(v.onPayout).toHaveBeenCalledWith(['i1', 'i4'], '123456789012'));
    expect((await screen.findAllByText(/Bank file made: 2 payments/)).length).toBeGreaterThan(0);
  });

  it('a new consultant: pressed too early, the errors show and the first bad field takes focus; then the exact payload', async () => {
    const v = live();
    render(<ConsultantsScreen live={v} />);
    await ue.click(screen.getByRole('button', { name: 'Add consultant' }));
    await ue.type(screen.getByRole('textbox', { name: /^PAN/ }), 'BAD');
    expect(screen.queryByText(/like ABCDE1234F/)).not.toBeInTheDocument();
    await ue.click(within(drawer()).getByRole('button', { name: 'Add consultant' }));
    expect(screen.getByText('Give their name.')).toBeInTheDocument();
    expect(screen.getByText(/like ABCDE1234F/)).toBeInTheDocument();
    expect(screen.getByRole('textbox', { name: /^Name/ })).toHaveFocus();
    expect(v.onCreate).not.toHaveBeenCalled();
    await ue.type(screen.getByRole('textbox', { name: /^Name/ }), 'Ravi Shankar');
    await ue.type(screen.getByRole('textbox', { name: /^Email/ }), 'ravi@example.test');
    await ue.clear(screen.getByRole('textbox', { name: /^PAN/ }));
    await ue.type(screen.getByRole('textbox', { name: /^PAN/ }), 'abcde1234f');
    await ue.click(within(drawer()).getByRole('button', { name: 'Add consultant' }));
    await waitFor(() => expect(v.onCreate).toHaveBeenCalledWith({ legalEntityId: 'e1', name: 'Ravi Shankar', kind: 'individual', email: 'ravi@example.test', defaultSection: '194J_B', pan: 'ABCDE1234F' }));
    expect((await screen.findAllByText('Ravi Shankar added')).length).toBeGreaterThan(0);
  });

  it('the bank check is recorded by someone other than the person who changed the account', async () => {
    const v = live();
    render(<ConsultantsScreen live={v} />);
    await ue.click(screen.getByRole('tab', { name: /Register/ }));
    expect(screen.getByText('You changed it, so someone else checks it')).toBeInTheDocument();
    const buttons = screen.getAllByRole('button', { name: 'Record bank check' });
    expect(buttons).toHaveLength(1);
    await ue.click(buttons[0]!);
    await ue.type(screen.getByRole('textbox', { name: /Penny-drop/ }), 'PD-1234567');
    await ue.click(within(drawer()).getByRole('button', { name: 'Record check' }));
    await waitFor(() => expect(v.onBankCheck).toHaveBeenCalledWith('k2', 'PD-1234567'));
  });

  it('release: never by the maker, and only after typing the phrase', async () => {
    const v = live({ batches: [...SAMPLE_BATCHES, { ...SAMPLE_BATCHES[0]!, id: 'b4', madeByMe: true }] });
    render(<ConsultantsScreen live={v} />);
    await ue.click(screen.getByRole('tab', { name: /Bank files/ }));
    expect(screen.getAllByRole('button', { name: 'Release' })).toHaveLength(1);
    expect(screen.getByText('You made it, so someone else releases it')).toBeInTheDocument();
    await ue.click(screen.getByRole('button', { name: 'Release' }));
    await ue.click(screen.getByRole('button', { name: 'Release file' }));
    expect(v.onRelease).not.toHaveBeenCalled();
    await ue.type(screen.getByRole('textbox', { name: /Type RELEASE 2 PAYMENTS/ }), 'RELEASE 2 PAYMENTS');
    await ue.click(screen.getByRole('button', { name: 'Release file' }));
    await waitFor(() => expect(v.onRelease).toHaveBeenCalledWith('b1', { phrase: 'RELEASE 2 PAYMENTS', impact: [{ label: 'Total', value: '₹81,500.00' }] }));
    expect((await screen.findAllByText('Bank file released')).length).toBeGreaterThan(0);
  });

  it('a failed release stays in the sheet with the reason', async () => {
    render(<ConsultantsScreen live={live({ onRelease: vi.fn(async () => Promise.reject(new Error('The file changed after it was made.'))) })} />);
    await ue.click(screen.getByRole('tab', { name: /Bank files/ }));
    await ue.click(screen.getByRole('button', { name: 'Release' }));
    await ue.type(screen.getByRole('textbox', { name: /Type RELEASE 2 PAYMENTS/ }), 'RELEASE 2 PAYMENTS');
    await ue.click(screen.getByRole('button', { name: 'Release file' }));
    expect(await screen.findByText('The file changed after it was made.')).toBeInTheDocument();
  });

  it('bank results: a paid row needs its reference, a failed row its reason', async () => {
    const v = live();
    render(<ConsultantsScreen live={v} />);
    await ue.click(screen.getByRole('tab', { name: /Bank files/ }));
    await ue.click(screen.getByRole('button', { name: 'Record results' }));
    await ue.click(within(drawer()).getByRole('button', { name: 'Record results' }));
    expect(screen.getByText('DM-14: give the bank reference.')).toBeInTheDocument();
    await ue.click(screen.getByRole('radio', { name: 'Failed' }));
    await ue.type(screen.getByRole('textbox', { name: /Why it failed/ }), 'Account frozen');
    await ue.click(within(drawer()).getByRole('button', { name: 'Record results' }));
    await waitFor(() => expect(v.onResults).toHaveBeenCalledWith('b2', [{ invoiceId: 'i5', status: 'failed', reason: 'Account frozen' }]));
  });

  it('without the consultant key: no adding, picking or results; release stays for the release key', async () => {
    render(<ConsultantsScreen live={live({ can: { manage: false, release: true } })} />);
    expect(screen.queryByRole('button', { name: 'Add consultant' })).not.toBeInTheDocument();
    expect(screen.queryByRole('checkbox', { name: /INV-001/ })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Payment advice' })).not.toBeInTheDocument();
    await ue.click(screen.getByRole('tab', { name: /Bank files/ }));
    expect(screen.getByRole('button', { name: 'Release' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Record results' })).not.toBeInTheDocument();
  });
});

describe('PAY-56 Consultant portal, live', () => {
  const me = (over: Partial<LiveConsultantPortal> = {}, canUpload = true): LiveConsultantPortal => ({
    tenant: 'kaveri',
    data: { me: { id: 'k1', name: 'Asha Rao', company: 'Kaveri Foods Pvt Ltd', pan: null, panStatus: 'missing', bank: { account: '•••• 2333', usable: true } }, canUpload, invoices: SAMPLE_INVOICES.filter((i) => i.consultantId === 'k1'), certificates: [{ id: 'c1', taxYear: '2026-27', quarter: 1, form: 'Form 131' }] },
    onUpload: fn(),
    onAdvice: fn(),
    onCertificate: fn(),
    onSignOut: vi.fn(),
    ...over,
  });

  it('loading until the data is in; then invoices, a PAN warning and downloads', async () => {
    const v = me();
    const { rerender } = render(<ConsultantPortalScreen live={{ ...v, data: null }} />);
    expect(screen.getByRole('status', { name: 'Loading your invoices' })).toBeInTheDocument();
    rerender(<ConsultantPortalScreen live={v} />);
    expect(screen.getByText('No working PAN on file')).toBeInTheDocument();
    await ue.click(screen.getByRole('button', { name: 'Payment advice' }));
    expect(v.onAdvice).toHaveBeenCalledWith(expect.objectContaining({ id: 'i2' }));
    await ue.click(screen.getByRole('button', { name: 'Form 131 · 2026-27 Q1' }));
    expect(v.onCertificate).toHaveBeenCalledWith({ id: 'c1', taxYear: '2026-27', quarter: 1, form: 'Form 131' });
    await ue.click(screen.getByRole('button', { name: 'Sign out' }));
    expect(v.onSignOut).toHaveBeenCalled();
  });

  it('upload: pressed too early it asks for every field and the PDF; then sends the exact invoice', async () => {
    const v = me();
    const { container } = render(<ConsultantPortalScreen live={v} />);
    await ue.click(screen.getByRole('button', { name: 'Send an invoice' }));
    await ue.click(within(drawer()).getByRole('button', { name: 'Send invoice' }));
    expect(screen.getByText('Attach the invoice as a PDF.')).toBeInTheDocument();
    expect(screen.getByRole('textbox', { name: /Invoice number/ })).toHaveFocus();
    expect(v.onUpload).not.toHaveBeenCalled();
    await ue.type(screen.getByRole('textbox', { name: /Invoice number/ }), 'INV-009');
    await ue.type(screen.getByLabelText(/Invoice date/), '2026-10-20');
    await ue.type(screen.getByLabelText(/Work for the month/), '2026-10');
    await ue.type(screen.getByRole('textbox', { name: /Amount before GST/ }), '25000');
    const pdf = new File(['%PDF'], 'inv-009.pdf', { type: 'application/pdf' });
    await ue.upload((container.ownerDocument.querySelector('input[type="file"]') as HTMLInputElement), pdf);
    await ue.click(within(drawer()).getByRole('button', { name: 'Send invoice' }));
    await waitFor(() => expect(v.onUpload).toHaveBeenCalledWith({ invoiceNo: 'INV-009', invoiceDate: '2026-10-20', period: '2026-10', taxableValue: '25000.00' }, pdf));
  });

  it('after 10 minutes the upload asks to sign in again instead of opening', async () => {
    const v = me({}, false);
    render(<ConsultantPortalScreen live={v} />);
    await ue.click(screen.getByRole('button', { name: 'Send an invoice' }));
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(screen.getAllByText('Sign in again to send an invoice').length).toBeGreaterThan(0);
  });

  it('founder answer 9: a session that ends part-way shows the sign-in-again page, and its button starts a new sign-in', async () => {
    const onSignInAgain = vi.fn();
    render(<ConsultantPortalScreen live={me({ ended: true, onSignInAgain })} />);
    expect(screen.getByText('Your session ended')).toBeInTheDocument();
    expect(screen.queryByRole('table', { name: 'Your invoices' })).not.toBeInTheDocument();
    await ue.click(screen.getByRole('button', { name: 'Sign in again' }));
    expect(onSignInAgain).toHaveBeenCalled();
  });

  it('a failed load shows the error with Retry; a refusal shows no access (both reachable live)', async () => {
    const onRetry = vi.fn();
    const { unmount } = render(<ConsultantPortalScreen live={me({ data: null, state: 'error', onRetry })} />);
    expect(screen.getByText("We couldn't load your invoices.")).toBeInTheDocument();
    await ue.click(screen.getByRole('button', { name: /Try again|Retry/ }));
    expect(onRetry).toHaveBeenCalled();
    unmount();
    render(<ConsultantPortalScreen live={me({ data: null, state: 'no-access' })} />);
    expect(screen.getByText("You don't have access to your invoices")).toBeInTheDocument();
    expect(screen.queryByRole('status', { name: 'Loading your invoices' })).not.toBeInTheDocument();
  });
});
