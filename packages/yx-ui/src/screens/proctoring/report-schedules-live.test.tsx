import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { ToastProvider } from '../../components/notify';
import { SchedulesScreen } from './analytics';
import type { LiveReportSchedules } from './report-schedules-live';

// G4 (answers 2690-2692): schedules and the export log with real records. Positive and negative.
const ue = userEvent.setup({ pointerEventsCheck: 0 });
const show = (ui: React.ReactElement) => render(<ToastProvider>{ui}</ToastProvider>);
const base = (over: Partial<LiveReportSchedules> = {}): LiveReportSchedules => ({
  state: 'ready',
  schedules: [],
  reports: [{ id: 'learning.compliance', name: 'Mandatory training compliance', sensitivity: 'Internal' }, { id: 'perf.completion', name: 'Review completion', sensitivity: 'Confidential' }],
  people: [{ id: 'u1', name: 'Lakshmi Venkatesan' }],
  onCreate: vi.fn().mockResolvedValue({}),
  onEnd: vi.fn().mockResolvedValue({}),
  exportLog: null,
  ...over,
});

describe('ANL-08 schedules (live)', () => {
  it('a schedule needs a report and a recipient; a confidential report says it is a link', async () => {
    const live = base();
    show(<SchedulesScreen library={live} />);
    await ue.click(screen.getByRole('button', { name: 'New schedule' }));
    const d = await screen.findByRole('dialog');
    await ue.click(within(d).getByRole('button', { name: 'Save schedule' }));
    expect(await within(d).findByText('Choose the report.')).toBeInTheDocument();
    expect(within(d).getByText('Choose at least one person.')).toBeInTheDocument();
    expect(live.onCreate).not.toHaveBeenCalled();
    await ue.click(within(d).getByRole('combobox', { name: /Report/ }));
    await ue.click(await screen.findByRole('option', { name: 'Review completion' }));
    expect(within(d).getByText(/a link to sign in, not an attachment/)).toBeInTheDocument();
    await ue.click(within(d).getByRole('combobox', { name: /Recipients/ }));
    await ue.click(await screen.findByRole('option', { name: 'Lakshmi Venkatesan' }));
    await ue.keyboard('{Escape}');
    await ue.click(within(d).getByRole('button', { name: 'Save schedule' }));
    expect(live.onCreate).toHaveBeenCalledWith({ reportId: 'perf.completion', frequency: 'weekly', recipientIds: ['u1'] });
  });

  it('the export log tab shows only with the key; an auditor without reports sees only the log', async () => {
    const { unmount } = show(<SchedulesScreen library={base()} />);
    expect(screen.queryByRole('tab', { name: /Export log/ })).toBeNull();
    unmount();
    const onDownload = vi.fn().mockResolvedValue(undefined);
    show(<SchedulesScreen library={base({ reports: [], exportLog: { rows: [{ id: 'x', at: '2026-11-24T05:00:00.000Z', who: 'Lakshmi', what: 'Payroll report', detail: 'register', rows: 12, sensitivity: 'Confidential' }], onDownload } })} />);
    expect(screen.getByRole('heading', { name: 'Export log' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'New schedule' })).toBeNull();
    expect(screen.getByText('Payroll report · register')).toBeInTheDocument();
    await ue.click(screen.getByRole('button', { name: 'Download log' }));
    expect(onDownload).toHaveBeenCalled();
  });

  // T2-G 46: the import log next to the export log.
  it('the import log tab shows only when given, with rows in and rows not in', async () => {
    const { unmount } = show(<SchedulesScreen library={base()} />);
    expect(screen.queryByRole('tab', { name: /Import log/ })).toBeNull();
    unmount();
    show(<SchedulesScreen library={base({ reports: [], importLog: { rows: [{ id: 'i', at: '2026-11-25T06:10:00.000Z', who: 'Lakshmi', what: 'Employees', detail: 'joiners.csv', ok: 38, failed: 2 }] } })} />);
    expect(screen.getByRole('heading', { name: 'Export and import log' })).toBeInTheDocument();
    await ue.click(screen.getByRole('tab', { name: /Import log/ }));
    expect(screen.getByText('Employees · joiners.csv')).toBeInTheDocument();
    expect(screen.getByRole('columnheader', { name: /Rows not in/ })).toBeInTheDocument();
    expect(screen.getByText('38')).toBeInTheDocument();
  });
});
