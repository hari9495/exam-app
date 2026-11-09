import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { RediscoveryPanel, RequisitionSheet, RequisitionsScreen, type LiveRediscovery, type LiveRequisitionRow, type LiveRequisitions } from './hiring-plan';
import { PLAN_LINES, REDISCOVERY, REQUISITIONS } from './hiring-data';

// HIR-02 requisitions list and HIR-26 rediscovery panel made live, with sample data.
const ue = userEvent.setup({ pointerEventsCheck: 0 });

const row = (i: number, o: Partial<LiveRequisitionRow> = {}): LiveRequisitionRow => {
  const { planLineId: _p, ...r } = REQUISITIONS[i];
  return { ...r, line: null, outsidePlan: false, outsidePlanReason: null, sentBackReason: null, steps: [], canDecide: false, mine: false, cancelReason: null, ...o };
};
const ROWS: LiveRequisitionRow[] = [
  row(0, { id: 'a', status: 'Approved', line: PLAN_LINES[0], steps: [{ id: 's0', label: 'Submitted', status: 'done' }, { id: 's1', label: 'Recruiting', status: 'done', approver: 'Neha Joshi' }] }),
  row(1, { id: 'b', status: 'Pending approval', waitingOn: 'Outside the plan', outsidePlan: true, outsidePlanReason: 'New client go-live' }),
  row(2, { id: 'c', status: 'Sent back', sentBackReason: 'Add the client territory' }),
];
const rd = (o: Partial<LiveRediscovery> = {}): LiveRediscovery => ({ state: 'ready', onRetry: vi.fn(), mode: 'text', ai: 'off', matches: REDISCOVERY, ...o });
const live = (o: Partial<LiveRequisitions> = {}): LiveRequisitions => ({
  persona: 'recruiter',
  rows: ROWS,
  state: 'ready',
  onRetry: vi.fn(),
  canManage: true,
  onOpenJob: vi.fn(),
  onSubmit: vi.fn(async () => undefined),
  onWithdraw: vi.fn(async () => undefined),
  onNew: vi.fn(),
  onOpenRow: vi.fn(),
  rediscovery: rd(),
  ...o,
});
const show = (l: LiveRequisitions) => render(<RequisitionsScreen rows={[]} planLines={[]} persona="recruiter" live={l} />);

describe('HIR-02 requisitions (live)', () => {
  it('lists the API rows; a recruiter opens one, sees the route and the outside-plan reason, and sends a sent-back one again', async () => {
    const l = live();
    show(l);
    expect(screen.getByRole('button', { name: 'New requisition' })).toBeInTheDocument();
    await ue.click(screen.getByText('Shift Lead, Line 3'));
    expect(l.onOpenRow).toHaveBeenCalledWith('b');
    const d = await screen.findByRole('dialog');
    expect(within(d).getByText(/New client go-live/)).toBeInTheDocument();
    await ue.keyboard('{Escape}');
    await ue.click(screen.getByText(ROWS[2].title));
    const back = await screen.findByRole('dialog');
    expect(within(back).getByText(/Add the client territory/)).toBeInTheDocument();
    await ue.click(within(back).getByRole('button', { name: 'Send for approval' }));
    expect(l.onSubmit).toHaveBeenCalledWith(expect.objectContaining({ id: 'c' }));
  });

  it('an approved requisition opens its job; past candidates show in the drawer', async () => {
    const l = live();
    show(l);
    await ue.click(screen.getByText(ROWS[0].title));
    const d = await screen.findByRole('dialog');
    expect(within(d).getByText('Past candidates to consider')).toBeInTheDocument();
    expect(within(d).getByText('Sana Nizami')).toBeInTheDocument();
    await ue.click(within(d).getByRole('button', { name: 'Open job' }));
    expect(l.onOpenJob).toHaveBeenCalledWith(expect.objectContaining({ id: 'a' }));
  });

  it('a hiring manager reads their own, read-only: no actions, no Send, no Add to pipeline', async () => {
    show(live({ persona: 'hm', canManage: false, onNew: undefined, rediscovery: rd({ onAdd: undefined }) }));
    expect(screen.getByText(/Read-only: recruiting and HR change them/)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'New requisition' })).toBeNull();
    await ue.click(screen.getByText(ROWS[2].title));
    const d = await screen.findByRole('dialog');
    expect(within(d).queryByRole('button', { name: 'Send for approval' })).toBeNull();
    expect(within(d).queryByRole('button', { name: /Add to pipeline/ })).toBeNull();
    expect(within(d).queryByRole('button', { name: 'Edit and resubmit' })).toBeNull();
  });

  it('empty, loading and error states', () => {
    const { unmount } = show(live({ rows: [] }));
    expect(screen.getByText('No requisitions yet.')).toBeInTheDocument();
    unmount();
    const onRetry = vi.fn();
    show(live({ rows: [], state: 'error', onRetry }));
    expect(screen.getByRole('button', { name: /Retry/ })).toBeInTheDocument();
  });
});

