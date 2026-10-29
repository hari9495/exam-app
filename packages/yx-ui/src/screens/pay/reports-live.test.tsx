import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { PayrollReportsScreen } from './admin-tax-loans';
import type { LivePayrollReports, PayReport, ReportOptions } from './reports-live';

// The designed PAY-25 screen with the live page's data: the server's totals, filters on one row, paging, export with its
// toast, the empty, loading, error and no-access states.

const ue = userEvent.setup({ pointerEventsCheck: 0 });
const OPTIONS: ReportOptions = {
  entities: [
    { id: 'ka', name: 'Kaveri Foods Pvt Ltd' },
    { id: 'tn', name: 'Kaveri Foods Pvt Ltd (Tamil Nadu)' },
  ],
  departments: [{ id: 'ops', name: 'Operations' }],
  locations: [
    { id: 'blr', name: 'Bengaluru', legalEntityId: 'ka' },
    { id: 'che', name: 'Chennai', legalEntityId: 'tn' },
  ],
  months: ['2026-09', '2026-08'],
  today: '2026-10-30',
};
const REGISTER: PayReport = {
  kind: 'register',
  components: [
    { code: 'basic', name: 'Basic', kind: 'earning' },
    { code: 'tds', name: 'Income tax (TDS)', kind: 'deduction' },
  ],
  rows: [{ id: 's1', employeeId: 'e1', name: 'Asha Rao', code: 'KF-001', department: 'Operations', month: '2026-09', runType: 'regular', gross: '30000.00', deductions: '1200.00', net: '28800.00', employerCost: '31800.00', lines: { basic: '30000.00', tds: '1200.00' } }],
  totals: { gross: '1234567.89', deductions: '1200.00', net: '28800.00', employerCost: '31800.00', lines: { basic: '30000.00', tds: '1200.00' } },
  total: 1,
  page: 1,
  pageSize: 200,
};
const live = (x: Partial<LivePayrollReports> = {}): LivePayrollReports => ({
  state: 'ready',
  options: OPTIONS,
  kind: 'register',
  onKind: vi.fn(),
  filters: { legalEntityId: null, from: null, to: null, departmentId: null, locationId: null },
  onFilters: vi.fn(),
  page: 1,
  onPage: vi.fn(),
  report: REGISTER,
  reportState: 'ready',
  onExport: vi.fn(async () => undefined),
  ...x,
});

