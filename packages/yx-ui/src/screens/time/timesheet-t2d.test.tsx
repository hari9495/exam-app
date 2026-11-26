import { render, screen, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { TimesheetActivityCard } from './ops';
import { T2D_ACTIVITY, T2D_PROJECTS } from './timesheet-t2d-samples';

// T2-D 62: the week's Activity card.

describe('T2-D 62 Activity', () => {
  it('shows each event newest first with who, and the reason for a reduced line', () => {
    render(<TimesheetActivityCard activity={T2D_ACTIVITY} projects={T2D_PROJECTS} />);
    const items = within(screen.getByRole('list', { name: 'Timesheet activity' })).getAllByRole('listitem');
    expect(items.map((li) => li.querySelector('strong')?.textContent)).toEqual(['NRP · Build reduced', 'Sent to the project manager', 'Recalled to edit', 'Sent to the project manager']);
    expect(items[0]).toHaveTextContent('Suresh Iyer · Reason: Offsite on Tuesday');
  });

  it('negative: a week with no events shows no card', () => {
    render(<TimesheetActivityCard activity={[]} projects={T2D_PROJECTS} />);
    expect(screen.queryByText('Activity')).toBeNull();
    expect(screen.queryByRole('list', { name: 'Timesheet activity' })).toBeNull();
  });
});
