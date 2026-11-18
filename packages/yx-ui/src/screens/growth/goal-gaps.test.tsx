import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { ToastProvider } from '../../components/notify';
import { GoalGapsCard, type GoalGaps } from './goal-gaps';

// Batch F item 30 (answer 2575): who has no goals, whose goals were not updated, and a once-a-day Remind.
const ue = userEvent.setup({ pointerEventsCheck: 0 });
const GAPS: GoalGaps = {
  periodId: 'p',
  days: 30,
  team: 3,
  noGoals: [
    { employeeId: 'a', name: 'Arjun Kulkarni', remindedAt: null, canRemind: true },
    { employeeId: 'm', name: 'Meera Nair', remindedAt: '2026-09-28T04:30:00Z', canRemind: false },
  ],
  notUpdated: [{ employeeId: 's', name: 'Sana Nizami', remindedAt: null, canRemind: true, goals: 3, lastCheckIn: null }],
};

describe('GoalGapsCard', () => {
  it('lists no-goals people; Remind sends once with a toast; reminded today cannot be sent again', async () => {
    const onRemind = vi.fn().mockResolvedValue(undefined);
    render(<ToastProvider><GoalGapsCard gaps={GAPS} onRemind={onRemind} /></ToastProvider>);
    const table = screen.getByRole('table', { name: 'Team members with no goals' });
    await ue.click(within(screen.getByRole('row', { name: /Arjun Kulkarni/ })).getByRole('button', { name: 'Remind' }));
    expect(onRemind).toHaveBeenCalledWith('a', 'no_goals');
    expect((await screen.findAllByText('Reminder sent to Arjun Kulkarni.')).length).toBeGreaterThan(0);
    expect(within(table).getByRole('button', { name: 'Reminded today' })).toBeDisabled();
  });

  it('the Segment switches to not updated (last check-in "Never"); a refusal shows why', async () => {
    const onRemind = vi.fn().mockRejectedValue(new Error('Already reminded in the last day. Try again tomorrow.'));
    render(<ToastProvider><GoalGapsCard gaps={GAPS} onRemind={onRemind} /></ToastProvider>);
    await ue.click(screen.getByRole('radio', { name: /Not updated in 30 days \(1\)/ }));
    const table = screen.getByRole('table', { name: 'Team members whose goals were not updated' });
    expect(within(table).getByText('Never')).toBeInTheDocument();
    await ue.click(within(table).getByRole('button', { name: 'Remind' }));
    await waitFor(() => expect(onRemind).toHaveBeenCalledWith('s', 'not_updated'));
    expect(await screen.findByText(/Already reminded in the last day/)).toBeInTheDocument();
  });

  it('negative: nobody to chase says so', () => {
    render(<ToastProvider><GoalGapsCard gaps={{ ...GAPS, noGoals: [], notUpdated: [] }} onRemind={vi.fn()} /></ToastProvider>);
    expect(screen.getByText('Everyone in your team has goals.')).toBeInTheDocument();
  });
});
