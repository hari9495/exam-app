import { describe, expect, it, vi } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { RecycleBinScreen, type RecycleBinRow } from './recycle-bin';

const ROWS: RecycleBinRow[] = [
  { id: 'b1', source: 'bin', kind: 'department', what: 'Department', area: 'Organisation', label: 'Quality assurance', deletedAt: '2026-11-16T10:20:00+05:30', deletedBy: 'Lakshmi V', purgeOn: '2027-05-15T10:20:00+05:30' },
  { id: 'h1', source: 'hiring', kind: 'candidate', what: 'Candidate', area: 'Hiring', label: 'Farhan Sheikh', deletedAt: '2026-11-08T12:00:00+05:30', deletedBy: null, purgeOn: '2026-12-08T12:00:00+05:30' },
];
const show = (over: Partial<Parameters<typeof RecycleBinScreen>[0]> = {}) =>
  render(<RecycleBinScreen state="ready" rows={ROWS} keepDays={180} onRestore={vi.fn(async () => {})} onPurge={vi.fn(async () => {})} {...over} />);

describe('Settings › Recycle bin (batch B item 3)', () => {
  it('lists deleted records with who deleted them and when they go for good', () => {
    show();
    const table = screen.getByRole('table', { name: 'Deleted records' });
    expect(within(table).getByText('Quality assurance')).toBeInTheDocument();
    expect(within(table).getByText('16 Nov 2026 by Lakshmi V')).toBeInTheDocument();
    expect(within(table).getByText('15 May 2027')).toBeInTheDocument();
    expect(screen.getByText(/stay here for 180 days/)).toBeInTheDocument();
  });

  it('restores after a confirm', async () => {
    const u = userEvent.setup();
    const onRestore = vi.fn(async () => {});
    show({ onRestore });
    await u.click(screen.getByRole('button', { name: 'Restore Quality assurance' }));
    await u.click(await screen.findByRole('button', { name: 'Restore' }));
    expect(onRestore).toHaveBeenCalledWith(expect.objectContaining({ id: 'b1' }));
  });

  it('offers Delete for good only for the YukthiX bin, not hiring rows', () => {
    show();
    expect(screen.getByRole('button', { name: 'Delete Quality assurance for good' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Delete Farhan Sheikh for good' })).not.toBeInTheDocument();
  });

  it('filters by name', async () => {
    const u = userEvent.setup();
    show();
    await u.type(screen.getByRole('searchbox'), 'farhan');
    const table = screen.getByRole('table', { name: 'Deleted records' });
    expect(within(table).queryByText('Quality assurance')).not.toBeInTheDocument();
    expect(within(table).getByText('Farhan Sheikh')).toBeInTheDocument();
  });

  it('says so when empty, and when the person may not open it', () => {
    const { unmount } = show({ rows: [] });
    expect(screen.getByText('The recycle bin is empty.')).toBeInTheDocument();
    unmount();
    show({ state: 'no-access', rows: [] });
    expect(screen.getByText("You don't have access to the recycle bin")).toBeInTheDocument();
  });
});
