import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { AgentDeskScreen } from './helpdesk';
import { BUILT_IN_VIEWS, toFilters } from './helpdesk-desk-live';
import { DESK_ROWS, liveDesk } from './helpdesk-desk-live-samples';

// HLP-02 Agent desk, live: the designed screen with the real tickets (Helpdesk design wiring, round 2).
const ue = userEvent.setup({ pointerEventsCheck: 0 });

describe('HLP-02 rules', () => {
  it('filters: queue, priority, status and the raised days go to the server on top of the view', () => {
    const f = toFilters({ assignee: 'me' }, [
      { key: 'queue', type: 'multi', values: ['d-it'] },
      { key: 'priority', type: 'multi', values: ['1', '2'] },
      { key: 'status', type: 'multi', values: ['open'] },
      { key: 'created', type: 'date', from: '2026-10-01', to: null },
    ], 'vpn');
    expect(f).toEqual({ assignee: 'me', deskIds: ['d-it'], priorities: [1, 2], states: ['open'], createdFrom: '2026-10-01', createdTo: undefined, search: 'vpn' });
  });

  it('built-in views carry the design names', () => {
    expect(BUILT_IN_VIEWS.map((v) => v.name)).toEqual(['My open tickets', 'Unassigned', 'At risk or breached', 'Waiting on employee', 'All open', 'Snoozed by me', 'All in my queues']);
  });
});

