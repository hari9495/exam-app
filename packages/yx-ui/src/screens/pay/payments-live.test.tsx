import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { PaymentsScreen } from './payroll-inputs';
import type { LivePaymentModes, LivePayrollFiles, LiveRunPayments, RunJournal } from './payments-live';
import { PAYSLIPS, PEOPLE, RUN } from './live/fixtures-5j';
import { DISBURSEMENTS, MODES } from './live/fixtures-ops';
import { EXCHANGE_FILES } from './live/fixtures-5ab';

// PAY-10 live (ported from live/pay-ops-live.test.tsx and live/pay-live.test.tsx): the designed PaymentsScreen with `live`.
const ue = userEvent.setup({ pointerEventsCheck: 0 });
const fn = () => vi.fn(async () => ({}) as never);
const nameOf = (id: string) => PEOPLE.find((p) => p.employeeId === id)?.name ?? 'Someone';
const search = async () => PEOPLE.map((p) => ({ id: p.employeeId, name: p.name, employeeCode: p.employeeCode ?? undefined }));

const runLive = (over: Partial<LiveRunPayments> = {}): LiveRunPayments => ({
  view: 'run',
  state: 'ready',
  run: { ...RUN, status: 'approved' },
  payslips: PAYSLIPS,
  disbursements: DISBURSEMENTS,
  bankFiles: [],
  journal: null,
  nameOf,
  can: { record: true, journal: false },
  onBack: vi.fn(),
  onResults: fn(),
  onUploadResults: vi.fn(async () => ({ recorded: 1 })),
  onDisburse: fn(),
  onDownloadBankFile: fn(),
  onExportJournal: fn(),
  ...over,
});

