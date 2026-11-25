import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { ToastProvider } from '../../components/notify';
import { AllReferralsScreen, RecruitingCostsScreen, ReferralsScreen, type AllReferral, type CostEntry, type LiveRecruitingCosts, type LiveReferrals, type Referral } from './hiring-plan';

// HIR-11 recruiting costs and HIR-12 referrals, the designed screens with `live`: positive and negative.
const ue = userEvent.setup({ pointerEventsCheck: 0 });
const show = (ui: React.ReactElement) => render(<ToastProvider>{ui}</ToastProvider>);

const COST_ROWS: CostEntry[] = [
  { id: 'c1', period: 'Oct 2026', month: '2026-10', job: 'Senior Accountant', jobId: 'j1', source: 'Naukri', type: 'Job board', amount: 12_500.5, origin: 'Manual', enteredBy: 'Neha Joshi' },
  { id: 'c2', period: 'Nov 2026', month: '2026-11', job: null, jobId: null, source: 'Campus fair, Hosur', type: 'Event', amount: 42_000, origin: 'Manual', enteredBy: 'Neha Joshi' },
  { id: 'c3', period: 'Sep 2026', month: '2026-09', job: null, jobId: null, source: 'LinkedIn', type: 'Job board', amount: 99_999, origin: 'Manual', enteredBy: 'Neha Joshi' },
];
const costsLive = (over: Partial<LiveRecruitingCosts> = {}): LiveRecruitingCosts => ({
  quarter: { label: 'Oct–Dec 2026', months: ['2026-10', '2026-11', '2026-12'] },
  months: [
    { value: '2026-10', label: 'Oct' },
    { value: '2026-11', label: 'Nov' },
  ],
  jobs: [{ value: 'j1', label: 'Senior Accountant' }],
  onRetry: vi.fn(),
  onSave: vi.fn().mockResolvedValue(undefined),
  onDelete: vi.fn().mockResolvedValue(undefined),
  onExport: vi.fn(),
  ...over,
});

describe('HIR-11 Recruiting costs (live)', () => {
  it('adds up only this quarter in rupees; cost per hire = quarter spend / hires', () => {
    show(<RecruitingCostsScreen rows={COST_ROWS} hires={3} live={costsLive()} />);
    expect(screen.getByRole('region', { name: 'Cost summary, Oct–Dec 2026' })).toBeInTheDocument();
    // 12,500.50 + 42,000 (September's 99,999 is last quarter).
    expect(screen.getByText('₹54,500.50')).toBeInTheDocument();
    expect(screen.getByText('₹18,167')).toBeInTheDocument();
  });

  it('Add cost pressed too early shows what is missing and sends nothing', async () => {
    const live = costsLive();
    show(<RecruitingCostsScreen rows={[]} hires={0} live={live} />);
    await ue.click(screen.getAllByRole('button', { name: 'Add cost' })[0]!);
    const d = screen.getByRole('dialog');
    const add = within(d).getByRole('button', { name: 'Add cost' });
    expect(add).toBeEnabled();
    await ue.click(add);
    expect(await within(d).findByText('Say where the money went, for example Naukri.')).toBeInTheDocument();
    expect(within(d).getByText('Enter the amount in rupees.')).toBeInTheDocument();
    expect(live.onSave).not.toHaveBeenCalled();
  });

  it('adds an agency fee in rupees for the chosen month (Segment) with a toast', async () => {
    const live = costsLive();
    show(<RecruitingCostsScreen rows={COST_ROWS} hires={3} live={live} />);
    await ue.click(screen.getAllByRole('button', { name: 'Add cost' })[0]!);
    const d = screen.getByRole('dialog');
    await ue.click(within(d).getByRole('combobox', { name: /Cost type/ }));
    await ue.click(await screen.findByRole('option', { name: 'Agency fee' }));
    await ue.type(within(d).getByRole('textbox', { name: /Source/ }), 'Sahyadri Staffing');
    await ue.type(within(d).getByRole('textbox', { name: /Amount/ }), '64000.75');
    const month = within(d).getByRole('radiogroup', { name: 'Month' });
    expect(within(month).getByRole('radio', { name: 'Nov' })).toHaveAttribute('aria-checked', 'true');
    await ue.click(within(month).getByRole('radio', { name: 'Oct' }));
    await ue.click(within(d).getByRole('button', { name: 'Add cost' }));
    expect(live.onSave).toHaveBeenCalledWith({ costType: 'agency_fee', source: 'Sahyadri Staffing', jobId: null, amount: 64000.75, currency: 'INR', period: '2026-10-01', note: null }, null);
    expect(await screen.findByText('Cost added')).toBeInTheDocument();
  });

  it('a refusal stays in the sheet and nothing is toasted', async () => {
    const live = costsLive({ onSave: vi.fn().mockRejectedValue(new Error('That job is not in your organisation.')) });
    show(<RecruitingCostsScreen rows={[]} hires={0} live={live} />);
    await ue.click(screen.getAllByRole('button', { name: 'Add cost' })[0]!);
    const d = screen.getByRole('dialog');
    await ue.type(within(d).getByRole('textbox', { name: /Source/ }), 'Naukri');
    await ue.type(within(d).getByRole('textbox', { name: /Amount/ }), '4500');
    await ue.click(within(d).getByRole('button', { name: 'Add cost' }));
    expect(await within(d).findByText('That job is not in your organisation.')).toBeInTheDocument();
    expect(screen.queryByText('Cost added')).not.toBeInTheDocument();
  });

  it('shows loading and error states; Try again retries', async () => {
    const live = costsLive();
    const { rerender } = show(<RecruitingCostsScreen rows={[]} hires={0} state="error" live={live} />);
    await ue.click(screen.getByRole('button', { name: /Try again|Retry/ }));
    expect(live.onRetry).toHaveBeenCalled();
    rerender(
      <ToastProvider>
        <RecruitingCostsScreen rows={[]} hires={0} state="loading" live={live} />
      </ToastProvider>,
    );
    expect(screen.queryByText('No recruiting costs this quarter.')).not.toBeInTheDocument();
  });
});

