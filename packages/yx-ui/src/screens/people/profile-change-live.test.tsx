import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { ToastProvider } from '../../components/notify';
import { ProfileChangeRequest, type LiveProfileChange } from './selfservice';
import type { ChangeForm, ProfileRequest } from '../access/types';

// PPL-32 live: my own change with the designed Now → Change to table, the checks, the proof, the cooling period, and
// the request's progress once sent.

const ue = userEvent.setup({ pointerEventsCheck: 0 });
const FORM: ChangeForm = {
  employeeId: 'e1',
  personId: 'p1',
  proofRequired: true,
  proofTypes: { bank_salary: 'bank_proof', pan: 'pan_card', legal_name: 'name_change_proof' },
  coolingHours: 72,
  current: { bank_salary: { holderName: 'Divya R', ifsc: 'CNRB0001234', account: '•••• 6789' }, bank_reimbursement: null, pan: { value: '••••••821M' }, aadhaar: null, uan: null, esic: null, legal_name: { legalName: 'Divya Raghunathan' }, passport: null, bank_international: null },
};
const REQ = (x: Partial<ProfileRequest>): ProfileRequest => ({ id: 'r1', employeeId: 'e1', employeeName: 'Divya', kind: 'bank_salary', label: 'Salary bank account', proposed: {}, current: null, reason: null, status: 'pending', requestedBy: 'Divya', requestedAt: '2026-09-28T09:40:00Z', mine: true, decidedBy: null, decidedAt: null, decisionNote: null, overrideReason: null, proofDocumentId: 'd1', effectiveOn: null, usableFrom: null, ...x });

function page(over: Partial<LiveProfileChange> = {}) {
  const live: LiveProfileChange = { state: 'ready', onRetry: () => {}, form: FORM, requests: [], onProof: vi.fn(async () => 'doc1'), onSend: vi.fn(async () => {}), onCancel: vi.fn(), ...over };
  const view = render(
    <ToastProvider>
      <ProfileChangeRequest today={new Date(2026, 9, 27)} live={live} />
    </ToastProvider>,
  );
  return { live, view };
}
const field = (name: RegExp) => screen.getByRole('textbox', { name });
const send = () => ue.click(screen.getByRole('button', { name: 'Send for approval' }));

describe('PPL-32 profile change request, live', () => {
  it('bank: what is on file now, the checks, the proof, then it goes for approval', async () => {
    const { live, view } = page();
    expect(screen.getByRole('cell', { name: '•••• 6789 · CNRB0001234' })).toBeInTheDocument();
    expect(screen.getByText(/after a 3-day cooling period/)).toBeInTheDocument();
    await send();
    expect(screen.getAllByText('Fill this in.').length).toBe(3);
    expect(screen.getByText('Add the proof.')).toBeInTheDocument();
    expect(live.onSend).not.toHaveBeenCalled();
    await ue.type(field(/Account holder/), 'Divya Raghunathan');
    await ue.type(field(/Account number/), '389011224410');
    await ue.type(field(/IFSC/), 'sbin1012765');
    await ue.tab();
    expect(screen.getByText('Enter an 11-character IFSC like CNRB0001234. The fifth character is zero.')).toBeInTheDocument();
    expect(screen.queryByText('State Bank of India')).toBeNull(); // no bank named for a bad IFSC
    await ue.clear(field(/IFSC/));
    await ue.type(field(/IFSC/), 'sbin0012765');
    expect(screen.getByText('State Bank of India')).toBeInTheDocument(); // the bank, from the bundled list
    expect(screen.getByRole('cell', { name: '389011224410 · SBIN0012765' })).toBeInTheDocument();
    await ue.upload(view.container.querySelector('input[type="file"]') as HTMLInputElement, new File(['%PDF'], 'cheque.pdf', { type: 'application/pdf' }));
    await waitFor(() => expect(live.onProof).toHaveBeenCalledWith('bank_salary', expect.any(File)));
    await send();
    expect(live.onSend).toHaveBeenCalledWith({ kind: 'bank_salary', value: { holderName: 'Divya Raghunathan', accountNumber: '389011224410', ifsc: 'SBIN0012765' }, proofDocumentId: 'doc1' });
  });

  it('PAN: an invalid format is named; legal name needs its effective date', async () => {
    page({ form: { ...FORM, proofRequired: false } });
    await ue.click(screen.getByRole('radio', { name: 'PAN' }));
    await ue.type(field(/New PAN/), 'BRGPR7712');
    await ue.tab();
    expect(screen.getByText('Enter a 10-character PAN like ABCDE1234F.')).toBeInTheDocument();
    await ue.click(screen.getByRole('radio', { name: 'Legal name' }));
    expect(screen.getByRole('cell', { name: 'Divya Raghunathan' })).toBeInTheDocument();
    await ue.type(field(/New legal name/), 'Divya Raghunathan Iyer');
    await send();
    expect(screen.getByText('Choose the date the name changed.')).toBeInTheDocument();
  });

  it('a waiting change blocks another of its kind; an approved bank account shows its cooling period', () => {
    page({ requests: [REQ({ kind: 'pan', label: 'PAN' }), REQ({ id: 'r2', status: 'approved', decidedBy: 'Lakshmi Venkatesan', decidedAt: '2026-09-28T10:42:00Z', usableFrom: '2099-10-01T10:42:00Z' })] });
    expect(screen.getByRole('radio', { name: /PAN/ })).toBeDisabled();
    expect(screen.getByText('A change is already waiting')).toBeInTheDocument();
    const card = screen.getByText('Salary bank account change').closest('section') ?? document.body;
    expect(within(card as HTMLElement).getByText('Cooling period ends')).toBeInTheDocument();
    expect(screen.getByText(/We emailed your old contact on 28 Sep 2026/)).toBeInTheDocument();
  });

  it('a refusal from the server stays on the page; Cancel goes back', async () => {
    const { live } = page({ form: { ...FORM, proofRequired: false }, onSend: vi.fn(async () => Promise.reject(new Error('That is already the value on file.'))) });
    await ue.click(screen.getByRole('radio', { name: 'UAN' }));
    await ue.type(field(/New UAN/), '100912345678');
    await send();
    expect(await screen.findByText('That is already the value on file.')).toBeInTheDocument();
    await ue.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(live.onCancel).toHaveBeenCalled();
  });
});
