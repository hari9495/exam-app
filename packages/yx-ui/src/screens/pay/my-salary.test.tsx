import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { MySalaryScreen, type LiveMySalary } from './my-salary';
import { MY_SALARY_HISTORY, MY_SALARY_SPLIT, MY_SALARY_TODAY } from './my-salary-samples';

// T2-B 63 (Keka B3): the employee's salary timeline on Me › My pay › My salary.
const ue = userEvent.setup({ pointerEventsCheck: 0 });
const live = (o: Partial<LiveMySalary> = {}): LiveMySalary => ({ state: 'ready', today: MY_SALARY_TODAY, history: MY_SALARY_HISTORY, onBreakdown: vi.fn(async () => MY_SALARY_SPLIT), ...o });

describe('My salary (T2-B 63)', () => {
  it('marks the salary in force Current and a later one Starts on, newest first, and opens a split', async () => {
    const p = live();
    render(<MySalaryScreen live={p} />);
    const items = within(screen.getByRole('list', { name: 'Salary changes' })).getAllByRole('listitem');
    expect(items.map((li) => li.querySelector('strong')?.textContent)).toEqual(['₹13,80,000 a year', '₹12,00,000 a year', '₹10,80,000 a year', '₹9,60,000 a year']);
    expect(within(items[0]!).getByText(/Starts on/)).toBeInTheDocument();
    expect(within(items[1]!).getByText('Current')).toBeInTheDocument();
    expect(items[1]).toHaveAttribute('aria-current', 'true');
    expect(within(items[1]!).getByText(/\+11\.1% on the salary before · Annual revision 2026/)).toBeInTheDocument();
    const show = within(items[1]!).getByRole('button', { name: 'Show the split' });
    expect(show).toHaveAttribute('aria-expanded', 'false');
    await ue.click(show);
    await waitFor(() => expect(p.onBreakdown).toHaveBeenCalledWith('2026-04-01'));
    const table = await within(items[1]!).findByRole('table', { name: 'Salary split by component' });
    expect(within(table).getByRole('row', { name: /Basic ₹50,000 ₹6,00,000/ })).toBeInTheDocument();
    // Open again: already loaded, not asked twice.
    await ue.click(within(items[1]!).getByRole('button', { name: 'Hide the split' }));
    await ue.click(within(items[1]!).getByRole('button', { name: 'Show the split' }));
    expect(p.onBreakdown).toHaveBeenCalledTimes(1);
  });

  it('negative: a pay request still waiting is never shown; no salary says so; a failed split shows why', async () => {
    const { unmount } = render(<MySalaryScreen live={live()} />);
    expect(screen.queryByText(/₹15,00,000/)).toBeNull();
    expect(screen.queryByText(/Counter-offer/)).toBeNull();
    // Who asked for or approved a change is not shown to the person.
    expect(screen.queryByText(/Suresh Pillai|Divya Raghunathan/)).toBeNull();
    unmount();
    const r = render(<MySalaryScreen live={live({ history: [] })} />);
    expect(screen.getByText('No salary yet.')).toBeInTheDocument();
    r.unmount();
    render(<MySalaryScreen live={live({ onBreakdown: async () => Promise.reject(new Error('Confirm it is you to open salary details.')) })} />);
    await ue.click(screen.getAllByRole('button', { name: 'Show the split' })[1]!);
    expect(await screen.findByText('Confirm it is you to open salary details.')).toBeInTheDocument();
  });

  it('negative: loading and error states show no amounts', () => {
    const { unmount } = render(<MySalaryScreen live={live({ state: 'loading', history: null })} />);
    expect(screen.queryByText(/a year/)).toBeNull();
    unmount();
    const onRetry = vi.fn();
    render(<MySalaryScreen live={live({ state: 'error', history: null, onRetry })} />);
    expect(screen.queryByText(/a year/)).toBeNull();
  });
});
