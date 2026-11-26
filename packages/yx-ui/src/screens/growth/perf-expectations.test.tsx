import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { ExpectationsScreen } from './perf-expectations';
import { MINE } from './prf-18.stories';

// T2-C item 68 (answer 2842): read-only expectations; no ratings; a manager opens a report's page.
const ue = userEvent.setup({ pointerEventsCheck: 0 });

describe('What is expected of me (68)', () => {
  it('shows each competency with its expected level and behaviours, then the values; nothing to rate', () => {
    render(<ExpectationsScreen state="ready" onRetry={vi.fn()} data={MINE} onPerson={vi.fn()} />);
    expect(screen.getByRole('heading', { level: 1, name: 'What is expected of me' })).toBeInTheDocument();
    expect(screen.getByText('Competencies for Quality Engineer')).toBeInTheDocument();
    expect(screen.getByText('Expected: level 3 of 4 · Coaches others')).toBeInTheDocument();
    expect(screen.getByText('Runs the daily safety check and coaches new joiners.')).toBeInTheDocument();
    expect(screen.getByText('Do the right thing')).toBeInTheDocument();
    expect(screen.queryByRole('radio')).toBeNull();
    expect(screen.queryByRole('textbox')).toBeNull();
    expect(screen.queryByRole('combobox')).toBeNull(); // no reports: no picker
  });

  it('a manager picks a report, and goes back to their own page', async () => {
    const onPerson = vi.fn();
    render(<ExpectationsScreen state="ready" onRetry={vi.fn()} data={{ ...MINE, reports: [{ value: 'e1', label: 'Arjun Rao' }, { value: 'e2', label: 'Meena S' }] }} onPerson={onPerson} />);
    await ue.click(screen.getByRole('combobox', { name: 'Show the page for' }));
    await ue.click(screen.getByRole('option', { name: 'Meena S' }));
    expect(onPerson).toHaveBeenLastCalledWith('e2');
  });

  it('negative: no competencies for the job says so; a failed load offers a retry', async () => {
    const { unmount } = render(<ExpectationsScreen state="ready" onRetry={vi.fn()} data={{ ...MINE, competencies: [], employee: { ...MINE.employee, mine: false, name: 'Arjun Rao' } }} onPerson={vi.fn()} />);
    expect(screen.getByRole('heading', { level: 1, name: 'What is expected of Arjun Rao' })).toBeInTheDocument();
    expect(screen.getByText('No competencies are set for this job yet.')).toBeInTheDocument();
    unmount();
    const onRetry = vi.fn();
    render(<ExpectationsScreen state="error" onRetry={onRetry} data={null} onPerson={vi.fn()} />);
    await ue.click(screen.getByRole('button', { name: /try again|retry/i }));
    expect(onRetry).toHaveBeenCalled();
  });
});
