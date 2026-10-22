import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { ToastProvider } from '../../../components/notify';
import { PayrollBudgetScreen, type PayrollBudget } from './budget';

const MONTHS = ['2026-04', '2026-05', '2026-06', '2026-07', '2026-08', '2026-09', '2026-10', '2026-11', '2026-12', '2027-01', '2027-02', '2027-03'];
const budget = (canEdit: boolean): PayrollBudget => ({
  entityId: 'kf',
  taxYear: '2026-27',
  canEdit,
  months: MONTHS.map((month, i) => ({ month, budget: i < 2 ? '21400000.00' : null, cost: i === 0 ? '20850000.00' : null, changedBy: i < 2 ? 'Suresh Pillai' : null, changedOn: i < 2 ? '2026-04-02' : null })),
});
const show = (canEdit: boolean, onSave = vi.fn(async () => ({}))) => {
  render(
    <ToastProvider>
      <PayrollBudgetScreen state="ready" entities={[{ id: 'kf', name: 'Kaveri Foods Pvt Ltd', shortName: 'KFPL', keys: ['payroll.setup.manage'] }]} entityId="kf" onEntity={() => {}} taxYears={['2026-27']} taxYear="2026-27" onTaxYear={() => {}} budget={budget(canEdit)} onSave={onSave} />
    </ToastProvider>,
  );
  return onSave;
};

describe('Payroll budget (21 Oct 2026)', () => {
  it('shows each month with the cost beside it, and how far over or under', () => {
    show(false);
    const april = screen.getByRole('row', { name: /April 2026/ });
    expect(april).toHaveTextContent('₹2,14,00,000');
    expect(april).toHaveTextContent('₹2,08,50,000');
    expect(april).toHaveTextContent('₹5,50,000 under');
    expect(april).toHaveTextContent('Suresh Pillai, 2 Apr 2026');
    expect(screen.getByRole('row', { name: /June 2026/ })).toHaveTextContent('No budget');
    // Read only: no fields and no Save.
    expect(screen.queryByRole('textbox')).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Save budget' })).not.toBeInTheDocument();
  });

  it('saves only the months that changed, with Indian commas allowed and an empty month cleared, then says so', async () => {
    const onSave = show(true);
    const save = screen.getByRole('button', { name: 'Save budget' });
    expect(save).toBeDisabled();
    await userEvent.type(screen.getByRole('textbox', { name: 'Budget for June 2026' }), '2,14,00,000');
    await userEvent.clear(screen.getByRole('textbox', { name: 'Budget for May 2026' }));
    await userEvent.click(save);
    await waitFor(() => expect(onSave).toHaveBeenCalledWith([{ month: '2026-05', amount: null }, { month: '2026-06', amount: '21400000' }]));
    expect(await screen.findByText('Budget saved for Kaveri Foods Pvt Ltd')).toBeInTheDocument();
  });

  it('refuses an amount that is not rupees', async () => {
    show(true);
    await userEvent.type(screen.getByRole('textbox', { name: 'Budget for July 2026' }), 'two crore');
    expect(screen.getByRole('button', { name: 'Save budget' })).toBeDisabled();
    expect(within(screen.getByRole('table')).getByRole('textbox', { name: 'Budget for July 2026' })).toHaveAttribute('aria-invalid', 'true');
  });
});
