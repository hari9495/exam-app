import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { ContinuityChecklistPanel, type LiveContinuity } from './changes';

// PPL-10 live: a move's continuity checklist, the designed panel on the journey's tasks.

const ue = userEvent.setup({ pointerEventsCheck: 0 });
const day = (iso: string) => new Date(`${iso}T00:00:00`);
const live = (o: Partial<LiveContinuity> = {}): LiveContinuity => ({
  state: 'ready',
  onRetry: vi.fn(),
  person: 'Rahul Sharma',
  from: 'Kaveri Foods Pvt Ltd',
  to: 'Kaveri Foods Pvt Ltd (Tamil Nadu)',
  effective: day('2026-10-05'),
  rows: [
    { id: 'u', title: 'PF UAN transfer (same UAN, Form 13 or EPFO auto-transfer)', owner: 'Payroll · Suresh Pillai', due: day('2026-10-20'), status: 'Pending', canDone: true },
    { id: 'g', title: 'Gratuity for the service so far (service restarts)', owner: 'Payroll', due: day('2026-10-05'), status: 'Done', note: 'Service continues: one payout at the final exit.', canDone: false },
  ],
  onDone: vi.fn(async () => undefined),
  ...o,
});

describe('PPL-10 continuity checklist, live', () => {
  it('shows the move, the open items for payroll pre-flight and the reasons items closed; an owner marks theirs done', async () => {
    const l = live();
    render(<ContinuityChecklistPanel today={day('2026-10-06')} live={l} />);
    expect(screen.getByText('Inter-entity transfer · Rahul Sharma')).toBeTruthy();
    expect(screen.getByText(/Kaveri Foods Pvt Ltd → Kaveri Foods Pvt Ltd \(Tamil Nadu\) · effective/)).toBeTruthy();
    const drawer = await screen.findByRole('dialog');
    expect(within(drawer).getByText('1 items open · shown in payroll pre-flight')).toBeTruthy();
    expect(within(drawer).getByText('Open items show in payroll pre-flight for Kaveri Foods Pvt Ltd (Tamil Nadu).')).toBeTruthy();
    expect(within(drawer).getByText('Service continues: one payout at the final exit.')).toBeTruthy();
    // Only the open item the viewer owns has the action.
    expect(within(drawer).getAllByRole('button', { name: 'Mark done' })).toHaveLength(1);
    await ue.click(within(drawer).getByRole('button', { name: 'Mark done' }));
    expect(l.onDone).toHaveBeenCalledWith('u');
  });

  it('all done says so; no access and errors say what to do, never an empty list', async () => {
    const { unmount } = render(<ContinuityChecklistPanel today={day('2026-10-06')} live={live({ rows: [{ id: 'g', title: 'Gratuity', owner: 'Payroll', due: day('2026-10-05'), status: 'Done', canDone: false }] })} />);
    expect(await screen.findByText('All items done')).toBeTruthy();
    expect(screen.queryByText(/Open items show/)).toBeNull();
    unmount();
    const { unmount: u2 } = render(<ContinuityChecklistPanel today={day('2026-10-06')} live={live({ state: 'no-access', rows: [] })} />);
    expect(screen.queryByText('Continuity items')).toBeNull();
    expect(screen.getByText(/this checklist/)).toBeTruthy();
    u2();
    const onRetry = vi.fn();
    render(<ContinuityChecklistPanel today={day('2026-10-06')} live={live({ state: 'error', onRetry, rows: [] })} />);
    await ue.click(screen.getByRole('button', { name: 'Retry' }));
    expect(onRetry).toHaveBeenCalled();
  });
});
