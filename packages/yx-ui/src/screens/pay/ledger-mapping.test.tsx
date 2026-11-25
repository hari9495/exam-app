import type { ReactElement } from 'react';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { ToastProvider } from '../../components/notify';
import { LEDGER_OPTIONS, LEDGER_ROWS, LedgerMappingScreen, SUSPENSE_LINE } from './ledger-mapping';

const wrap = (ui: ReactElement) => render(<ToastProvider>{ui}</ToastProvider>);
const props = (over: Partial<Parameters<typeof LedgerMappingScreen>[0]> = {}) => ({ state: 'ready' as const, onRetry: vi.fn(), rows: LEDGER_ROWS, options: LEDGER_OPTIONS, canEdit: true, onSave: vi.fn(async () => undefined), onRemove: vi.fn(async () => undefined), ...over });

describe('PAY-62 ledger mapping (Enterprise E4, O19-O20)', () => {
  it('shows the suspense account first and the mapping by pay line, with overrides named (positive)', () => {
    wrap(<LedgerMappingScreen {...props()} />);
    expect(screen.getByText('Company: 9999 · Payroll suspense')).toBeInTheDocument();
    const table = screen.getByRole('table', { name: 'Ledger mapping' });
    expect(within(table).getByText('Net pay')).toBeInTheDocument();
    expect(within(table).getByText('Stores BLR')).toBeInTheDocument();
    expect(within(table).queryByText('Suspense account')).not.toBeInTheDocument();
  });

  it('adds a mapping for a cost centre after the checks pass (positive and negative)', async () => {
    const p = props();
    wrap(<LedgerMappingScreen {...p} />);
    await userEvent.click(screen.getByRole('button', { name: 'Add mapping' }));
    await userEvent.click(screen.getByRole('button', { name: 'Save mapping' }));
    expect(p.onSave).not.toHaveBeenCalled();
    expect(await screen.findByText('Choose the pay line.')).toBeInTheDocument();
    expect(screen.getByText('Give the account code (letters, digits, . _ / -).')).toBeInTheDocument();
  });

  it('sets the suspense account (payable, company) from the card (positive)', async () => {
    const p = props({ rows: LEDGER_ROWS.filter((r) => r.componentCode !== SUSPENSE_LINE) });
    wrap(<LedgerMappingScreen {...p} />);
    expect(screen.getByText(/None yet\. Without one/)).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Set suspense account' }));
    await userEvent.type(screen.getByRole('textbox', { name: /Account code/ }), '9999');
    await userEvent.type(screen.getByRole('textbox', { name: /Account name/ }), 'Payroll suspense');
    await userEvent.click(screen.getByRole('button', { name: 'Save mapping' }));
    await waitFor(() => expect(p.onSave).toHaveBeenCalledWith({ scopeType: 'company', scopeId: null, componentCode: SUSPENSE_LINE, side: 'payable', accountCode: '9999', accountName: 'Payroll suspense' }));
    expect((await screen.findAllByText('Ledger mapping saved')).length).toBeGreaterThan(0);
  });

  it('read only: no Add, no change, no remove (negative)', () => {
    wrap(<LedgerMappingScreen {...props({ canEdit: false })} />);
    expect(screen.queryByRole('button', { name: 'Add mapping' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Change' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /More actions/ })).not.toBeInTheDocument();
  });
});