describe('PAY-10 live · a run’s payments', () => {
  it('the design’s header and tabs; a cash person is not in the bank list (positive)', () => {
    render(<PaymentsScreen live={runLive()} />);
    expect(screen.getByRole('heading', { name: 'Payments & files' })).toBeInTheDocument();
    for (const t of ['Payment status', 'Cash and cheque', 'Bank files']) expect(screen.getByRole('tab', { name: new RegExp(t) })).toBeInTheDocument();
    expect(screen.queryByRole('tab', { name: /Journal export/ })).not.toBeInTheDocument();
    expect(screen.queryByText('Sridhar Fernandes')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Record the bank result for Arjun Kulkarni' })).toBeInTheDocument();
  });

  it('pay stays hidden until Show pay (negative: no amount on screen first)', async () => {
    render(<PaymentsScreen live={runLive()} />);
    expect(screen.queryByText('₹55,380')).not.toBeInTheDocument();
    await ue.click(screen.getByRole('button', { name: 'Show pay' }));
    expect(screen.getByText('₹55,380')).toBeInTheDocument();
  });

  it('a failed bank result needs the bank’s reason, shown only after pressing Record (negative, then positive)', async () => {
    const live = runLive();
    render(<PaymentsScreen live={live} />);
    await ue.click(screen.getByRole('button', { name: 'Record the bank result for Arjun Kulkarni' }));
    await ue.click(screen.getByRole('radio', { name: 'Failed' }));
    expect(screen.queryByText('Say what the bank gave as the reason.')).not.toBeInTheDocument();
    await ue.click(screen.getByRole('button', { name: 'Record' }));
    expect(screen.getByText('Say what the bank gave as the reason.')).toBeInTheDocument();
    expect(screen.getByRole('textbox', { name: /Reason from the bank/ })).toHaveFocus();
    expect(live.onResults).not.toHaveBeenCalled();
    await ue.type(screen.getByRole('textbox', { name: /Reason from the bank/ }), 'Account closed');
    await ue.click(screen.getByRole('button', { name: 'Record' }));
    await waitFor(() => expect(live.onResults).toHaveBeenCalledWith([{ payslipId: 's1', status: 'failed', reason: 'Account closed' }]));
    expect((await screen.findAllByText('Bank result recorded for Arjun Kulkarni')).length).toBeGreaterThan(0);
  });

  it('the API’s row problems are shown and nothing is recorded (negative)', async () => {
    const onResults = vi.fn(async () => {
      throw Object.assign(new Error('Nothing was recorded. Fix these rows first.'), { body: { problems: ['Row 1: the payslip is pending, not waiting for a bank result.'] } });
    });
    render(<PaymentsScreen live={runLive({ onResults, disbursements: [] })} />);
    await ue.click(screen.getByRole('button', { name: 'Record the bank result for Arjun Kulkarni' }));
    await ue.type(screen.getByRole('textbox', { name: /How you know/ }), 'Seen on the statement');
    await ue.click(screen.getByRole('button', { name: 'Record' }));
    expect(await screen.findByText(/not waiting for a bank result/)).toBeInTheDocument();
    expect(onResults).toHaveBeenCalledWith([{ payslipId: 's1', status: 'paid', reason: 'Seen on the statement' }]);
  });

  it('cash and cheque: a cheque needs its number; then the day is recorded', async () => {
    const live = runLive();
    render(<PaymentsScreen live={live} />);
    await ue.click(screen.getByRole('tab', { name: /Cash and cheque/ }));
    await ue.click(screen.getByRole('button', { name: 'Record the payment to Sridhar Fernandes' }));
    await ue.click(screen.getByRole('radio', { name: 'Cheque' }));
    await ue.type(screen.getByLabelText(/Paid on/), '2026-10-01');
    await ue.click(screen.getByRole('button', { name: 'Record payment' }));
    expect(screen.getAllByText('A cheque number is 6 to 10 digits.').length).toBeGreaterThan(0);
    expect(live.onDisburse).not.toHaveBeenCalled();
    await ue.type(screen.getByRole('textbox', { name: /Cheque number/ }), '123456');
    await ue.click(screen.getByRole('button', { name: 'Record payment' }));
    await waitFor(() => expect(live.onDisburse).toHaveBeenCalledWith({ payslipId: 's3', mode: 'cheque', chequeNo: '123456', paidOn: '2026-10-01' }));
  });

  it('before approval, or without payroll.payment.record, nothing can be recorded (negative)', () => {
    const { unmount } = render(<PaymentsScreen live={runLive({ run: RUN })} />);
    expect(screen.getByText('Payments are recorded once the run is approved.')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Record the bank result/ })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Upload bank response' })).not.toBeInTheDocument();
    unmount();
    render(<PaymentsScreen live={runLive({ can: { record: false, journal: false } })} />);
    expect(screen.queryByRole('button', { name: /Record the bank result/ })).not.toBeInTheDocument();
  });

  it('Back to the run, loading, error with retry and no access', async () => {
    const live = runLive({ state: 'error', onRetry: vi.fn() });
    const { rerender } = render(<PaymentsScreen live={live} />);
    await ue.click(screen.getByRole('button', { name: /Try again|Retry/ }));
    expect(live.onRetry).toHaveBeenCalled();
    await ue.click(screen.getByRole('button', { name: 'Back to the run' }));
    expect(live.onBack).toHaveBeenCalled();
    rerender(<PaymentsScreen live={runLive({ state: 'no-access' })} />);
    expect(screen.getByText(/payments/i, { selector: '.yx-empty *' })).toBeInTheDocument();
    rerender(<PaymentsScreen live={runLive({ state: 'loading' })} />);
    expect(screen.getByRole('status', { name: 'Loading' })).toBeInTheDocument();
  });

  it('journal: export in the chosen format; with unmapped lines it says why and sends nothing', async () => {
    const journal: RunJournal = { runId: 'r1', postedAt: null, canPost: true, unmapped: [], exports: [], lines: [{ accountCode: '5001', accountName: 'Salaries', ledger: 'Salaries', costCentre: null, debit: '160860.00', credit: '0.00' }, { accountCode: '2001', accountName: 'Net salary payable', ledger: 'Net salary payable', costCentre: null, debit: '0.00', credit: '160860.00' }] };
    const live = runLive({ journal, can: { record: true, journal: true } });
    const { rerender } = render(<PaymentsScreen live={live} />);
    await ue.click(screen.getByRole('tab', { name: /Journal export/ }));
    expect(screen.getByText('Both ₹1,60,860')).toBeInTheDocument();
    await ue.click(screen.getByRole('radio', { name: 'Tally (XML)' }));
    await ue.click(screen.getByRole('button', { name: 'Export journal' }));
    await waitFor(() => expect(live.onExportJournal).toHaveBeenCalledWith('tally'));
    const blocked = runLive({ journal: { ...journal, unmapped: [{ componentCode: 'BONUS', side: 'expense', costCentreId: null, amount: '100.00' }] }, can: { record: true, journal: true } });
    rerender(<PaymentsScreen live={blocked} />);
    expect(screen.getByText(/BONUS \(expense\)/)).toBeInTheDocument();
    await ue.click(screen.getByRole('button', { name: 'Export journal' }));
    expect(blocked.onExportJournal).not.toHaveBeenCalled();
    expect((await screen.findAllByText('Map every pay line to a ledger account first.')).length).toBeGreaterThan(0);
  });
});

const filesLive = (over: Partial<LivePayrollFiles> = {}): LivePayrollFiles => ({ view: 'files', state: 'ready', data: EXCHANGE_FILES, me: 'Meena Raghavan', onDownload: fn(), onRelease: fn(), ...over });

