import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { ToastProvider } from '../../components/notify';
import { RunReadinessScreen, RunWorkspaceScreen } from './payroll-run';
import { WhyThisNumber } from './pay-kit';
import type { LiveRunReadinessData, LiveRunWorkspaceData } from './run-workspace-live';
import { BANK_FILES, DETAIL, PAYSLIPS, PEOPLE, READINESS, RUN, VARIANCES } from './live/fixtures-5j';
import type { RunDates, RunReadiness } from './live/types-5j';

// Enterprise E5 payroll controls (answers 2656, 2657): PAY-02 run readiness live (dates, late inputs, change dates for
// one month), the publish sheet's release date (early needs a reason) and the payslip's "Paid separately" section.

const ue = userEvent.setup({ pointerEventsCheck: 0 });
const DATES: RunDates = { payGroup: { id: 'g1', name: 'Head office monthly' }, month: '2026-09', cutOff: '2026-09-20', release: '2099-10-03', changed: null, canChange: true };
const WITH: RunReadiness = {
  ...READINESS,
  dates: DATES,
  late: [
    { id: 'o1', employeeId: 'p1', name: 'Lakshmi Iyer', component: 'Incentive', amount: '5000.00', from: '2026-08', to: '2026-09', direction: 'in' },
    { id: 'o2', employeeId: 'p2', name: 'Divya Raghunathan', component: 'Bonus', amount: '20000.00', from: '2026-09', to: '2026-10', direction: 'out' },
  ],
};
const ready = (over: Partial<LiveRunReadinessData> = {}): LiveRunReadinessData => ({
  state: 'ready',
  onRetry: vi.fn(),
  run: { ...RUN, status: 'draft' },
  people: PEOPLE,
  readiness: WITH,
  can: { prepare: true, approve: true, bankGenerate: true, bankRelease: true, publish: true, offcycle: true },
  onWaive: vi.fn(async () => ({})),
  onCalculate: vi.fn(async () => ({})),
  onOpenRun: vi.fn(),
  onSaveDates: vi.fn(async () => ({})),
  ...over,
});
const wrap = (ui: React.ReactElement) => render(<ToastProvider>{ui}</ToastProvider>);

describe('PAY-02 run readiness, live (E5)', () => {
  it('shows the month’s cut-off and release dates and the inputs that came after the cut-off (positive)', () => {
    wrap(<RunReadinessScreen live={ready()} />);
    expect(screen.getByRole('heading', { level: 1, name: 'Run readiness' })).toBeInTheDocument();
    const dates = screen.getByRole('region', { name: 'Dates for this month' });
    expect(within(dates).getByText('20 Sept 2026')).toBeInTheDocument();
    expect(within(dates).getByText('3 Oct 2099')).toBeInTheDocument();
    const late = screen.getByRole('table', { name: 'Inputs after the cut-off' });
    expect(within(late).getByText('Lakshmi Iyer')).toBeInTheDocument();
    expect(within(late).getByText('Divya Raghunathan')).toBeInTheDocument();
    expect(screen.getByText(/1 item asked for this month is paid next month/)).toBeInTheDocument();
  });

  it('change dates: needs a cut-off in the month and a reason; saves only this month (positive and negative)', async () => {
    const l = ready();
    wrap(<RunReadinessScreen live={l} />);
    await ue.click(screen.getByRole('button', { name: 'Change dates' }));
    const drawer = await screen.findByRole('dialog', { name: /Dates for September 2026/ });
    await ue.click(within(drawer).getByRole('button', { name: 'Save dates' }));
    expect(within(drawer).getByText('Say why, in 10 characters or more.')).toBeInTheDocument();
    expect(l.onSaveDates).not.toHaveBeenCalled();
    await ue.type(within(drawer).getByRole('textbox', { name: /Reason/ }), 'Festival week, inputs close early');
    await ue.click(within(drawer).getByRole('button', { name: 'Save dates' }));
    await waitFor(() => expect(l.onSaveDates).toHaveBeenCalledWith({ payGroupId: 'g1', month: '2026-09', cutOffOn: '2026-09-20', releaseOn: '2099-10-03', reason: 'Festival week, inputs close early' }));
  });

  it('no Change dates without the setup key, and Calculate waits for a blocking check (negative)', () => {
    wrap(<RunReadinessScreen live={ready({ readiness: { ...WITH, dates: { ...DATES, canChange: false } } })} />);
    expect(screen.queryByRole('button', { name: 'Change dates' })).not.toBeInTheDocument();
    // READINESS has one unwaived blocking check: the Calculate step stays locked and says why.
    expect(screen.getAllByText(/1 item to resolve or waive/).length).toBeGreaterThan(0);
  });

  it('a run with no late inputs says so', () => {
    wrap(<RunReadinessScreen live={ready({ readiness: { ...WITH, late: [] } })} />);
    expect(screen.getByText('Nothing came after the cut-off.')).toBeInTheDocument();
  });
});

