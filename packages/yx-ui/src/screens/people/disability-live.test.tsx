import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { ToastProvider } from '../../components/notify';
import { DisabilityDeclaration, type LiveDisability, type LiveDisabilityList } from './selfservice';

// PPL-38 live: the voluntary disability declaration, consent first, withdrawable; the HR diversity role's list.

const ue = userEvent.setup({ pointerEventsCheck: 0 });
const day = (iso: string) => new Date(`${iso}T00:00:00`);
const mine = (o: Partial<LiveDisability> = {}): LiveDisability => ({
  state: 'ready', onRetry: vi.fn(), company: 'Kaveri Foods', declaration: null,
  onUpload: vi.fn(async () => 'doc1'), onSave: vi.fn(async () => undefined), onWithdraw: vi.fn(async () => undefined), onSkip: vi.fn(), ...o,
});
const page = (live: LiveDisability) => render(<ToastProvider><DisabilityDeclaration live={live} /></ToastProvider>);

describe('PPL-38 disability declaration, live', () => {
  it('nothing can be filled in before consent; a "Yes" needs the category, percentage and certificate', async () => {
    const live = mine();
    const view = page(live);
    expect(screen.getByRole('button', { name: 'Save declaration' })).toBeDisabled();
    expect(screen.getByRole('combobox', { name: /Category/ })).toBeDisabled();
    await ue.click(screen.getByRole('checkbox', { name: /I agree Kaveri Foods may record this/ }));
    await ue.click(screen.getByRole('button', { name: 'Save declaration' }));
    expect(screen.getByText('Fix these before saving')).toBeInTheDocument();
    expect(live.onSave).not.toHaveBeenCalled();
    await ue.click(screen.getByRole('combobox', { name: /Category/ }));
    await ue.click(await screen.findByRole('option', { name: 'Hard of hearing' }));
    await ue.type(screen.getByRole('textbox', { name: /Percentage/ }), '50');
    await ue.type(screen.getByRole('textbox', { name: 'Certificate valid until' }), '2 Nov 2030');
    await ue.tab();
    await ue.upload(view.container.querySelector('input[type="file"]') as HTMLInputElement, new File(['%PDF'], 'udid.pdf', { type: 'application/pdf' }));
    await waitFor(() => expect(live.onUpload).toHaveBeenCalledWith(expect.any(File), '2030-11-02'));
    await ue.type(screen.getByRole('textbox', { name: /Reasonable adjustments/ }), 'A hearing loop in meeting rooms');
    await ue.click(screen.getByRole('button', { name: 'Save declaration' }));
    await waitFor(() => expect(live.onSave).toHaveBeenCalledWith({ consent: true, answer: 'yes', category: 'Hard of hearing', percent: 50, certificateDocumentId: 'doc1', adjustments: 'A hearing loop in meeting rooms' }));
  });

  it('"Prefer not to say" saves with no details; Skip leaves', async () => {
    const live = mine();
    page(live);
    await ue.click(screen.getByRole('checkbox', { name: /I agree/ }));
    await ue.click(screen.getByRole('radio', { name: 'Prefer not to say' }));
    expect(screen.queryByRole('combobox', { name: /Category/ })).toBeNull();
    await ue.click(screen.getByRole('button', { name: 'Save declaration' }));
    await waitFor(() => expect(live.onSave).toHaveBeenCalledWith({ consent: true, answer: 'skip' }));
    await ue.click(screen.getByRole('button', { name: 'Skip' }));
    expect(live.onSkip).toHaveBeenCalled();
  });

  it('declared: the details, waiting for HR; withdrawing asks first', async () => {
    const live = mine({ declaration: { answer: 'yes', category: 'Low vision', percent: 60, adjustments: null, consentAt: day('2026-02-03'), certificate: { status: 'uploaded', validUntil: null } } });
    page(live);
    expect(screen.getByText('Low vision · 60%')).toBeInTheDocument();
    expect(screen.getByText('No end date · waiting for HR to verify')).toBeInTheDocument();
    expect(screen.getByText('None asked for')).toBeInTheDocument();
    expect(screen.getByText('Given on 3 Feb 2026')).toBeInTheDocument();
    await ue.click(screen.getByRole('button', { name: 'Withdraw consent' }));
    const dialog = screen.getByRole('dialog');
    expect(live.onWithdraw).not.toHaveBeenCalled();
    await ue.click(within(dialog).getByRole('button', { name: 'Withdraw consent' }));
    await waitFor(() => expect(live.onWithdraw).toHaveBeenCalled());
  });

  it('a rejected certificate shows HR’s reason and is uploaded again from here', async () => {
    const onUploadAgain = vi.fn(async () => undefined);
    page(mine({ onUploadAgain, declaration: { answer: 'yes', category: 'Low vision', percent: 60, adjustments: null, consentAt: day('2026-02-03'), certificate: { status: 'rejected', validUntil: null, rejectReason: 'The scan is unreadable' } } }));
    expect(screen.getByText('Rejected')).toBeInTheDocument();
    expect(screen.getByText('The scan is unreadable')).toBeInTheDocument();
    const file = new File(['%PDF-1.4'], 'udid.pdf', { type: 'application/pdf' });
    await ue.upload(screen.getByLabelText(/Upload the certificate again/), file);
    await waitFor(() => expect(onUploadAgain).toHaveBeenCalledWith(file));
  });

  it('a failed save says so and keeps the form', async () => {
    const live = mine({ onSave: vi.fn(async () => Promise.reject(new Error('That certificate is not your disability certificate.'))) });
    page(live);
    await ue.click(screen.getByRole('checkbox', { name: /I agree/ }));
    await ue.click(screen.getByRole('radio', { name: 'No' }));
    await ue.click(screen.getByRole('button', { name: 'Save declaration' }));
    expect(await screen.findByText('That certificate is not your disability certificate.')).toBeInTheDocument();
  });
});

