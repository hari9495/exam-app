import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { PreclearanceQueue, TradingPreclearance, type LivePreclearance, type LivePreclearanceQueue, type PreclearanceItem } from './selfservice';

// PPL-44 live: asking for pre-clearance, the decision and its validity, reporting the trade; the officer's queue.

const ue = userEvent.setup({ pointerEventsCheck: 0 });
const day = (iso: string) => new Date(`${iso}T00:00:00`);
const RULES = { threshold: 1000000, validDays: 7, decideDays: 2 };
const item = (o: Partial<PreclearanceItem> = {}): PreclearanceItem => ({
  id: 'p1', name: 'Arjun Kulkarni', referenceNo: 'PC-2026-0114', security: 'Deccan Agro Industries Ltd', side: 'sell', quantity: 350, value: 1225000, status: 'Approved',
  requestedAt: day('2026-09-27'), decidedBy: 'Kavitha Menon', decidedAt: day('2026-09-28'), decisionNote: null, validUntil: day('2026-10-06'), tradedOn: null, ...o,
});
const mine = (o: Partial<LivePreclearance> = {}): LivePreclearance => ({ state: 'ready', onRetry: vi.fn(), rules: RULES, requests: [], onRequest: vi.fn(async () => undefined), onUploadNote: vi.fn(async () => 'note1'), onReport: vi.fn(async () => undefined), ...o });

describe('PPL-44 trading pre-clearance, live', () => {
  it('the company rules in the header; a request needs every field and the UPSI confirmation', async () => {
    const live = mine();
    render(<TradingPreclearance today={day('2026-09-29')} live={live} />);
    expect(screen.getByText('Designated persons need pre-clearance for trades above ₹10,00,000 in a quarter. Approval is valid for 7 trading days.')).toBeInTheDocument();
    const send = screen.getByRole('button', { name: 'Request pre-clearance' });
    await ue.type(screen.getByRole('textbox', { name: /Security/ }), 'Deccan Agro Industries Ltd');
    await ue.click(screen.getByRole('radio', { name: 'Sell' }));
    await ue.type(screen.getByRole('textbox', { name: /^Quantity/ }), '350');
    await ue.type(screen.getByRole('textbox', { name: /Approximate value/ }), '1225000');
    expect(send).toBeDisabled();
    await ue.click(screen.getByRole('checkbox', { name: /unpublished price-sensitive/ }));
    await ue.click(send);
    await waitFor(() => expect(live.onRequest).toHaveBeenCalledWith({ security: 'Deccan Agro Industries Ltd', side: 'sell', quantity: 350, value: 1225000, noUpsi: true }));
  });

  it('approved: the decision and validity; the trade is reported with its contract note', async () => {
    const live = mine({ requests: [item()] });
    const view = render(<TradingPreclearance today={day('2026-09-30')} live={live} />);
    expect(screen.getByText('Sell 350 Deccan Agro Industries Ltd · PC-2026-0114')).toBeInTheDocument();
    expect(screen.getByText('Approved by Kavitha Menon (compliance officer) on 28 Sep 2026')).toBeInTheDocument();
    expect(screen.getByText('6 Oct 2026 (valid)')).toBeInTheDocument();
    const report = screen.getByRole('button', { name: 'Report trade' });
    await ue.type(screen.getByRole('textbox', { name: 'Traded on' }), '29 Sep 2026');
    await ue.tab();
    expect(report).toBeDisabled();
    await ue.upload(view.container.querySelector('input[type="file"]') as HTMLInputElement, new File(['%PDF'], 'note.pdf', { type: 'application/pdf' }));
    await waitFor(() => expect(live.onUploadNote).toHaveBeenCalled());
    await ue.click(report);
    await waitFor(() => expect(live.onReport).toHaveBeenCalledWith('p1', { tradedOn: '2026-09-29', quantity: 350, contractNoteDocumentId: 'note1' }));
  });

  it('pending waits for the officer; expired says to report or ask again; New request opens the form', async () => {
    const { unmount } = render(<TradingPreclearance today={day('2026-09-30')} live={mine({ requests: [item({ status: 'Pending', decidedAt: null, decidedBy: null, validUntil: null })] })} />);
    expect(screen.getByText('Waiting for the compliance officer, who decides within 2 working days')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'New request' })).toBeNull();
    unmount();
    render(<TradingPreclearance today={day('2026-10-20')} live={mine({ requests: [item({ status: 'Expired' })] })} />);
    expect(screen.getByText('The window ended without a trade report. Report the trade if you made it, or request again.')).toBeInTheDocument();
    await ue.click(screen.getByRole('button', { name: 'New request' }));
    expect(screen.getByRole('button', { name: 'Request pre-clearance' })).toBeInTheDocument();
    await ue.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(screen.queryByRole('button', { name: 'Request pre-clearance' })).toBeNull();
  });
});

describe('PPL-44 compliance officer queue, live', () => {
  const queue = (o: Partial<LivePreclearanceQueue> = {}): LivePreclearanceQueue => ({ state: 'ready', onRetry: vi.fn(), rules: RULES, rows: [item({ status: 'Pending', decidedAt: null, decidedBy: null, validUntil: null }), item({ id: 'p2', name: 'Sana Nizami', status: 'Done' })], onDecide: vi.fn(async () => undefined), ...o });

  it('approves, and rejects only with a reason', async () => {
    const live = queue();
    render(<PreclearanceQueue live={live} />);
    expect(screen.getByText('Decide within 2 working days. Approvals are valid for 7 trading days.')).toBeInTheDocument();
    expect(within(screen.getByRole('row', { name: /Sana Nizami/ })).queryByRole('button', { name: 'Approve' })).toBeNull();
    await ue.click(screen.getByRole('button', { name: 'Approve' }));
    await waitFor(() => expect(live.onDecide).toHaveBeenCalledWith('p1', true));
    await ue.click(screen.getByRole('button', { name: 'Reject' }));
    const dialog = screen.getByRole('dialog');
    expect(within(dialog).getByRole('button', { name: 'Reject' })).toBeDisabled();
    await ue.type(within(dialog).getByRole('textbox'), 'Results week');
    await ue.click(within(dialog).getByRole('button', { name: 'Reject' }));
    await waitFor(() => expect(live.onDecide).toHaveBeenCalledWith('p1', false, 'Results week'));
  });
});
