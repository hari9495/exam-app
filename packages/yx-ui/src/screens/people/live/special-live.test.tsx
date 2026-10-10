import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { AbscondingScreen, PayeesCard, RehireCard, VrsCard } from './special';
import type { AbscondingRow, RehireView } from './types';

const ue = userEvent.setup({ pointerEventsCheck: 0 });

describe('Batch 6e screens', () => {
  it('rehire: a choice away from the policy needs a reason', async () => {
    const onSave = vi.fn(async () => ({}));
    const data: RehireView = {
      previous: { employeeCode: 'KF-010', joinedOn: '2025-04-01', exitedOn: '2026-06-30', exitType: 'resignation', rehireEligible: true, breakMonths: 3, sameEntityFy: true },
      options: [{ key: 'gratuity', label: 'gratuity service', choices: ['fresh', 'add_prior'], policy: 'fresh', value: 'fresh', overridden: false, reason: null, meaning: 'Gratuity service starts fresh.' }],
      version: 2,
    };
    render(<RehireCard data={data} onSave={onSave} />);
    expect(screen.getByText(/Break: 3 months/)).toBeInTheDocument();
    await ue.click(screen.getByRole('button', { name: 'Change choices' }));
    const dialog = screen.getByRole('dialog');
    await ue.click(within(dialog).getByRole('combobox', { name: 'gratuity service' }));
    await ue.click(screen.getByRole('option', { name: 'Add prior' }));
    expect(within(dialog).getByRole('button', { name: 'Save choices' })).toBeDisabled();
    await ue.type(within(dialog).getByRole('textbox', { name: /Why for this rehire/ }), 'Not paid out');
    await ue.click(within(dialog).getByRole('button', { name: 'Save choices' }));
    expect(onSave).toHaveBeenCalledWith({ gratuity: { value: 'add_prior', reason: 'Not paid out' } }, 2);
  });

  it('payees: shares must make 100 % before saving', async () => {
    render(<PayeesCard data={{ payees: [], total: '0.00', complete: false }} documents={[]} onSave={vi.fn()} />);
    expect(screen.getByText('Payees are not complete')).toBeInTheDocument();
    await ue.click(screen.getByRole('button', { name: 'Change' }));
    const dialog = screen.getByRole('dialog');
    await ue.type(within(dialog).getByRole('textbox', { name: /Name/ }), 'Meera');
    await ue.type(within(dialog).getByRole('textbox', { name: /Relation/ }), 'Wife');
    await ue.type(within(dialog).getByRole('textbox', { name: /Share/ }), '60');
    expect(within(dialog).getByRole('button', { name: 'Save payees' })).toBeDisabled();
    await ue.clear(within(dialog).getByRole('textbox', { name: /Share/ }));
    await ue.type(within(dialog).getByRole('textbox', { name: /Share/ }), '100');
    expect(within(dialog).getByRole('button', { name: 'Save payees' })).toBeEnabled();
  });

  it('absconding: a running timeline can be stopped, with a reason', async () => {
    const onStop = vi.fn(async () => ({}));
    const row: AbscondingRow = { id: 't', employeeId: 'e', name: 'Anil', lastPresentOn: '2026-11-01', status: 'running', stoppedReason: null, exitCaseId: null, version: 1, steps: [{ key: 'hold', label: 'Salary hold and alert', day: 3, dueOn: '2026-11-04', doneAt: '2026-11-04T00:00:00Z', note: null, dispatchRef: null }] };
    render(<AbscondingScreen state="ready" rows={[row]} today="2026-11-10" people={[]} onStart={vi.fn()} onStop={onStop} onResume={vi.fn()} onDispatch={vi.fn()} />);
    await ue.click(screen.getByRole('button', { name: /Stop: they came back/ }));
    const dialog = screen.getByRole('dialog');
    expect(within(dialog).getByRole('button', { name: 'Stop timeline' })).toBeDisabled();
    await ue.type(within(dialog).getByRole('textbox', { name: /Why/ }), 'Back from hospital');
    await ue.click(within(dialog).getByRole('button', { name: 'Stop timeline' }));
    expect(onStop).toHaveBeenCalledWith(row, 'Back from hospital');
  });

  it('VRS: only an eligible scheme offers Apply', () => {
    render(<VrsCard today="2026-10-09" onApply={vi.fn()} schemes={[{ id: 'a', name: 'VRS 2026', closesOn: '2026-11-30', minAge: 40, minServiceYears: 10, eligible: false }]} />);
    expect(screen.queryByRole('button', { name: 'Apply' })).toBeNull();
    expect(screen.getByText(/For age 40\+/)).toBeInTheDocument();
  });
});
