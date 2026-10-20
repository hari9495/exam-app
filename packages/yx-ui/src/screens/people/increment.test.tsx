import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { BulkChangesWizard } from './changes';
import type { IncrementResult, LiveIncrement } from './increment';

const ue = userEvent.setup({ pointerEventsCheck: 0, delay: null });
const RESULT: IncrementResult = {
  people: [{ employeeId: 'e1', name: 'Arjun Kulkarni', code: 'KF-0142', department: 'Quality', grade: 'G5', rating: 'Exceeds', currentCtc: '850000.00', percent: '7.25', newCtc: '911625.00' }],
  leftOut: [{ employeeId: 'e3', name: 'Nikhil Rao', rating: null, why: 'No released rating in FY 2025-26 annual review.' }],
  ratingCycles: [{ id: 'fy26', name: 'FY 2025-26 annual review' }],
  ratingCycleId: 'fy26',
  bands: ['Exceeds'],
  rows: [{ employeeId: 'e1', ok: true, error: null }],
  errors: 0,
};
const live = (over: Partial<LiveIncrement> = {}): LiveIncrement => ({
  entities: [{ value: 'kf', label: 'Kaveri Foods Pvt Ltd' }],
  departments: [{ value: 'q', label: 'Quality' }],
  today: new Date(2026, 9, 20),
  canRate: true,
  onCheck: vi.fn(async () => RESULT),
  onSend: vi.fn(async () => undefined),
  ...over,
});

describe('Annual increment, live (PPL-06)', () => {
  it('checks the people once the date is set, says who has no rating, and sends the rule', async () => {
    const l = live();
    render(<BulkChangesWizard live={l} />);
    await ue.click(screen.getByRole('textbox', { name: /Effective date/ }));
    await ue.keyboard('01/11/2026{Enter}');
    await waitFor(() => expect(l.onCheck).toHaveBeenCalled(), { timeout: 3000 });
    expect(vi.mocked(l.onCheck).mock.calls[0][0]).toMatchObject({ legalEntityId: 'kf', mode: 'rating', byRating: [], reason: 'Annual increment' });
    expect(await screen.findByText(/1 person matches\. 1 is left out\./)).toBeInTheDocument();
    await ue.click(screen.getByRole('button', { name: 'See who' }));
    expect(within(screen.getByRole('dialog')).getByText('No released rating in FY 2025-26 annual review.')).toBeInTheDocument();
  });

  it('without perf.review.view there is only one raise for everyone', () => {
    render(<BulkChangesWizard live={live({ canRate: false })} />);
    expect(screen.queryByRole('radiogroup', { name: 'Raise by' })).toBeNull();
  });
});
