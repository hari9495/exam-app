import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { GoalScreen, GoalsScreen, type GoalScreenProps, type GoalsScreenProps } from './goals';
import type { GoalDetail, GoalSummary } from './types';

// Performance batch PM2 goal screens (M06-BUILD-DESIGN §7; PRF-01 / 02 / 03; PM-2.04).

const ue = userEvent.setup({ pointerEventsCheck: 0 });
const ok = async () => ({});
const goal = (o: Partial<GoalSummary> = {}): GoalSummary => ({ id: 'g1', periodId: 'p1', ownerType: 'person', ownerEmployeeId: 'e1', ownerDepartmentId: null, owner: 'Arjun', parentGoalId: null, kind: 'okr', title: 'Close three new accounts', weight: 60, status: 'active', progress: 66.67, version: 2, ...o });
const detail = (o: Partial<GoalDetail> = {}): GoalDetail => ({ ...goal(), description: null, keyResults: [{ id: 'k1', title: 'Accounts signed', unit: null, direction: 'up', start: 0, target: 3, current: 2, weight: 1, progress: 66.67 }], parent: null, children: [], checkins: [], pendingChange: null, decisionNote: null, can: { edit: true, checkIn: true, drop: true, cascade: false }, ...o });
const listProps = (o: Partial<GoalsScreenProps> = {}): GoalsScreenProps => ({ state: 'ready', periods: [{ id: 'p1', name: 'H2', fromOn: '2026-10-01', toOn: '2027-03-31', status: 'open' }], periodId: 'p1', onPeriod: vi.fn(), view: 'mine', onView: vi.fn(), goals: [goal(), goal({ id: 'g2', status: 'draft', weight: 30 })], totalWeight: 90, canManage: false, departments: [], alignOptions: [{ id: 'g0', title: 'Team revenue', owner: 'Priya' }], onCreate: vi.fn(ok), onSubmitGoals: vi.fn(ok), onAddPeriod: vi.fn(ok), onOpen: vi.fn(), ...o });
const goalProps = (o: Partial<GoalScreenProps> = {}): GoalScreenProps => ({ state: 'ready', goal: detail(), alignOptions: [], departments: [], team: [], onBack: vi.fn(), onSave: vi.fn(ok), onCheckIn: vi.fn(ok), onDrop: vi.fn(ok), onCascade: vi.fn(ok), onOpen: vi.fn(), ...o });

describe('Goals (PM2)', () => {
  it('my goals warn until weights reach 100 and send drafts to the manager together', async () => {
    const p = listProps();
    render(<GoalsScreen {...p} />);
    expect(screen.getByText('Weights add up to 90 of 100')).toBeInTheDocument();
    await ue.click(screen.getByRole('button', { name: 'Send my goal to my manager' }));
    expect(p.onSubmitGoals).toHaveBeenCalled();
    expect(screen.getByRole('radiogroup', { name: 'Show' })).toBeInTheDocument();
  });

  it('a new objective needs a key result with a target past its start; it can align to a team goal', async () => {
    const p = listProps();
    render(<GoalsScreen {...p} />);
    await ue.click(screen.getByRole('button', { name: 'Add a goal' }));
    const sheet = screen.getByRole('dialog');
    await ue.type(within(sheet).getByRole('textbox', { name: /^Goal/ }), 'Open two new depots');
    await ue.type(within(sheet).getByRole('textbox', { name: /^Key result 1/ }), 'Depots opened');
    await ue.click(within(sheet).getByRole('button', { name: 'Save' }));
    expect(p.onCreate).not.toHaveBeenCalled();
    expect(within(sheet).getAllByText(/a target past its start/).length).toBeGreaterThan(0);
    await ue.type(within(sheet).getByRole('textbox', { name: /^Target/ }), '2');
    await ue.click(within(sheet).getByRole('button', { name: 'Save' }));
    expect(p.onCreate).toHaveBeenCalledWith(expect.objectContaining({ title: 'Open two new depots', kind: 'okr', ownerType: 'person', keyResults: [expect.objectContaining({ title: 'Depots opened', direction: 'up', start: 0, target: 2 })] }));
  });

  it('a check-in takes key result values, never a typed percentage, and a pick-one confidence', async () => {
    const p = goalProps();
    render(<GoalScreen {...p} />);
    await ue.click(screen.getByRole('button', { name: 'Check in' }));
    const sheet = screen.getByRole('dialog');
    expect(within(sheet).queryByRole('textbox', { name: /How far/ })).toBeNull();
    const value = within(sheet).getByRole('textbox', { name: /Accounts signed/ });
    await ue.clear(value);
    await ue.type(value, '3');
    await ue.click(within(sheet).getByRole('radio', { name: 'At risk' }));
    await ue.click(within(sheet).getByRole('button', { name: 'Save check-in' }));
    expect(p.onCheckIn).toHaveBeenCalledWith({ values: [{ keyResultId: 'k1', value: 3 }], confidence: 'at_risk', note: null });
  });

  it('changing an approved goal asks why; the change goes to the manager', async () => {
    const p = goalProps();
    render(<GoalScreen {...p} />);
    await ue.click(screen.getByRole('button', { name: 'Ask to change' }));
    const sheet = screen.getByRole('dialog');
    await ue.click(within(sheet).getByRole('button', { name: 'Send the change' }));
    expect(p.onSave).not.toHaveBeenCalled();
    await ue.type(within(sheet).getByRole('textbox', { name: /Why it changes/ }), 'A fourth client joined');
    await ue.click(within(sheet).getByRole('button', { name: 'Send the change' }));
    expect(p.onSave).toHaveBeenCalledWith(expect.objectContaining({ reason: 'A fourth client joined', version: 2 }));
  });
});
