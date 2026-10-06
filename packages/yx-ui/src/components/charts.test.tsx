import { describe, expect, it, vi } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { changeInWords, formatValue, limitSeries, niceTicks, stack, suppressGroups, trendSummary } from '../lib/chart';
import { BarChart, CapacityHeatmap, DonutChart, Funnel, LineChart, StatCard } from './charts';
import { DashboardGrid, NeedsActionList } from './dashboard';

describe('chart maths', () => {
  it('nice ticks land on 1/2/2.5/5 steps and format with Indian grouping', () => {
    expect(niceTicks(0, 248)).toEqual([0, 50, 100, 150, 200, 250]);
    const money = niceTicks(0, 1234567, 4);
    expect(money).toEqual([0, 500000, 1000000, 1500000]);
    expect(money.map((t) => formatValue(t, true))).toEqual(['₹0', '₹5,00,000', '₹10,00,000', '₹15,00,000']);
    expect(formatValue(12345678)).toBe('1,23,45,678');
  });

  it('stacks series, treating missing values as zero', () => {
    const out = stack([
      { name: 'Permanent', values: [10, 20] },
      { name: 'Contract', values: [5, null] },
    ]);
    expect(out).toEqual([
      [[0, 10], [0, 20]],
      [[10, 15], [20, 20]],
    ]);
  });

  it('groups series beyond 8 as "Other"', () => {
    const many = Array.from({ length: 10 }, (_, i) => ({ name: `S${i}`, values: [i, 1] }));
    const out = limitSeries(many);
    expect(out).toHaveLength(8);
    expect(out[7]).toEqual({ name: 'Other', values: [7 + 8 + 9, 3] });
  });

  it('suppresses groups under the minimum size', () => {
    expect(suppressGroups([12, 3, 5, 4], 4)).toEqual({ keep: [0, 2], hidden: 2 });
    expect(suppressGroups(undefined, 2)).toEqual({ keep: [0, 1], hidden: 0 });
  });

  it('writes the change in words', () => {
    expect(changeInWords(252, 248, 'August').text).toBe('4 more than August');
    expect(changeInWords(4880000, 5000000, 'August', { money: true })).toEqual({ text: '₹1,20,000 less than August', direction: 'down' });
    expect(changeInWords(9, 12, 'August').text).toBe('3 fewer than August');
    expect(changeInWords(5, 5, 'August')).toEqual({ text: 'Same as August', direction: 'same' });
    expect(trendSummary([212, 230, 248], 'Headcount')).toBe('Headcount rose from 212 to 248');
  });
});

const DEPTS = ['Engineering', 'Operations', 'Finance', 'Legal'];

describe('BarChart', () => {
  it('hides small groups and says so', () => {
    render(<BarChart title="Attrition by department" categories={DEPTS} series={[{ name: 'Leavers', values: [12, 8, 6, 1] }]} groupSizes={[120, 80, 40, 3]} />);
    expect(screen.getByRole('img', { name: 'Engineering: 12' })).toBeInTheDocument();
    expect(screen.queryByRole('img', { name: /Legal/ })).toBeNull();
    expect(screen.getByText('Groups under 5 people are hidden for privacy.')).toBeInTheDocument();
  });

  it('"View as table" swaps the chart for a table of the same data', async () => {
    const u = userEvent.setup();
    render(<BarChart title="Monthly salary cost" money xLabel="Department" categories={DEPTS.slice(0, 2)} series={[{ name: 'Cost', values: [1250000, 830000] }]} />);
    await u.click(screen.getByRole('button', { name: 'View as table' }));
    const table = screen.getByRole('table', { name: 'Monthly salary cost' });
    expect(within(table).getByRole('columnheader', { name: 'Department' })).toBeInTheDocument();
    expect(within(table).getByRole('rowheader', { name: 'Engineering' })).toBeInTheDocument();
    expect(within(table).getByText('₹12,50,000')).toBeInTheDocument();
    expect(screen.queryByRole('group', { name: 'Monthly salary cost' })).toBeNull();
    await u.click(screen.getByRole('button', { name: 'View as chart' }));
    expect(screen.queryByRole('table')).toBeNull();
  });

  it('bars are keyboard focusable and show a tooltip on focus', async () => {
    const u = userEvent.setup();
    render(<BarChart title="Headcount" categories={DEPTS} series={[{ name: 'Headcount', values: [120, 80, 40, 12] }]} />);
    await u.tab(); // View as table
    await u.tab();
    expect(screen.getByRole('img', { name: 'Engineering: 120' })).toHaveFocus();
    expect(document.querySelector('.yx-chart__tooltip')).toHaveTextContent('Engineering: 120');
  });

  it('shows the empty and loading states', () => {
    const { rerender } = render(<BarChart title="Headcount" categories={[]} series={[]} />);
    expect(screen.getByText('No data for this period.')).toBeInTheDocument();
    rerender(<BarChart title="Headcount" categories={DEPTS} series={[]} loading />);
    expect(screen.getByText('Loading Headcount')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'View as table' })).toBeNull();
  });
});

