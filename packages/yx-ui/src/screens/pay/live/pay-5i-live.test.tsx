import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { PayRunsScreen } from './runs';
import { MyEwaScreen } from './special';
import { periodsOf } from './types-5j';

const ue = userEvent.setup({ pointerEventsCheck: 0 });

describe('batch 5i screens', () => {
  it('weekly periods match the API calendar: from the anchor, cut at month ends', () => {
    expect(periodsOf('weekly', '2026-09-28', '2026-10').map((x) => [x.from, x.to])).toEqual([
      ['2026-10-01', '2026-10-04'],
      ['2026-10-05', '2026-10-11'],
      ['2026-10-12', '2026-10-18'],
      ['2026-10-19', '2026-10-25'],
      ['2026-10-26', '2026-10-31'],
    ]);
  });

  it('a weekly group’s run asks for its pay period; the choice is sent with the run', async () => {
    const onCreate = vi.fn(async () => ({ id: 'r1' }));
    render(<PayRunsScreen state="ready" runs={[]} groups={[{ id: 'g1', name: 'Weekly workers', legalEntityId: 'e1', frequency: 'weekly', anchorDate: '2026-09-28' }]} thisMonth="2026-10" canPrepare canOffcycle={false} onCreate={onCreate} onOpen={vi.fn()} />);
    await ue.click(screen.getAllByRole('button', { name: 'New run' })[0]);
    await ue.click(screen.getByRole('button', { name: 'Create run' }));
    expect(screen.getAllByText(/Choose the pay period/).length).toBeGreaterThan(0);
    expect(onCreate).not.toHaveBeenCalled();
    await ue.click(screen.getByRole('combobox', { name: /Pay period/ }));
    await ue.click(await screen.findByRole('option', { name: /26 Oct 2026 to 31 Oct 2026/ }));
    await ue.click(screen.getByRole('button', { name: 'Create run' }));
    await waitFor(() => expect(onCreate).toHaveBeenCalledWith('g1', '2026-10', null, 5));
  });

  it('a draw needs the recovery accepted and stays within what is available', async () => {
    const onDraw = vi.fn(async () => ({}));
    render(<MyEwaScreen data={{ open: true, reasons: [], policy: { minAmount: '500.00', maxAmount: '20000.00', fee: '49.00', feePayer: 'employee', drawsPerMonth: 3 }, quote: { expectedNet: '30000.00', payableDays: '12.00', monthDays: 30, drawn: '0.00', deductionsDue: '0.00', earned: '12000.00', available: '6000' }, draws: [] }} onDraw={onDraw} />);
    await ue.click(screen.getByRole('button', { name: 'Draw now' }));
    await ue.type(screen.getByRole('textbox', { name: /Amount/ }), '7000');
    await ue.click(screen.getByRole('button', { name: 'Ask for it' }));
    expect(screen.getByText(/Fix these/)).toBeInTheDocument();
    expect(onDraw).not.toHaveBeenCalled();
    await ue.clear(screen.getByRole('textbox', { name: /Amount/ }));
    await ue.type(screen.getByRole('textbox', { name: /Amount/ }), '5000');
    await ue.click(screen.getByRole('checkbox', { name: /taken from this month/ }));
    await ue.click(screen.getByRole('button', { name: 'Ask for it' }));
    await waitFor(() => expect(onDraw).toHaveBeenCalledWith('5000'));
  });
});
