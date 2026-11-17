import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { LeaveHistoryDrawer, type LeaveHistoryPage } from './leave-history-live';
import type { LeaveRequestRow } from './live/types';

// Batch A item 2 (C2): my full leave history.
const ue = userEvent.setup({ pointerEventsCheck: 0 });
const row = (i: number, over: Partial<LeaveRequestRow> = {}): LeaveRequestRow =>
  ({ id: `r${i}`, employeeId: 'e1', type: { id: 'cl', code: 'CL', name: 'Casual leave', colour: 'blue', medical: false }, from: '2026-03-02', to: '2026-03-03', fromHalf: 'full', toHalf: 'full', days: 2, status: 'approved', certificate: 'none', reason: 'Errand', wfRequestId: null, createdAt: '2026-02-20T05:00:00.000Z', decidedAt: null, ...over }) as LeaveRequestRow;
const TYPES = [{ id: 'cl', name: 'Casual leave' }, { id: 'sl', name: 'Sick leave' }];

describe('C2 my leave history', () => {
  it('loads every request a page at a time; a row opens the request', async () => {
    const load = vi.fn(async (q: { page: number }): Promise<LeaveHistoryPage> => ({ rows: q.page === 1 ? [row(1), row(2, { status: 'rejected', type: { id: 'sl', code: 'SL', name: 'Sick leave', colour: 'red', medical: true } })] : [row(3)], total: 27, page: q.page, pageSize: 25 }));
    const onOpenRequest = vi.fn();
    render(<LeaveHistoryDrawer open onClose={vi.fn()} types={TYPES} load={load} onOpenRequest={onOpenRequest} />);
    expect(await screen.findByText('Sick leave')).toBeInTheDocument();
    expect(load).toHaveBeenCalledWith({ page: 1, pageSize: 25, types: [], statuses: [], from: null, to: null, q: '' });
    expect(screen.getByText('Not approved')).toBeInTheDocument();
    await ue.click(screen.getByRole('button', { name: /next page|^2$/i }));
    await waitFor(() => expect(load).toHaveBeenLastCalledWith(expect.objectContaining({ page: 2 })));
    await ue.click(await screen.findByText('Casual leave'));
    expect(onOpenRequest).toHaveBeenCalledWith(expect.objectContaining({ id: 'r3' }));
  });

  it('negative: nothing found says so; a failed load offers Retry and loads again', async () => {
    const load = vi.fn().mockRejectedValueOnce(new Error('down')).mockResolvedValue({ rows: [], total: 0, page: 1, pageSize: 25 });
    render(<LeaveHistoryDrawer open onClose={vi.fn()} types={TYPES} load={load} onOpenRequest={vi.fn()} />);
    expect(await screen.findByText("Your leave history didn't load")).toBeInTheDocument();
    await ue.click(screen.getByRole('button', { name: 'Retry' }));
    expect(await screen.findByText('No leave requests yet')).toBeInTheDocument();
    expect(load).toHaveBeenCalledTimes(2);
  });

  it('negative: closed, it loads nothing', () => {
    const load = vi.fn();
    render(<LeaveHistoryDrawer open={false} onClose={vi.fn()} types={TYPES} load={load} onOpenRequest={vi.fn()} />);
    expect(load).not.toHaveBeenCalled();
  });
});
