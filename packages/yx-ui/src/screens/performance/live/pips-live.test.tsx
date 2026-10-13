import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { PipScreen, type PipScreenProps } from './pips';
import type { Pip } from './types';

// Performance batch PM8 screens (M06-BUILD-DESIGN §13; PRF-12; PM-8.03).

const ue = userEvent.setup({ pointerEventsCheck: 0 });
const ok = async () => ({});
const base: Pip = {
  id: 'p1', employee: 'Arjun', employeeId: 'e1', manager: 'Priya', reason: 'Accuracy fell.', expectations: 'Errors at most 2%.', support: 'Coaching.',
  startsOn: '2026-10-01', plannedEndsOn: '2026-10-31', endsOn: '2026-10-31', pausedDays: 0, pausedNow: false, checkinEveryDays: 7, status: 'active',
  acknowledgedAt: null, employeeComment: null, extendedFrom: null, extendReason: null, outcomeNote: null, outcomeAt: null, letterId: null, exitCaseId: null,
  goals: [], checkins: [{ id: 'c1', dueOn: '2026-10-08', heldOn: null, managerNote: null, employeeNote: null, status: 'due' }],
  warning: false, role: 'employee', can: { acknowledge: true, checkin: false, employeeNote: true, outcome: false, extend: false, letter: false, startExit: false }, version: 2,
};
const sp = (pip: Partial<Pip> = {}, o: Partial<PipScreenProps> = {}): PipScreenProps => ({ state: 'ready', pip: { ...base, ...pip }, onBack: vi.fn(), onAcknowledge: vi.fn(ok), onCheckin: vi.fn(ok), onOutcome: vi.fn(ok), onLetter: vi.fn(ok), onStartExit: vi.fn(ok), ...o });

describe('Improvement plans (PM8)', () => {
  it('the employee acknowledges with a comment, and is told it is not agreeing', async () => {
    const p = sp();
    render(<PipScreen {...p} />);
    expect(screen.getByText(/It does not mean you agree/)).toBeInTheDocument();
    await ue.click(screen.getByRole('button', { name: 'Acknowledge' }));
    const d = screen.getByRole('dialog');
    await ue.type(within(d).getByRole('textbox', { name: /Your comment/ }), 'I will try');
    await ue.click(within(d).getByRole('button', { name: 'Acknowledge' }));
    expect(p.onAcknowledge).toHaveBeenCalledWith('I will try');
  });

  it('HR sees the warning and the pause; extending asks for a date; not met says nothing happens by itself', async () => {
    const p = sp({ role: 'hr', warning: true, pausedNow: true, can: { ...base.can, acknowledge: false, outcome: true, extend: true } });
    const { rerender } = render(<PipScreen {...p} />);
    expect(screen.getByText('Check with the case owner')).toBeInTheDocument();
    expect(screen.getByText('Paused for protected leave')).toBeInTheDocument();
    await ue.click(screen.getByRole('button', { name: 'Record the outcome' }));
    const d = screen.getByRole('dialog');
    await ue.click(within(d).getByRole('radio', { name: 'Extend once' }));
    await ue.type(within(d).getByRole('textbox', { name: /Why extend/ }), 'Leave');
    expect(within(d).getByRole('button', { name: 'Save' })).toBeDisabled();
    await ue.click(within(d).getByRole('radio', { name: 'Not met' }));
    expect(within(d).getByText(/does not start an exit/)).toBeInTheDocument();
    await ue.click(within(d).getByRole('button', { name: 'Save' }));
    expect(p.onOutcome).toHaveBeenCalledWith({ outcome: 'not_met', note: 'Leave', extendTo: null });
    rerender(<PipScreen {...sp({ role: 'hr', status: 'not_met', can: { ...base.can, acknowledge: false, startExit: true } })} />);
    expect(screen.getByText('Not met. Nothing else happens by itself.')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Start an exit case' })).toBeInTheDocument();
  });
});
