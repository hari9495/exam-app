import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { PayeesDialog, RehireCard } from './special';
import { VrsApply, vrsWhyNot } from '../relations';
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
    await ue.click(within(dialog).getByRole('button', { name: 'Save choices' }));
    expect(within(dialog).getByText('Enter a reason of at least 3 characters.')).toBeInTheDocument();
    expect(onSave).not.toHaveBeenCalled();
    await ue.type(within(dialog).getByRole('textbox', { name: /Why for this rehire/ }), 'Not paid out');
    await ue.click(within(dialog).getByRole('button', { name: 'Save choices' }));
    expect(onSave).toHaveBeenCalledWith({ gratuity: { value: 'add_prior', reason: 'Not paid out' } }, 2);
  });

  it('payees: shares must make 100 % before saving', async () => {
    const onSave = vi.fn(async () => ({}));
    render(<PayeesDialog current={[]} documents={[]} onClose={vi.fn()} onSave={onSave} />);
    const dialog = screen.getByRole('dialog');
    await ue.type(within(dialog).getByRole('textbox', { name: /Name/ }), 'Meera');
    await ue.type(within(dialog).getByRole('textbox', { name: /Relation/ }), 'Wife');
    await ue.type(within(dialog).getByRole('textbox', { name: /Share/ }), '60');
    await ue.click(within(dialog).getByRole('button', { name: 'Save payees' }));
    expect(within(dialog).getByText('Make the shares add up to 100 %.')).toBeInTheDocument();
    expect(onSave).not.toHaveBeenCalled();
    await ue.clear(within(dialog).getByRole('textbox', { name: /Share/ }));
    await ue.type(within(dialog).getByRole('textbox', { name: /Share/ }), '100');
    await ue.click(within(dialog).getByRole('button', { name: 'Save payees' }));
    expect(onSave).toHaveBeenCalledWith([{ kind: 'nominee', name: 'Meera', relation: 'Wife', sharePercent: '100', email: null, documentId: null }]);
  });

  it('VRS (PPL-40): a scheme I am not eligible for says why, with my age and years, and offers no Apply', () => {
    const scheme = { id: 'a', name: 'VRS 2026', closesOn: '2026-11-30', minAge: 40, minServiceYears: 10, eligible: false, age: 38, serviceYears: 7 };
    render(<VrsApply today="2026-10-09" onApply={vi.fn()} schemes={[scheme]} />);
    expect(screen.queryByRole('button', { name: 'Apply for VRS' })).toBeNull();
    expect(screen.getByText("You're not eligible for this scheme")).toBeInTheDocument();
    expect(screen.getByText(/It needs age 40\+ and 10\+ years of service\. You are 38 with 7 years of service\./)).toBeInTheDocument();
    expect(vrsWhyNot({ ...scheme, age: null })).toMatch(/date of birth is not on your record/);
  });

  it('VRS (PPL-40): eligible shows my estimate; Apply without a day shows the error; then sends the day and the note', async () => {
    const onApply = vi.fn().mockResolvedValue(undefined);
    const estimate = { benefit: '1296000', benefitBasis: '45 days × 24 years', gratuity: '1034000', leaveDays: '42', leaveEncashment: '84000' };
    render(<VrsApply today="2026-10-09" onApply={onApply} schemes={[{ id: 'a', name: 'VRS 2026', closesOn: '2026-11-30', minAge: 50, minServiceYears: 10, eligible: true, age: 57, serviceYears: 24, estimate }]} />);
    expect(screen.getByText('₹12,96,000 (45 days × 24 years)')).toBeInTheDocument();
    expect(screen.getByText('On top: leave encashment (42 days)')).toBeInTheDocument();
    await ue.click(screen.getByRole('button', { name: 'Apply for VRS' }));
    expect((await screen.findAllByText('Choose the last working day you would like.')).length).toBeGreaterThan(0);
    expect(onApply).not.toHaveBeenCalled();
    await ue.type(screen.getByRole('textbox', { name: /Preferred last working day/ }), '30 Nov 2026');
    await ue.tab();
    await ue.type(screen.getByRole('textbox', { name: /Anything HR should know/ }), 'Family move');
    await ue.click(screen.getByRole('button', { name: 'Apply for VRS' }));
    await waitFor(() => expect(onApply).toHaveBeenCalledWith(expect.objectContaining({ id: 'a' }), { requestedLwd: '2026-11-30', reasonText: 'Family move' }));
  });

  it('VRS (PPL-40): no pay on record says so instead of an estimate; a refusal shows', async () => {
    render(<VrsApply today="2026-10-09" onApply={() => Promise.reject(new Error('You already have an exit in progress.'))} schemes={[{ id: 'a', name: 'VRS 2026', closesOn: '2026-11-30', minAge: 50, minServiceYears: 10, eligible: true, age: 57, serviceYears: 24, estimate: null }]} />);
    expect(screen.getByText(/Your estimate needs your pay on record/)).toBeInTheDocument();
    await ue.type(screen.getByRole('textbox', { name: /Preferred last working day/ }), '30 Nov 2026');
    await ue.tab();
    await ue.click(screen.getByRole('button', { name: 'Apply for VRS' }));
    expect(await screen.findByText('You already have an exit in progress.')).toBeInTheDocument();
  });
});
