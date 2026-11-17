import type { ReactElement } from 'react';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { LopReversalDrawer } from './payroll-inputs';
import { ReverseLop, ReverseLopOpenMonth } from './pay-04-lop-input.stories';

// Batch A item 8 (attendance-leave D15, answer 2315): PAY-04 "Reverse loss of pay", design and live.

const ue = userEvent.setup({ pointerEventsCheck: 0 });
const ASHA = { id: 'e1', name: 'Asha Rao', employeeCode: 'KF-0101' };
const base = { month: '2026-08', monthOpen: false, regulariseHref: '/yx/time/exceptions', onSearch: vi.fn(async () => [ASHA]), onClose: vi.fn() };
const pick = async (dlg: HTMLElement, label: string, text: string) => {
  const f = within(dlg).getByRole('textbox', { name: label });
  await ue.clear(f);
  await ue.type(f, text);
  fireEvent.blur(f);
};

describe('Reverse loss of pay, design', () => {
  it('a locked month: the person, the days and what each should be, then Send to payroll', () => {
    render(<>{(ReverseLop.render as () => ReactElement)()}</>);
    const dlg = screen.getByRole('dialog', { name: 'Reverse loss of pay' });
    expect(within(dlg).getByText(/August 2026 is locked/)).toBeInTheDocument();
    expect(within(dlg).getByRole('button', { name: 'Send to payroll' })).not.toBeDisabled();
    expect(within(dlg).getByText(/2 days go to payroll for approval/)).toBeInTheDocument();
  });
  it('an open month sends HR to regularisation instead', () => {
    render(<>{(ReverseLopOpenMonth.render as () => ReactElement)()}</>);
    const dlg = screen.getByRole('dialog', { name: 'Reverse loss of pay' });
    expect(within(dlg).getByRole('link', { name: 'Go to regularisation' })).toHaveAttribute('href', '#regularisation');
    expect(within(dlg).queryByRole('button', { name: 'Send to payroll' })).toBeNull();
  });
});

describe('Reverse loss of pay, live', () => {
  it('pressed early it names what is missing and sends nothing; filled in it sends the days and shows a toast', async () => {
    const onSend = vi.fn(async () => ({}));
    render(<LopReversalDrawer {...base} onSend={onSend} />);
    const dlg = screen.getByRole('dialog', { name: 'Reverse loss of pay' });
    await ue.click(within(dlg).getByRole('button', { name: 'Send to payroll' }));
    expect(onSend).not.toHaveBeenCalled();
    expect(within(dlg).getAllByText('Choose the person.').length).toBeGreaterThan(0);
    await ue.type(within(dlg).getByRole('textbox', { name: 'Find employee' }), 'Asha');
    await ue.click(within(dlg).getByRole('button', { name: 'Search' }));
    await ue.click(await within(dlg).findByRole('button', { name: 'Asha Rao · KF-0101' }));
    await pick(dlg, 'Day 1', '21 Aug 2026');
    await ue.click(within(dlg).getByRole('button', { name: 'Add a day' }));
    await pick(dlg, 'Day 2', '21 Aug 2026');
    await ue.type(within(dlg).getByRole('textbox', { name: /Reason/ }), 'Kiosk at the plant was offline');
    await ue.click(within(dlg).getByRole('button', { name: 'Send to payroll' }));
    expect(within(dlg).getAllByText('21 Aug 2026 is listed twice.').length).toBeGreaterThan(0);
    expect(onSend).not.toHaveBeenCalled();
    await pick(dlg, 'Day 2', '24 Aug 2026');
    await ue.click(within(dlg).getAllByRole('radio', { name: 'Half day' })[1]!);
    await ue.click(within(dlg).getByRole('button', { name: 'Send to payroll' }));
    await waitFor(() => expect(onSend).toHaveBeenCalledWith({ employeeId: 'e1', days: [{ on: '2026-08-21', shouldBe: 'present' }, { on: '2026-08-24', shouldBe: 'half_day' }], reason: 'Kiosk at the plant was offline' }));
    expect(await screen.findByText('Loss of pay reversal for Asha Rao sent to payroll')).toBeInTheDocument();
  });

  it('a refusal from the server stays in the drawer', async () => {
    const onSend = vi.fn(async () => { throw new Error('A correction for that day is already waiting for approval.'); });
    render(<LopReversalDrawer {...base} onSend={onSend} start={{ who: ASHA, days: [{ on: new Date(2026, 7, 21), shouldBe: 'present', leave: null }], reason: 'Kiosk at the plant was offline' }} />);
    const dlg = screen.getByRole('dialog', { name: 'Reverse loss of pay' });
    await ue.click(within(dlg).getByRole('button', { name: 'Send to payroll' }));
    expect(await within(dlg).findByText('A correction for that day is already waiting for approval.')).toBeInTheDocument();
  });
});