describe('PPL-38 HR diversity role list, live', () => {
  const list = (o: Partial<LiveDisabilityList> = {}): LiveDisabilityList => ({
    state: 'ready', onRetry: vi.fn(), onOpen: vi.fn(), onVerify: vi.fn(async () => undefined), onReject: vi.fn(async () => undefined),
    rows: [
      { employeeId: 'e1', name: 'Divya Raghunathan', category: 'Locomotor disability', percent: 45, validUntil: day('2031-03-14'), verified: true, expiringSoon: false, certificate: { status: 'verified' } },
      { employeeId: 'e2', name: 'Joseph Mathew', category: 'Hard of hearing', percent: 50, validUntil: day('2026-11-02'), verified: true, expiringSoon: true, certificate: { status: 'verified' } },
      { employeeId: 'e3', name: 'Ravi Kumar', category: 'Low vision', percent: 40, validUntil: null, verified: false, expiringSoon: false, certificate: { status: 'uploaded' } },
      { employeeId: 'e4', name: 'Selvi Arun', category: 'Hard of hearing', percent: 45, validUntil: null, verified: false, expiringSoon: false, certificate: { status: 'rejected' } },
    ],
    ...o,
  });

  it('shows each declaration with its certificate status', () => {
    render(<DisabilityDeclaration persona="hr" liveList={list()} />);
    expect(screen.getByRole('row', { name: /Divya Raghunathan Locomotor disability · 45% 14 Mar 2031 Verified/ })).toBeInTheDocument();
    expect(screen.getByRole('row', { name: /Joseph Mathew .* Expiring/ })).toBeInTheDocument();
    expect(screen.getByRole('row', { name: /Ravi Kumar Low vision · 40% No end date To verify/ })).toBeInTheDocument();
  });

  it('opens a certificate; verifies or rejects one waiting, a rejection only with a reason', async () => {
    const l = list();
    render(<DisabilityDeclaration persona="hr" liveList={l} />);
    expect(screen.getByRole('row', { name: /Selvi Arun .* Rejected/ })).toBeInTheDocument();
    // A verified certificate only opens.
    await ue.click(screen.getByRole('button', { name: /More actions for Divya Raghunathan/ }));
    expect(screen.queryByRole('menuitem', { name: 'Verify' })).toBeNull();
    await ue.click(screen.getByRole('menuitem', { name: 'Open certificate' }));
    expect(l.onOpen).toHaveBeenCalledWith('e1');
    await ue.click(screen.getByRole('button', { name: /More actions for Ravi Kumar/ }));
    await ue.click(screen.getByRole('menuitem', { name: 'Verify' }));
    await waitFor(() => expect(l.onVerify).toHaveBeenCalledWith('e3'));
    await ue.click(screen.getByRole('button', { name: /More actions for Ravi Kumar/ }));
    await ue.click(screen.getByRole('menuitem', { name: 'Reject' }));
    const dialog = await screen.findByRole('dialog');
    await ue.click(within(dialog).getByRole('button', { name: 'Reject certificate' }));
    expect(within(dialog).getByText('Say why, so the person can upload the right certificate.')).toBeInTheDocument();
    expect(l.onReject).not.toHaveBeenCalled();
    await ue.type(within(dialog).getByRole('textbox'), 'The scan is unreadable');
    await ue.click(within(dialog).getByRole('button', { name: 'Reject certificate' }));
    await waitFor(() => expect(l.onReject).toHaveBeenCalledWith('e3', 'The scan is unreadable'));
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
  });

  it('empty, and a failed load can be retried', async () => {
    const { unmount } = render(<DisabilityDeclaration persona="hr" liveList={list({ rows: [] })} />);
    expect(screen.getByText('No declarations')).toBeInTheDocument();
    unmount();
    const l = list({ state: 'error' });
    render(<DisabilityDeclaration persona="hr" liveList={l} />);
    await ue.click(screen.getByRole('button', { name: /Retry|Try again/ }));
    expect(l.onRetry).toHaveBeenCalled();
  });
});