describe('PAY-25 payroll reports (live)', () => {
  it('shows the register with one column per component and the server totals', () => {
    render(<PayrollReportsScreen live={live()} />);
    expect(screen.getByRole('heading', { name: 'Payroll reports' })).toBeTruthy();
    expect(screen.getByRole('columnheader', { name: /Income tax \(TDS\)/ })).toBeTruthy();
    expect(screen.getByText('₹12,34,567.89')).toBeTruthy();
    expect(screen.getByText('Asha Rao')).toBeTruthy();
    // No schedule button: scheduling is not built.
    expect(screen.queryByRole('button', { name: 'Schedule' })).toBeNull();
  });

  it('filters sit in one row: report, legal entity, months, department, location', async () => {
    const l = live();
    render(<PayrollReportsScreen live={l} />);
    for (const name of ['Report', 'Legal entity', 'From month', 'To month', 'Department', 'Location']) expect(screen.getByRole('combobox', { name })).toBeTruthy();
    await ue.click(screen.getByRole('combobox', { name: 'Legal entity' }));
    await ue.click(await screen.findByRole('option', { name: 'Kaveri Foods Pvt Ltd (Tamil Nadu)' }));
    expect(l.onFilters).toHaveBeenCalledWith({ legalEntityId: 'tn', from: null, to: null, departmentId: null, locationId: null });
    await ue.click(screen.getByRole('combobox', { name: 'Report' }));
    await ue.click(await screen.findByRole('option', { name: /Hold ageing/ }));
    expect(l.onKind).toHaveBeenCalledWith('holds');
  });

  it('a one-month report has one month; hold ageing has none and says as on today', () => {
    const { unmount } = render(<PayrollReportsScreen live={live({ kind: 'variance', report: null, reportState: 'loading' })} />);
    expect(screen.getByRole('combobox', { name: 'Month' })).toBeTruthy();
    expect(screen.queryByRole('combobox', { name: 'From month' })).toBeNull();
    unmount();
    render(<PayrollReportsScreen live={live({ kind: 'holds', report: null, reportState: 'loading' })} />);
    expect(screen.queryByRole('combobox', { name: 'Month' })).toBeNull();
    expect(screen.getByText(/As on 30 Oct 2026/)).toBeTruthy();
  });

  it('export downloads the CSV and says so in a toast', async () => {
    const l = live();
    render(<PayrollReportsScreen live={l} />);
    await ue.click(screen.getByRole('button', { name: 'Export CSV' }));
    await waitFor(() => expect(l.onExport).toHaveBeenCalled());
    expect((await screen.findAllByText('Salary register downloaded as CSV.')).length).toBeGreaterThan(0);
  });

  it('empty: no data for the filters, export off, clear filters', async () => {
    const l = live({ report: { ...REGISTER, rows: [], total: 0 } });
    render(<PayrollReportsScreen live={l} />);
    expect(screen.getByText('No data for these filters.')).toBeTruthy();
    expect((screen.getByRole('button', { name: 'Export CSV' }) as HTMLButtonElement).disabled).toBe(true);
    await ue.click(screen.getByRole('button', { name: 'Clear filters' }));
    expect(l.onFilters).toHaveBeenCalledWith({ legalEntityId: null, from: null, to: null, departmentId: null, locationId: null });
  });

  it('pages a long report', async () => {
    const l = live({ report: { ...REGISTER, total: 450, page: 1, pageSize: 200 } });
    render(<PayrollReportsScreen live={l} />);
    const pages = screen.getByRole('navigation', { name: 'Pages' });
    expect(within(pages).getByText('Page 1 of 3')).toBeTruthy();
    await ue.click(within(pages).getByRole('button', { name: 'Next page' }));
    expect(l.onPage).toHaveBeenCalledWith(2);
  });

  it('every report kind renders from API data', () => {
    const reports: PayReport[] = [
      { kind: 'recon', month: '2026-09', previous: '2026-08', rows: [{ item: 'employees', label: 'Employees', previous: '4', current: '5', difference: '1' }, { item: 'gross', label: 'Gross', previous: '100.00', current: '150.00', difference: '50.00' }], bridge: { joiners: { count: 1, gross: '50.00' }, leavers: { count: 0, gross: '0.00' }, changed: { count: 0, gross: '0.00' } }, trend: [{ month: '2026-09', gross: '150.00', net: '140.00' }] },
      { kind: 'variance', month: '2026-09', threshold: '10', buckets: { below: 1, down: 0, up: 2, above: 0 }, rows: [{ id: 'x', employeeId: 'e', name: 'Bala', code: 'B', previous: '19000.00', current: '15000.00', difference: '-4000.00', change: '-21.1', cause: null }], total: 1, page: 1, pageSize: 200 },
      { kind: 'ctc', rows: [{ id: 'ops', department: 'Operations', people: 3, gross: '61000.00', employer: '2521.15', ctc: '63521.15' }], totals: { gross: '61000.00', employer: '2521.15', ctc: '63521.15' } },
      { kind: 'arrears', rows: [{ id: 'a', employeeId: 'e', name: 'Chitra', code: 'C', fromMonth: '2026-07', toMonth: '2026-07', payMonth: '2026-08', reason: 'Late revision', amount: '3500.00', employerCost: '420.00', runStatus: null }], totals: { amount: '3500.00', employerCost: '420.00' }, total: 1, page: 1, pageSize: 200 },
      { kind: 'ytd', yearStart: '2026-04', rows: [{ id: 'y', employeeId: 'e', name: 'Asha', code: 'A', months: 2, gross: '65000.00', tds: '2400.00', deductions: '6000.00', net: '59000.00' }], totals: { gross: '65000.00', tds: '2400.00', deductions: '6000.00', net: '59000.00' }, trend: [{ month: '2026-04', gross: '30000.00', net: '27000.00' }], total: 1, page: 1, pageSize: 200 },
      { kind: 'bank', rows: [{ id: 'b', employeeId: 'e', name: 'Asha', code: 'A', month: '2026-09', ifsc: 'HDFC0001234', account: '1234', amount: '27000.00', status: 'pending' }], totals: { count: 1, amount: '27000.00' }, left: 2, total: 1, page: 1, pageSize: 200 },
      { kind: 'holds', asOn: '2026-10-30', buckets: [{ id: '0-30', count: 1, amount: '2500.00' }], reasons: [{ reason: 'investigation', count: 1, amount: '2500.00' }], rows: [], totals: { count: 1, amount: '2500.00' }, total: 1, page: 1, pageSize: 200 },
      { kind: 'gratuity', month: '2026-09', minYears: 5, rows: [{ id: 'g', employeeId: 'e', name: 'Asha', code: 'A', joined: '2019-01-01', serviceMonths: 92, eligible: true, thisMonth: '721.15', toDate: '1442.30' }], totals: { thisMonth: '721.15', toDate: '1442.30' }, total: 1, page: 1, pageSize: 200 },
      { kind: 'loans', rows: [{ id: 'l', employeeId: 'e', name: 'Asha', code: 'A', type: 'loan', principal: '12000.00', emi: '2000.00', opening: '8000.00', recovered: '2000.00', closing: '6000.00', status: 'active' }], totals: { principal: '12000.00', opening: '8000.00', recovered: '2000.00', closing: '6000.00' }, total: 1, page: 1, pageSize: 200 },
    ];
    const expected: Record<string, string | RegExp> = { recon: /1 joiner/, variance: 'Not explained yet', ctc: '₹63,521.15', arrears: 'Late revision', ytd: '₹59,000', bank: '••••1234', holds: '0–30 days', gratuity: '7 y 8 m', loans: '₹6,000' };
    for (const r of reports) {
      const { unmount } = render(<PayrollReportsScreen live={live({ kind: r.kind, report: r })} />);
      expect(screen.getAllByText(expected[r.kind]).length).toBeGreaterThan(0);
      unmount();
    }
  });

  it('loading, error (retry) and no access', async () => {
    const { unmount } = render(<PayrollReportsScreen live={live({ state: 'loading', options: null })} />);
    expect(screen.getByRole('status', { name: 'Loading payroll reports' })).toBeTruthy();
    unmount();
    const onRetry = vi.fn();
    const e = render(<PayrollReportsScreen live={live({ state: 'error', options: null, onRetry })} />);
    await ue.click(screen.getByRole('button', { name: /Retry/ }));
    expect(onRetry).toHaveBeenCalled();
    e.unmount();
    render(<PayrollReportsScreen live={live({ state: 'no-access', options: null })} />);
    expect(screen.getByText("You don't have access to payroll reports")).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Request access' })).toBeNull();
  });
});