describe('HLP-02 Agent desk (live)', () => {
  it('HLP-05b: the row badge follows the desk\'s at-risk point', () => {
    const at = (atRiskPercent: number) => liveDesk({ page: { items: [{ ...DESK_ROWS[0], resolution: { usedMinutes: 300, targetMinutes: 480, paused: false, atRiskPercent } }], total: 1, nextCursor: null } });
    const { unmount } = render(<AgentDeskScreen live={at(50)} />);
    expect(screen.getByText('3 h left').closest('.yx-badge')).toHaveAttribute('data-tone', 'warning');
    unmount();
    render(<AgentDeskScreen live={at(90)} />);
    expect(screen.getByText('3 h left').closest('.yx-badge')).not.toHaveAttribute('data-tone', 'warning');
  });

  it('lists tickets with the resolution clock, the missed-target banner and facts', () => {
    render(<AgentDeskScreen live={liveDesk()} />);
    expect(screen.getByText('IT-1001')).toBeInTheDocument();
    expect(screen.getByText(/1 h left/)).toBeInTheDocument();
    expect(screen.getAllByText(/Breached/)[0]).toBeInTheDocument();
    expect(screen.getAllByText(/Paused/)[0]).toBeInTheDocument();
    expect(screen.getByText(/1 ticket has passed a response target/)).toBeInTheDocument();
    expect(screen.getByText(/3 in this view · 1 past the target/)).toBeInTheDocument();
  });

  // Batch F item 34 (answer 2570): the first-response column.
  it('first response: Met or Breached once answered, the clock while it runs, a dash with no target', () => {
    const rows = [...DESK_ROWS, { ...DESK_ROWS[2]!, id: 'none', number: 'IT-1009', subject: 'No target here', firstResponse: null, firstResponseAt: null, firstResponseOutcome: null }];
    render(<AgentDeskScreen live={liveDesk({ page: { items: rows, total: rows.length, nextCursor: null } })} />);
    const table = screen.getByRole('table');
    expect(within(table).getByRole('columnheader', { name: /First response/ })).toBeInTheDocument();
    const cell = (subject: string) => within(screen.getByRole('row', { name: new RegExp(subject) }));
    expect(cell(DESK_ROWS[0]!.subject).getByText('Met')).toBeInTheDocument();
    // Still running and past its target: the clock says so.
    expect(cell('New laptop for Arjun').getAllByText(/Breached .* ago/).length).toBe(2);
    expect(cell(DESK_ROWS[2]!.subject).getAllByText('Breached').length).toBeGreaterThan(0);
    expect(cell('No target here').getByLabelText('No first-response target')).toBeInTheDocument();
  });

  it('"Show breaching tickets" switches to the at-risk view', async () => {
    const onQueryChange = vi.fn();
    render(<AgentDeskScreen live={liveDesk({ onQueryChange })} />);
    await ue.click(screen.getByRole('button', { name: 'Show breaching tickets' }));
    expect(onQueryChange).toHaveBeenCalledWith(expect.objectContaining({ viewId: 'breaching', filters: { breaching: true, states: ['new', 'open', 'pending', 'on_hold'] } }));
  });

  it('a row opens the quick view; Assign to me and Open ticket work from it', async () => {
    const onAssignToMe = vi.fn().mockResolvedValue(undefined);
    const onOpen = vi.fn();
    render(<AgentDeskScreen live={liveDesk({ onAssignToMe, onOpen })} />);
    await ue.click(screen.getByText('New laptop for Arjun'));
    const drawer = await screen.findByRole('dialog');
    expect(within(drawer).getByText('First response')).toBeInTheDocument();
    await ue.click(within(drawer).getByRole('button', { name: 'Assign to me' }));
    await waitFor(() => expect(onAssignToMe).toHaveBeenCalledWith(expect.objectContaining({ id: 't2' })));
    expect((await screen.findAllByText('IT-1002 is now yours.'))[0]).toBeInTheDocument();
    await ue.click(within(drawer).getByRole('button', { name: 'Open ticket' }));
    expect(onOpen).toHaveBeenCalledWith('t2');
  });

  it('team lead: bulk "Assign to me" sends the chosen tickets and says how many changed', async () => {
    const onBulk = vi.fn().mockResolvedValue({ done: ['t1', 't2'], failed: [] });
    render(<AgentDeskScreen live={liveDesk({ onBulk, start: { selected: ['t1', 't2'] } })} />);
    await ue.click(screen.getByRole('button', { name: 'Assign 2 to me' }));
    await waitFor(() => expect(onBulk).toHaveBeenCalledWith(['t1', 't2'], { assignee: 'me' }));
    expect((await screen.findAllByText('2 tickets changed.'))[0]).toBeInTheDocument();
  });

  it('bulk refusals stay on the page with each ticket and its reason', async () => {
    const onBulk = vi.fn().mockResolvedValue({ done: ['t1'], failed: [{ id: 't3', reason: 'Changed by someone else' }] });
    render(<AgentDeskScreen live={liveDesk({ onBulk, start: { selected: ['t1', 't3'] } })} />);
    await ue.click(screen.getByRole('button', { name: 'Assign 2 to me' }));
    expect(await screen.findByText(/1 changed. 1 not changed: IT-1004: Changed by someone else/)).toBeInTheDocument();
  });

  it('change priority: pressed with no reason says why; then sends priority and reason', async () => {
    const onBulk = vi.fn().mockResolvedValue({ done: ['t1'], failed: [] });
    render(<AgentDeskScreen live={liveDesk({ onBulk, start: { selected: ['t1'], dialog: 'priority' } })} />);
    await screen.findByRole('dialog');
    await ue.click(screen.getAllByRole('button', { name: 'Change priority' }).at(-1)!);
    expect(onBulk).not.toHaveBeenCalled();
    expect(await screen.findByText('Say why, in 3 letters or more.')).toBeInTheDocument();
    await ue.click(screen.getByRole('radio', { name: 'P1 · Urgent' }));
    await ue.type(screen.getByRole('textbox', { name: /Why/ }), 'Payroll run tomorrow');
    await ue.click(screen.getAllByRole('button', { name: 'Change priority' }).at(-1)!);
    await waitFor(() => expect(onBulk).toHaveBeenCalledWith(['t1'], { priority: 1, priorityReason: 'Payroll run tomorrow' }));
  });

  it('move to another queue: needs the desk and a reason, then moves each ticket', async () => {
    const onMoveDesk = vi.fn().mockResolvedValue(undefined);
    render(<AgentDeskScreen live={liveDesk({ onMoveDesk, start: { selected: ['t1'], dialog: 'move' } })} />);
    await ue.click(await screen.findByRole('button', { name: 'Move' }));
    expect(await screen.findByText('Choose the desk.')).toBeInTheDocument();
    expect(onMoveDesk).not.toHaveBeenCalled();
    await ue.click(screen.getByRole('combobox', { name: /To/ }));
    await ue.click(await screen.findByRole('option', { name: 'HR help desk' }));
    await ue.type(screen.getByRole('textbox', { name: /Why/ }), 'Payslip question');
    await ue.click(screen.getByRole('button', { name: 'Move' }));
    await waitFor(() => expect(onMoveDesk).toHaveBeenCalledWith('t1', 'd-hr', 'Payslip question'));
  });

  it('an agent who is not a team lead gets no bulk selection', () => {
    render(<AgentDeskScreen live={liveDesk({ page: { items: DESK_ROWS.map((r) => ({ ...r, canBulk: false })), total: 3, nextCursor: null } })} />);
    expect(screen.queryAllByRole('checkbox', { name: /Select/ })).toHaveLength(0);
  });

  it('new ticket for an employee: pressed too early says what is missing; nothing is sent', async () => {
    const onCreate = vi.fn();
    render(<AgentDeskScreen live={liveDesk({ onCreate })} />);
    await ue.click(screen.getByRole('button', { name: 'New ticket for an employee' }));
    await ue.click(await screen.findByRole('button', { name: 'Raise ticket' }));
    expect(await screen.findByText('Choose who the ticket is for.')).toBeInTheDocument();
    expect(screen.getByText('Write a subject.')).toBeInTheDocument();
    expect(onCreate).not.toHaveBeenCalled();
  });

  it('board layout shows tickets by state', () => {
    render(<AgentDeskScreen live={liveDesk({ query: { ...liveDesk().query, layout: 'board' } })} />);
    expect(screen.getByLabelText('Tickets by state')).toBeInTheDocument();
  });

  it('loading, error with retry, empty and no access', async () => {
    const onRetry = vi.fn();
    const { rerender } = render(<AgentDeskScreen live={liveDesk({ state: 'error', onRetry })} />);
    expect(screen.getByText("We couldn't load tickets.")).toBeInTheDocument();
    await ue.click(screen.getByRole('button', { name: /Try again|Retry/ }));
    expect(onRetry).toHaveBeenCalled();
    rerender(<AgentDeskScreen live={liveDesk({ page: { items: [], total: 0, nextCursor: null }, query: { viewId: 'open', filters: {}, layout: 'list' } })} />);
    expect(screen.getByText('No tickets in your queues.')).toBeInTheDocument();
    rerender(<AgentDeskScreen live={liveDesk({ state: 'no-access' })} />);
    expect(screen.getByText(/You don't have access to the agent desk/)).toBeInTheDocument();
  });
});