describe('publish with a release date (E5)', () => {
  const ws = (over: Partial<LiveRunWorkspaceData> = {}): LiveRunWorkspaceData => ({
    state: 'ready',
    onRetry: vi.fn(),
    run: { ...RUN, status: 'paid' },
    people: PEOPLE,
    readiness: WITH,
    progress: null,
    payslips: PAYSLIPS.map((s) => ({ ...s, status: 'approved' })),
    variances: VARIANCES,
    bankFiles: [],
    published: false,
    can: { prepare: true, approve: true, bankGenerate: false, bankRelease: true, publish: true, offcycle: true },
    onBack: vi.fn(),
    onWaive: vi.fn(async () => ({})),
    onCalculate: vi.fn(async () => ({})),
    onPayslip: vi.fn(async () => DETAIL),
    onAck: vi.fn(async () => ({})),
    onSubmit: vi.fn(async () => ({})),
    onDecide: vi.fn(async () => ({})),
    onVoid: vi.fn(async () => ({})),
    onGenerateBank: vi.fn(async () => ({ id: 'b2', fileId: 'f2', rows: 2, total: '1.00', excluded: [] })),
    onReleaseBank: vi.fn(async () => ({})),
    onDownload: vi.fn(async () => ({})),
    onPublish: vi.fn(async () => ({})),
    ...over,
  });
  void BANK_FILES;

  it('published before the release date they wait for it (positive)', async () => {
    const l = ws();
    wrap(<RunWorkspaceScreen live={l} />);
    await ue.click(screen.getByRole('button', { name: 'Publish payslips' }));
    expect(screen.getByRole('radio', { name: 'On 3 Oct 2099' })).toBeChecked();
    await ue.type(screen.getByRole('textbox', { name: /Type/ }), 'PUBLISH 3');
    await ue.click(screen.getAllByRole('button', { name: 'Publish payslips' }).pop()!);
    await waitFor(() => expect(l.onPublish).toHaveBeenCalledWith(expect.objectContaining({ phrase: 'PUBLISH 3' }), undefined, { now: false }));
  });

  it('releasing now needs a reason; without one nothing is sent (negative), with one it goes (positive)', async () => {
    const l = ws();
    wrap(<RunWorkspaceScreen live={l} />);
    await ue.click(screen.getByRole('button', { name: 'Publish payslips' }));
    await ue.click(screen.getByRole('radio', { name: 'Now' }));
    await ue.type(screen.getByRole('textbox', { name: /Type/ }), 'PUBLISH 3');
    await ue.click(screen.getAllByRole('button', { name: 'Publish payslips' }).pop()!);
    expect(l.onPublish).not.toHaveBeenCalled();
    await ue.type(screen.getByRole('textbox', { name: /Reason/ }), 'Bank holiday, salaries went out early');
    await ue.click(screen.getAllByRole('button', { name: 'Publish payslips' }).pop()!);
    await waitFor(() => expect(l.onPublish).toHaveBeenCalledWith(expect.objectContaining({ phrase: 'PUBLISH 3' }), undefined, { now: true, reason: 'Bank holiday, salaries went out early' }));
  });
});

describe('payslip: paid separately (E5)', () => {
  it('separate lines sit in their own section with their own total; the rest stays in earnings and deductions', () => {
    render(
      <WhyThisNumber
        lines={[
          { id: 'b', label: 'Basic', amount: 30000, kind: 'earning' },
          { id: 'jb', label: 'Joining bonus', amount: 100000, kind: 'earning', separate: true },
          { id: 'tpc', label: 'Tax paid by the company', amount: 4000, kind: 'earning', separate: true },
          { id: 'tds', label: 'Income tax (TDS) on Joining bonus', amount: 4000, kind: 'deduction', separate: true },
        ]}
      />,
    );
    const sep = screen.getByRole('region', { name: 'Paid separately (its own bank payment)' });
    expect(within(sep).getByText('Joining bonus')).toBeInTheDocument();
    expect(within(screen.getByRole('region', { name: 'Earnings' })).queryByText('Joining bonus')).not.toBeInTheDocument();
    expect(screen.queryByRole('region', { name: 'Deductions' })).not.toBeInTheDocument();
  });
});
