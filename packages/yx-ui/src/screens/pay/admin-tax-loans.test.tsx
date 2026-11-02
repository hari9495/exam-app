import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { EwaAdminScreen, LoansScreen, ProofQueueScreen, type Form12bRow, type LiveEwaAdmin, type LiveLoans, type LiveProofQueue, type PanLinkRow, type ResidencyRow } from './admin-tax-loans';
import type { LoanRepayments } from './live/types-ops';
import { PEOPLE } from './live/fixtures-5j';
import { LOANS, PROOFS } from './live/fixtures-ops';

// PAY-17, PAY-23 and PAY-27 with the live app's data (moved from live/pay-ops-live.test.tsx, plus the new paths).

const ue = userEvent.setup({ pointerEventsCheck: 0 });
const fn = () => vi.fn(async () => ({}) as never);
const nameOf = (id: string) => PEOPLE.find((p) => p.employeeId === id)?.name ?? 'Someone';
const search = async () => PEOPLE.map((p) => ({ id: p.employeeId, name: p.name, employeeCode: p.employeeCode ?? undefined }));

describe('PAY-17 · Payroll › Loans and advances (live)', () => {
  const MONTHS: LoanRepayments = {
    loanId: 'l1',
    interestRate: '6.00',
    recovered: '10000.00',
    rows: [
      { no: 1, month: '2026-09', emi: '10000.00', interest: '150.00', principal: '9850.00', balance: '20150.00', status: 'recovered' },
      { no: 2, month: '2026-10', emi: '0.00', interest: '0.00', principal: '0.00', balance: '20150.00', status: 'paused' },
      { no: 3, month: '2026-11', emi: '10000.00', interest: '100.75', principal: '9899.25', balance: '10250.75', status: 'scheduled' },
    ],
    closing: { on: '2026-10-30', interestFrom: '2026-10-01', days: 30, principal: '20000.00', interest: '98.63', total: '20098.63' },
  };
  const live = (over: Partial<LiveLoans> = {}): LiveLoans => ({ state: 'ready', loans: LOANS, nameOf, can: { manage: true }, onSearch: search, onRequest: fn(), onChange: fn(), onRepayments: vi.fn(async () => MONTHS), ...over });

  it('founder answer 5: the record shows the month-by-month schedule from the API, recovered, paused and scheduled', async () => {
    const onRepayments = vi.fn(async () => MONTHS);
    render(<LoansScreen live={live({ onRepayments })} />);
    await ue.click(screen.getByRole('button', { name: 'Change the loan of Arjun Kulkarni' }));
    const d = screen.getByRole('dialog');
    const table = await within(d).findByRole('table', { name: 'Schedule' });
    expect(onRepayments).toHaveBeenCalledWith(LOANS[0]);
    expect(within(table).getAllByRole('row')).toHaveLength(4);
    expect(within(table).getByText('Recovered')).toBeInTheDocument();
    expect(within(table).getByText('Paused')).toBeInTheDocument();
    expect(within(table).getByText('Scheduled')).toBeInTheDocument();
    expect(within(d).getByText('Recovered in payroll so far: ₹10,000.00.')).toBeInTheDocument();
  });

  it('a schedule that fails to load says so (no blank table)', async () => {
    render(<LoansScreen live={live({ onRepayments: vi.fn(async () => Promise.reject(new Error('x'))) })} />);
    await ue.click(screen.getByRole('button', { name: 'Change the loan of Arjun Kulkarni' }));
    expect(await within(screen.getByRole('dialog')).findByText(/The schedule didn't load/)).toBeInTheDocument();
    expect(within(screen.getByRole('dialog')).queryByRole('table', { name: 'Schedule' })).not.toBeInTheDocument();
  });

  it('pre-closure shows the interest to the closing day from the API and the total; a reason is required', async () => {
    const onChange = fn();
    render(<LoansScreen live={live({ onChange })} />);
    await ue.click(screen.getByRole('button', { name: 'Change the loan of Arjun Kulkarni' }));
    await within(screen.getByRole('dialog')).findByRole('table', { name: 'Schedule' });
    await ue.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Pre-close' }));
    const d = await screen.findByRole('dialog', { name: /^Pre-close/ });
    expect(within(d).getByText('Interest to 30 Oct 2026')).toBeInTheDocument();
    expect(within(d).getByText(/₹98.63 · 30 days/)).toBeInTheDocument();
    expect(within(d).getAllByText(/₹20,098.63/).length).toBeGreaterThan(0);
    await ue.click(within(d).getByRole('button', { name: 'Pre-close loan' }));
    expect(onChange).not.toHaveBeenCalled();
    expect(within(d).getByRole('textbox', { name: /Reason/ })).toHaveFocus();
    await ue.type(within(d).getByRole('textbox', { name: /Reason/ }), 'Paid back from a bonus');
    await ue.click(within(d).getByRole('button', { name: 'Pre-close loan' }));
    await waitFor(() => expect(onChange).toHaveBeenCalledWith(LOANS[0], { kind: 'preclose', reason: 'Paid back from a bonus' }));
  });

  it('founder answer 1: payroll asking for someone types no interest; the company rate applies', async () => {
    render(<LoansScreen live={live()} />);
    await ue.click(screen.getByRole('button', { name: 'Add loan' }));
    const d = screen.getByRole('dialog');
    await ue.click(within(d).getByRole('radio', { name: 'Personal loan' }));
    expect(within(d).queryByRole('textbox', { name: /Interest/ })).not.toBeInTheDocument();
    expect(within(d).getByText(/Interest is the company's rate for this loan type/)).toBeInTheDocument();
  });

  it('payroll asks for someone else with a person; pressed too early the person is required', async () => {
    const onRequest = fn();
    render(<LoansScreen live={live({ onRequest })} />);
    await ue.click(screen.getByRole('button', { name: 'Add loan' }));
    const d = screen.getByRole('dialog');
    await ue.click(within(d).getByRole('button', { name: 'Send for approval' }));
    expect(onRequest).not.toHaveBeenCalled();
    expect(within(d).getByText('Choose the person.')).toBeInTheDocument();
    await ue.click(within(d).getByRole('button', { name: 'Search' }));
    await ue.click(await within(d).findByRole('button', { name: /Divya Raghunathan/ }));
    await ue.type(within(d).getByRole('textbox', { name: /Amount/ }), '25000');
    await ue.type(within(d).getByRole('textbox', { name: /Instalments/ }), '5');
    await ue.clear(within(d).getByLabelText(/First instalment in/));
    await ue.type(within(d).getByLabelText(/First instalment in/), '2026-11');
    await ue.type(within(d).getByRole('textbox', { name: /Reason/ }), 'Medical bills');
    await ue.click(within(d).getByRole('button', { name: 'Send for approval' }));
    await waitFor(() => expect(onRequest).toHaveBeenCalledWith({ employeeId: 'p2', loanType: 'advance', principal: '25000', instalments: 5, firstMonth: '2026-11', reason: 'Medical bills' }));
  });

  it('only active loans of others can be changed; one’s own loan cannot', () => {
    render(<LoansScreen live={live()} />);
    expect(screen.getAllByRole('button', { name: /^Change the loan of/ })).toHaveLength(1);
    expect(screen.getByRole('button', { name: 'Change the loan of Arjun Kulkarni' })).toBeInTheDocument();
  });

  it('a new instalment is above zero and not more than what is left', async () => {
    const onChange = fn();
    render(<LoansScreen live={live({ onChange })} />);
    await ue.click(screen.getByRole('button', { name: 'Change the loan of Arjun Kulkarni' }));
    await ue.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Change instalment' }));
    const d = await screen.findByRole('dialog', { name: 'Change the instalment?' });
    await ue.type(within(d).getByRole('textbox', { name: /New instalment/ }), '25000');
    await ue.type(within(d).getByRole('textbox', { name: /Reason/ }), 'Asked to repay faster');
    await ue.click(within(d).getByRole('button', { name: 'Save instalment' }));
    expect(onChange).not.toHaveBeenCalled();
    expect(within(d).getByText(/not more than ₹20,000.00/)).toBeInTheDocument();
    await ue.clear(within(d).getByRole('textbox', { name: /New instalment/ }));
    await ue.type(within(d).getByRole('textbox', { name: /New instalment/ }), '15000');
    await ue.click(within(d).getByRole('button', { name: 'Save instalment' }));
    await waitFor(() => expect(onChange).toHaveBeenCalledWith(LOANS[0], { kind: 'reschedule', emi: '15000', reason: 'Asked to repay faster' }));
  });

  it('pause needs a reason and sends the month', async () => {
    const onChange = fn();
    render(<LoansScreen live={live({ onChange })} />);
    await ue.click(screen.getByRole('button', { name: 'Change the loan of Arjun Kulkarni' }));
    await ue.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Pause EMIs' }));
    const d = await screen.findByRole('dialog', { name: 'Pause EMIs?' });
    await ue.click(within(d).getByRole('button', { name: 'Pause EMIs' }));
    expect(onChange).not.toHaveBeenCalled();
    expect(within(d).getByRole('textbox', { name: /Reason/ })).toHaveFocus();
    await ue.type(within(d).getByRole('textbox', { name: /Reason/ }), 'Medical leave without pay');
    await ue.click(within(d).getByRole('button', { name: 'Pause EMIs' }));
    await waitFor(() => expect(onChange).toHaveBeenCalledWith(LOANS[0], expect.objectContaining({ kind: 'pause', reason: 'Medical leave without pay', pauseUntil: expect.stringMatching(/^\d{4}-\d{2}$/) })));
  });

  it('an expense loan is shown as the recovery of an expense advance, not a salary advance', () => {
    render(<LoansScreen live={live({ loans: [{ ...LOANS[0]!, id: 'l9', loanType: 'expense' }] })} />);
    expect(screen.getByText('Expense advance recovery')).toBeInTheDocument();
    expect(screen.queryByText('Salary advance')).not.toBeInTheDocument();
  });

  it('without payroll.loan.manage there is no Add loan and no Change; no access shows who grants it', () => {
    const { unmount } = render(<LoansScreen live={live({ can: { manage: false } })} />);
    expect(screen.queryByRole('button', { name: 'Add loan' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /^Change the loan of/ })).not.toBeInTheDocument();
    unmount();
    render(<LoansScreen live={live({ state: 'no-access', loans: null })} />);
    expect(screen.getByText(/your payroll admin/)).toBeInTheDocument();
  });
});

describe('PAY-23 · Payroll › Proof checking (live)', () => {
  const F12B: Form12bRow = { id: 'f1', employeeId: 'p2', employeeName: 'Divya Raghunathan', legalEntityId: 'e1', taxYear: '2026-27', employerName: 'Old Co', employerTan: 'BLRA12345B', gross: '300000.00', exemptions: '0.00', tds: '12000.00', status: 'pending', comment: null, file: { name: 'form12b.pdf', size: 1000, at: '2026-10-01T10:00:00Z' }, submittedAt: '2026-10-01T10:00:00Z' };
  const live = (over: Partial<LiveProofQueue> = {}): LiveProofQueue => ({ state: 'ready', status: 'pending', onStatus: vi.fn(), lines: PROOFS, form12b: [F12B], onFile: fn(), onDecide: fn(), onForm12bFile: fn(), onForm12bDecide: fn(), ...over });

  it('a part approval is below what was declared; a rejection needs a comment', async () => {
    const onDecide = fn();
    render(<ProofQueueScreen live={live({ onDecide })} />);
    await ue.click(screen.getAllByRole('button', { name: /^Decide on/ })[1]!);
    const d = screen.getByRole('dialog');
    await ue.click(within(d).getByRole('radio', { name: 'Approve part' }));
    await ue.type(within(d).getByRole('textbox', { name: /Approved amount/ }), '150000');
    await ue.type(within(d).getByRole('textbox', { name: /Comment/ }), 'Only the PPF receipt is this year’s');
    await ue.click(within(d).getByRole('button', { name: 'Approve part' }));
    expect(onDecide).not.toHaveBeenCalled();
    await ue.clear(within(d).getByRole('textbox', { name: /Approved amount/ }));
    await ue.type(within(d).getByRole('textbox', { name: /Approved amount/ }), '90000');
    await ue.click(within(d).getByRole('button', { name: 'Approve part' }));
    await waitFor(() => expect(onDecide).toHaveBeenCalledWith(PROOFS[1], { decision: 'partly', amount: '90000', comment: 'Only the PPF receipt is this year’s' }));
  });

  it('the decision drawer shows the file sent in the page (PDF and image, a Segment between them); Download still downloads (PAY-23 Line)', async () => {
    const make = vi.spyOn(URL, 'createObjectURL').mockImplementation(() => 'blob:proof');
    const drop = vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => undefined);
    try {
      const two = { ...PROOFS[0]!, proofs: [...PROOFS[0]!.proofs, { n: 1, name: 'receipt.jpg', size: 5000, at: '2026-10-02T10:00:00Z' }] };
      const onPreview = vi.fn(async (_l: unknown, n: number) => new Blob(['x'], { type: n ? 'image/jpeg' : 'application/pdf' }));
      const onFile = fn();
      render(<ProofQueueScreen live={live({ lines: [two], onPreview, onFile })} />);
      await ue.click(screen.getByRole('button', { name: /^Decide on Arjun/ }));
      const d = screen.getByRole('dialog');
      await waitFor(() => expect(d.querySelector('object[type="application/pdf"]')).toHaveAttribute('data', 'blob:proof'));
      expect(onPreview).toHaveBeenCalledWith(two, 0);
      await ue.click(within(d).getByRole('radio', { name: 'receipt.jpg' }));
      expect(await within(d).findByRole('img', { name: /receipt\.jpg/ })).toHaveAttribute('src', 'blob:proof');
      expect(onPreview).toHaveBeenLastCalledWith(two, 1);
      expect(drop).toHaveBeenCalled();
      await ue.click(within(d).getByRole('button', { name: 'Download' }));
      await waitFor(() => expect(onFile).toHaveBeenCalledWith(two, 1, 'receipt.jpg'));
    } finally {
      make.mockRestore();
      drop.mockRestore();
    }
  });

  it('a file that is neither a PDF nor an image is not shown, only downloaded', async () => {
    const make = vi.spyOn(URL, 'createObjectURL');
    const odd = { ...PROOFS[0]!, proofs: [{ n: 0, name: 'notes.docx', size: 900, at: '2026-10-02T10:00:00Z' }] };
    render(<ProofQueueScreen live={live({ lines: [odd], onPreview: async () => new Blob(['x'], { type: 'application/msword' }) })} />);
    await ue.click(screen.getByRole('button', { name: /^Decide on Arjun/ }));
    expect(await screen.findByText(/We can't preview .docx files here/)).toBeInTheDocument();
    expect(make).not.toHaveBeenCalled();
    make.mockRestore();
  });

  it('a deep link to one’s own proof opens it read only with the designed warning; nothing to decide (PAY-23 OwnProof)', () => {
    const mine = { ...PROOFS[0]!, employeeName: 'You' };
    const onDecide = fn();
    render(<ProofQueueScreen live={live({ lines: [], form12b: [], own: { line: mine }, onDecide })} />);
    const d = screen.getByRole('dialog');
    expect(within(d).getByText('This is your own proof')).toBeInTheDocument();
    expect(within(d).getByText(/You can't verify your own proofs/)).toBeInTheDocument();
    expect(within(d).queryByRole('radio')).not.toBeInTheDocument();
    expect(within(d).queryByRole('button', { name: /Approve|Reject/ })).not.toBeInTheDocument();
  });

  it('a deep link to one’s own residency request: deciding it shows the server refusal (PAY-23 ResidencyOwn)', async () => {
    const mine: ResidencyRow = { id: 'rs-own', employeeId: '', employeeName: 'You', legalEntityId: '', taxYear: '2026-27', from: 'resident', residentialStatus: 'non_resident', trcValidTo: '2027-03-31', dtaaCountry: 'AE', form10fFiled: true, file: { name: 'trc.pdf', size: 900, at: '2026-10-24T09:00:00Z' }, status: 'pending', comment: null, submittedAt: '2026-10-24T09:00:00Z', verifiedAt: null };
    const onResidencyDecide = vi.fn(async () => Promise.reject(new Error('Someone else checks your own residential status.')));
    render(<ProofQueueScreen live={live({ lines: [], form12b: [], residency: [], own: { residency: mine }, onResidencyDecide })} />);
    const d = screen.getByRole('dialog', { name: /Residential status change/ });
    await ue.click(within(d).getByRole('button', { name: 'Approve change' }));
    expect(await within(d).findByText('Someone else checks your own residential status.')).toBeInTheDocument();
    expect(within(d).getByText('That did not go through')).toBeInTheDocument();
  });

  it('a PAN link confirmation is in the queue; the file shows in the drawer; refusing needs a reason; approve sends it (PAY-22 NoPan)', async () => {
    const make = vi.spyOn(URL, 'createObjectURL').mockImplementation(() => 'blob:pan');
    try {
      const PAN: PanLinkRow = { id: 'pl1', employeeId: 'p3', employeeName: 'Karthik Iyer', legalEntityId: 'e1', taxYear: '2026-27', file: { name: 'pan-link.pdf', size: 900, type: 'application/pdf', at: '2026-10-29T08:00:00Z' }, status: 'pending', comment: null, submittedAt: '2026-10-29T08:00:00Z', verifiedAt: null };
      const onPanLinkDecide = fn();
      const onPanLinkPreview = vi.fn(async () => new Blob(['%PDF'], { type: 'application/pdf' }));
      render(<ProofQueueScreen live={live({ lines: [], form12b: [], panLinks: [PAN], onPanLinkDecide, onPanLinkPreview, onPanLinkFile: fn() })} />);
      expect(screen.getByText('PAN linked with Aadhaar')).toBeInTheDocument();
      await ue.click(screen.getByRole('button', { name: "Decide on Karthik Iyer's PAN link" }));
      const d = screen.getByRole('dialog', { name: /PAN linked with Aadhaar/ });
      await waitFor(() => expect(d.querySelector('object[type="application/pdf"]')).toHaveAttribute('data', 'blob:pan'));
      await ue.click(within(d).getByRole('radio', { name: 'Refuse' }));
      await ue.click(within(d).getByRole('button', { name: 'Refuse PAN link' }));
      expect(onPanLinkDecide).not.toHaveBeenCalled();
      expect(within(d).getByRole('textbox', { name: /Reason/ })).toHaveFocus();
      await ue.click(within(d).getByRole('radio', { name: 'Approve' }));
      await ue.click(within(d).getByRole('button', { name: 'Approve PAN link' }));
      await waitFor(() => expect(onPanLinkDecide).toHaveBeenCalledWith(PAN, { decision: 'approve' }));
    } finally {
      make.mockRestore();
    }
  });

  it('a deep link opens that row of the queue', () => {
    render(<ProofQueueScreen live={live({ openId: `l-${PROOFS[1]!.id}` })} />);
    expect(screen.getByRole('dialog')).toHaveTextContent('Divya');
  });

  it('Form 12B is in the same queue: the file opens; reject needs a comment; approve sends the decision', async () => {
    const onForm12bDecide = fn();
    const onForm12bFile = fn();
    render(<ProofQueueScreen live={live({ onForm12bDecide, onForm12bFile })} />);
    await ue.click(screen.getByRole('button', { name: "Decide on Divya Raghunathan's Form 12B" }));
    const d = screen.getByRole('dialog');
    await ue.click(within(d).getByRole('button', { name: 'Open form12b.pdf' }));
    await waitFor(() => expect(onForm12bFile).toHaveBeenCalledWith(F12B));
    await ue.click(within(d).getByRole('radio', { name: 'Reject' }));
    await ue.click(within(d).getByRole('button', { name: 'Reject Form 12B' }));
    expect(onForm12bDecide).not.toHaveBeenCalled();
    expect(within(d).getByRole('textbox', { name: /Comment/ })).toHaveFocus();
    await ue.click(within(d).getByRole('radio', { name: 'Approve' }));
    await ue.click(within(d).getByRole('button', { name: 'Approve Form 12B' }));
    await waitFor(() => expect(onForm12bDecide).toHaveBeenCalledWith(F12B, { decision: 'approve' }));
  });

  it('founder answer 2: a residential-status change is in the same queue; the TRC opens; refuse needs a reason; approve sends', async () => {
    const RES: ResidencyRow = { id: 'r1', employeeId: 'p2', employeeName: 'Divya Raghunathan', legalEntityId: 'e1', taxYear: '2026-27', from: 'resident', residentialStatus: 'non_resident', trcValidTo: '2027-03-31', dtaaCountry: 'SG', form10fFiled: true, file: { name: 'trc.pdf', size: 900, at: '2026-10-20T10:00:00Z' }, status: 'pending', comment: null, submittedAt: '2026-10-20T10:00:00Z' };
    const onResidencyDecide = fn();
    const onResidencyFile = fn();
    render(<ProofQueueScreen live={live({ form12b: [], residency: [RES], onResidencyDecide, onResidencyFile })} />);
    expect(screen.getByText('Resident → non-resident · TRC until 31 Mar 2027 · SG · 2026-27')).toBeInTheDocument();
    expect(screen.getByText('Certificate sent')).toBeInTheDocument();
    await ue.click(screen.getByRole('button', { name: "Decide on Divya Raghunathan's residential status" }));
    const d = screen.getByRole('dialog');
    expect(within(d).getByText('31 Mar 2027')).toBeInTheDocument();
    expect(within(d).getByText('Filed (the employee confirmed)')).toBeInTheDocument();
    await ue.click(within(d).getByRole('button', { name: 'Open trc.pdf' }));
    await waitFor(() => expect(onResidencyFile).toHaveBeenCalledWith(RES));
    await ue.click(within(d).getByRole('radio', { name: 'Refuse' }));
    await ue.click(within(d).getByRole('button', { name: 'Refuse change' }));
    expect(onResidencyDecide).not.toHaveBeenCalled();
    expect(within(d).getByText('Give the reason, so the employee can fix it.')).toBeInTheDocument();
    expect(within(d).getByRole('textbox', { name: /Reason for the employee/ })).toHaveFocus();
    await ue.type(within(d).getByRole('textbox', { name: /Reason for the employee/ }), 'The TRC is for last year');
    await ue.click(within(d).getByRole('button', { name: 'Refuse change' }));
    await waitFor(() => expect(onResidencyDecide).toHaveBeenCalledWith(RES, { decision: 'reject', comment: 'The TRC is for last year' }));
    expect((await screen.findAllByText('Divya Raghunathan · change refused.'))[0]).toBeInTheDocument();
  });

  it('founder last 10, item 7: back to resident shows no document; approve sends with a toast', async () => {
    const BACK: ResidencyRow = { id: 'r2', employeeId: 'p3', employeeName: 'Rahul Menon', legalEntityId: 'e1', taxYear: '2026-27', from: 'non_resident', residentialStatus: 'resident', trcValidTo: null, dtaaCountry: null, form10fFiled: false, file: null, status: 'pending', comment: null, submittedAt: '2026-10-27T10:00:00Z' };
    const onResidencyDecide = fn();
    render(<ProofQueueScreen live={live({ lines: [], form12b: [], residency: [BACK], onResidencyDecide, onResidencyFile: fn() })} />);
    expect(screen.getByText('Non-resident → resident · no document needed · 2026-27')).toBeInTheDocument();
    expect(screen.getByText('No document')).toBeInTheDocument();
    await ue.click(screen.getByRole('button', { name: "Decide on Rahul Menon's residential status" }));
    const d = screen.getByRole('dialog');
    expect(within(d).getByText('None needed: going back to resident only needs your approval.')).toBeInTheDocument();
    expect(within(d).queryByText('Tax residency certificate')).toBeNull();
    await ue.click(within(d).getByRole('button', { name: 'Approve change' }));
    await waitFor(() => expect(onResidencyDecide).toHaveBeenCalledWith(BACK, { decision: 'approve' }));
    expect((await screen.findAllByText('Rahul Menon · now resident from the next payslip.'))[0]).toBeInTheDocument();
  });

  it('founder last 10, item 10: the designed states render (approved, refused with its reason, own refused by the server)', async () => {
    const { unmount } = render(<ProofQueueScreen residency="refused" />);
    const d = await screen.findByRole('dialog');
    expect(within(d).getByText('Refused', { selector: '.yx-badge, .yx-badge *' })).toBeInTheDocument();
    expect(within(d).getByText('The certificate is for 2025-26. Send the one for 2026-27.')).toBeInTheDocument();
    expect(within(d).queryByRole('button', { name: 'Refuse change' })).toBeNull();
    expect(screen.getAllByText('Refused: The certificate is for 2025-26. Send the one for 2026-27.').length).toBeGreaterThan(0);
    unmount();
    const r2 = render(<ProofQueueScreen residency="approved" />);
    const ad = await screen.findByRole('dialog');
    expect(within(ad).getAllByRole('button', { name: 'Close' }).length).toBeGreaterThan(0);
    expect(within(ad).queryByRole('button', { name: 'Approve change' })).toBeNull();
    expect(within(ad).getByText('25 Oct 2026')).toBeInTheDocument();
    r2.unmount();
    render(<ProofQueueScreen residency="own" />);
    expect(within(await screen.findByRole('dialog')).getByText('Someone else checks your own residential status.')).toBeInTheDocument();
  });

  it('a refusal from the server stays in the drawer and nothing is toasted', async () => {
    const RES: ResidencyRow = { id: 'r3', employeeId: 'p4', employeeName: 'Me Myself', legalEntityId: 'e1', taxYear: '2026-27', from: 'non_resident', residentialStatus: 'resident', trcValidTo: null, dtaaCountry: null, form10fFiled: false, file: null, status: 'pending', comment: null, submittedAt: '2026-10-27T10:00:00Z' };
    const onResidencyDecide = vi.fn(async () => Promise.reject(new Error('Someone else checks your own residential status.')));
    render(<ProofQueueScreen live={live({ lines: [], form12b: [], residency: [RES], onResidencyDecide, onResidencyFile: fn() })} />);
    await ue.click(screen.getByRole('button', { name: "Decide on Me Myself's residential status" }));
    const d = screen.getByRole('dialog');
    await ue.click(within(d).getByRole('button', { name: 'Approve change' }));
    expect(await within(d).findByText('Someone else checks your own residential status.')).toBeInTheDocument();
    expect(screen.queryByText(/now resident from the next payslip/)).toBeNull();
  });

  it('the status filter is one Segment; an empty queue says so', async () => {
    const onStatus = vi.fn();
    const { unmount } = render(<ProofQueueScreen live={live({ onStatus })} />);
    await ue.click(screen.getByRole('radio', { name: 'Rejected' }));
    expect(onStatus).toHaveBeenCalledWith('rejected');
    unmount();
    render(<ProofQueueScreen live={live({ lines: [], form12b: [] })} />);
    expect(screen.getByText('No proofs to verify yet.')).toBeInTheDocument();
  });
});

describe('PAY-27 · Payroll › Earned wage access (live)', () => {
  const DRAWS = [
    { id: 'w1', employeeId: 'p1', month: '2026-10', available: '6000.00', amount: '5000.00', fee: '49.00', feePayer: 'employee' as const, status: 'requested' as const, paidRef: null, failureReason: null, createdAt: '2026-10-12T09:00:00Z' },
    { id: 'w2', employeeId: 'p2', month: '2026-10', available: '8000.00', amount: '3000.10', fee: '49.00', feePayer: 'employee' as const, status: 'paid' as const, paidRef: 'UTR1234', failureReason: null, createdAt: '2026-10-10T09:00:00Z' },
  ];
  const live = (over: Partial<LiveEwaAdmin> = {}): LiveEwaAdmin => ({
    state: 'ready',
    entities: [{ id: 'e1', name: 'Kaveri Foods Pvt Ltd', shortName: 'KFPL', keys: [] } as never],
    entityId: 'e1',
    onEntity: vi.fn(),
    month: '2026-10',
    onMonth: vi.fn(),
    nameOf,
    policies: [{ id: 'p', validFrom: '2026-10-01', enabled: true, percentAvailable: '50', minAmount: '500.00', maxAmount: '20000.00', drawsPerMonth: 3, blackoutDays: 3, fee: '49.00', feePayer: 'employee' }],
    draws: DRAWS,
    onPolicy: fn(),
    onPaid: fn(),
    onFailed: fn(),
    ...over,
  });

  it('a payment needs its bank reference; then it is recorded', async () => {
    const onPaid = fn();
    render(<EwaAdminScreen live={live({ onPaid })} />);
    await ue.click(screen.getByRole('button', { name: 'Record payment to Arjun Kulkarni' }));
    const d = await screen.findByRole('dialog');
    await ue.click(within(d).getByRole('button', { name: 'Record payment' }));
    expect(onPaid).not.toHaveBeenCalled();
    await ue.type(within(d).getByRole('textbox', { name: /Bank reference/ }), 'UTR998877');
    await ue.click(within(d).getByRole('button', { name: 'Record payment' }));
    await waitFor(() => expect(onPaid).toHaveBeenCalledWith(DRAWS[0], 'UTR998877'));
  });

  it('recoveries add the amounts and the person’s fees exactly', async () => {
    render(<EwaAdminScreen live={live()} />);
    await ue.click(screen.getByRole('tab', { name: 'Recoveries in payroll' }));
    expect(screen.getByText('₹3,049.10')).toBeInTheDocument();
  });

  it('the policy: pressed too early the start day is required; then saved from that day', async () => {
    const onPolicy = fn();
    render(<EwaAdminScreen live={live({ onPolicy })} />);
    await ue.click(screen.getByRole('tab', { name: 'Policy' }));
    await ue.click(screen.getByRole('button', { name: 'Change from a date' }));
    const d = screen.getByRole('dialog');
    await ue.click(within(d).getByRole('button', { name: 'Save policy' }));
    expect(onPolicy).not.toHaveBeenCalled();
    expect(within(d).getByLabelText(/^From/)).toHaveFocus();
    await ue.type(within(d).getByLabelText(/^From/), '2026-11-01');
    await ue.click(within(d).getByRole('button', { name: 'Save policy' }));
    await waitFor(() => expect(onPolicy).toHaveBeenCalledWith({ validFrom: '2026-11-01', enabled: true, percentAvailable: '50', minAmount: '500', maxAmount: '20000', drawsPerMonth: 3, blackoutDays: 3, fee: '0', feePayer: 'employer' }));
  });

  it('no partner connected is the true state; no access says who grants it', () => {
    const { unmount } = render(<EwaAdminScreen live={live()} />);
    unmount();
    render(<EwaAdminScreen live={live({ state: 'no-access', entities: [] })} />);
    expect(screen.getByText(/your payroll admin/)).toBeInTheDocument();
  });

  it('Recoveries in payroll: a row a month with recovered, deferred and to F&F (PAY-27 Recoveries)', async () => {
    render(<EwaAdminScreen live={live({ recoveries: [
      { month: '2026-10', draws: 3, toRecover: '9147.10', recovered: '6000.00', deferred: '2000.00', fnf: { people: 1, amount: '1147.10' }, waiting: '0.00' },
      { month: '2026-09', draws: 1, toRecover: '500.00', recovered: '500.00', deferred: '0.00', fnf: { people: 0, amount: '0.00' }, waiting: '0.00' },
    ] })} />);
    await ue.click(screen.getByRole('tab', { name: 'Recoveries in payroll' }));
    const t = screen.getByRole('table', { name: 'Recoveries in payroll' });
    expect(within(t).getAllByRole('row')[1]).toHaveTextContent('October 2026');
    expect(t).toHaveTextContent('₹2,000.00');
    expect(t).toHaveTextContent('1 leaver: ₹1,147.10');
  });

  it('Reconciliation: paid, recovered and the difference explained; the finance approver sees only this tab (PAY-27 Reconciliation)', () => {
    const recon = { entities: [{ id: 'e1', name: 'Kaveri Foods Pvt Ltd' }], legalEntityId: 'e1', month: '2026-10', totals: { draws: 2, paidOut: '8000.10', fees: '98.00', toRecover: '8098.10', recovered: '5049.00', deferred: '0.00', fnf: '0.00', waiting: '3049.10', difference: '3049.10' }, draws: [] };
    render(<EwaAdminScreen live={live({ canManage: false, recon, draws: null, policies: null })} />);
    expect(screen.queryByRole('tab', { name: /Draws/ })).not.toBeInTheDocument();
    expect(screen.getByRole('tab', { name: 'Reconciliation', selected: true })).toBeInTheDocument();
    expect(screen.getByText('₹8,000.10 + ₹98.00 fees')).toBeInTheDocument();
    expect(screen.getByText('₹3,049.10 (₹3,049.10 waiting for the October 2026 payroll)')).toBeInTheDocument();
    expect(screen.getByText(/Each draw is matched to its payslip deduction/)).toBeInTheDocument();
  });

  it('Reconciliation with nothing paid in the month says so', async () => {
    render(<EwaAdminScreen live={live({ recon: { entities: [], legalEntityId: 'e1', month: '2026-10', totals: { draws: 0, paidOut: '0.00', fees: '0.00', toRecover: '0.00', recovered: '0.00', deferred: '0.00', fnf: '0.00', waiting: '0.00', difference: '0.00' }, draws: [] } })} />);
    await ue.click(screen.getByRole('tab', { name: 'Reconciliation' }));
    expect(screen.getByText('No draws paid in October 2026.')).toBeInTheDocument();
  });
});

describe('design samples: no greyed-out buttons (house rules 2 and 3)', () => {
  it('Pause EMIs pressed without a reason shows the field error and focuses it; with one it pauses', async () => {
    const u = userEvent.setup();
    render(<LoansScreen openId="l1" action="pause" />);
    // Two stacked modals (record drawer, then this dialog): jsdom marks both aria-hidden, so query hidden ones.
    const confirm = () => screen.getAllByRole('button', { name: 'Pause EMIs', hidden: true }).at(-1)!;
    await u.click(confirm());
    expect(screen.getByText('Add a reason.')).toBeInTheDocument();
    const reason = screen.getAllByRole('textbox', { name: /Reason/, hidden: true }).at(-1)!;
    expect(reason).toHaveFocus();
    await u.type(reason, 'Medical leave');
    await u.click(confirm());
    await waitFor(() => expect(screen.queryByText('Pause EMIs?')).not.toBeInTheDocument());
  });

  it('the loan ledger says the list has not loaded yet instead of greying out', async () => {
    const u = userEvent.setup();
    render(<LoansScreen state="loading" />);
    await u.click(screen.getByRole('button', { name: 'Loan ledger' }));
    expect(screen.getAllByText('The loan list has not loaded yet.')[0]).toBeInTheDocument();
  });

  it('one’s own proof: Approve says why and changes nothing', async () => {
    const u = userEvent.setup();
    render(<ProofQueueScreen openId="pr-own" />);
    await u.click(screen.getByRole('button', { name: 'Approve line' }));
    expect(screen.getAllByText(/You can't verify your own proof/)[0]).toBeInTheDocument();
    expect(screen.getByRole('dialog')).toBeInTheDocument();
  });

  it('connect a partner: sent with a toast; pressed again it says it was already sent', async () => {
    const u = userEvent.setup();
    render(<EwaAdminScreen tab="partner" partner="not-connected" />);
    await u.click(screen.getByRole('button', { name: 'Connect a partner' }));
    expect(screen.getAllByText('Connection request sent to Pragati EarlyPay Pvt Ltd.')[0]).toBeInTheDocument();
    await u.click(screen.getByRole('button', { name: 'Request sent' }));
    expect(screen.getAllByText(/The connection request was already sent/)[0]).toBeInTheDocument();
  });
});
