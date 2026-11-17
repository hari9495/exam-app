import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { ToastProvider } from '../../components/notify';
import { SavedExpensesCard, type LiveSavedExpenses } from './expenses-saved';

// Keka ideas (2026-11): expenses saved first, claimed later.
const ue = userEvent.setup({ pointerEventsCheck: 0 });
const wrap = (live: Partial<LiveSavedExpenses> = {}) =>
  render(
    <ToastProvider>
      <SavedExpensesCard
        live={{
          currency: 'INR',
          today: '2026-11-16',
          drafts: [{ id: 'd1', title: 'Hosur plant audit' }],
          items: [
            { id: 's1', spentOn: '2026-11-14', amount: '640.00', categoryCode: null, merchant: 'Cab to airport', description: null, receipt: true, createdAt: '2026-11-14T03:00:00.000Z' },
            { id: 's2', spentOn: '2026-11-12', amount: '120.00', categoryCode: null, merchant: 'Auto to client', description: null, receipt: false, createdAt: '2026-11-12T03:00:00.000Z' },
          ],
          onAdd: vi.fn().mockResolvedValue(undefined),
          onRemove: vi.fn().mockResolvedValue(undefined),
          onClaim: vi.fn().mockResolvedValue(undefined),
          ...live,
        }}
      />
    </ToastProvider>,
  );

describe('Expenses to be claimed (live)', () => {
  it('saves an expense with date and amount; negative: the amount is asked for', async () => {
    const onAdd = vi.fn().mockResolvedValue(undefined);
    wrap({ onAdd });
    await ue.click(screen.getByRole('button', { name: 'Add an expense' }));
    await ue.click(screen.getByRole('button', { name: 'Save expense' }));
    expect(screen.getByText('Enter the amount.')).toBeInTheDocument();
    expect(onAdd).not.toHaveBeenCalled();
    await ue.type(screen.getByRole('textbox', { name: 'Amount' }), '450');
    await ue.type(screen.getByRole('textbox', { name: /Where/ }), 'Tea for visitors');
    await ue.click(screen.getByRole('button', { name: 'Save expense' }));
    expect(onAdd).toHaveBeenCalledWith({ spentOn: '2026-11-16', amount: '450.00', merchant: 'Tea for visitors', description: null, receipt: null });
  });

  it('claims the ticked ones into a new claim or a draft; negative: nothing ticked says so', async () => {
    const onClaim = vi.fn().mockResolvedValue(undefined);
    wrap({ onClaim });
    await ue.click(screen.getByRole('button', { name: 'Claim selected' }));
    expect(onClaim).not.toHaveBeenCalled();
    expect((await screen.findAllByText('Tick the expenses to claim first.')).length).toBeGreaterThan(0);
    await ue.click(screen.getByRole('checkbox', { name: /Cab to airport/ }));
    await ue.click(screen.getByRole('button', { name: 'Claim 1 selected' }));
    const dialog = screen.getByRole('dialog');
    await ue.click(within(dialog).getByRole('button', { name: 'Put in the claim' }));
    expect(within(dialog).getByText('Say what the claim is for, in at least 2 characters.')).toBeInTheDocument();
    await ue.type(within(dialog).getByRole('textbox', { name: /What is the claim for/ }), 'Delhi trip');
    await ue.click(within(dialog).getByRole('button', { name: 'Put in the claim' }));
    expect(onClaim).toHaveBeenCalledWith(['s1'], { title: 'Delhi trip' });
  });

  it('into a draft claim; removing asks first; nothing saved says what to do', async () => {
    const onClaim = vi.fn().mockResolvedValue(undefined);
    const onRemove = vi.fn().mockResolvedValue(undefined);
    const { unmount } = wrap({ onClaim, onRemove });
    await ue.click(screen.getByRole('checkbox', { name: /Auto to client/ }));
    await ue.click(screen.getByRole('button', { name: 'Claim 1 selected' }));
    const dialog = screen.getByRole('dialog');
    await ue.click(within(dialog).getByRole('radio', { name: 'A draft claim' }));
    await ue.click(within(dialog).getByRole('combobox', { name: 'Draft claim' }));
    await ue.click(screen.getByRole('option', { name: 'Hosur plant audit' }));
    await ue.click(within(dialog).getByRole('button', { name: 'Put in the claim' }));
    expect(onClaim).toHaveBeenCalledWith(['s2'], { claimId: 'd1' });
    await ue.click(screen.getByRole('button', { name: 'Remove Cab to airport' }));
    expect(onRemove).not.toHaveBeenCalled();
    await ue.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Remove' }));
    expect(onRemove).toHaveBeenCalledWith('s1');
    unmount();
    wrap({ items: [] });
    expect(screen.getByText('Nothing saved yet.')).toBeInTheDocument();
  });
});

// Answer 2252: with a receipt, a date or amount left empty is read from it when saved.
describe('saved receipt read when saved', () => {
  it('with a receipt the date and amount may be left empty; read ones are marked', async () => {
    const onAdd = vi.fn().mockResolvedValue(undefined);
    wrap({ onAdd, items: [{ id: 's3', spentOn: '2026-11-15', amount: '350.00', categoryCode: null, merchant: 'Cafe Kaveri', description: null, receipt: true, fromReceipt: true, createdAt: '2026-11-15T03:00:00.000Z' }] });
    expect(screen.getByText('Read from receipt')).toBeInTheDocument();
    await ue.click(screen.getByRole('button', { name: 'Add an expense' }));
    await ue.upload(screen.getByLabelText(/Receipt/, { selector: 'input' }), new File(['x'], 'bill.png', { type: 'image/png' }));
    expect(screen.getAllByText('Leave empty to read it from the receipt.').length).toBe(2);
    await ue.click(screen.getByRole('button', { name: 'Save expense' }));
    expect(onAdd).toHaveBeenCalledWith(expect.objectContaining({ spentOn: null, amount: null, receipt: expect.any(File) }));
  });
  it('negative: without a receipt both are asked for and nothing is saved', async () => {
    const onAdd = vi.fn().mockResolvedValue(undefined);
    wrap({ onAdd });
    await ue.click(screen.getByRole('button', { name: 'Add an expense' }));
    expect(screen.queryByText('Leave empty to read it from the receipt.')).toBeNull();
    await ue.click(screen.getByRole('button', { name: 'Save expense' }));
    expect(screen.getByText('Enter the amount.')).toBeInTheDocument();
    expect(onAdd).not.toHaveBeenCalled();
  });
});
