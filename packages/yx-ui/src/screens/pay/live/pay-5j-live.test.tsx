import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { StatutoryHubScreen } from './compliance';
import { FnfCalculator, type LiveFnf } from '../../people/exits';
import { rupees } from './runs';
import { DETAIL, FILINGS, FNF, HUB, PEOPLE, RETURNS, RUN } from './fixtures-5j';

const ue = userEvent.setup({ pointerEventsCheck: 0 });
const ok = vi.fn(async () => ({}) as never);
describe('batch 5j payroll screens', () => {
  it('rupees: Indian grouping from the API string', () => {
    expect(rupees('1234567.5')).toBe('₹12,34,567.50');
    expect(rupees('-200.00')).toBe('−₹200.00');

  });

  it('statutory hub: an uploaded filing is marked filed with its phrase; the TDS return waits for the filer’s .fvu', async () => {
    const onFiled = vi.fn(async () => ({}));
    render(
      <StatutoryHubScreen
        state="ready"
        entities={[{ id: 'e1', name: 'Kaveri Foods Pvt Ltd', shortName: 'KFPL', keys: [] }]}
        entityId="e1"
        onEntity={vi.fn()}
        month="2026-09"
        onMonth={vi.fn()}
        hub={HUB}
        filings={FILINGS}
        returns={RETURNS}
        can={{ generate: true, markFiled: true }}
        onGenerate={ok}
        onUploaded={ok}
        onFiled={onFiled}
        onDownload={ok}
        onCreateReturn={ok}
        onReconcile={ok}
        onReturnFile={ok}
        onUploadFvu={ok}
        onReturnFiled={ok}
      />,
    );
    expect(screen.getByRole('table', { name: 'Statutory dues' })).toHaveTextContent('Late');
    await ue.click(screen.getByRole('button', { name: 'Mark filed' }));
    await ue.type(screen.getByRole('textbox', { name: /Type/ }), 'FILED PF 2026-09');
    await ue.click(screen.getAllByRole('button', { name: 'Mark filed' }).pop()!);
    await waitFor(() => expect(onFiled).toHaveBeenCalledWith('fl1', expect.objectContaining({ phrase: 'FILED PF 2026-09' })));
  });

  // PPL-22: the live Full and final page is the designed calculator with the real settlement.
  const fnfLive = (over: Partial<LiveFnf> = {}): LiveFnf => ({
    state: 'ready',
    onRetry: vi.fn(),
    settlements: FNF,
    nameOf: (id) => PEOPLE.find((x) => x.employeeId === id)!.name,
    can: { manage: true, waiveNotice: true, prepare: true },
    onOpenRun: vi.fn(),
    onRecalculate: ok,
    onSubmit: ok,
    onHold: ok,
    onAdd: ok,
    onWaiveNotice: ok,
    onSecondRun: async () => ({ runId: 'r10' }),
    ...over,
  });

  it('F&F: the calculated run shows the lines grouped and explained, with totals from the run', async () => {
    const onSubmit = vi.fn(async () => ({}));
    const onRecalculate = vi.fn(async () => ({}));
    render(<FnfCalculator today={new Date(2026, 9, 19)} live={fnfLive({ settlements: [FNF[1]], onSubmit, onRecalculate })} />);
    expect(screen.getByText('F&F · Arjun Kulkarni')).toBeInTheDocument();
    expect(screen.getByText('Resignation · last working day 19 Oct 2026 · off-cycle run FNF-2026-0041')).toBeInTheDocument();
    expect(screen.getByText("Payment goes in the bank file; the F&F statement letter goes to Arjun's documents. Changes after payment follow corrections.")).toBeInTheDocument();
    expect(screen.getByText('2 working days left')).toBeInTheDocument();
    expect(screen.getByText('Wages due on exit by 21 Oct 2026')).toBeInTheDocument();
    expect(screen.getByText('Gratuity: not due. 2 years 4 months of service; gratuity needs 5 years.')).toBeInTheDocument();
    const earnings = screen.getByRole('region', { name: 'Earnings' });
    expect(earnings).toHaveTextContent('Salary to the last working day (19 Oct 2026)Wage line₹35,000');
    expect(earnings).toHaveTextContent('Basic ₹25,000: ₹40000.00 a month × 19 of 31 days.');
    expect(earnings).toHaveTextContent('Pending reimbursement: Travel to MysuruPulled automatically₹3,450');
    expect(within(earnings).getAllByText('Wage line')).toHaveLength(2);
    // A recovery is money the leaver owes (founder 25 Oct 2026): listed under Recoveries, to recover, never "To pay".
    const recoveries = screen.getByRole('region', { name: 'Recoveries' });
    expect(recoveries).toHaveTextContent(/Expense advance: Delhi trip.*Pulled automatically.*To recover.*₹5,000/);
    expect(recoveries).not.toHaveTextContent('To pay');
    expect(screen.getByRole('region', { name: 'Tax' })).toHaveTextContent('Income tax (TDS)₹6,210');
    expect(screen.getByRole('region', { name: 'Tax' })).not.toHaveTextContent('Provident fund');
    expect(screen.getByRole('region', { name: 'Statutory deductions' })).toHaveTextContent('Provident fund₹1,800');
    const totals = screen.getByText('Totals').closest('section') as HTMLElement;
    expect(totals).toHaveTextContent('Earnings₹46,450of which wage lines₹43,000Recoveries₹5,000TDS₹6,210Statutory deductions₹1,800Net payable₹33,440');
    // Founder 26 Oct 2026: no Hold on wage lines (due in 2 working days), recoveries or claims (changed in Expenses).
    expect(screen.queryAllByRole('button', { name: 'Hold', hidden: true })).toHaveLength(0);
    await ue.click(screen.getByRole('button', { name: 'Recalculate' }));
    await waitFor(() => expect(onRecalculate).toHaveBeenCalledWith(FNF[1]));
    await ue.click(screen.getByRole('button', { name: 'Send for approval' }));
    await waitFor(() => expect(onSubmit).toHaveBeenCalledWith(FNF[1]));
  });

  it('F&F: before the run is calculated, salary and TDS wait; a held line shows why and is released', async () => {
    const onHold = vi.fn(async () => ({}));
    render(<FnfCalculator today={new Date(2026, 9, 16)} live={fnfLive({ settlements: [FNF[0]], onHold })} />);
    expect(screen.getByText('Part of this F&F is held')).toBeInTheDocument();
    expect(screen.getByText('Pay now').parentElement).toHaveTextContent('Pay now—');
    expect(screen.getByText('Held back').parentElement).toHaveTextContent('Held back₹44,000');
    // As the design's held story: a short tag by the title, the full reason inside the opened line.
    const notice = within(screen.getByRole('region', { name: 'Earnings' })).getByText('Notice pay').closest('li') as HTMLElement;
    expect(within(notice).getByText('Held: permission needed')).toBeInTheDocument();
    expect(within(notice).getByText("Held because: The establishment has 350 workers: the government's permission for retrenchment is needed first.")).toBeInTheDocument();
    expect(screen.getByRole('region', { name: 'Tax' })).toHaveTextContent('Worked out on the final income for the year when the F&F run is calculated.');
    expect(screen.getByText('Gratuity: 5 years 7 months counts as 6 years (6 months or more rounds up). Due within 30 days, by 15 Nov 2026.')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Send for approval' })).toBeDisabled();
    await ue.click(screen.getByRole('button', { name: 'Release', hidden: true }));
    await waitFor(() => expect(onHold).toHaveBeenCalledWith(FNF[0], 'i1', null, 'Released for payment'));
  });

  it('F&F: a calculated run whose lines changed since says it needs recalculating', () => {
    render(<FnfCalculator today={new Date(2026, 9, 19)} live={fnfLive({ settlements: [{ ...FNF[1], salary: null }] })} />);
    expect(screen.getByText('Needs recalculating')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Send for approval' })).toBeDisabled();
  });

  it('F&F: hold with a reason, add a line, waive the notice, and pick another settlement', async () => {
    const onHold = vi.fn(async () => ({}));
    const onAdd = vi.fn(async () => ({}));
    const onWaiveNotice = vi.fn(async () => ({}));
    const gratuity = { ...FNF[1], items: [...FNF[1].items, { ...FNF[1].items[0], id: 'j4', componentCode: 'gratuity', title: 'Gratuity', wage: false }] };
    render(<FnfCalculator today={new Date(2026, 9, 19)} live={fnfLive({ settlements: [FNF[0], gratuity], onHold, onAdd, onWaiveNotice })} />);
    await ue.click(screen.getByRole('combobox', { name: 'Settlement for' }));
    await ue.click(screen.getByRole('option', { name: 'Arjun Kulkarni · Resignation' }));
    await ue.click(screen.getByRole('button', { name: 'Hold', hidden: true }));
    let dialog = await screen.findByRole('dialog');
    await ue.type(within(dialog).getByRole('textbox', { name: /Why/ }), 'Leave balance disputed');
    await ue.click(within(dialog).getByRole('button', { name: 'Hold' }));
    await waitFor(() => expect(onHold).toHaveBeenCalledWith(gratuity, 'j4', 'Leave balance disputed', 'Leave balance disputed'));
    await ue.click(screen.getByRole('button', { name: 'More settlement actions' }));
    await ue.click(await screen.findByRole('menuitem', { name: 'Add a line' }));
    dialog = await screen.findByRole('dialog');
    await ue.click(within(dialog).getByRole('combobox', { name: 'Line' }));
    await ue.click(screen.getByRole('option', { name: 'Settlement recovery' }));
    await ue.type(within(dialog).getByRole('textbox', { name: /Amount/ }), '1200.50');
    await ue.type(within(dialog).getByRole('textbox', { name: /What it is/ }), 'Canteen dues');
    await ue.click(within(dialog).getByRole('button', { name: 'Add line' }));
    expect(within(dialog).getByText('Enter a reason of at least 5 characters.')).toBeInTheDocument();
    expect(onAdd).not.toHaveBeenCalled();
    await ue.type(within(dialog).getByRole('textbox', { name: /Why/ }), 'Canteen dues at exit');
    await ue.click(within(dialog).getByRole('button', { name: 'Add line' }));
    await waitFor(() => expect(onAdd).toHaveBeenCalledWith(gratuity, { componentCode: 'fnf_recovery', amount: '1200.50', label: 'Canteen dues' }, 'Canteen dues at exit'));
    await ue.click(screen.getByRole('button', { name: 'More settlement actions' }));
    await ue.click(await screen.findByRole('menuitem', { name: 'Waive notice recovery' }));
    dialog = await screen.findByRole('dialog');
    await ue.type(within(dialog).getByRole('textbox', { name: /Why/ }), 'Leaving to care for a parent');
    await ue.click(within(dialog).getByRole('button', { name: 'Waive' }));
    await waitFor(() => expect(onWaiveNotice).toHaveBeenCalledWith(gratuity, 'Leaving to care for a parent'));
  });

  it('F&F: without payroll.fnf.manage the lines are read-only and the run is not prepared here', () => {
    render(<FnfCalculator today={new Date(2026, 9, 19)} live={fnfLive({ settlements: [FNF[1]], can: { manage: false, waiveNotice: true, prepare: false } })} />);
    expect(screen.queryByRole('button', { name: 'Hold', hidden: true })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Recalculate' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Send for approval' })).not.toBeInTheDocument();
  });
});