describe('HIR-26 rediscovery panel (live)', () => {
  it('plain search says AI is off; AI mode shows the advisory note; Add to pipeline turns into a badge', async () => {
    const { unmount } = render(<RediscoveryPanel matches={[]} viewer="recruiter" live={rd()} />);
    expect(screen.getByText(/Plain search: AI notes are off for your company/)).toBeInTheDocument();
    expect(screen.queryByText(/AI note, advice only/)).toBeNull();
    unmount();
    const onAdd = vi.fn(async () => undefined);
    render(<RediscoveryPanel matches={[]} viewer="recruiter" live={rd({ mode: 'ai', ai: 'on', matches: [{ ...REDISCOVERY[0], aiNote: 'Reached the final panel.' }], onAdd })} />);
    expect(screen.getByText(/never change who is listed or the order/)).toBeInTheDocument();
    expect(screen.getByText(/AI note, advice only: Reached the final panel\./)).toBeInTheDocument();
    // Contact is not offered live (no messaging from here yet).
    expect(screen.queryByRole('button', { name: 'Contact' })).toBeNull();
    await ue.click(screen.getByRole('button', { name: /Add to pipeline/ }));
    expect(onAdd).toHaveBeenCalledWith(expect.objectContaining({ id: 'rd1' }));
    expect(await screen.findByText('Added to pipeline')).toBeInTheDocument();
  });

  it('a failed add keeps the button; empty, loading and error states', async () => {
    const onAdd = vi.fn(async () => {
      throw new Error('no');
    });
    const { unmount } = render(<RediscoveryPanel matches={[]} viewer="recruiter" live={rd({ matches: [REDISCOVERY[0]], onAdd })} />);
    await ue.click(screen.getByRole('button', { name: /Add to pipeline/ }));
    expect(screen.getByRole('button', { name: /Add to pipeline/ })).toBeInTheDocument();
    unmount();
    const r1 = render(<RediscoveryPanel matches={[]} viewer="recruiter" live={rd({ matches: [] })} />);
    expect(screen.getByText('No past candidates match this requisition.')).toBeInTheDocument();
    r1.unmount();
    const onRetry = vi.fn();
    render(<RediscoveryPanel matches={[]} viewer="recruiter" live={rd({ state: 'error', onRetry })} />);
    await ue.click(screen.getByRole('button', { name: /Retry/ }));
    expect(onRetry).toHaveBeenCalled();
  });
});

describe('Request a hire sheet: never greyed out', () => {
  it('Send pressed too early shows the missing fields and focuses the first; nothing is sent', async () => {
    const onSend = vi.fn(async () => undefined);
    render(<RequisitionSheet open onOpenChange={() => {}} planLines={PLAN_LINES} defaultLine={null} defaultMax={null} live={{ subtitle: 'Hiring manager request', team: [], onSend }} />);
    const send = screen.getByRole('button', { name: /Send for approval/ });
    expect(send).toBeEnabled();
    await ue.click(send);
    expect(onSend).not.toHaveBeenCalled();
    expect(screen.getByText('Choose a plan line, or tick that the hire is outside the plan.')).toBeInTheDocument();
    expect(screen.getByText('Enter the most you can pay.')).toBeInTheDocument();
    await new Promise((r) => requestAnimationFrame(r));
    expect(document.activeElement).toHaveAttribute('aria-invalid', 'true');
  });
});

