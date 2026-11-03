import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { ReactElement } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { ToastProvider } from '../../components/notify';
import { ExpenseReportsScreen, ToPayScreen } from './expenses-finance';
import type { LiveReports, LiveToPay } from './expenses-finance-live';
import { paymentText } from './expenses-live-data';
import { JOURNAL_VIEW, PATTERNS_REPORT, SUMMARY_REPORT, TO_PAY_FULL } from './expenses-live-samples';

// EXP-06 to pay and EXP-09 reports live (expenses round 2): the designed screens with `live`, positive and negative.
const ue = userEvent.setup({ pointerEventsCheck: 0 });
const show = (ui: ReactElement) => render(<ToastProvider>{ui}</ToastProvider>);
const toPay = (over: Partial<LiveToPay> = {}): LiveToPay => ({
  state: 'ready', onRetry: vi.fn(), data: TO_PAY_FULL, journal: JOURNAL_VIEW, journalEntity: 'e1', journalMonth: '2026-10', onJournal: vi.fn(),
  onToPayroll: vi.fn(async () => ({ moved: 1, refused: [] })), onPayout: vi.fn(async () => ({ rows: 2, total: '5314.00', phrase: 'RELEASE 2', excluded: [] })),
  onDownload: vi.fn(async () => ({})), onRelease: vi.fn(async () => ({})), onCancel: vi.fn(async () => ({})), onResults: vi.fn(async () => ({})), onExportJournal: vi.fn(async () => ({})), onPosted: vi.fn(async () => ({})), ...over,
});
const reports = (over: Partial<LiveReports> = {}): LiveReports => ({ state: 'ready', onRetry: vi.fn(), kind: 'summary', report: SUMMARY_REPORT, from: '2026-09-01', to: '2026-09-30', departments: [], entityName: null, onKind: vi.fn(), onFilters: vi.fn(), onExport: vi.fn(async () => ({})), ...over });

