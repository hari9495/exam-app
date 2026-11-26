import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { ToastProvider } from '../../components/notify';
import { MyProjectsTable, TimesheetActivityCard, TimesheetScreen, type LiveTimesheet } from './ops';
import { MY_TIMESHEET, TODAY } from './live/fixtures';
import { T2D_ACTIVITY, T2D_MY_PROJECTS, T2D_PROJECTS } from './timesheet-t2d-samples';

// T2-D 55 (My projects tab), 61 (the view switch) and 62 (the week's Activity card).
const ue = userEvent.setup({ pointerEventsCheck: 0 });
const ok = () => vi.fn(async () => ({}));
const live = (): LiveTimesheet => ({ state: 'ready', data: MY_TIMESHEET, week: MY_TIMESHEET.week, today: TODAY, onWeek: vi.fn(), onSave: ok(), onSubmit: ok(), onWithdraw: ok() });
describe('T2-D 55 My projects', () => {
  it('lists the project I am on first, with my allocation, the manager and my hours booked and approved', () => {
    render(<MyProjectsTable projects={T2D_MY_PROJECTS} />);
    const rows = within(screen.getByRole('table', { name: 'My projects' })).getAllByRole('row').slice(1);
    expect(rows[0]).toHaveTextContent('NRP · Nilgiri Retail web rebuild');
    expect(rows[0]).toHaveTextContent('Developer, 80% from 1 Sep 2026');
    expect(rows[0]).toHaveTextContent('On it now');
    expect(rows[0]).toHaveTextContent('Suresh Iyer');
    expect(rows[0]).toHaveTextContent('420 h');
    expect(rows[0]).toHaveTextContent('380 h');
    expect(rows[1]).toHaveTextContent('Project closed');
  });

  it('negative: no projects says so, with no table', () => {
    render(<MyProjectsTable projects={[]} />);
    expect(screen.getByText('No projects yet.')).toBeInTheDocument();
    expect(screen.queryByRole('table')).toBeNull();
  });
});

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

describe('T2-D 61 view switch', () => {
  it('switches the week between the grid and day cards and keeps the choice on this device', async () => {
    window.localStorage.removeItem('yx.timesheet.layout');
    const { container, unmount } = render(<ToastProvider><TimesheetScreen live={live()} /></ToastProvider>);
    expect(container.querySelector('.yx-ts')).toHaveAttribute('data-layout', 'grid');
    await ue.click(screen.getByRole('radio', { name: 'Day cards' }));
    expect(container.querySelector('.yx-ts')).toHaveAttribute('data-layout', 'days');
    unmount();
    const again = render(<ToastProvider><TimesheetScreen live={live()} /></ToastProvider>);
    expect(again.container.querySelector('.yx-ts')).toHaveAttribute('data-layout', 'days');
    await ue.click(screen.getByRole('radio', { name: 'Grid' }));
    expect(again.container.querySelector('.yx-ts')).toHaveAttribute('data-layout', 'grid');
  });

  it('negative: with storage blocked the switch still works for this visit', async () => {
    const get = vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('blocked');
    });
    const set = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('blocked');
    });
    const { container } = render(<ToastProvider><TimesheetScreen live={live()} /></ToastProvider>);
    await ue.click(screen.getByRole('radio', { name: 'Day cards' }));
    expect(container.querySelector('.yx-ts')).toHaveAttribute('data-layout', 'days');
    get.mockRestore();
    set.mockRestore();
  });
});