describe('other charts', () => {
  it('line chart leaves gaps and only focuses real points', () => {
    render(<LineChart title="Utilisation" categories={['Jul', 'Aug', 'Sep']} series={[{ name: 'Design', values: [70, null, 76] }]} target={{ value: 75, label: 'Target 75%' }} />);
    expect(screen.getAllByRole('img')).toHaveLength(2);
    expect(document.querySelectorAll('.yx-chart__line')).toHaveLength(2);
  });

  it('donut warns and groups above 4 slices', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    render(<DonutChart title="Work mode" slices={['A', 'B', 'C', 'D', 'E'].map((label) => ({ label, value: 10 }))} />);
    expect(warn).toHaveBeenCalled();
    expect(screen.getByRole('img', { name: /Other: 20, 40%/ })).toBeInTheDocument();
    warn.mockRestore();
  });

  it('funnel shows conversion between stages', () => {
    render(<Funnel title="Hiring funnel" stages={[{ label: 'Applied', count: 400 }, { label: 'Screened', count: 120 }]} />);
    expect(screen.getByText('30% moved on')).toBeInTheDocument();
  });

  it('capacity heatmap writes over-allocation in words', () => {
    render(<CapacityHeatmap title="Capacity" weeks={['5 Oct']} people={[{ name: 'Kavya Reddy', weeks: [{ allocated: 48, available: 40 }] }]} />);
    expect(screen.getByText('Over by 8 h')).toBeInTheDocument();
  });

  it('stat card has the change in words and a drill link', () => {
    render(<StatCard label="Headcount" value={252} previous={248} previousLabel="August" drill={{ label: 'View 252 employees', href: '/people' }} />);
    expect(screen.getByText('4 more than August')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'View 252 employees' })).toHaveAttribute('href', '/people');
  });
});

describe('dashboard', () => {
  const widgets = ['Headcount', 'Attrition', 'Leave today'].map((t) => ({ id: t, title: t, content: <p>{t} body</p> }));
  const titles = () => screen.getAllByRole('heading', { level: 2 }).map((h) => h.textContent);

  it('shows widget menus only in edit mode; reorders, removes with undo and resets to the company layout', async () => {
    const u = userEvent.setup();
    const onChange = vi.fn();
    render(<DashboardGrid label="HR home" widgets={widgets} onChange={onChange} />);
    expect(screen.queryByRole('button', { name: 'Options for Attrition' })).not.toBeInTheDocument();
    await u.click(screen.getByRole('button', { name: 'Edit home' }));
    expect(screen.getByRole('group', { name: 'Editing your home' })).toBeInTheDocument();
    await u.click(screen.getByRole('button', { name: 'Options for Attrition' }));
    await u.click(await screen.findByRole('menuitem', { name: 'Move up' }));
    expect(titles()).toEqual(['Attrition', 'Headcount', 'Leave today']);
    expect(onChange).toHaveBeenLastCalledWith(['Attrition', 'Headcount', 'Leave today']);
    expect(screen.getByText(/Attrition moved. Position 1 of 3./)).toBeInTheDocument();

    await u.click(screen.getByRole('button', { name: 'Options for Leave today' }));
    await u.click(await screen.findByRole('menuitem', { name: 'Remove widget' }));
    expect(titles()).toEqual(['Attrition', 'Headcount']);
    await u.click(screen.getByRole('button', { name: 'Undo' }));
    expect(titles()).toEqual(['Attrition', 'Headcount', 'Leave today']);

    await u.click(screen.getByRole('button', { name: 'Reset to company layout' }));
    expect(titles()).toEqual(['Headcount', 'Attrition', 'Leave today']);
  });

  it('switches off buttons inside widgets while editing', async () => {
    const u = userEvent.setup();
    render(<DashboardGrid label="HR home" widgets={widgets} />);
    await u.click(screen.getByRole('button', { name: 'Edit home' }));
    for (const body of document.querySelectorAll('.yx-widget__body')) expect(body).toHaveAttribute('inert');
    await u.click(screen.getByRole('button', { name: 'Done' }));
    for (const body of document.querySelectorAll('.yx-widget__body')) expect(body).not.toHaveAttribute('inert');
  });

  it('edit mode adds a widget back', async () => {
    const u = userEvent.setup();
    render(<DashboardGrid label="HR home" widgets={widgets} defaultValue={['Headcount']} />);
    await u.click(screen.getByRole('button', { name: 'Edit home' }));
    await u.click(screen.getByRole('button', { name: 'Add widget' }));
    await u.click(await screen.findByRole('menuitem', { name: 'Leave today' }));
    expect(titles()).toEqual(['Headcount', 'Leave today']);
    await u.click(screen.getByRole('button', { name: 'Done' }));
    expect(screen.getByRole('button', { name: 'Edit home' })).toBeInTheDocument();
  });

  it('needs-action list approves inline and flags overdue items', async () => {
    const u = userEvent.setup();
    const onApprove = vi.fn();
    render(
      <NeedsActionList
        today={new Date(2026, 8, 29)}
        viewAllHref="/inbox"
        total={7}
        onApprove={onApprove}
        items={[{ id: '1', type: 'Leave', title: 'Casual leave, 2 days', who: 'Meera Iyer', due: new Date(2026, 8, 27) }]}
      />,
    );
    expect(screen.getByText('Overdue since 27 Sep 2026')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'View all 7' })).toBeInTheDocument();
    await u.click(screen.getByRole('button', { name: 'Approve leave for Meera Iyer' }));
    expect(onApprove).toHaveBeenCalledWith(expect.objectContaining({ id: '1' }));
  });
});
