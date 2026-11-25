import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { BulkChangesScreen, type BulkChangesScreenProps } from './bulk';
import { csvCell, csvText } from './workforce-kit';
import { BATCH_DETAIL, BATCHES, BULK_RESULT, PEOPLE } from './data';

const ok = () => vi.fn().mockResolvedValue(undefined);

describe('CSV export cells (OWASP CSV injection)', () => {
  it('quotes commas and quotes, and defuses formula-looking text', () => {
    expect(csvCell('Kulkarni, Arjun')).toBe('"Kulkarni, Arjun"');
    expect(csvCell('say "hi"')).toBe('"say ""hi"""');
    expect(csvCell('=HYPERLINK("x")')).toBe(`"'=HYPERLINK(""x"")"`);
    expect(csvCell('+91 98450')).toBe("'+91 98450");
    // Formula forms an importer may still run after trimming or folding full-width signs.
    for (const v of ['  =1+1', '\t=1+1', '\r=1', ' @SUM(A1)', '\uFF1D1+1', ' \uFF0BA1', '\uFF0D1', '\uFF20x', '\u3000=1']) expect(csvCell(v).replace(/^"/, '').startsWith("'")).toBe(true);
    expect(csvCell('Kaveri - Hosur')).toBe('Kaveri - Hosur');
    expect(csvText([['a', null], [1, 'b']])).toBe('a,\r\n1,b\r\n');
  });
});


describe('Bulk changes (M01 §3.3; YX-SEC-11)', () => {
  const props = (over: Partial<BulkChangesScreenProps> = {}): BulkChangesScreenProps => ({
    state: 'ready',
    batches: BATCHES,
    people: PEOPLE,
    canManage: true,
    canApprove: true,
    canPay: false,
    onCheckFile: vi.fn().mockResolvedValue(BULK_RESULT),
    onCheckReassign: vi.fn().mockResolvedValue({ ...BULK_RESULT, errors: 0, rows: BULK_RESULT.rows.slice(0, 1) }),
    loadBatch: vi.fn().mockResolvedValue(BATCH_DETAIL),
    onApprove: ok(),
    onReject: ok(),
    onCancel: ok(),
    ...over,
  });

  it('checks every row first; a file with a bad row cannot be sent', async () => {
    const p = props();
    render(<BulkChangesScreen {...p} />);
    const input = document.querySelector('input[type="file"]') as HTMLInputElement;
    await userEvent.upload(input, new File(['employee_code,change_type,effective_date\nKF-0142,transfer,2026-11-01'], 'reorg.csv', { type: 'text/csv' }));
    await userEvent.type(screen.getByRole('textbox'), 'Quality team moves');
    await userEvent.click(screen.getByRole('button', { name: 'Check every row' }));
    await waitFor(() => expect(p.onCheckFile).toHaveBeenCalledWith({ csv: 'employee_code,change_type,effective_date\nKF-0142,transfer,2026-11-01', fileName: 'reorg.csv', reason: 'Quality team moves', dryRun: true }));
    expect(await screen.findByText('1 of 2 rows need fixing')).toBeInTheDocument();
    expect(screen.getAllByText('No current employee with the code KF-0999.').length).toBeGreaterThan(0);
    expect(screen.getByRole('button', { name: 'Send for approval' })).toBeDisabled();
  });

  it('a batch is approved as a whole; a recalculation needs a second, explicit approval', async () => {
    const rebase = Object.assign(new Error('Later changes are recalculated'), { code: 'REBASE_CONFIRMATION_REQUIRED' });
    const onApprove = vi.fn().mockRejectedValueOnce(rebase).mockResolvedValueOnce(undefined);
    render(<BulkChangesScreen {...props({ onApprove })} defaultBatchId="b-1" />);
    const drawer = await screen.findByRole('dialog');
    expect(await within(drawer).findByText(/Transfer · 1 Nov 2026/)).toBeInTheDocument();
    await userEvent.click(within(drawer).getByRole('button', { name: 'Approve all' }));
    await waitFor(() => expect(onApprove).toHaveBeenCalledWith('b-1', false));
    await userEvent.click(await within(drawer).findByRole('button', { name: 'Approve and recalculate' }));
    await waitFor(() => expect(onApprove).toHaveBeenLastCalledWith('b-1', true));
  });

  it('without manage rights there is no upload, only the batches', () => {
    render(<BulkChangesScreen {...props({ canManage: false })} />);
    expect(screen.queryByText('From a file')).toBeNull();
    expect(screen.queryByRole('button', { name: 'Download template' })).toBeNull();
    expect(screen.getAllByText('q3-reorg.csv').length).toBeGreaterThan(0);
  });
});
