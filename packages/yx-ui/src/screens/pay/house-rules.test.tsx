import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { LopInputScreen } from './payroll-inputs';
import { PieceRateScreen, TipsPoolScreen } from './special-pay';
import { LOP_ROWS } from './pay-data';

const toasted = async (t: string | RegExp) => expect((await screen.findAllByText(t)).length).toBeGreaterThan(0);

// House rules (BUILD-STANDARD 2, 3): a button is never greyed out; pressed too early a toast says why and nothing
// happens; done is a success toast, not a green alert that stays.
describe('Pay designs: never disabled, done is a toast', () => {
  it('LOP: frozen inputs and a row with an error say why; a clean sheet saves with a toast', async () => {
    const u = userEvent.setup();
    const { unmount } = render(<LopInputScreen locked />);
    await u.click(screen.getByRole('button', { name: 'Bulk upload' }));
    await toasted(/Inputs are frozen for September\. Changes now go/);
    expect(screen.queryByRole('dialog')).toBeNull();
    unmount();

    const { unmount: un2 } = render(<LopInputScreen />);
    await u.click(screen.getByRole('button', { name: /^Save LOP for/ }));
    await toasted(/^Fix .+'s row first:/);
    expect(screen.queryByText(/^LOP saved for/)).toBeNull();
    un2();

    render(<LopInputScreen rows={LOP_ROWS.filter((r) => !r.error)} />);
    await u.click(screen.getByRole('button', { name: /^Save LOP for/ }));
    await toasted(/^LOP saved for/);
  });

  it('piece-rate: loading says wait; sent once with a toast, a second press says it is already sent', async () => {
    const u = userEvent.setup();
    const { unmount } = render(<PieceRateScreen state="loading" />);
    await u.click(screen.getByRole('button', { name: 'Send to September run' }));
    await toasted('Wait for the output to load.');
    expect(screen.queryByRole('alertdialog')).toBeNull();
    unmount();

    render(<PieceRateScreen />);
    await u.click(screen.getByRole('button', { name: 'Send to September run' }));
    await u.click(screen.getAllByRole('button', { name: 'Send to September run' }).pop()!);
    await toasted('Sent to the September run');
    await u.click(screen.getByRole('button', { name: 'Sent to September run' }));
    await toasted('Already sent. September output is locked.');
  });

  it('tips: a pool that already exists is not created again', async () => {
    const u = userEvent.setup();
    render(<TipsPoolScreen />);
    await u.click(screen.getByRole('button', { name: /New pool/ }));
    // The default outlet and period may be free; pressing Create twice makes the second one a duplicate.
    await u.click(screen.getByRole('button', { name: 'Create pool' }));
    await u.click(screen.getByRole('button', { name: /New pool/ }));
    await u.click(screen.getByRole('button', { name: 'Create pool' }));
    await toasted('A pool for this outlet and period already exists.');
    expect(screen.getByRole('button', { name: 'Create pool' })).toBeInTheDocument(); // still open: nothing created
  });
});
