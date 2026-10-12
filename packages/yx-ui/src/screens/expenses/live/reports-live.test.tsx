import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { ExpenseReportsScreen } from './reports';

// Expense reports (EXP-09, XP-5.06).
const ue = userEvent.setup({ pointerEventsCheck: 0 });

describe('Expense reports (EXP-09)', () => {
  it('shows the rows of the chosen report, switches report, and exports it', async () => {
    const onKind = vi.fn();
    const onExport = vi.fn(async () => ({}));
    render(<ExpenseReportsScreen state="ready" kind="gst-input" from="2026-10-01" to="2026-10-12" report={{ kind: 'gst-input', from: '2026-10-01', to: '2026-10-12', columns: [{ key: 'gstin', label: 'GSTIN of supplier' }, { key: 'itc', label: 'ITC status' }], rows: [{ gstin: '27BBBBB2222B1Z5', itc: 'eligible' }] }} onKind={onKind} onRange={vi.fn()} onExport={onExport} />);
    expect(screen.getByText('27BBBBB2222B1Z5')).toBeInTheDocument();
    await ue.click(screen.getByRole('tab', { name: 'Advance ageing' }));
    expect(onKind).toHaveBeenCalledWith('advance-ageing');
    await ue.click(screen.getByRole('button', { name: 'Export CSV' }));
    expect(onExport).toHaveBeenCalled();
  });
});
