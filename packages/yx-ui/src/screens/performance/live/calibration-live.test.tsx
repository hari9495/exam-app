import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { CalibrationSessions } from './calibration';

// Performance batch PM6 screens (M06-BUILD-DESIGN §11, §13; PRF-09; PM-6.04).

const ue = userEvent.setup({ pointerEventsCheck: 0 });
const ok = async () => ({});

describe('Calibration (PM6)', () => {
  it('a session needs a guide that adds up to 100 when one is used', async () => {
    const onCreate = vi.fn(ok);
    render(<CalibrationSessions sessions={[]} departments={[]} facilitators={[{ value: 'u1', label: 'Lakshmi' }]} bands={['Below', 'Above']} onOpen={vi.fn()} onCreate={onCreate} />);
    await ue.click(screen.getByRole('button', { name: 'Open a session' }));
    const d = screen.getByRole('dialog');
    await ue.type(within(d).getByRole('textbox', { name: /^Name/ }), 'Sales');
    await ue.click(within(d).getByRole('combobox', { name: 'Facilitator' }));
    await ue.click(screen.getByRole('option', { name: 'Lakshmi' }));
    await ue.click(within(d).getByRole('radio', { name: 'Use a guide' }));
    await ue.type(within(d).getByRole('textbox', { name: /^Below/ }), '30');
    await ue.click(within(d).getByRole('button', { name: 'Open' }));
    expect(within(d).getByText('Make the shares add up to 100 (now 30).')).toBeInTheDocument();
    expect(onCreate).not.toHaveBeenCalled();
    await ue.type(within(d).getByRole('textbox', { name: /^Above/ }), '70');
    await ue.click(within(d).getByRole('button', { name: 'Open' }));
    expect(onCreate).toHaveBeenCalledWith({ name: 'Sales', facilitatorUserId: 'u1', departmentIds: [], guide: { bands: [{ label: 'Below', share: 30 }, { label: 'Above', share: 70 }], tolerance: 10 } });
  });
});
