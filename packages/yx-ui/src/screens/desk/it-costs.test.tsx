import { useState } from 'react';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { ToastProvider } from '../../components/notify';
import { CostsPanel } from './ticket';
import { ItBudgetsScreen } from './it-budgets';
import { DeskSetupScreen } from './setup';
import { COSTS, DESK, DETAIL, HR_DESK, IT_BUDGETS } from './data';
import { dayKey } from '../../lib/dates';

// GLPI 7 (answer 2719): ticket costs, the IT budgets page and the team's hourly rate.
const ue = userEvent.setup({ pointerEventsCheck: 0 });
const ok = () => vi.fn().mockResolvedValue(undefined);

describe('CostsPanel', () => {
  it('shows time at the rate, the lines and the total; adds a material cost', async () => {
    const onAdd = ok();
    render(<CostsPanel costs={COSTS} work busy={false} onAdd={onAdd} onRemove={ok()} />);
    expect(screen.getByText(/at ₹650 an hour/)).toBeInTheDocument();
    expect(screen.getByText('₹9,775')).toBeInTheDocument();
    expect(screen.getByText('Engineering')).toBeInTheDocument();
    await ue.type(screen.getByLabelText('What for'), 'Docking station');
    await ue.type(screen.getByLabelText('Amount'), '6200.50');
    await ue.click(screen.getByRole('button', { name: 'Add cost' }));
    await waitFor(() => expect(onAdd).toHaveBeenCalledWith({ kind: 'material', description: 'Docking station', amount: '6200.5', costOn: dayKey(new Date()) }));
  });

  it('2810: the date can be set to the day the ticket was opened', async () => {
    const onAdd = ok();
    render(<CostsPanel costs={COSTS} work busy={false} onAdd={onAdd} onRemove={ok()} />);
    await ue.type(screen.getByLabelText('What for'), 'Spare charger');
    await ue.type(screen.getByLabelText('Amount'), '1800');
    const date = screen.getByLabelText('Date');
    await ue.clear(date);
    await ue.type(date, '20 Nov 2026{Enter}');
    await ue.click(screen.getByRole('button', { name: 'Add cost' }));
    await waitFor(() => expect(onAdd).toHaveBeenCalledWith(expect.objectContaining({ costOn: '2026-11-20' })));
  });

  it('negative 2810: a date before the ticket was opened, or no date, is refused and nothing is sent', async () => {
    const onAdd = ok();
    render(<CostsPanel costs={COSTS} work busy={false} onAdd={onAdd} onRemove={ok()} />);
    await ue.type(screen.getByLabelText('What for'), 'Spare charger');
    await ue.type(screen.getByLabelText('Amount'), '1800');
    const date = screen.getByLabelText('Date');
    await ue.clear(date);
    await ue.type(date, '19 Nov 2026');
    await ue.tab();
    expect(await screen.findByText(/Choose a date on or after 20 Nov 2026/)).toBeInTheDocument();
    await ue.clear(date);
    await ue.tab();
    await ue.click(screen.getByRole('button', { name: 'Add cost' }));
    expect(await screen.findByText('Choose the date of the cost.')).toBeInTheDocument();
    expect(onAdd).not.toHaveBeenCalled();
  });

  it('negative: nothing is sent without what and how much; only own lines can be taken off, with a reason', async () => {
    const onAdd = ok();
    const onRemove = ok();
    render(<CostsPanel costs={COSTS} work busy={false} onAdd={onAdd} onRemove={onRemove} />);
    await ue.click(screen.getByRole('button', { name: 'Add cost' }));
    expect(await screen.findByText('Say what the cost is for.')).toBeInTheDocument();
    expect(screen.getByText('Enter the amount in rupees.')).toBeInTheDocument();
    expect(onAdd).not.toHaveBeenCalled();
    // The courier line was added by someone else: no Take off for it.
    expect(screen.getAllByRole('button', { name: 'Take off' })).toHaveLength(1);
    await ue.click(screen.getByRole('button', { name: 'Take off' }));
    const dlg = await screen.findByRole('dialog', { name: 'Take this cost off?' });
    await ue.click(within(dlg).getByRole('button', { name: 'Take off' }));
    expect(await within(dlg).findByText('Say why (at least 3 letters).')).toBeInTheDocument();
    expect(onRemove).not.toHaveBeenCalled();
    await ue.type(within(dlg).getByLabelText(/Why/), 'Charged twice');
    await ue.click(within(dlg).getByRole('button', { name: 'Take off' }));
    await waitFor(() => expect(onRemove).toHaveBeenCalledWith('cl-1', 'Charged twice'));
  });

  it('negative: without work rights the costs are shown but nothing can be added or taken off', () => {
    render(<CostsPanel costs={COSTS} work={false} busy={false} onAdd={ok()} onRemove={ok()} />);
    expect(screen.queryByRole('button', { name: 'Add cost' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Take off' })).toBeNull();
  });
});

describe('ItBudgetsScreen', () => {
  function Screen({ onSet }: { onSet: (d: string, y: number, a: string) => Promise<void> }) {
    const [year, setYear] = useState(2026);
    return (
      <ToastProvider>
        <ItBudgetsScreen state="ready" data={{ ...IT_BUDGETS, year }} year={year} thisYear={2026} onYear={setYear} onSet={onSet} />
      </ToastProvider>
    );
  }

  it('lists spent and left, flags a department over budget, and sets a budget', async () => {
    const onSet = ok();
    render(<Screen onSet={onSet} />);
    expect(screen.getByText('Over by ₹11,150')).toBeInTheDocument();
    expect(screen.getByText(/₹1,950 spent for requesters with no department/)).toBeInTheDocument();
    await ue.click(screen.getByRole('button', { name: 'Set budget' }));
    const dlg = await screen.findByRole('dialog', { name: 'IT budget for 2026–27' });
    await ue.type(within(dlg).getByLabelText(/Budget for the year/), '150000');
    await ue.click(within(dlg).getByRole('button', { name: 'Save budget' }));
    await waitFor(() => expect(onSet).toHaveBeenCalledWith('dp-ops', 2026, '150000'));
    expect((await screen.findAllByText('Budget saved.')).length).toBeGreaterThan(0);
  });

  it('negative: Save with no department or amount sends nothing', async () => {
    const onSet = ok();
    render(<Screen onSet={onSet} />);
    await ue.click(screen.getByRole('button', { name: 'Set a budget' }));
    const dlg = await screen.findByRole('dialog');
    await ue.click(within(dlg).getByRole('button', { name: 'Save budget' }));
    expect(await within(dlg).findByText('Choose a department.')).toBeInTheDocument();
    expect(within(dlg).getByText('Enter the budget in rupees (0 or more).')).toBeInTheDocument();
    expect(onSet).not.toHaveBeenCalled();
  });

  it('negative: no access shows the no-access state, not the table', () => {
    render(<ItBudgetsScreen state="no-access" data={null} year={2026} thisYear={2026} onYear={() => {}} onSet={ok()} />);
    expect(screen.queryByRole('table')).toBeNull();
    expect(screen.queryByRole('button', { name: 'Set a budget' })).toBeNull();
  });
});

describe('team hourly rate', () => {
  const setup = (detail: typeof DETAIL, onSaveGroup: ReturnType<typeof ok>) =>
    render(
      <ToastProvider>
        <DeskSetupScreen state="ready" initialTab="groups" desks={[DESK, HR_DESK]} canCreate={false} selectedId={detail.desk.id} onSelect={() => {}} detail={{ ...detail, canSetUp: true }} canned={[]} calendars={[]} canCalendars={false} onCreateDesk={ok()} onUpdateDesk={ok()} onSearchUsers={async () => []} onSeatCost={vi.fn()} onAddMember={ok()} onEndMember={ok()} onSaveGroup={onSaveGroup} onSaveCategory={ok()} onSaveType={ok()} onSaveStatus={ok()} onSaveMatrix={ok()} onSaveCanned={ok()} onSaveScenario={ok()} onAddHoliday={ok()} onSetHours={ok()} />
      </ToastProvider>,
    );

  it('an IT desk team saves its hourly rate', async () => {
    const onSaveGroup = ok();
    setup(DETAIL, onSaveGroup);
    expect(screen.getByText(/₹650 an hour/)).toBeInTheDocument();
    await ue.click(screen.getByRole('button', { name: 'Edit' }));
    const rate = await screen.findByLabelText(/Hourly rate/);
    await ue.clear(rate);
    await ue.type(rate, '700');
    await ue.click(screen.getByRole('button', { name: 'Save group' }));
    await waitFor(() => expect(onSaveGroup).toHaveBeenCalledWith('g-1', expect.objectContaining({ hourlyRate: '700' })));
  });

  it('negative: another kind of desk has no hourly rate and sends none', async () => {
    const onSaveGroup = ok();
    setup({ ...DETAIL, desk: { ...DETAIL.desk, kind: 'hr' } }, onSaveGroup);
    await ue.click(screen.getByRole('button', { name: 'Edit' }));
    await screen.findByRole('dialog');
    expect(screen.queryByLabelText(/Hourly rate/)).toBeNull();
    await ue.click(screen.getByRole('button', { name: 'Save group' }));
    await waitFor(() => expect(onSaveGroup).toHaveBeenCalled());
    expect(onSaveGroup.mock.calls[0][1]).not.toHaveProperty('hourlyRate');
  });
});