describe('PAY-10 live · payroll files (PAY-1.11)', () => {
  it('rows, the total in rupees and the hash; release asks for the typed phrase, then a toast', async () => {
    const live = filesLive();
    render(<PaymentsScreen live={live} />);
    expect(screen.getByRole('heading', { name: 'Payroll files' })).toBeInTheDocument();
    expect(screen.getByText('₹98,42,630')).toBeInTheDocument();
    await ue.click(screen.getByRole('button', { name: 'Release KFPL-salary-2026-10.csv' }));
    const sheet = screen.getByRole('dialog');
    await ue.click(within(sheet).getByRole('button', { name: 'Release the file' }));
    expect(live.onRelease).not.toHaveBeenCalled();
    await ue.type(within(sheet).getByRole('textbox', { name: /Type RELEASE 214 to confirm/ }), 'RELEASE 214');
    await ue.click(within(sheet).getByRole('button', { name: 'Release the file' }));
    await waitFor(() => expect(live.onRelease).toHaveBeenCalledWith(EXCHANGE_FILES.files[0], expect.objectContaining({ phrase: 'RELEASE 214' })));
    expect((await screen.findAllByText('KFPL-salary-2026-10.csv is released')).length).toBeGreaterThan(0);
  });

  it('the person who made a file cannot release it; a download asks for a link (negative, then positive)', async () => {
    const live = filesLive({ data: { ...EXCHANGE_FILES, files: EXCHANGE_FILES.files.map((f) => ({ ...f, madeByMe: true, canRelease: false })) } });
    render(<PaymentsScreen live={live} />);
    expect(screen.queryByRole('button', { name: /^Release / })).not.toBeInTheDocument();
    await ue.click(screen.getByRole('button', { name: 'Download KFPL-ECR-2026-09.txt' }));
    await waitFor(() => expect(live.onDownload).toHaveBeenCalledWith(expect.objectContaining({ id: 'f1' })));
  });

  it('no files yet', () => {
    render(<PaymentsScreen live={filesLive({ data: { ...EXCHANGE_FILES, files: [] } })} />);
    expect(screen.getByText('No payroll files yet')).toBeInTheDocument();
  });
});

const modesLive = (over: Partial<LivePaymentModes> = {}): LivePaymentModes => ({ view: 'modes', state: 'ready', modes: MODES, nameOf, can: { request: true }, onSearch: search, onRequest: fn(), ...over });

describe('PAY-10 live · payment modes (new design, founder decision 3)', () => {
  it('lists cash and cheque people with their approval status', () => {
    render(<PaymentsScreen live={modesLive()} />);
    expect(screen.getByRole('heading', { name: 'Payment modes' })).toBeInTheDocument();
    expect(screen.getByText('Sridhar Fernandes')).toBeInTheDocument();
    expect(screen.getByText('Waiting for approval')).toBeInTheDocument();
  });

  it('asking: pressed too early shows the errors and focuses the person; then sends for approval with a toast', async () => {
    const live = modesLive();
    render(<PaymentsScreen live={live} />);
    await ue.click(screen.getByRole('button', { name: 'Ask for a payment mode' }));
    await ue.click(screen.getByRole('button', { name: 'Send for approval' }));
    expect(screen.getByText('Choose the person.')).toBeInTheDocument();
    expect(live.onRequest).not.toHaveBeenCalled();
    await ue.click(screen.getByRole('button', { name: 'Search' }));
    await ue.click(await screen.findByRole('button', { name: /Divya Raghunathan/ }));
    await ue.click(screen.getByRole('radio', { name: 'Cheque' }));
    await ue.type(within(screen.getByRole('dialog')).getByLabelText(/^From/), '2026-11-01');
    await ue.type(screen.getByRole('textbox', { name: /Why/ }), 'Account frozen by the bank');
    await ue.click(screen.getByRole('button', { name: 'Send for approval' }));
    await waitFor(() => expect(live.onRequest).toHaveBeenCalledWith({ employeeId: 'p2', mode: 'cheque', validFrom: '2026-11-01', reason: 'Account frozen by the bank' }));
    expect((await screen.findAllByText('Sent for approval')).length).toBeGreaterThan(0);
  });

  it('without the right there is no Ask button; empty and no-access states (negative)', () => {
    const { rerender } = render(<PaymentsScreen live={modesLive({ can: { request: false } })} />);
    expect(screen.queryByRole('button', { name: 'Ask for a payment mode' })).not.toBeInTheDocument();
    rerender(<PaymentsScreen live={modesLive({ modes: [] })} />);
    expect(screen.getByText('Everyone is paid by bank transfer')).toBeInTheDocument();
    rerender(<PaymentsScreen live={modesLive({ state: 'no-access', modes: null })} />);
    expect(screen.queryByRole('button', { name: 'Ask for a payment mode' })).not.toBeInTheDocument();
  });

  it('the design story’s "Payment modes" tab is the same panel', async () => {
    render(<PaymentsScreen tab="modes" />);
    expect(screen.getByRole('tab', { name: /Payment modes/, selected: true })).toBeInTheDocument();
    expect(screen.getByText('Waiting for approval')).toBeInTheDocument();
  });
});
