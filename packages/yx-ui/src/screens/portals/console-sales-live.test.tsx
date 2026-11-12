import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { ToastProvider } from '../../components/notify';
import { SalesAssistScreen } from './console-ops';
import type { LiveSales, SalesLiveRow } from './console-sales-live';
import { TalkToUsLiveDialog } from '../platform-b/growth-screens';

// Console C-8, YX-13 and answer 1210: the live sales-assist queue and Talk to us.
const wrap = (ui: React.ReactElement) => render(<ToastProvider>{ui}</ToastProvider>);
const NOW = new Date(2026, 10, 13, 10, 0);
const row = (o: Partial<SalesLiveRow> = {}): SalesLiveRow => ({ id: 'r1', ref: 'SA-012', company: 'Coromandel Logistics', band: '200–500', why: 'Talk to us: Access requests · pricing for their size', setupPct: 40, owner: null, mine: false, dueAt: new Date(2026, 10, 13, 16, 0).toISOString(), status: 'open', requestedBy: 'Meena Pillai', phone: '9845012345', note: null, outcomeNote: null, createdAt: new Date(2026, 10, 12, 16, 0).toISOString(), version: 1, ...o });
const live = (o: Partial<LiveSales> = {}): LiveSales => ({ state: 'ready', onRetry: () => {}, now: NOW, rows: [row()], onTake: vi.fn().mockResolvedValue(undefined), onOutcome: vi.fn().mockResolvedValue(undefined), ...o });
const show = (l: LiveSales) => wrap(<SalesAssistScreen rows={[]} now={NOW} live={l} />);

describe('Sales assist (live)', () => {
  it('lists requests with size band, set-up, reply time; an unowned one is taken', async () => {
    const onTake = vi.fn().mockResolvedValue(undefined);
    show(live({ onTake, rows: [row(), row({ id: 'r2', ref: 'SA-010', company: 'Hampi Hotels', owner: 'Kavitha Rao', dueAt: new Date(2026, 10, 12, 9).toISOString() })] }));
    expect(screen.getByText('Coromandel Logistics')).toBeInTheDocument();
    expect(screen.getAllByText('40%').length).toBeGreaterThan(0);
    expect(screen.getByText('Breached')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Take' }));
    await waitFor(() => expect(onTake).toHaveBeenCalledWith('r1'));
  });

  it('someone else owns it: no outcome to record', async () => {
    show(live({ rows: [row({ owner: 'Kavitha Rao' })], defaultOpen: 'r1' }));
    const drawer = await screen.findByRole('dialog');
    expect(within(drawer).getByText(/only the owner records the outcome/)).toBeInTheDocument();
    expect(within(drawer).queryByRole('button', { name: 'Save outcome' })).toBeNull();
  });

  it('the owner records the outcome; Lost needs a reason', async () => {
    const onOutcome = vi.fn().mockResolvedValue(undefined);
    show(live({ rows: [row({ owner: 'Anand Iyer', mine: true })], defaultOpen: 'r1', onOutcome }));
    const drawer = await screen.findByRole('dialog');
    expect(within(drawer).getByText('+91 9845012345')).toBeInTheDocument();
    await userEvent.click(within(drawer).getByRole('radio', { name: 'Lost' }));
    await userEvent.click(within(drawer).getByRole('button', { name: 'Save outcome' }));
    expect(within(drawer).getByText('Say why it was lost.')).toBeInTheDocument();
    expect(onOutcome).not.toHaveBeenCalled();
    await userEvent.click(within(drawer).getByRole('radio', { name: 'Demo booked' }));
    await userEvent.click(within(drawer).getByRole('button', { name: 'Save outcome' }));
    await waitFor(() => expect(onOutcome).toHaveBeenCalledWith('r1', 'demo_booked', undefined, 1));
  });
});

describe('Talk to us (answer 1210)', () => {
  it('needs a 10-digit mobile number; then it is sent and says when YukthiX calls', async () => {
    const onSend = vi.fn().mockResolvedValue({ dueAt: new Date(2026, 10, 14, 10, 0).toISOString() });
    wrap(<TalkToUsLiveDialog about="Access requests" onSend={onSend} onClose={() => {}} />);
    const dialog = await screen.findByRole('dialog');
    expect(within(dialog).getByText(/About Access requests/)).toBeInTheDocument();
    await userEvent.click(within(dialog).getByRole('button', { name: 'Ask for a call' }));
    expect(within(dialog).getByText('Give a 10-digit mobile number.')).toBeInTheDocument();
    expect(onSend).not.toHaveBeenCalled();
    await userEvent.type(within(dialog).getByRole('textbox', { name: /Phone/ }), '98450 12345');
    await userEvent.click(within(dialog).getByRole('checkbox', { name: 'Pricing for our size' }));
    await userEvent.click(within(dialog).getByRole('button', { name: 'Ask for a call' }));
    await waitFor(() => expect(onSend).toHaveBeenCalledWith({ phone: '9845012345', topics: ['pricing'] }));
    expect(await screen.findByText(/YukthiX will call you by/)).toBeInTheDocument();
  });
});
