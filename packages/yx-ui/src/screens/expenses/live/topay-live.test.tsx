import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { paymentText } from './claims';
import { ToPayLiveScreen, type ToPayLiveScreenProps } from './topay';
import { JOURNAL, TO_PAY } from './topay-fixtures';

// To pay (EXP-06, XP-3.08): payroll or a bank file, release by someone else, the bank's results, the journal.
const ue = userEvent.setup({ pointerEventsCheck: 0 });
const props = (over: Partial<ToPayLiveScreenProps> = {}): ToPayLiveScreenProps => ({
  state: 'ready',
  data: TO_PAY,
  journal: JOURNAL,
  journalEntity: 'e1',
  journalMonth: '2026-10',
  onJournal: vi.fn(),
  onToPayroll: vi.fn(async () => ({ moved: 1, refused: [] })),
  onPayout: vi.fn(async () => ({ rows: 2, total: '5314.00', phrase: 'RELEASE 2', excluded: [] })),
  onDownload: vi.fn(async () => ({})),
  onRelease: vi.fn(async () => ({})),
  onCancel: vi.fn(async () => ({})),
  onResults: vi.fn(async () => ({})),
  onExportJournal: vi.fn(async () => ({})),
  onPosted: vi.fn(async () => ({})),
  ...over,
});

describe('To pay (EXP-06)', () => {
  it('waiting claims go to a bank file with the account they are paid from; errors show only after trying', async () => {
    const p = props();
    render(<ToPayLiveScreen {...p} />);
    expect(screen.getByRole('radiogroup', { name: 'Show' })).toBeInTheDocument();
    expect(screen.getByText('Account closed')).toBeInTheDocument();
    for (const box of screen.getAllByRole('checkbox', { name: /Select/ }).slice(1)) await ue.click(box);
    await ue.click(screen.getByRole('button', { name: 'Pay by bank file' }));
    expect(screen.queryByText(/Fix these/)).not.toBeInTheDocument();
    await ue.click(screen.getByRole('button', { name: 'Make bank file' }));
    expect(screen.getByText(/Fix these/)).toBeInTheDocument();
    await ue.type(screen.getByRole('textbox', { name: /Pay from account/ }), '00123456789');
    await ue.click(screen.getByRole('button', { name: 'Make bank file' }));
    await waitFor(() => expect(p.onPayout).toHaveBeenCalledWith(['c1', 'c2'], '00123456789'));
    expect(await screen.findByText(/Someone else releases it/)).toBeInTheDocument();
  });

  it('bank files: the maker cannot release; release needs the typed phrase; results need the bank’s reason for a failure', async () => {
    const p = props();
    render(<ToPayLiveScreen {...p} />);
    await ue.click(screen.getByRole('tab', { name: /Bank files/ }));
    await ue.click(screen.getByRole('button', { name: 'Release' }));
    const confirm = screen.getAllByRole('button', { name: 'Release' }).pop()!;
    expect(confirm).toBeDisabled();
    await ue.type(screen.getByRole('textbox', { name: /Type/ }), 'RELEASE 1');
    await ue.click(confirm);
    await waitFor(() => expect(p.onRelease).toHaveBeenCalledWith(TO_PAY.batches[0], 'RELEASE 1'));
    await ue.click(screen.getByRole('button', { name: 'Record results' }));
    await ue.click(screen.getByRole('radio', { name: 'Came back' }));
    await ue.click(screen.getAllByRole('button', { name: 'Record results' }).pop()!);
    expect(p.onResults).not.toHaveBeenCalled();
    await ue.type(screen.getByRole('textbox', { name: /Reason from the bank/ }), 'Account frozen');
    await ue.click(screen.getAllByRole('button', { name: 'Record results' }).pop()!);
    await waitFor(() => expect(p.onResults).toHaveBeenCalledWith(TO_PAY.batches[1], [{ claimId: 'c5', status: 'returned', reason: 'Account frozen' }]));
  });

  it('the journal cannot be exported while a code is unmapped', async () => {
    const p = props();
    const { rerender } = render(<ToPayLiveScreen {...p} />);
    await ue.click(screen.getByRole('tab', { name: 'Journal' }));
    expect(screen.getByText(/exp._bank/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Export journal (CSV)' })).toBeDisabled();
    rerender(<ToPayLiveScreen {...p} journal={{ ...JOURNAL, unmapped: [], lines: JOURNAL.lines.filter((l) => l.accountCode !== 'UNMAPPED'), exports: [{ id: 'j1', status: 'exported', sha256: 'c'.repeat(64), createdAt: '2026-10-12T10:00:00Z', postedAt: null }] }} />);
    await ue.click(screen.getByRole('button', { name: 'Export journal (CSV)' }));
    await waitFor(() => expect(p.onExportJournal).toHaveBeenCalled());
    await ue.click(screen.getByRole('button', { name: 'Mark posted' }));
    await waitFor(() => expect(p.onPosted).toHaveBeenCalledWith('j1'));
  });

  it('U62: the employee is told where the money comes from', () => {
    expect(paymentText('in_payroll', { route: 'payroll', month: '2026-10', paidOn: null })).toBe('Approved: payment in the October 2026 payroll.');
    expect(paymentText('payout_queued', { route: 'payout', month: null, paidOn: null })).toBe('Approved: bank transfer queued.');
    expect(paymentText('payment_failed', { route: 'payroll', month: '2026-10', paidOn: null })).toMatch(/payroll pays it again/);
  });
});
