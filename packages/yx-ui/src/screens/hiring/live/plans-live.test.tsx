import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { HeadcountPlansScreen, type HeadcountPlansScreenProps } from './plans';
import { ApprovalRoutesScreen } from './routes';
import { HiringJobsScreen, type HiringJobsScreenProps } from './jobs';

// Recruitment batch AT2 (M10-BUILD-DESIGN §5).

const ue = userEvent.setup({ pointerEventsCheck: 0 });
const ok = async () => ({});

describe('Headcount plans (AT2)', () => {
  const sp = (o: Partial<HeadcountPlansScreenProps> = {}): HeadcountPlansScreenProps => ({
    state: 'ready',
    fy: 2026,
    years: [2026],
    onFy: vi.fn(),
    plans: [{ id: 'p1', departmentId: 'd1', department: 'Finance', legalEntityId: null, fyStart: 2026, status: 'draft', note: null, version: 2, lines: [{ id: 'l1', designationId: 'x1', designation: 'Accountant', gradeId: null, grade: null, locationId: null, location: null, count: 2, budget: null, committed: 1, committedBudget: 0, filled: 0 }] }],
    departments: [{ value: 'd1', label: 'Finance' }],
    designations: [{ value: 'x1', label: 'Accountant' }],
    grades: [],
    locations: [],
    onSave: vi.fn(ok),
    onSubmit: vi.fn(ok),
    ...o,
  });

  it('shows a draft plan and sends it for approval with its version', async () => {
    const p = sp();
    render(<HeadcountPlansScreen {...p} />);
    expect(screen.getByText('Finance · FY 2026–27')).toBeInTheDocument();
    await ue.click(screen.getByRole('button', { name: 'Send for approval' }));
    expect(p.onSubmit).toHaveBeenCalledWith('p1', 2);
  });

  it('a new plan needs a department and a designation on each line', async () => {
    const p = sp({ plans: [] });
    render(<HeadcountPlansScreen {...p} />);
    await ue.click(screen.getByRole('button', { name: 'New plan' }));
    const d = screen.getByRole('dialog');
    expect(within(d).getByRole('button', { name: 'Save' })).toBeDisabled();
    await ue.click(within(d).getByRole('combobox', { name: 'Department' }));
    await ue.click(screen.getByRole('option', { name: 'Finance' }));
    await ue.click(within(d).getByRole('combobox', { name: 'Line 1: designation' }));
    await ue.click(screen.getByRole('option', { name: 'Accountant' }));
    await ue.click(within(d).getByRole('button', { name: 'Save' }));
    expect(p.onSave).toHaveBeenCalledWith(null, expect.objectContaining({ departmentId: 'd1', fyStart: 2026, lines: [{ designationId: 'x1', gradeId: null, locationId: null, count: 1, budget: null }] }));
  });
});

describe('Hiring approvals (AT2)', () => {
  it('a named-people step needs people before it can be saved while approval is on', async () => {
    const onSave = vi.fn(ok);
    render(<ApprovalRoutesScreen state="ready" requisition={{ enabled: true, steps: [] }} offer={null} people={[{ value: 'u1', label: 'Priya' }]} groups={[]} onSave={onSave} />);
    await ue.click(screen.getByRole('button', { name: 'Add a step' }));
    await ue.type(screen.getByRole('textbox', { name: /Step 1/ }), 'Head');
    expect(screen.getByRole('button', { name: 'Save requisition approval' })).toBeDisabled();
    await ue.click(screen.getByRole('combobox', { name: 'People for step 1' }));
    await ue.click(screen.getByRole('option', { name: 'Priya' }));
    await ue.keyboard('{Escape}');
    await ue.click(screen.getByRole('button', { name: 'Save requisition approval' }));
    expect(onSave).toHaveBeenCalledWith('requisition', { enabled: true, steps: [{ name: 'Head', approverType: 'users', approverUserIds: ['u1'], managerLevel: null, groupId: null }] });
  });
});

describe('Requisitions in the jobs list (AT2)', () => {
  const jp = (o: Partial<HiringJobsScreenProps> = {}): HiringJobsScreenProps => ({
    state: 'ready',
    jobs: [
      { id: 'j1', title: 'Accountant', status: 'draft', createdAt: '2026-10-01T00:00:00Z', stageSummary: 'No candidates yet' },
      { id: 'j2', title: 'Clerk', status: 'pending_approval', createdAt: '2026-10-01T00:00:00Z', stageSummary: 'No candidates yet' },
    ],
    filter: 'all',
    onFilter: vi.fn(),
    canManage: true,
    onOpen: vi.fn(),
    onCreate: vi.fn(ok),
    onDelete: vi.fn(ok),
    departments: [],
    locations: [],
    designations: [],
    managers: [],
    pipelines: [],
    customFields: [],
    planLines: [],
    employees: [{ value: 'e1', label: 'Ravi' }],
    onSubmitRequisition: vi.fn(ok),
    onWithdraw: vi.fn(ok),
    ...o,
  });

  it('drafts go for approval, pending ones are withdrawn, and outside the plan needs a reason', async () => {
    const p = jp();
    render(<HiringJobsScreen {...p} />);
    await ue.click(screen.getByRole('button', { name: 'Send for approval' }));
    expect(p.onSubmitRequisition).toHaveBeenCalledWith('j1');
    await ue.click(screen.getByRole('button', { name: 'Withdraw' }));
    expect(p.onWithdraw).toHaveBeenCalledWith('j2');
    await ue.click(screen.getByRole('button', { name: 'New job' }));
    const d = screen.getByRole('dialog');
    await ue.type(within(d).getByRole('textbox', { name: /Job title/ }), 'Buyer');
    await ue.click(within(d).getByRole('checkbox', { name: /Outside the headcount plan/ }));
    expect(within(d).getByRole('button', { name: 'Create' })).toBeDisabled();
    await ue.type(within(d).getByRole('textbox', { name: /Why outside the plan/ }), 'New client');
    await ue.click(within(d).getByRole('button', { name: 'Create' }));
    expect(p.onCreate).toHaveBeenCalledWith(expect.objectContaining({ requisitionReason: 'new', outsidePlan: true, outsidePlanReason: 'New client' }));
  });
});
