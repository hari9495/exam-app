import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { ReactElement } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { ToastProvider } from '../../components/notify';
import { CardImportScreen } from './expenses-finance';
import { cardStatus, columnLabel, importProblem, mappingItems, type LiveCardImport, type LiveCardLines } from './expenses-cards-live';
import type { CardLineRow, CardStatements, CardStatementView } from '../expenses/live/types';

// EXP-08 card statements live: the designed screen with `live` (finance) and `employee`, positive and negative.
const ue = userEvent.setup({ pointerEventsCheck: 0 });
const show = (ui: ReactElement) => render(<ToastProvider>{ui}</ToastProvider>);
const LINE: CardLineRow = { id: 'l1', rowNo: 4, txnOn: '2026-09-14', description: 'SKYINDIA', merchant: null, amount: '6840.00', direction: 'debit', currency: 'INR', cardLast4: '1234', holders: [{ id: 'e1', name: 'Vikram Rao' }], status: 'open', matchGone: false, matchedTo: null, suggestion: null, chasedOn: null, own: false, version: 1 };
const LIST: CardStatements = { statements: [], banks: [{ bankName: 'Kaveri Bank', mapping: { date: 'Txn Date', dateFormat: 'DD/MM/YYYY', description: 'Description', amountMode: 'signed', amount: 'Amount', card: 'Card No' }, version: 1 }], rules: { within: '1', days: 3, recoveryInstalments: 3 } };
const VIEW: CardStatementView = {
  statement: { id: 's1', bankName: 'Kaveri Bank', revision: 1, periodFrom: '2026-09-01', periodTo: '2026-09-30', fileName: 'kf.csv', rowCount: 1, debitTotal: '6840.00', creditTotal: '0.00', fullNumbersDropped: 0, status: 'open', note: null, version: 1, importedAt: '2026-10-02T00:00:00Z' },
  rules: LIST.rules,
  lines: [LINE],
  candidates: [],
};
const fin = (over: Partial<LiveCardImport> = {}): LiveCardImport => ({
  state: 'ready', onRetry: vi.fn(), list: LIST, statement: null, statementState: 'ready', onOpen: vi.fn(),
  onPreview: vi.fn(async () => ({ fileName: 'kf.csv', columns: ['Txn Date', 'Card No', 'Description', 'Amount'], sample: [], rows: 1, mapping: null })),
  onImport: vi.fn(async () => ({ id: 's1', fullNumbersDropped: 0 })), onMatch: vi.fn(async () => ({})), onChase: vi.fn(async () => ({})), onClose: vi.fn(async () => ({})),
  onLinkCard: vi.fn(async () => ({ lines: 1 })), onSearchPeople: vi.fn(async () => []), ...over,
});

describe('EXP-08 rules shown on screen', () => {
  it('status words, column letters and the saved mapping in words', () => {
    expect(cardStatus(LINE)).toBe('Unmatched');
    expect(cardStatus({ ...LINE, suggestion: { lineId: 'x', claimId: 'k', text: 't', amount: '1', spentOn: '2026-09-14' } })).toBe('Suggested');
    expect(cardStatus({ ...LINE, status: 'to_chase' })).toBe('With employee');
    expect(cardStatus({ ...LINE, status: 'refund', direction: 'credit' })).toBe('Refund');
    expect(columnLabel(['Txn Date', 'Amount'], 'amount')).toBe('Column B · Amount');
    expect(mappingItems(LIST.banks[0]!.mapping, ['Txn Date', 'Card No', 'Description', 'Amount'])[0]!.value).toContain('Column A · Txn Date');
  });

  it('an import refusal becomes rows to fix, the same file, or the same period', () => {
    expect(importProblem(Object.assign(new Error('2 rows need fixing.'), { code: 'ROWS_TO_FIX', body: { problems: [{ rowNo: 5, problems: ['No date.'] }] } }))).toMatchObject({ kind: 'rows', problems: [{ rowNo: 5 }] });
    expect(importProblem(Object.assign(new Error('x'), { code: 'SAME_PERIOD', body: { statementId: 's1', revision: 1 } }))).toMatchObject({ kind: 'period', revision: 1 });
    expect(importProblem(new Error('Network'))).toEqual({ kind: 'other', message: 'Network' });
  });
});

describe('EXP-08 finance (live)', () => {
  it('Continue without a programme name or a file says what is missing, and nothing is sent', async () => {
    const live = fin({ list: { ...LIST, banks: [] } });
    show(<CardImportScreen live={live} />);
    await ue.click(screen.getByRole('button', { name: 'Continue' }));
    expect(await screen.findByText('Name the card programme, e.g. HDFC corporate cards.')).toBeInTheDocument();
    expect(screen.getByText('Upload the statement file (CSV or Excel).')).toBeInTheDocument();
    expect(live.onPreview).not.toHaveBeenCalled();
  });

  it('Ask employee sends the line; a card linked to nobody offers Link card instead', async () => {
    const live = fin({ statement: { ...VIEW, lines: [LINE, { ...LINE, id: 'l2', description: 'CLOUDSOFT', holders: [], cardLast4: '9999' }] } });
    show(<CardImportScreen live={live} />);
    expect(within(screen.getByRole('row', { name: /CLOUDSOFT/ })).getByRole('button', { name: 'Link card' })).toBeInTheDocument();
    await ue.click(within(screen.getByRole('row', { name: /SKYINDIA/ })).getByRole('button', { name: 'Ask employee' }));
    await waitFor(() => expect(live.onChase).toHaveBeenCalledWith(expect.objectContaining({ id: 'l1' })));
  });

  it('own card lines have no match buttons; nothing left to match says so', () => {
    show(<CardImportScreen live={fin({ statement: { ...VIEW, lines: [{ ...LINE, own: true, status: 'to_chase' }] } })} />);
    expect(within(screen.getByRole('row', { name: /SKYINDIA/ })).queryByRole('button')).toBeNull();
    expect(screen.getByText(/Nothing to match/)).toBeInTheDocument();
  });

  it('no access (403) shows the no-access state', () => {
    show(<CardImportScreen live={fin({ state: 'no-access', list: null })} />);
    expect(screen.getByText(/You don't have access to card statements/)).toBeInTheDocument();
  });
});

describe('EXP-08 employee (live)', () => {
  const emp = (over: Partial<LiveCardLines> = {}): LiveCardLines => ({
    state: 'ready', onRetry: vi.fn(),
    data: { lines: [{ id: 'm1', txnOn: '2026-09-21', description: 'BOOKNOOK', merchant: null, amount: '1450.00', currency: 'INR', cardLast4: '1234', bankName: 'Kaveri Bank', periodFrom: '2026-09-01', periodTo: '2026-09-30', suggestion: null, version: 2 }], recoveryInstalments: 3 },
    onExplain: vi.fn(async () => ({ claimId: 'k1' })), onOpenClaim: vi.fn(), onBack: vi.fn(), ...over,
  });
  it('business opens the claim to add the receipt', async () => {
    const live = emp();
    show(<CardImportScreen employee={live} device="desk" />);
    expect(screen.getByText(/1 line needs you/)).toBeInTheDocument();
    await ue.click(screen.getByRole('button', { name: 'Add receipt' }));
    await waitFor(() => expect(live.onOpenClaim).toHaveBeenCalledWith('k1'));
  });
  it('nothing to explain is an empty state, also on a phone', () => {
    show(<CardImportScreen employee={emp({ data: { lines: [], recoveryInstalments: 3 } })} device="phone" />);
    expect(screen.getByText('Nothing to explain.')).toBeInTheDocument();
  });
});