describe('HIR-02 / HIR-26 follow-ups (answers 252-257)', () => {
  it('257: the task holder approves, or sends back only with a reason', async () => {
    const onDecide = vi.fn(async () => undefined);
    show(live({ rows: [row(1, { id: 'b', status: 'Pending approval', canDecide: true })], onDecide }));
    await ue.click(screen.getByText('Shift Lead, Line 3'));
    const d = await screen.findByRole('dialog');
    await ue.click(within(d).getByRole('button', { name: 'Send back' }));
    const ask = (await screen.findAllByRole('dialog')).at(-1)!;
    await ue.click(within(ask).getByRole('button', { name: 'Send back' }));
    expect(onDecide).not.toHaveBeenCalled();
    expect(within(ask).getByText('Enter a reason so the hiring manager knows what to change.')).toBeInTheDocument();
    await ue.type(within(ask).getByRole('textbox', { name: /Reason/ }), 'Lower the pay');
    await ue.click(within(ask).getByRole('button', { name: 'Send back' }));
    expect(onDecide).toHaveBeenCalledWith(expect.objectContaining({ id: 'b' }), 'reject', 'Lower the pay');
  });

  it('257: without the task there is no Approve', async () => {
    show(live({ rows: [row(1, { id: 'b', status: 'Pending approval', canDecide: false })], onDecide: vi.fn() }));
    await ue.click(screen.getByText('Shift Lead, Line 3'));
    const d = await screen.findByRole('dialog');
    expect(within(d).queryByRole('button', { name: 'Approve' })).toBeNull();
  });

  it('252: the hiring manager edits their own sent-back requisition; not someone else’s', async () => {
    const onEdit = vi.fn();
    const { unmount } = show(live({ persona: 'hm', canManage: false, rows: [row(2, { id: 'c', status: 'Sent back', mine: true })], onEdit }));
    await ue.click(screen.getByText(ROWS[2].title));
    await ue.click(within(await screen.findByRole('dialog')).getByRole('button', { name: 'Edit and resubmit' }));
    expect(onEdit).toHaveBeenCalledWith(expect.objectContaining({ id: 'c' }));
    unmount();
    show(live({ persona: 'hm', canManage: false, rows: [row(2, { id: 'c', status: 'Sent back', mine: false })], onEdit }));
    await ue.click(screen.getByText(ROWS[2].title));
    expect(within(await screen.findByRole('dialog')).queryByRole('button', { name: 'Edit and resubmit' })).toBeNull();
  });

  it('253: cancel asks for a reason first; ended requisitions offer no cancel', async () => {
    const onCancel = vi.fn(async () => undefined);
    render(<RequisitionsScreen rows={[]} planLines={[]} persona="recruiter" cancelId="a" live={live({ onCancel })} />);
    const ask = (await screen.findAllByRole('dialog')).at(-1)!;
    await ue.click(within(ask).getByRole('button', { name: 'Cancel requisition' }));
    expect(onCancel).not.toHaveBeenCalled();
    expect(within(ask).getByText(/Say why it is cancelled/)).toBeInTheDocument();
    await ue.type(within(ask).getByRole('textbox', { name: /Reason/ }), 'Client deal fell through');
    await ue.click(within(ask).getByRole('button', { name: 'Cancel requisition' }));
    expect(onCancel).toHaveBeenCalledWith(expect.objectContaining({ id: 'a' }), 'Client deal fell through');
  });

  it('253: assign recruiter needs a choice; then sets it for the chosen rows', async () => {
    const onAssign = vi.fn(async () => undefined);
    render(<RequisitionsScreen rows={[]} planLines={[]} persona="recruiter" live={live({ assign: { recruiters: [{ value: 'u9', label: 'Neha Joshi' }], onAssign } })} />);
    await ue.click(screen.getByRole('checkbox', { name: `Select ${ROWS[0].code}` }));
    await ue.click(screen.getByRole('button', { name: 'Assign recruiter' }));
    const ask = (await screen.findAllByRole('dialog')).at(-1)!;
    await ue.click(within(ask).getByRole('button', { name: 'Assign' }));
    expect(within(ask).getByText('Choose the recruiter.')).toBeInTheDocument();
    await ue.click(within(ask).getByRole('combobox', { name: /Recruiter/ }));
    await ue.click(await screen.findByRole('option', { name: 'Neha Joshi' }));
    await ue.click(within(ask).getByRole('button', { name: 'Assign' }));
    expect(onAssign).toHaveBeenCalledWith([expect.objectContaining({ id: 'a' })], 'u9');
  });

  it('254, 255: Contact explains when there is no email opt-in; Suggest to recruiter turns into a badge', async () => {
    const onContact = vi.fn();
    const onSuggest = vi.fn(async () => undefined);
    const { unmount } = render(<RediscoveryPanel matches={[]} viewer="recruiter" live={rd({ matches: [REDISCOVERY[0], REDISCOVERY[2]], onContact })} />);
    const [ok, no] = screen.getAllByRole('button', { name: 'Contact' });
    await ue.click(no);
    expect(onContact).not.toHaveBeenCalled();
    expect(screen.getByText(/Deepa Ghosh has not agreed to email from us/)).toBeInTheDocument();
    await ue.click(ok);
    expect(onContact).toHaveBeenCalledWith(expect.objectContaining({ id: 'rd1' }));
    unmount();
    render(<RediscoveryPanel matches={[]} viewer="hm" live={rd({ matches: [REDISCOVERY[0], { ...REDISCOVERY[1], suggested: true }], onSuggest })} />);
    expect(screen.getByText('Suggested to recruiter')).toBeInTheDocument();
    await ue.click(screen.getByRole('button', { name: 'Suggest to recruiter' }));
    expect(onSuggest).toHaveBeenCalledWith(expect.objectContaining({ id: 'rd1' }));
    expect(await screen.findAllByText('Suggested to recruiter')).toHaveLength(2);
  });

  it('the request sheet opens filled in for edit and Duplicate', () => {
    render(<RequisitionSheet open onOpenChange={() => {}} planLines={PLAN_LINES} live={{ subtitle: 'x', title: 'Change and send again', team: [], onSend: vi.fn(), initial: { title: 'Data Analyst', requisitionReason: 'new', headcountPlanLineId: null, outsidePlan: true, outsidePlanReason: 'Backlog', replacementOfEmployeeId: null, headcount: 2, budgetAmount: 800000, targetStart: null } }} />);
    expect(screen.getByRole('dialog', { name: /Change and send again/ })).toBeInTheDocument();
    expect(screen.getByDisplayValue('Data Analyst')).toBeInTheDocument();
    expect(screen.getByDisplayValue('Backlog')).toBeInTheDocument();
  });
});