describe('EXP-06 to pay', () => {
  it('shows the cut-off, the failed banner and only claims that can still be paid; a bank file asks for the account', async () => {
    const p = toPay();
    show(<ToPayScreen live={p} />);
    expect(screen.getByText('October payroll cut-off 23 Oct 2026')).toBeInTheDocument();
    expect(screen.getByText(/1 payment failed/)).toBeInTheDocument();
    expect(screen.queryByText('Internet, Aug')).toBeNull();
    await ue.click(within(screen.getByRole('row', { name: /Client visit, Mysuru/ })).getByRole('checkbox'));
    await ue.click(screen.getByRole('button', { name: 'Pay now by bank file' }));
    await ue.click(screen.getByRole('button', { name: 'Create bank file' }));
    expect(await screen.findByText('The account the money comes from: 6 to 20 digits.')).toBeInTheDocument();
    expect(p.onPayout).not.toHaveBeenCalled();
    await ue.type(screen.getByRole('textbox', { name: /Pay from account/ }), '00123456789');
    await ue.click(screen.getByRole('button', { name: 'Create bank file' }));
    await waitFor(() => expect(p.onPayout).toHaveBeenCalledWith(['c1'], '00123456789'));
  });
  it('the payroll route: claims go to the cut-off month; a refusal stays on the page with the reason', async () => {
    const p = toPay({ onToPayroll: vi.fn(async () => ({ moved: 0, refused: [{ claimId: 'c1', reason: 'No pay this month: on unpaid leave.' }] })) });
    show(<ToPayScreen live={p} />);
    await ue.click(within(screen.getByRole('row', { name: /Client visit, Mysuru/ })).getByRole('checkbox'));
    await ue.click(screen.getByRole('button', { name: 'Add 1 to October payroll' }));
    await ue.click(screen.getByRole('button', { name: 'Add to payroll' }));
    expect(await screen.findByText('Arjun Kulkarni: No pay this month: on unpaid leave.')).toBeInTheDocument();
  });
  it('a failed bank payment is re-routed to payroll', async () => {
    const p = toPay();
    show(<ToPayScreen live={p} />);
    await ue.click(screen.getByRole('button', { name: 'Re-route' }));
    await ue.click(screen.getByRole('button', { name: 'Add to October payroll' }));
    await waitFor(() => expect(p.onToPayroll).toHaveBeenCalledWith(['c2']));
  });
  it('bank files: the maker is told someone else releases it; release needs the typed phrase; results need the bank’s reason', async () => {
    const p = toPay({ data: { ...TO_PAY_FULL, batches: TO_PAY_FULL.batches.map((b) => (b.id === 'b1' ? { ...b, madeByMe: true } : b)) } });
    show(<ToPayScreen live={p} defaultTab="files" />);
    await ue.click(screen.getByRole('button', { name: 'Release' }));
    expect((await screen.findAllByText('You made this bank file, so someone else releases it.')).length).toBeGreaterThan(0);
    expect(p.onRelease).not.toHaveBeenCalled();
    await ue.click(screen.getByRole('button', { name: 'Record results' }));
    await ue.click(screen.getByRole('radio', { name: 'Came back' }));
    await ue.click(screen.getAllByRole('button', { name: 'Record results' }).pop()!);
    expect(p.onResults).not.toHaveBeenCalled();
    await ue.type(screen.getByRole('textbox', { name: /Reason from the bank/ }), 'Account frozen');
    await ue.click(screen.getAllByRole('button', { name: 'Record results' }).pop()!);
    await waitFor(() => expect(p.onResults).toHaveBeenCalledWith(TO_PAY_FULL.batches[1], [{ claimId: 'c5', status: 'returned', reason: 'Account frozen' }]));
  });
  it('a checker releases with the typed phrase', async () => {
    const p = toPay();
    show(<ToPayScreen live={p} defaultTab="files" defaultSheet="release" />);
    const confirm = screen.getAllByRole('button', { name: 'Release' }).pop()!;
    await ue.click(confirm);
    expect(p.onRelease).not.toHaveBeenCalled();
    await ue.type(screen.getByRole('textbox', { name: /Type/ }), 'RELEASE 1');
    await ue.click(confirm);
    await waitFor(() => expect(p.onRelease).toHaveBeenCalledWith(TO_PAY_FULL.batches[0], 'RELEASE 1'));
  });
  it('the journal: export is never greyed out, but refused while a code is unmapped; then it exports and is marked posted', async () => {
    const p = toPay();
    const { rerender } = show(<ToPayScreen live={p} defaultTab="journal" />);
    expect(screen.getByText(/exp._bank/)).toBeInTheDocument();
    await ue.click(screen.getByRole('button', { name: 'Export journal (CSV)' }));
    expect((await screen.findAllByText('Map every code to a ledger account first.')).length).toBeGreaterThan(0);
    expect(p.onExportJournal).not.toHaveBeenCalled();
    rerender(<ToastProvider><ToPayScreen live={{ ...p, journal: { ...JOURNAL_VIEW, unmapped: [], exports: [{ id: 'j1', status: 'exported', sha256: 'c'.repeat(64), createdAt: '2026-10-12T10:00:00Z', postedAt: null }] } }} defaultTab="journal" /></ToastProvider>);
    await ue.click(screen.getByRole('button', { name: 'Export journal (CSV)' }));
    await waitFor(() => expect(p.onExportJournal).toHaveBeenCalled());
    await ue.click(screen.getByRole('button', { name: 'Mark posted' }));
    await waitFor(() => expect(p.onPosted).toHaveBeenCalledWith('j1'));
  });
  it('a refused page shows no access, never "check your connection"', () => {
    show(<ToPayScreen live={toPay({ state: 'no-access', data: null })} />);
    expect(screen.getByText(/You don't have access to claims to pay/)).toBeInTheDocument();
  });
  it('U62: the employee is told where the money comes from', () => {
    expect(paymentText('in_payroll', { route: 'payroll', month: '2026-10', paidOn: null })).toBe('Approved: payment in the October 2026 payroll.');
    expect(paymentText('payment_failed', { route: 'payroll', month: '2026-10', paidOn: null })).toMatch(/payroll pays it again/);
  });
});

describe('EXP-09 reports', () => {
  it('summary: charts from the server figures, the table, and both exports', async () => {
    const p = reports();
    show(<ExpenseReportsScreen live={p} />);
    expect(screen.getByText('Spend by category')).toBeInTheDocument();
    expect(screen.getByText('Paid through')).toBeInTheDocument();
    expect(screen.getAllByText('₹1,46,200.50').length).toBeGreaterThan(0);
    await ue.click(screen.getByRole('button', { name: 'Export' }));
    await ue.click(screen.getByRole('button', { name: 'Download as XLSX' }));
    expect(p.onExport).toHaveBeenNthCalledWith(1, 'csv');
    expect(p.onExport).toHaveBeenNthCalledWith(2, 'xlsx');
  });
  it('switches report; approver patterns is a list for a second look', async () => {
    const p = reports();
    const { rerender } = show(<ExpenseReportsScreen live={p} />);
    await ue.click(screen.getByRole('tab', { name: 'Advance ageing' }));
    expect(p.onKind).toHaveBeenCalledWith('advance-ageing');
    rerender(<ToastProvider><ExpenseReportsScreen live={reports({ kind: 'approver-patterns', report: PATTERNS_REPORT })} /></ToastProvider>);
    expect(screen.getByText('Sana Nizami')).toBeInTheDocument();
  });
  it('ageing: the bucket table with counts and the exact total', () => {
    show(<ExpenseReportsScreen live={reports({ kind: 'advance-ageing', report: { ...SUMMARY_REPORT, kind: 'advance-ageing', columns: [], rows: [], charts: { ageing: [{ label: '0–30 days', count: 2, amount: '0.30' }, { label: 'Over 90 days', count: 1, amount: '6600.00' }] } } })} />);
    expect(screen.getByText('Total open ₹6,600.30')).toBeInTheDocument();
  });
  it('a refused page shows no access', () => {
    show(<ExpenseReportsScreen live={reports({ state: 'no-access', report: null })} />);
    expect(screen.getByText(/You don't have access to expense reports/)).toBeInTheDocument();
  });
});
