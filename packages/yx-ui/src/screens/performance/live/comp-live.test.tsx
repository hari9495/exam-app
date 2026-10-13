import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { CompSheetScreen, MyPayBandScreen, type CompSheetScreenProps } from './comp';
import type { CompProposal } from './types';

// Performance batch PM7 screens (M06-BUILD-DESIGN §12; PRF-10, PAY-39; PM-7.07).

const ue = userEvent.setup({ pointerEventsCheck: 0 });
const ok = async () => ({});
const proposal = (o: Partial<CompProposal> = {}): CompProposal => ({ id: 'p1', employee: 'Arjun', employeeId: 'e1', departmentId: 'd1', manager: 'Priya', band: 'Exceeds', currentCtc: 850_000, compaRatio: 0.85, proration: 1, cell: { band: 'Exceeds', minPct: 10, targetPct: 12, maxPct: 14 }, meritPct: 12, meritAmount: 102_000, promotionToGradeId: null, promotionToDesignationId: null, promotionAmount: 0, bonusAmount: 0, newCtc: 952_000, outOfRange: false, justification: null, status: 'draft', version: 3, ...o });
const sp = (o: Partial<CompSheetScreenProps> = {}): CompSheetScreenProps => ({
  state: 'ready',
  sheet: { cycle: { id: 'c1', name: 'FY27', reviewCycleId: null, legalEntityId: 'le', currency: 'INR', effectiveOn: '2027-04-01', matrixId: 'm', bonus: null, status: 'open', appliedAt: null, version: 1 }, role: 'manager', proposals: [proposal()], budgets: [], overrun: 'extra_approval', can: { edit: true, submit: true, apply: false } },
  departments: [],
  designations: [{ value: 'x1', label: 'Lead' }],
  onBack: vi.fn(),
  onBudgets: vi.fn(ok),
  onOpenCycle: vi.fn(ok),
  onSave: vi.fn(ok),
  onSubmit: vi.fn(ok),
  onApply: vi.fn(ok),
  ...o,
});

describe('Comp review (PM7)', () => {
  it('outside the matrix the change needs a reason before it can be saved (YX-PERF-10)', async () => {
    const p = sp();
    render(<CompSheetScreen {...p} />);
    expect(screen.getByText(/your team only; your views are recorded/)).toBeInTheDocument();
    await ue.click(screen.getByRole('button', { name: 'Change' }));
    const d = screen.getByRole('dialog');
    expect(within(d).getByText(/suggests 10–14% \(target 12%\)/)).toBeInTheDocument();
    const merit = within(d).getByRole('textbox', { name: /Merit increase/ });
    await ue.clear(merit);
    await ue.type(merit, '20');
    expect(within(d).getByRole('button', { name: 'Save' })).toBeDisabled();
    await ue.type(within(d).getByRole('textbox', { name: /^Why/ }), 'Took over the region');
    await ue.click(within(d).getByRole('button', { name: 'Save' }));
    expect(p.onSave).toHaveBeenCalledWith('p1', { meritPct: 20, promotionToDesignationId: null, promotionAmount: 0, bonusAmount: 0, justification: 'Took over the region', version: 3 });
  });

  it('HR applies only after confirming', async () => {
    const p = sp({ sheet: { ...sp().sheet!, role: 'hr', can: { edit: false, submit: false, apply: true } } });
    render(<CompSheetScreen {...p} />);
    await ue.click(screen.getByRole('button', { name: 'Apply' }));
    await ue.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Apply' }));
    expect(p.onApply).toHaveBeenCalled();
  });

  it('my pay band says where I sit, or that there is no range', () => {
    const { rerender } = render(<MyPayBandScreen state="ready" band={{ visible: true, currency: 'INR', range: { min: 600_000, mid: 800_000, max: 1_000_000 }, position: 'within', quartile: 3 }} />);
    expect(screen.getByText('You are within the range, in quarter 3 of 4.')).toBeInTheDocument();
    rerender(<MyPayBandScreen state="ready" band={{ visible: true, range: null }} />);
    expect(screen.getByText('No range is set for your grade yet.')).toBeInTheDocument();
  });
});
