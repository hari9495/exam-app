import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { ToastProvider } from '../../components/notify';
import { HeadcountPlanScreen, revisionChange, type LiveHeadcountPlan, type LivePlan } from './hiring-plan';

// HIR-01 headcount plan board, live: HR plans and revises, the approver decides on the board, a hiring manager reads
// their own department's plan only (decision 11), nothing is changed while acting for someone else.

const ue = userEvent.setup({ pointerEventsCheck: 0 });
const line = { id: 'l1', designationId: 'x1', designation: 'Shift Lead', gradeId: 'g4', grade: 'G4', locationId: 'c1', location: 'Hosur plant', count: 5, budget: 36_00_000, committed: 2, committedBudget: 14_80_000, filled: 1 };
const ops: LivePlan = { id: 'p1', departmentId: 'd1', department: 'Operations', fyStart: 2026, status: 'approved', note: null, version: 7, revisionNo: 2, revision: null, approval: null, lines: [line] };
const sales: LivePlan = { id: 'p2', departmentId: 'd2', department: 'Sales', fyStart: 2026, status: 'draft', note: null, version: 1, revisionNo: 1, revision: null, approval: null, lines: [{ ...line, id: 'l2', designationId: 'x2', designation: 'Account Executive', committed: 0, committedBudget: 0, filled: 0, count: 3, budget: 24_00_000 }] };
const pending: LivePlan = {
  ...ops,
  revision: { status: 'submitted', note: null, lines: [{ ...line, count: 7, budget: 48_00_000 }] },
  approval: { kind: 'revision', status: 'pending', reason: null, submittedAt: '2026-11-02T05:00:00Z', submittedBy: 'Lakshmi Venkatesan', steps: [{ name: 'Finance and HR', state: 'waiting', approvers: ['Ravi Shankar'], at: null }], myTaskId: 't1' },
};
const live = (o: Partial<LiveHeadcountPlan> = {}): LiveHeadcountPlan => ({
  persona: 'hr',
  state: 'ready',
  onRetry: vi.fn(),
  fy: 2026,
  years: [2025, 2026, 2027],
  onFy: vi.fn(),
  plans: [ops, sales],
  choices: { departments: [{ value: 'd1', label: 'Operations' }, { value: 'd2', label: 'Sales' }, { value: 'd3', label: 'Quality' }], designations: [{ value: 'x1', label: 'Shift Lead' }, { value: 'x2', label: 'Account Executive' }], grades: [], locations: [] },
  onSave: vi.fn(async (id) => ({ ...(id === 'p2' ? sales : ops), version: 9 })),
  onSubmit: vi.fn(async () => undefined),
  onDecide: vi.fn(async () => undefined),
  now: new Date('2026-11-09T06:00:00Z'),
  ...o,
});
const show = (l: LiveHeadcountPlan) => render(<ToastProvider><HeadcountPlanScreen live={l} /></ToastProvider>);

