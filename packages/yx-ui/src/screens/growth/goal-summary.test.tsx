import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { GoalProgressSummary } from './goal-summary';
import { progressSummary, type Goal } from './growth-logic';

// Batch F item 31 (answer 2576): average progress (weighted when weights are set) and the status counts.
const g = (id: string, progress: number | undefined, weight: number, confidence?: Goal['confidence'], status: Goal['status'] = 'Approved'): Goal => ({ id, title: id, type: 'kpi', owner: { type: 'person', name: 'A' }, weight, period: '', status, keyResults: [], confidence, progress });

describe('goal progress summary', () => {
  it('weights the average by goal weight; a simple average when no weights; counts each status; done counts closed goals', () => {
    expect(progressSummary([g('a', 80, 60, 'On track'), g('b', 20, 40, 'At risk')])).toEqual({ average: 56, onTrack: 1, atRisk: 1, offTrack: 0, done: 0 });
    expect(progressSummary([g('a', 80, 0), g('b', 20, 0, 'Off track')]).average).toBe(50);
    expect(progressSummary([g('a', 100, 50, 'On track', 'Closed'), g('b', 0, 50, 'Off track')])).toMatchObject({ average: 50, onTrack: 0, offTrack: 1, done: 1 });
    // Nothing measured yet: no average.
    expect(progressSummary([g('a', undefined, 100)]).average).toBeNull();
    expect(progressSummary([])).toEqual({ average: null, onTrack: 0, atRisk: 0, offTrack: 0, done: 0 });
  });

  it('shows the average and the pills; with nothing measured says so', () => {
    const { unmount } = render(<GoalProgressSummary goals={[g('a', 80, 60, 'On track'), g('b', 20, 40, 'At risk')]} />);
    expect(screen.getByText('Average progress 56%')).toBeInTheDocument();
    expect(screen.getByText('1 at risk')).toBeInTheDocument();
    unmount();
    render(<GoalProgressSummary goals={[g('a', undefined, 100)]} />);
    expect(screen.getByText('No progress yet')).toBeInTheDocument();
  });
});
