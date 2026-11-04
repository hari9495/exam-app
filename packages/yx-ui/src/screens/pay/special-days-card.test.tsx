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

  it('answer 121: Not paid needs a reason; then it leaves the review list with a toast; Undo while open', async () => {
    const onNotPaid = vi.fn().mockResolvedValue(undefined);
    const onUndoNotPaid = vi.fn().mockResolvedValue(undefined);
    show(<SpecialDaysCard data={SPECIAL_DAYS_SAMPLE} onSave={vi.fn()} onNotPaid={onNotPaid} onUndoNotPaid={onUndoNotPaid} />);
    await ue.click(screen.getByRole('button', { name: 'Not paid' }));
    const d = await screen.findByRole('dialog', { name: 'Not paid · Naveen Hegde' });
    await ue.click(within(d).getByRole('button', { name: 'Mark not paid' }));
    expect(await within(d).findByText('Say why it is not paid (5 letters or more).')).toBeInTheDocument();
    expect(onNotPaid).not.toHaveBeenCalled();
    await ue.type(within(d).getByRole('textbox', { name: /Why it is not paid/ }), 'Already paid as EC compensation');
    await ue.click(within(d).getByRole('button', { name: 'Mark not paid' }));
    expect(onNotPaid).toHaveBeenCalledWith('pc-1', 'Already paid as EC compensation');
    expect((await screen.findAllByText('Naveen Hegde: marked not paid')).length).toBeGreaterThan(0);
    const done = screen.getByRole('table', { name: /not paid/i });
    expect(within(done).getByText(/Paid in the full and final settlement/)).toBeInTheDocument();
    await ue.click(within(done).getByRole('button', { name: 'Undo' }));
    expect(onUndoNotPaid).toHaveBeenCalledWith('pc-0');
  });

  it('answer 121: no Not paid or Undo once the run is locked; a refusal stays in the dialog', async () => {
    const { unmount } = show(<SpecialDaysCard data={{ ...SPECIAL_DAYS_SAMPLE, editable: false }} onSave={vi.fn()} onNotPaid={vi.fn()} onUndoNotPaid={vi.fn()} />);
    expect(screen.queryByRole('button', { name: 'Not paid' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Undo' })).not.toBeInTheDocument();
    unmount();
    const onNotPaid = vi.fn().mockRejectedValue(new Error('This run is locked: nothing on it changes now.'));
    show(<SpecialDaysCard data={SPECIAL_DAYS_SAMPLE} onSave={vi.fn()} onNotPaid={onNotPaid} />);
    await ue.click(screen.getByRole('button', { name: 'Not paid' }));
    const d = await screen.findByRole('dialog');
    await ue.type(within(d).getByRole('textbox', { name: /Why it is not paid/ }), 'Paid elsewhere');
    await ue.click(within(d).getByRole('button', { name: 'Mark not paid' }));
    expect(await within(d).findByText('This run is locked: nothing on it changes now.')).toBeInTheDocument();
  });

  it('the PAY-03 design story shows the card on the Inputs tab', () => {
    show(<RunWorkspaceScreen tab="inputs" specialDays />);
    expect(screen.getByRole('region', { name: 'Special days' })).toBeInTheDocument();
    // A visible heading, like the other Inputs panels (not only an accessible name).
    expect(within(screen.getByRole('region', { name: 'Special days' })).getByRole('heading', { name: 'Special days' })).toBeVisible();
  });
});