const REFS: Referral[] = [
  { id: 'r1', name: 'Vikram Reddy', job: 'Senior QA Engineer', referred: new Date(2026, 9, 8), stage: 'Applied', joined: null, bonus: 20_000 },
  { id: 'r2', name: 'Kiran Rao', job: 'Accountant', referred: new Date(2026, 5, 2), stage: 'Hired', joined: new Date(2026, 9, 1), bonus: 20_000 },
  { id: 'r3', name: 'Neha Das', job: 'Shift Lead', referred: new Date(2026, 3, 11), stage: 'Hired', joined: new Date(2026, 4, 20), bonus: 15_000, paid: true },
  { id: 'r4', name: 'Ajay Menon', job: 'Sales Manager', referred: new Date(2026, 7, 30), stage: 'Not selected', joined: null, bonus: 20_000 },
];
const JOBS = [{ id: 'j1', title: 'Senior QA Engineer', location: 'Chennai' }];
const refLive = (over: Partial<LiveReferrals> = {}): LiveReferrals => ({ bonus: 20_000, qualifyDays: 60, state: 'ready', onRetry: vi.fn(), onRefer: vi.fn().mockResolvedValue(undefined), ...over });
const TODAY = new Date(2026, 10, 9);

describe('HIR-12 Referrals (live)', () => {
  it('uses the company bonus and qualifying days; counts down from the joining day', () => {
    show(<ReferralsScreen jobs={JOBS} referrals={REFS} today={TODAY} live={refLive()} />);
    expect(screen.getByText(/once they complete 60 days/)).toBeInTheDocument();
    // Joined 1 Oct 2026 + 60 days = 30 Nov 2026, 21 days after 9 Nov.
    expect(screen.getByText('₹20,000 on 30 Nov 2026 (21 days to go)')).toBeInTheDocument();
    expect(screen.getByText('₹15,000 paid in payroll')).toBeInTheDocument();
    expect(screen.getByText('No bonus')).toBeInTheDocument();
    expect(screen.getByText('Bonus after they join and complete 60 days')).toBeInTheDocument();
  });

  it('Send referral pressed too early says what is missing, focuses it, and sends nothing', async () => {
    const live = refLive();
    show(<ReferralsScreen jobs={JOBS} referrals={[]} today={TODAY} live={live} />);
    await ue.click(screen.getByRole('button', { name: 'Refer someone' }));
    const d = screen.getByRole('dialog');
    expect(within(d).getByText('Referral bonus up to ₹20,000')).toBeInTheDocument();
    await ue.click(within(d).getByRole('button', { name: 'Send referral' }));
    expect(await within(d).findByText("Enter your friend's full name.")).toBeInTheDocument();
    expect(within(d).getByText('Enter a 10-digit mobile number.')).toBeInTheDocument();
    expect(within(d).getByText('Tick this once your friend has agreed.')).toBeInTheDocument();
    expect(within(d).getByRole('textbox', { name: /full name/ })).toHaveFocus();
    expect(live.onRefer).not.toHaveBeenCalled();
  });

  const fill = async (d: HTMLElement, mobile = '9876543210') => {
    await ue.type(within(d).getByRole('textbox', { name: /full name/ }), 'Ananya Iyer');
    await ue.type(within(d).getByRole('textbox', { name: /Email/ }), 'ananya.iyer@mailbox.in');
    await ue.type(within(d).getByRole('textbox', { name: /Mobile/ }), mobile);
    await ue.click(within(d).getByRole('checkbox', { name: /My friend agreed/ }));
  };

  it('refers a friend with consent and shows a toast', async () => {
    const live = refLive();
    show(<ReferralsScreen jobs={JOBS} referrals={[]} today={TODAY} live={live} />);
    await ue.click(screen.getByRole('button', { name: 'Refer someone' }));
    const d = screen.getByRole('dialog');
    await fill(d);
    await ue.click(within(d).getByRole('button', { name: 'Send referral' }));
    expect(live.onRefer).toHaveBeenCalledWith({ jobId: 'j1', name: 'Ananya Iyer', email: 'ananya.iyer@mailbox.in', phone: '+919876543210', resumeBase64: null, consentGiven: true });
    expect(await screen.findByText('Ananya Iyer referred')).toBeInTheDocument();
  });

  it('a bad mobile number is refused before sending', async () => {
    const live = refLive();
    show(<ReferralsScreen jobs={JOBS} referrals={[]} today={TODAY} live={live} />);
    await ue.click(screen.getByRole('button', { name: 'Refer someone' }));
    const d = screen.getByRole('dialog');
    await fill(d, '12345');
    await ue.click(within(d).getByRole('button', { name: 'Send referral' }));
    expect(await within(d).findByText('Enter a 10-digit mobile number.')).toBeInTheDocument();
    expect(live.onRefer).not.toHaveBeenCalled();
  });

  it('already referred (409) shows the blocked state, no toast', async () => {
    const live = refLive({ onRefer: vi.fn().mockRejectedValue(Object.assign(new Error('This person has already been referred for this role'), { status: 409 })) });
    show(<ReferralsScreen jobs={JOBS} referrals={[]} today={TODAY} live={live} />);
    await ue.click(screen.getByRole('button', { name: 'Refer someone' }));
    const d = screen.getByRole('dialog');
    await fill(d);
    await ue.click(within(d).getByRole('button', { name: 'Send referral' }));
    expect(await within(d).findByText('Already in our system')).toBeInTheDocument();
    expect(within(d).getByText(/already been referred for this role/)).toBeInTheDocument();
    expect(screen.queryByText('Ananya Iyer referred')).not.toBeInTheDocument();
  });

  it('no open jobs: the sheet says so; empty and error states', async () => {
    const live = refLive({ bonus: 0 });
    show(<ReferralsScreen jobs={[]} referrals={[]} today={TODAY} live={live} />);
    expect(screen.getByText("You haven't referred anyone yet.")).toBeInTheDocument();
    await ue.click(screen.getByRole('button', { name: 'Refer someone' }));
    expect(within(screen.getByRole('dialog')).getByText('No open jobs right now.')).toBeInTheDocument();
  });

  it('error state retries', async () => {
    const live = refLive({ state: 'error' });
    show(<ReferralsScreen jobs={JOBS} referrals={[]} today={TODAY} live={live} />);
    await ue.click(screen.getByRole('button', { name: /Try again|Retry/ }));
    expect(live.onRetry).toHaveBeenCalled();
  });
});

