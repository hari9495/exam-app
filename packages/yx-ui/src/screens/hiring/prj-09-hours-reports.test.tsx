import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { ToastProvider } from '../../components/notify';
import { HoursReportsScreen, type LiveHoursReports } from './projects-reports';
import { BY_PERSON, BY_TASK } from './prj-09-hours-reports.stories';

// T2-D 60 (answer 2871): the two hours reports, positive and negative.
const ue = userEvent.setup({ pointerEventsCheck: 0 });
const live = (over: Partial<LiveHoursReports> = {}): LiveHoursReports => ({ state: 'ready', kind: 'person', onKind: vi.fn(), filters: { from: '2026-09-07', to: '2026-11-27', projectId: null, clientId: null }, onFilters: vi.fn(), data: BY_PERSON, onExport: vi.fn().mockResolvedValue(undefined), ...over });
const show = (l: LiveHoursReports) => render(<ToastProvider><HoursReportsScreen live={l} /></ToastProvider>);

describe('PRJ-09 hours reports (T2-D 60)', () => {
  it('hours by person: week by week, billable and not, approved; Download CSV and the report switch call back', async () => {
    const l = live();
    show(l);
    const rows = within(screen.getByRole('table', { name: 'Hours by person' })).getAllByRole('row').slice(1);
    expect(rows[0]).toHaveTextContent('Priya Nair');
    expect(rows[0]).toHaveTextContent('36 h');
    expect(rows[0]).toHaveTextContent('4 h');
    await ue.click(screen.getByRole('button', { name: 'Download CSV' }));
    expect(l.onExport).toHaveBeenCalled();
    await ue.click(screen.getByRole('radio', { name: 'Hours by task' }));
    expect(l.onKind).toHaveBeenCalledWith('task');
  });

  it('hours by task: budget, booked and approved; a task with no budget says so', () => {
    show(live({ kind: 'task', data: BY_TASK }));
    const t = screen.getByRole('table', { name: 'Hours by task' });
    expect(within(t).getAllByRole('row')[1]).toHaveTextContent('1,600 h');
    expect(within(t).getByText('No budget')).toBeInTheDocument();
  });

  it('a project manager is told the report shows their own projects', () => {
    show(live({ data: { ...BY_PERSON, scope: 'mine' } }));
    expect(screen.getByText(/projects you manage/)).toBeInTheDocument();
  });

  it('negative: no rows say so and Download is off; no access never shows a table', () => {
    const { unmount } = show(live({ data: { ...BY_PERSON, rows: [] } }));
    expect(screen.getByText('No hours for these filters.')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Download CSV' })).toBeDisabled();
    unmount();
    show(live({ state: 'no-access', data: null }));
    expect(screen.getByText(/don't have access/)).toBeInTheDocument();
    expect(screen.queryByRole('table')).toBeNull();
  });
});