describe('HIR-01 live board', () => {
  it('HR sees every department with its own status, budgets in lakh format and the year as a segment', async () => {
    const l = live();
    show(l);
    expect(screen.getByRole('listitem', { name: 'Operations' })).toHaveTextContent('Approved · v2');
    expect(screen.getByRole('listitem', { name: 'Sales' })).toHaveTextContent('Draft');
    expect(screen.getAllByText(/₹14,80,000 of ₹36,00,000/).length).toBeGreaterThan(0);
    await ue.click(screen.getByRole('radio', { name: 'FY 2027–28' }));
    expect(l.onFy).toHaveBeenCalledWith(2027);
  });

  it('a draft is edited and sent: refused while a line has no designation, then saved with its version and sent', async () => {
    const l = live();
    show(l);
    await ue.click(screen.getByRole('button', { name: 'Revise plan' }));
    const d = await screen.findByRole('dialog');
    await ue.click(within(d).getByRole('button', { name: 'Send for approval' }));
    expect(within(d).getByText('Choose the department.')).toBeInTheDocument();
    expect(l.onSave).not.toHaveBeenCalled();
    await ue.click(within(d).getByRole('combobox', { name: /Department/ }));
    await ue.click(await screen.findByRole('option', { name: 'Sales' }));
    await ue.click(within(d).getByRole('button', { name: 'Add a line' }));
    await ue.click(within(d).getByRole('button', { name: 'Send for approval' }));
    expect(within(d).getByText('Choose the designation.')).toBeInTheDocument();
    await ue.click(within(d).getByRole('button', { name: 'Remove line 2' }));
    await ue.click(within(d).getByRole('button', { name: 'Send for approval' }));
    await waitFor(() => expect(l.onSubmit).toHaveBeenCalledWith('p2', 9));
    expect(l.onSave).toHaveBeenCalledWith('p2', { departmentId: 'd2', fyStart: 2026, note: null, lines: [{ id: null, designationId: 'x2', gradeId: 'g4', locationId: 'c1', count: 3, budget: 24_00_000 }], version: 1 });
    expect((await screen.findAllByText('Sales plan sent for approval')).length).toBeGreaterThan(0);
  });

  it('an approved plan is revised with its line ids; a line in use keeps at least its requisitions and hires', async () => {
    const l = live();
    show(l);
    await ue.click(screen.getByRole('button', { name: 'Revise plan' }));
    const d = await screen.findByRole('dialog');
    await ue.click(within(d).getByRole('combobox', { name: /Department/ }));
    await ue.click(await screen.findByRole('option', { name: 'Operations' }));
    expect(within(d).getByText('At least 3: open requisitions and hires')).toBeInTheDocument();
    expect(within(d).queryByRole('button', { name: /Remove line/ })).toBeNull();
    const positions = within(d).getByRole('textbox', { name: /Positions/ });
    await ue.clear(positions);
    await ue.type(positions, '2');
    await ue.click(within(d).getByRole('button', { name: 'Save draft' }));
    expect(within(d).getByText('Enter at least 3.')).toBeInTheDocument();
    await ue.clear(positions);
    await ue.type(positions, '6');
    await ue.click(within(d).getByRole('button', { name: 'Save draft' }));
    await waitFor(() => expect(l.onSave).toHaveBeenCalledWith('p1', expect.objectContaining({ lines: [expect.objectContaining({ id: 'l1', count: 6 })], version: 7 })));
    expect(l.onSubmit).not.toHaveBeenCalled();
  });

  it('a failed save stays in the sheet with the reason', async () => {
    const l = live({ onSave: vi.fn(async () => Promise.reject(new Error('Someone else changed this plan. Reload it.'))) });
    show(l);
    await ue.click(screen.getByRole('button', { name: 'Revise plan' }));
    const d = await screen.findByRole('dialog');
    await ue.click(within(d).getByRole('combobox', { name: /Department/ }));
    await ue.click(await screen.findByRole('option', { name: 'Sales' }));
    await ue.click(within(d).getByRole('button', { name: 'Save draft' }));
    expect(await within(d).findByText('Someone else changed this plan. Reload it.')).toBeInTheDocument();
  });

  it('the approver approves the waiting revision on the board, or sends it back only with a reason', async () => {
    const l = live({ plans: [pending, sales] });
    show(l);
    expect(screen.getByText('Revision v3 of Operations waiting for approval')).toBeInTheDocument();
    expect(screen.getByText(/Adds 2 positions and ₹12,00,000 budget\. Requisitions keep drawing on v2/)).toBeInTheDocument();
    await ue.click(screen.getByRole('button', { name: 'Send back' }));
    const dlg = await screen.findByRole('dialog');
    await ue.click(within(dlg).getByRole('button', { name: 'Send back' }));
    expect(within(dlg).getByText('Enter a reason so HR knows what to change.')).toBeInTheDocument();
    expect(l.onDecide).not.toHaveBeenCalled();
    await ue.type(within(dlg).getByRole('textbox', { name: /Reason/ }), 'Hold till Q4');
    await ue.click(within(dlg).getByRole('button', { name: 'Send back' }));
    await waitFor(() => expect(l.onDecide).toHaveBeenCalledWith('t1', 'reject', 'Hold till Q4'));
    await ue.click(screen.getByRole('button', { name: 'Approve revision' }));
    await waitFor(() => expect(l.onDecide).toHaveBeenCalledWith('t1', 'approve', null));
    expect((await screen.findAllByText('Approved: Operations revision v3')).length).toBeGreaterThan(0);
  });

  it('a sent-back plan shows the reason to HR', () => {
    show(live({ plans: [{ ...sales, status: 'rejected', approval: { kind: 'plan', status: 'rejected', reason: 'Too many', submittedAt: null, submittedBy: null, steps: [], myTaskId: null } }] }));
    expect(screen.getByText('Sales plan sent back')).toBeInTheDocument();
    expect(screen.getByText(/“Too many” Change it with Revise plan/)).toBeInTheDocument();
  });

  it('a hiring manager reads their department only: no budgets, no revise, a requisition from a line with free positions', async () => {
    const onRequisition = vi.fn();
    show(live({ persona: 'hm', plans: [{ ...ops, lines: [{ ...line, budget: null, committedBudget: 0 }] }], onRequisition }));
    expect(screen.getByText('Showing Operations only · read-only')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Revise plan' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Export' })).toBeNull();
    expect(screen.queryByText(/Budget committed/)).toBeNull();
    expect(screen.queryByRole('meter')).toBeNull();
    await ue.click(within(screen.getByRole('listitem', { name: 'Operations' })).getByRole('button', { name: 'Open requisition' }));
    expect(onRequisition).toHaveBeenCalledWith('l1');
  });

  it('while acting for someone else nothing can be changed or decided', () => {
    show(live({ plans: [pending], readOnly: true }));
    expect(screen.queryByRole('button', { name: 'Revise plan' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Approve revision' })).toBeNull();
    expect(screen.getByText(/read-only while acting for someone else/)).toBeInTheDocument();
  });

  it('empty, loading, error and no-access states', () => {
    const { rerender } = show(live({ plans: [] }));
    expect(screen.getByText('No headcount plan for FY 2026–27 yet')).toBeInTheDocument();
    expect(screen.getAllByRole('button', { name: 'Create plan' }).length).toBeGreaterThan(0);
    rerender(<ToastProvider><HeadcountPlanScreen live={live({ state: 'error' })} /></ToastProvider>);
    expect(screen.getByText("Couldn't load the headcount plan")).toBeInTheDocument();
    rerender(<ToastProvider><HeadcountPlanScreen live={live({ state: 'no-access', persona: 'hm' })} /></ToastProvider>);
    expect(screen.getByText('Only HR sees the headcount plan')).toBeInTheDocument();
  });

  it('revisionChange says what a revision changes, both ways', () => {
    expect(revisionChange(pending)).toBe('Adds 2 positions and ₹12,00,000 budget.');
    expect(revisionChange({ ...pending, revision: { status: 'draft', note: null, lines: [{ ...line, count: 4 }] } })).toBe('Removes 1 position.');
    expect(revisionChange({ ...pending, revision: { status: 'draft', note: null, lines: [line] } })).toBe('Changes lines without changing the totals.');
  });
});
