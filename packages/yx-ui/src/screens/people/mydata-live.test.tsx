import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { ToastProvider } from '../../components/notify';
import { MyDataScreen, type LiveMyData } from './selfservice';
import type { AccessLog } from '../access/types';

// PPL-33 live: what the company holds by class, my data as a PDF or JSON file, and who viewed my sensitive data with
// who they are to me and where it happened; the company may hide the list (never the recording).

const ue = userEvent.setup({ pointerEventsCheck: 0 });
const LOG: AccessLog = {
  enabled: true,
  company: 'Kaveri Foods',
  entries: [
    { id: 'a1', at: '2026-09-28T10:42:00Z', who: 'Lakshmi Venkatesan', role: 'Head of People', what: 'Salary bank account', context: 'Shown in full on your record', className: 'confidential' },
    { id: 'a2', at: '2026-09-15T09:00:00Z', who: 'Divya Raghunathan', role: 'Your manager', what: 'Pay', context: 'Your job history', className: 'confidential' },
  ],
};

function page(over: Partial<LiveMyData> = {}, tab?: 'data' | 'access') {
  const live: LiveMyData = { state: 'ready', onRetry: () => {}, log: LOG, onDownload: vi.fn(async () => {}), ...over };
  render(
    <ToastProvider>
      <MyDataScreen live={live} tab={tab} />
    </ToastProvider>,
  );
  return live;
}

describe('PPL-33 my data and who accessed it, live', () => {
  it('my data: the classes we hold and why; downloads as PDF or JSON', async () => {
    const live = page();
    expect(screen.getByText(/What Kaveri Foods holds about you/)).toBeInTheDocument();
    expect(screen.getByRole('columnheader', { name: 'What we hold' })).toBeInTheDocument();
    expect(screen.getByText('Salary, bank account, PAN, UAN, payslips')).toBeInTheDocument();
    expect(screen.queryByText(/health check-up/)).toBeNull();
    await ue.click(screen.getByRole('button', { name: 'Download my data (PDF)' }));
    await ue.click(screen.getByRole('button', { name: 'Download my data (JSON)' }));
    expect(live.onDownload).toHaveBeenNthCalledWith(1, 'pdf');
    expect(live.onDownload).toHaveBeenNthCalledWith(2, 'json');
  });

  it('who accessed: who they are to me, what, where and when, with the count on the tab', async () => {
    page({}, 'access');
    expect(screen.getByRole('tab', { name: /Who accessed my data/ })).toHaveTextContent('2');
    expect(screen.getAllByText('Your manager').length).toBeGreaterThan(0);
    expect(screen.getAllByText('Shown in full on your record').length).toBeGreaterThan(0);
    expect(screen.getByText("People who viewed your Confidential or Special data. Automatic payroll processing isn't listed.")).toBeInTheDocument();
  });

  it('turned off by the company: says so, no count; a failed download says why', async () => {
    page({ log: { enabled: false, company: 'Kaveri Foods', entries: [] }, onDownload: vi.fn(async () => Promise.reject(new Error('Try again in a minute.'))) });
    expect(screen.getByRole('tab', { name: /Who accessed my data/ })).not.toHaveTextContent(/\d/);
    await ue.click(screen.getByRole('button', { name: 'Download my data (JSON)' }));
    expect(await screen.findByText('Try again in a minute.')).toBeInTheDocument();
    await ue.click(screen.getByRole('tab', { name: /Who accessed my data/ }));
    expect(screen.getByText('Your company has turned this view off')).toBeInTheDocument();
  });

  it('no one has looked yet: the empty state', () => {
    page({ log: { ...LOG, entries: [] } }, 'access');
    expect(screen.getByText('No one has viewed your sensitive data')).toBeInTheDocument();
  });
});
