import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { PayrollReportsScreen } from './admin-tax-loans';
import { defaultMonth, effectiveFilters, fitWidth, textPx, type LivePayrollReports, type PayReport, type PayReportKind, type ReportFilters, type ReportOptions } from './reports-live';

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
const NONE: ReportFilters = { legalEntityId: null, from: null, to: null, departmentId: null, locationId: null };
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

  it('empty: no data for the filters, clear filters; Export stays enabled and says there is nothing to export', async () => {
    const l = live({ report: { ...REGISTER, rows: [], total: 0 } });
    render(<PayrollReportsScreen live={l} />);
    expect(screen.getByText('No data for these filters.')).toBeTruthy();
    expect(screen.getByText(/Filters: Salary register · September 2026\./)).toBeTruthy();
    const exp = screen.getByRole('button', { name: 'Export CSV' }) as HTMLButtonElement;
    expect(exp.disabled).toBe(false);
    expect(screen.queryByText('Nothing to export for these filters')).toBeNull();
    await ue.click(exp);
    expect((await screen.findAllByText('Nothing to export for these filters.')).length).toBeGreaterThan(0);
    expect(screen.getAllByText(/Try a different month/).length).toBeGreaterThan(0);
    expect(l.onExport).not.toHaveBeenCalled();
    await ue.click(screen.getByRole('button', { name: 'Clear filters' }));
    expect(l.onFilters).toHaveBeenCalledWith({ legalEntityId: null, from: null, to: null, departmentId: null, locationId: null });
  });

  it('export is never disabled, also while the report loads; pressed then, nothing is downloaded', async () => {
    const l = live({ report: null, reportState: 'loading' });
    render(<PayrollReportsScreen live={l} />);
    const exp = screen.getByRole('button', { name: 'Export CSV' }) as HTMLButtonElement;
    expect(exp.disabled).toBe(false);
    await ue.click(exp);
    expect(l.onExport).not.toHaveBeenCalled();
  });

  it('default month: the latest month with approved payslips; a range report runs from it to itself', () => {
    render(<PayrollReportsScreen live={live()} />);
    expect(within(screen.getByRole('combobox', { name: 'From month' })).getByText('From Sep 2026')).toBeTruthy();
    expect(within(screen.getByRole('combobox', { name: 'To month' })).getByText('To Sep 2026')).toBeTruthy();
    expect(effectiveFilters('register', NONE, OPTIONS)).toEqual({ ...NONE, from: '2026-09', to: '2026-09' });
    expect(effectiveFilters('variance', NONE, OPTIONS)).toEqual({ ...NONE, from: null, to: '2026-09' });
    expect(effectiveFilters('holds', { ...NONE, to: '2026-08' }, OPTIONS)).toEqual(NONE);
  });

  it('default month with no approved payslips in scope: last month (never "no month yet")', () => {
    const none = { ...OPTIONS, months: [] };
    expect(defaultMonth({ months: [], today: '2026-10-30' })).toBe('2026-09');
    expect(defaultMonth({ months: [], today: '2027-01-05' })).toBe('2026-12');
    render(<PayrollReportsScreen live={live({ options: none, report: { ...REGISTER, rows: [], total: 0 } })} />);
    expect(within(screen.getByRole('combobox', { name: 'To month' })).getByText('To Sep 2026')).toBeTruthy();
    expect(screen.queryByText(/no month yet/)).toBeNull();
  });

  it('negative: a chosen month is kept; a start after the end is pulled back to the end', () => {
    expect(effectiveFilters('register', { ...NONE, from: '2026-08', to: '2026-09' }, OPTIONS)).toMatchObject({ from: '2026-08', to: '2026-09' });
    expect(effectiveFilters('register', { ...NONE, from: '2026-10', to: '2026-09' }, OPTIONS)).toMatchObject({ from: '2026-09', to: '2026-09' });
  });

  it('month labels: range reports say From and To; one-month reports have one Month select with the full month', () => {
    const { unmount } = render(<PayrollReportsScreen live={live({ kind: 'gratuity', report: null, reportState: 'loading' })} />);
    expect(within(screen.getByRole('combobox', { name: 'Month' })).getByText('September 2026')).toBeTruthy();
    expect(screen.queryByRole('combobox', { name: 'From month' })).toBeNull();
    expect(screen.queryByRole('combobox', { name: 'To month' })).toBeNull();
    unmount();
    render(<PayrollReportsScreen live={live({ kind: 'loans', report: null, reportState: 'loading' })} />);
    expect(screen.getByRole('combobox', { name: 'From month' })).toBeTruthy();
    expect(screen.getByRole('combobox', { name: 'To month' })).toBeTruthy();
    expect(screen.queryByRole('combobox', { name: 'Month' })).toBeNull();
  });

  it('filter widths: each select fits its longest choice or placeholder, and the row fits 1278 x 635 for every report', () => {
    // Measured in Storybook at 1278 x 635: the filter row is 895 px wide with 12 px between selects. In the browser each
    // select is sized from its texts measured in its own font; tests have no layout, so they use the 0.55 em estimate.
    const ROW = 895;
    const px = (w: string) => Number(/calc\((\d+)px \+ var\(--yx-space-12\)\)/.exec(w)![1]) + 48;
    const chars = (n: number) => Math.ceil(n * 7.7) + 48;
    const row = (o: ReportOptions, kind: PayReportKind) => {
      const { container, unmount } = render(<PayrollReportsScreen live={live({ kind, options: o, report: null, reportState: 'loading' })} />);
      const cells = ([...container.querySelector('[data-testid="report-filters"]')!.children] as HTMLElement[]).map((c) => [c.querySelector('[role="combobox"]')!.getAttribute('aria-label')!, { w: px(c.style.width), shrink: c.style.flex.split(' ')[1] }] as const);
      unmount();
      return { cells: Object.fromEntries(cells), total: cells.reduce((a, [, x]) => a + x.w, 0) + 12 * (cells.length - 1) };
    };
    const demo: ReportOptions = { ...OPTIONS, entities: [{ id: 'ka', name: 'Kaveri Foods Pvt Ltd', shortName: 'KF-KA' }, { id: 'tn', name: 'Kaveri Foods Pvt Ltd (Tamil Nadu)', shortName: 'KF-TN' }], departments: [{ id: 'd', name: 'Operations' }, { id: 'f', name: 'Finance' }], locations: [{ id: 'l', name: 'Bengaluru', legalEntityId: 'ka' }] };
    for (const kind of ['register', 'variance', 'holds'] as const) {
      const r = row(demo, kind);
      expect(r.total).toBeLessThanOrEqual(ROW);
      // Positive: every select is as wide as its longest text (no cut text).
      expect(r.cells.Report.w).toBe(chars('Gratuity provision'.length));
      expect(r.cells['Legal entity'].w).toBe(chars('Entity'.length));
      expect(r.cells.Department.w).toBe(chars('Department'.length));
      expect(r.cells.Location.w).toBe(chars('Bengaluru'.length));
      if (kind === 'register') expect([r.cells['From month'].w, r.cells['To month'].w]).toEqual([chars('From Sep 2026'.length), chars('To Sep 2026'.length)]);
      if (kind === 'variance') expect(r.cells.Month.w).toBe(chars('September 2026'.length));
    }
    // Negative: a company's very long names. Report and months never shrink (their text is never cut); only the entity,
    // department and location fields give way, so the row stays on one line at 1278 px.
    const long: ReportOptions = { ...demo, entities: [{ id: 'a', name: 'A very long legal entity name', shortName: 'LONG-ENTITY-NAME' }, { id: 'b', name: 'B' }], departments: [{ id: 'x', name: 'Customer Success and Onboarding' }], locations: [{ id: 'y', name: 'Bengaluru head office, Tower B', legalEntityId: 'ka' }] };
    const r = row(long, 'register');
    expect([r.cells.Report.shrink, r.cells['From month'].shrink, r.cells['To month'].shrink]).toEqual(['0', '0', '0']);
    expect([r.cells['Legal entity'].shrink, r.cells.Department.shrink, r.cells.Location.shrink]).toEqual(['1', '1', '1']);
    expect(r.cells.Department.w).toBe(chars('Customer Success and Onboarding'.length));
    const { container, unmount } = render(<PayrollReportsScreen live={live({ options: long, report: null, reportState: 'loading' })} />);
    expect((container.querySelector('[data-testid="report-filters"]') as HTMLElement).style.flexWrap).toBe('nowrap');
    unmount();
    expect(fitWidth(textPx(['Entity', 'KF-KA'], null))).toBe(fitWidth(textPx(['Entity'], null)));
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
