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

  it('answer 2845: the company guide fills a new session, which can still be changed or dropped', async () => {
    const onCreate = vi.fn(ok);
    const guide = { bands: [{ label: 'Below', share: 20 }, { label: 'Above', share: 80 }], tolerance: 5 };
    render(<CalibrationSessions sessions={[]} departments={[]} facilitators={[{ value: 'u1', label: 'Lakshmi' }]} bands={['Below', 'Above']} defaultGuide={guide} onOpen={vi.fn()} onCreate={onCreate} />);
    await ue.click(screen.getByRole('button', { name: 'Open a session' }));
    const d = screen.getByRole('dialog');
    expect(within(d).getByRole('radio', { name: 'Use a guide' })).toBeChecked();
    expect(within(d).getByText(/Filled from the company guide/)).toBeInTheDocument();
    await ue.type(within(d).getByRole('textbox', { name: /^Name/ }), 'Sales');
    await ue.click(within(d).getByRole('combobox', { name: 'Facilitator' }));
    await ue.click(screen.getByRole('option', { name: 'Lakshmi' }));
    // Changed for this session: 30/70 instead of 20/80.
    await ue.clear(within(d).getByRole('textbox', { name: /^Below/ }));
    await ue.type(within(d).getByRole('textbox', { name: /^Below/ }), '30');
    await ue.click(within(d).getByRole('button', { name: 'Open' }));
    expect(within(d).getByText('Make the shares add up to 100 (now 110).')).toBeInTheDocument();
    expect(onCreate).not.toHaveBeenCalled();
    await ue.clear(within(d).getByRole('textbox', { name: /^Above/ }));
    await ue.type(within(d).getByRole('textbox', { name: /^Above/ }), '70');
    await ue.click(within(d).getByRole('button', { name: 'Open' }));
    expect(onCreate).toHaveBeenLastCalledWith({ name: 'Sales', facilitatorUserId: 'u1', departmentIds: [], guide: { bands: [{ label: 'Below', share: 30 }, { label: 'Above', share: 70 }], tolerance: 5 } });
  });

  it('answer 2845: without a company guide the form starts with none, and a session may drop the filled guide', async () => {
    const onCreate = vi.fn(ok);
    render(<CalibrationSessions sessions={[]} departments={[]} facilitators={[{ value: 'u1', label: 'Lakshmi' }]} bands={['Below', 'Above']} defaultGuide={{ bands: [{ label: 'Below', share: 50 }, { label: 'Above', share: 50 }], tolerance: 10 }} onOpen={vi.fn()} onCreate={onCreate} />);
    await ue.click(screen.getByRole('button', { name: 'Open a session' }));
    const d = screen.getByRole('dialog');
    await ue.type(within(d).getByRole('textbox', { name: /^Name/ }), 'Ops');
    await ue.click(within(d).getByRole('combobox', { name: 'Facilitator' }));
    await ue.click(screen.getByRole('option', { name: 'Lakshmi' }));
    await ue.click(within(d).getByRole('radio', { name: 'None' }));
    await ue.click(within(d).getByRole('button', { name: 'Open' }));
    expect(onCreate).toHaveBeenCalledWith({ name: 'Ops', facilitatorUserId: 'u1', departmentIds: [], guide: null });
  });
});
