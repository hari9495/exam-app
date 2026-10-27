import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { ToastProvider } from '../../components/notify';
import { JourneyRecord, type LivePreboardAction } from './onboarding';
import type { Journey } from './live/types';

// PPL-15 live: the journey record's Change status opens the designed drawer; postpone previews the moved tasks,
// the unwind says what is cancelled, and only a withdrawal must give a reason.

const ue = userEvent.setup({ pointerEventsCheck: 0 });
const day = (iso: string) => new Date(`${iso}T00:00:00`);
const JOURNEY: Journey = { id: 'jr1', kind: 'onboarding', person: 'Sneha Pillai', personId: 'p1', subjectType: 'preboarding', subjectId: 'j1', anchorOn: '2026-10-19', status: 'active', progress: 0, template: 'Standard onboarding', owner: null, canManage: true, today: '2026-10-09', tasks: [] };

function page(over: Partial<LivePreboardAction> = {}, journey: Partial<Journey> = {}) {
  const preboard: LivePreboardAction = {
    joiningOn: day('2026-10-19'),
    today: day('2026-10-09'),
    tasks: [
      { id: 't1', title: 'Call the joiner before day one', dueOn: day('2026-10-16'), done: false },
      { id: 't2', title: 'Laptop or work device', dueOn: day('2026-10-12'), done: true },
    ],
    fromOffer: true,
    rehire: null,
    onPostpone: vi.fn(async () => {}),
    onCancel: vi.fn(async () => {}),
    ...over,
  };
  render(
    <ToastProvider>
      <JourneyRecord tasks={[]} joining={day('2026-10-19')} today={day('2026-10-09')} live={{ state: 'ready', onRetry: () => {}, journey: { ...JOURNEY, ...journey }, actions: { onComplete: vi.fn(), onSkip: vi.fn() }, preboard }} />
    </ToastProvider>,
  );
  return preboard;
}
const drawer = () => screen.getByRole('dialog');

describe('PPL-15 pre-boarding actions, live', () => {
  it('postpone: needs a date, previews open tasks moving and done tasks staying, then sends the new date', async () => {
    const p = page();
    await ue.click(screen.getByRole('button', { name: 'Change status' }));
    expect(within(drawer()).getByText('Change pre-boarding for Sneha Pillai')).toBeInTheDocument();
    await ue.click(within(drawer()).getByRole('button', { name: 'Postpone joining' }));
    expect(within(drawer()).getByText('Pick the new joining date.')).toBeInTheDocument();
    expect(p.onPostpone).not.toHaveBeenCalled();
    await ue.type(within(drawer()).getByLabelText(/New joining date/), '26/10/2026');
    await ue.click(within(drawer()).getByText('Open tasks re-anchor; done tasks stay'));
    const rows = within(drawer()).getAllByRole('row');
    expect(within(rows[1]).getByText('23 Oct 2026')).toBeInTheDocument();
    expect(within(rows[2]).getByText('Done')).toBeInTheDocument();
    await ue.click(within(drawer()).getByRole('button', { name: 'Postpone joining' }));
    expect(p.onPostpone).toHaveBeenCalledWith('2026-10-26');
  });

  it('withdraw: a reason is required; reneged may go without one; the unwind says what is cancelled', async () => {
    const p = page({ rehire: { first: 'Sneha', code: 'KF-0077' } });
    await ue.click(screen.getByRole('button', { name: 'Change status' }));
    await ue.click(within(drawer()).getByRole('radio', { name: /Withdraw offer/ }));
    expect(within(drawer()).getByText(/The candidate's offer is marked withdrawn in Hiring/)).toBeInTheDocument();
    expect(within(drawer()).getByText(/code KF-0077 and UAN stay as they were/)).toBeInTheDocument();
    await ue.click(within(drawer()).getByRole('button', { name: 'Withdraw offer' }));
    expect(within(drawer()).getByText('Enter a reason. It is kept on the record and the audit log.')).toBeInTheDocument();
    expect(p.onCancel).not.toHaveBeenCalled();
    await ue.click(within(drawer()).getByRole('radio', { name: /Reneged/ }));
    await ue.click(within(drawer()).getByRole('button', { name: 'Record reneged' }));
    expect(p.onCancel).toHaveBeenCalledWith('reneged', '');
  });

  it('shows the server refusal in the drawer', async () => {
    page({ onCancel: vi.fn(async () => Promise.reject(new Error('"Did not join" is for on or after the joining day.'))) });
    await ue.click(screen.getByRole('button', { name: 'Change status' }));
    await ue.click(within(drawer()).getByRole('radio', { name: /Did not join/ }));
    await ue.click(within(drawer()).getByRole('button', { name: 'Mark did not join' }));
    expect(await within(drawer()).findByText(/is for on or after the joining day/)).toBeInTheDocument();
  });

  it('a cancelled checklist has no Change status', () => {
    page({}, { status: 'cancelled' });
    expect(screen.queryByRole('button', { name: 'Change status' })).toBeNull();
  });
});