describe('HIR-11/12 founder answers 204-206 (live)', () => {
  it('any month of the quarter: three joined segments, starting on this month (206)', async () => {
    const live = costsLive({ months: [{ value: '2026-10', label: 'Oct' }, { value: '2026-11', label: 'Nov' }, { value: '2026-12', label: 'Dec' }], defaultMonth: '2026-11' });
    show(<RecruitingCostsScreen rows={[]} hires={0} live={live} />);
    await ue.click(screen.getAllByRole('button', { name: 'Add cost' })[0]!);
    const month = within(screen.getByRole('dialog')).getByRole('radiogroup', { name: 'Month' });
    expect(within(month).getAllByRole('radio').map((r) => r.textContent)).toEqual(['Oct', 'Nov', 'Dec']);
    expect(within(month).getByRole('radio', { name: 'Nov' })).toHaveAttribute('aria-checked', 'true');
  });

  it('a referral who left before the qualifying day shows no bonus (205)', () => {
    show(<ReferralsScreen jobs={JOBS} referrals={[{ ...REFS[1]!, bonus: 0, leftEarly: true }]} today={TODAY} live={refLive()} />);
    expect(screen.getByText('No bonus: they left before completing 60 days')).toBeInTheDocument();
  });

  const ALL: AllReferral[] = [
    { id: 'a1', name: 'Kiran Rao', job: 'Accountant', referrer: 'Neha Joshi', referred: new Date(2026, 4, 2), stage: 'Hired', bonus: 'due', dueOn: new Date(2026, 8, 29), amount: 15_000 },
    { id: 'a2', name: 'Sana Sheikh', job: 'Senior QA Engineer', referrer: 'Arjun Kulkarni', referred: new Date(2026, 6, 1), stage: 'Hired', bonus: 'waiting', dueOn: new Date(2026, 10, 20), amount: 25_000 },
  ];

  it('All referrals: totals, Mark bonus paid only when due, confirm then toast (204)', async () => {
    const onMarkPaid = vi.fn().mockResolvedValue(undefined);
    show(<AllReferralsScreen rows={ALL} live={{ onMarkPaid, onRetry: vi.fn() }} />);
    expect(screen.getByText('1 to pay')).toBeInTheDocument();
    const [due, waiting] = screen.getAllByRole('button', { name: /Row actions|Actions|More/ });
    await ue.click(waiting!);
    expect(await screen.findByRole('menuitem', { name: 'No bonus due yet' })).toHaveAttribute('aria-disabled', 'true');
    await ue.keyboard('{Escape}');
    await ue.click(due!);
    await ue.click(await screen.findByRole('menuitem', { name: 'Mark bonus paid' }));
    const d = screen.getByRole('dialog');
    expect(within(d).getByText('Mark ₹15,000 paid to Neha Joshi?')).toBeInTheDocument();
    expect(within(d).getByText(/goes into payroll as a one-time referral bonus/)).toBeInTheDocument();
    await ue.click(within(d).getByRole('button', { name: 'Mark paid' }));
    expect(onMarkPaid).toHaveBeenCalledWith('a1', 'payroll');
    expect((await screen.findAllByText('Bonus sent to payroll')).length).toBeGreaterThan(0);
  });

  it('All referrals: a refusal stays in the dialog, no toast; empty state', async () => {
    const onMarkPaid = vi.fn().mockRejectedValue(new Error('They left before the qualifying day, so no bonus is due.'));
    const { unmount } = show(<AllReferralsScreen rows={ALL} confirmId="a1" live={{ onMarkPaid, onRetry: vi.fn() }} />);
    const d = screen.getByRole('dialog');
    await ue.click(within(d).getByRole('button', { name: 'Mark paid' }));
    expect(await within(d).findByText('They left before the qualifying day, so no bonus is due.')).toBeInTheDocument();
    expect(screen.queryByText('Bonus sent to payroll')).not.toBeInTheDocument();
    unmount();
    show(<AllReferralsScreen rows={[]} />);
    expect(screen.getByText('No referrals yet.')).toBeInTheDocument();
  });

  it('a resignation waiting for approval: Bonus on hold in both lists, no Mark paid (answer 234)', async () => {
    show(<AllReferralsScreen rows={[{ ...ALL[0]!, bonus: 'on-hold' }]} live={{ onMarkPaid: vi.fn(), onRetry: vi.fn() }} />);
    expect(screen.getAllByText('Bonus on hold').length).toBeGreaterThan(0);
    await ue.click(screen.getByRole('button', { name: /Row actions|Actions|More/ }));
    expect(await screen.findByRole('menuitem', { name: 'On hold: their resignation is pending' })).toHaveAttribute('aria-disabled', 'true');
    expect(screen.queryByRole('menuitem', { name: 'Mark bonus paid' })).not.toBeInTheDocument();
  });

  it('My referrals says the bonus is on hold while the resignation is decided (234)', () => {
    show(<ReferralsScreen jobs={JOBS} referrals={[{ ...REFS[1]!, stage: 'Hired', joined: new Date(2026, 4, 1), onHold: true }]} today={TODAY} live={refLive()} />);
    expect(screen.getByText(/bonus on hold while their resignation is decided/)).toBeInTheDocument();
  });

  it('Paid outside payroll (285): HR picks it in the joined Segment; a referrer with no employee record gets it without a choice', async () => {
    const onMarkPaid = vi.fn().mockResolvedValue(undefined);
    const { unmount } = show(<AllReferralsScreen rows={ALL} confirmId="a1" live={{ onMarkPaid, onRetry: vi.fn() }} />);
    const d = screen.getByRole('dialog');
    await ue.click(within(d).getByRole('radio', { name: 'Paid outside payroll' }));
    expect(within(d).getByText(/No payroll line is made/)).toBeInTheDocument();
    await ue.click(within(d).getByRole('button', { name: 'Mark paid' }));
    expect(onMarkPaid).toHaveBeenCalledWith('a1', 'outside');
    expect((await screen.findAllByText('Bonus marked paid outside payroll')).length).toBeGreaterThan(0);
    unmount();
    const outsideOnly = vi.fn().mockResolvedValue(undefined);
    show(<AllReferralsScreen rows={[{ ...ALL[0]!, referrerIsEmployee: false }]} confirmId="a1" live={{ onMarkPaid: outsideOnly, onRetry: vi.fn() }} />);
    const d2 = screen.getByRole('dialog');
    expect(within(d2).getByText('Neha Joshi has no employee record')).toBeInTheDocument();
    expect(within(d2).queryByRole('radio', { name: 'Payroll' })).not.toBeInTheDocument();
    await ue.click(within(d2).getByRole('button', { name: 'Mark paid' }));
    expect(outsideOnly).toHaveBeenCalledWith('a1', 'outside');
  });

  it('Undo paid (283): in the row menu of a paid bonus; done is a toast; a refusal stays in the dialog with the reason', async () => {
    const paid: AllReferral = { ...ALL[0]!, bonus: 'paid', paidVia: 'payroll' };
    const onUndoPaid = vi.fn().mockResolvedValue(undefined);
    const { unmount } = show(<AllReferralsScreen rows={[paid]} live={{ onMarkPaid: vi.fn(), onUndoPaid, onRetry: vi.fn() }} />);
    await ue.click(screen.getByRole('button', { name: /Row actions|Actions|More/ }));
    await ue.click(await screen.findByRole('menuitem', { name: 'Undo paid' }));
    const d = screen.getByRole('dialog');
    expect(within(d).getByText(/Allowed until the payroll run that pays it is approved/)).toBeInTheDocument();
    await ue.click(within(d).getByRole('button', { name: 'Undo paid' }));
    expect(onUndoPaid).toHaveBeenCalledWith('a1');
    expect((await screen.findAllByText('Bonus is due again')).length).toBeGreaterThan(0);
    unmount();
    const refused = vi.fn().mockRejectedValue(new Error('The bonus was paid in the approved 2026-10 payroll, so it cannot be undone here. Payroll recovers it if needed.'));
    show(<AllReferralsScreen rows={[paid]} undoId="a1" live={{ onMarkPaid: vi.fn(), onUndoPaid: refused, onRetry: vi.fn() }} />);
    const d2 = screen.getByRole('dialog');
    await ue.click(within(d2).getByRole('button', { name: 'Undo paid' }));
    expect(await within(d2).findByText(/paid in the approved 2026-10 payroll/)).toBeInTheDocument();
    expect(screen.queryByText('Bonus is due again')).not.toBeInTheDocument();
  });

  it('without an undo action (no live undo) a paid bonus shows Bonus already paid', async () => {
    show(<AllReferralsScreen rows={[{ ...ALL[0]!, bonus: 'paid' }]} live={{ onMarkPaid: vi.fn(), onRetry: vi.fn() }} />);
    await ue.click(screen.getByRole('button', { name: /Row actions|Actions|More/ }));
    expect(await screen.findByRole('menuitem', { name: 'Bonus already paid' })).toHaveAttribute('aria-disabled', 'true');
  });
});
