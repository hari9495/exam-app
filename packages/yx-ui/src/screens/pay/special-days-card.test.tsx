import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { ToastProvider } from '../../components/notify';
import { SPECIAL_DAYS_SAMPLE, SpecialDaysCard } from './special-days-card';
import { RunWorkspaceScreen } from './payroll-run';

// PAY-03 Inputs › Special days (HLP-12 founder answers 92 and 93): positive and negative.
const ue = userEvent.setup({ pointerEventsCheck: 0 });
const show = (ui: React.ReactElement) => render(<ToastProvider>{ui}</ToastProvider>);

describe('Special days card', () => {
  it('shows each person with where the days came from, and the late injury leave to review', () => {
    show(<SpecialDaysCard data={SPECIAL_DAYS_SAMPLE} onSave={vi.fn()} />);
    const table = screen.getByRole('table', { name: 'Special days' });
    expect(within(table).getByText('Injury leave in Time')).toBeInTheDocument();
    expect(within(table).getByText('Entered by payroll')).toBeInTheDocument();
    expect(screen.getByText('Injury leave approved after its month was locked')).toBeInTheDocument();
    expect(within(screen.getByRole('table', { name: 'Late injury leave to review' })).getByText('Naveen Hegde')).toBeInTheDocument();
  });

  it('Edit: pressed with a bad value says what to fix and saves nothing; a good value saves with a toast', async () => {
    const onSave = vi.fn().mockResolvedValue(undefined);
    show(<SpecialDaysCard data={SPECIAL_DAYS_SAMPLE} onSave={onSave} />);
    await ue.click(within(screen.getByRole('table', { name: 'Special days' })).getAllByRole('button', { name: 'Edit' })[0]);
    const d = await screen.findByRole('dialog', { name: /Injury days · Sathish Kumar/ });
    await ue.clear(within(d).getByRole('textbox', { name: /Days this month/ }));
    await ue.type(within(d).getByRole('textbox', { name: /Days this month/ }), '40');
    await ue.click(within(d).getByRole('button', { name: 'Save' }));
    expect(await within(d).findByText('A month has at most 31 days.')).toBeInTheDocument();
    expect(within(d).getByText('Say why (3 letters or more).')).toBeInTheDocument();
    expect(onSave).not.toHaveBeenCalled();
    await ue.clear(within(d).getByRole('textbox', { name: /Days this month/ }));
    await ue.type(within(d).getByRole('textbox', { name: /Days this month/ }), '4.5');
    await ue.type(within(d).getByRole('textbox', { name: /Why/ }), 'Doctor fit from 10 Nov');
    await ue.click(within(d).getByRole('button', { name: 'Save' }));
    expect(onSave).toHaveBeenCalledWith({ employeeId: 'e-sathish', kind: 'injury', days: '4.5', note: 'Doctor fit from 10 Nov' });
    expect((await screen.findAllByText('Sathish Kumar: 4.5 days saved')).length).toBeGreaterThan(0);
  });

  it('late injury leave is added only when payroll presses "Add to this month" (prefilled, still saved by payroll)', async () => {
    const onSave = vi.fn().mockResolvedValue(undefined);
    show(<SpecialDaysCard data={SPECIAL_DAYS_SAMPLE} onSave={onSave} />);
    expect(onSave).not.toHaveBeenCalled();
    await ue.click(screen.getByRole('button', { name: 'Add to this month' }));
    const d = await screen.findByRole('dialog', { name: /Injury days · Naveen Hegde/ });
    expect(within(d).getByRole('textbox', { name: /Days this month/ })).toHaveValue('3');
    await ue.click(within(d).getByRole('button', { name: 'Save' }));
    expect(onSave).toHaveBeenCalledWith(expect.objectContaining({ employeeId: 'e-naveen', kind: 'injury', days: '3' }));
  });

  it('not editable (locked month or no key): no Edit or Add buttons, and it says why', () => {
    show(<SpecialDaysCard data={{ ...SPECIAL_DAYS_SAMPLE, editable: false }} onSave={vi.fn()} />);
    expect(screen.queryByRole('button', { name: 'Edit' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Add to this month' })).not.toBeInTheDocument();
    expect(screen.getByText(/can be changed while the run is a draft or in review/)).toBeInTheDocument();
  });

  it('a refusal stays in the dialog', async () => {
    const onSave = vi.fn().mockRejectedValue(new Error('2026-11 is locked: record it as a correction for the next payroll.'));
    show(<SpecialDaysCard data={SPECIAL_DAYS_SAMPLE} onSave={onSave} />);
    await ue.click(within(screen.getByRole('table', { name: 'Special days' })).getAllByRole('button', { name: 'Edit' })[1]);
    const d = await screen.findByRole('dialog');
    await ue.click(within(d).getByRole('button', { name: 'Save' }));
    expect(await within(d).findByText(/is locked: record it as a correction/)).toBeInTheDocument();
  });

  it('the PAY-03 design story shows the card on the Inputs tab', () => {
    show(<RunWorkspaceScreen tab="inputs" specialDays />);
    expect(screen.getByRole('region', { name: 'Special days' })).toBeInTheDocument();
  });
});
