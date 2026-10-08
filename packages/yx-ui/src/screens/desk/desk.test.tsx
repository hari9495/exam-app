import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { HelpCentreScreen, MyTicketScreen } from './help';
import { TicketScreen, eventText, type TicketScreenProps } from './ticket';
import { BUILT_IN_VIEWS, DeskTicketsScreen } from './tickets';
import { fillCanned, minutesText } from './desk-kit';
import { CAL_ITEMS, CANNED, COMPLIANCE, CONTEXT, DESK, DETAIL, MY_ROWS, MY_TICKET, RAISE_DESKS, ROWS, SLA_SETUP, TEMPLATES, TICKET, TIMELINE, WORK } from './data';
import { ResolveDialog, TicketWorkRail, type TicketWorkProps } from './work';
import { MyCalendarScreen } from './calendar';
import { SlaTab } from './setup-sla';

const ue = userEvent.setup({ pointerEventsCheck: 0 });
const ok = () => vi.fn().mockResolvedValue(undefined);

describe('Service Desk helpers', () => {
  it('fills saved-reply variables and never lets a name become markup', () => {
    expect(fillCanned('<p>Hi {{requester.first_name}}, {{ ticket.number }} · {{agent.name}}</p>', { firstName: '<img src=x onerror=1>', number: 'IT-1', agent: 'Suresh' })).toBe('<p>Hi &lt;img src=x onerror=1&gt;, IT-1 · Suresh</p>');
    expect(minutesText(85)).toBe('1 h 25 min');
    expect(minutesText(45)).toBe('45 min');
    expect(eventText({ id: 'e', kind: 'priority_changed', from: '3', to: '1', reason: null, by: 'x', at: '' })).toBe('Priority changed: P3 → P1');
    expect(eventText({ id: 'e', kind: 'assigned', from: null, to: 'Farah', reason: null, by: 'x', at: '' })).toBe('Assigned to Farah');
  });
});

describe('HLP-01 help centre', () => {
  it('raises a ticket with the chosen team and shows the number', async () => {
    const onRaise = vi.fn().mockResolvedValue({ id: 'n', number: 'IT-1009' });
    render(<HelpCentreScreen state="ready" desks={RAISE_DESKS} tickets={MY_ROWS} onRaise={onRaise} onOpen={() => {}} />);
    await ue.click(screen.getByRole('button', { name: 'Raise a ticket' }));
    await ue.click(screen.getByRole('combobox', { name: /Which team/ }));
    await ue.click(await screen.findByRole('option', { name: /IT help desk/ }));
    await ue.type(screen.getByRole('textbox', { name: /Subject/ }), 'Wi-Fi drops');
    await ue.type(screen.getByRole('textbox', { name: /Details/ }), 'Every hour on floor 2');
    await ue.click(screen.getByRole('radio', { name: 'Today' }));
    await ue.click(screen.getByRole('button', { name: 'Raise ticket' }));
    await waitFor(() => expect(onRaise).toHaveBeenCalledWith(expect.objectContaining({ deskId: 'd-it', subject: 'Wi-Fi drops', description: 'Every hour on floor 2', urgency: 2 })));
    expect(await screen.findByText(/IT-1009/)).toBeInTheDocument();
  });

  it('lists my open tickets with private ones marked; the requester view has no notes', () => {
    render(<HelpCentreScreen state="ready" desks={RAISE_DESKS} tickets={MY_ROWS} onRaise={vi.fn()} onOpen={() => {}} />);
    expect(screen.getByRole('button', { name: 'LOP on my September payslip' })).toBeInTheDocument();
    expect(screen.getByText('Private')).toBeInTheDocument();
    render(<MyTicketScreen state="ready" ticket={MY_TICKET} onBack={() => {}} onReply={ok()} onUpload={vi.fn()} onOpenFile={ok()} onAddWatcher={ok()} />);
    expect(screen.queryByText(/Same router model/)).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: /vpn-log.txt/ })).toBeInTheDocument();
  });
});

describe('HLP-02 agent desk', () => {
  it('lead bulk actions run on the selected tickets', async () => {
    const onBulk = vi.fn().mockResolvedValue({ done: ['t1'], failed: [] });
    render(
      <DeskTicketsScreen state="ready" desks={[DESK]} details={[DETAIL]} views={[]} page={{ items: ROWS, total: 3, nextCursor: null }} pageState="ready" query={{ viewId: 'open', filters: BUILT_IN_VIEWS[2].filters, layout: 'list' }} onQueryChange={() => {}} onOpen={() => {}} onMove={ok()} onBulk={onBulk} onSaveView={ok()} onExport={ok()} onSearchPeople={async () => []} onCreate={vi.fn()} />,
    );
    await ue.click(screen.getAllByRole('checkbox', { name: /Select/ })[1]);
    await ue.click(screen.getByRole('button', { name: 'Assign to me' }));
    await waitFor(() => expect(onBulk).toHaveBeenCalledWith(expect.any(Array), { assignee: 'me' }));
    expect(await screen.findByText('1 changed.')).toBeInTheDocument();
  });
});

describe('HLP-03 ticket workspace', () => {
  const props = (over: Partial<TicketScreenProps> = {}): TicketScreenProps => ({
    state: 'ready',
    ticket: TICKET,
    detail: DETAIL,
    canned: CANNED,
    timeline: TIMELINE,
    context: CONTEXT,
    others: [],
    meName: 'Suresh Pillai',
    meId: 'u-suresh',
    onBack: () => {},
    onUpdate: ok(),
    onAssign: ok(),
    onPost: ok(),
    onUpload: vi.fn(),
    onOpenFile: ok(),
    onAddTime: ok(),
    onRunScenario: ok(),
    onConvert: ok(),
    onAddCollaborator: ok(),
    onRemoveCollaborator: ok(),
    onAddWatcher: ok(),
    onRemoveWatcher: ok(),
    onSearchPeople: async () => [],
    onTyping: () => {},
    onOpenTicket: () => {},
    ...over,
  });

  it('an agent sees reply and note; notes are marked internal; a colleague on the ticket is shown', () => {
    render(<TicketScreen {...props({ others: [{ userId: 'u-farah', name: 'Farah Khan', typing: true }] })} />);
    expect(screen.getByRole('tab', { name: 'Reply to Divya' })).toBeInTheDocument();
    expect(screen.getByText(/Internal note: Divya never sees it/)).toBeInTheDocument();
    expect(screen.getByText('Farah Khan is writing on this ticket')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Resolve' })).toBeInTheDocument();
  });

  it('a collaborator gets notes only and no work controls', () => {
    render(<TicketScreen {...props({ ticket: { ...TICKET, access: 'collaborator', canWork: false } })} />);
    expect(screen.queryByRole('tab', { name: /Reply to/ })).not.toBeInTheDocument();
    expect(screen.getByRole('tab', { name: 'Internal note' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Resolve' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Log time' })).not.toBeInTheDocument();
  });

  it('changing priority asks for a reason first', async () => {
    const onUpdate = ok();
    render(<TicketScreen {...props({ onUpdate })} />);
    await ue.click(screen.getByRole('radio', { name: 'P1' }));
    await ue.type(screen.getByRole('textbox', { name: /Reason/ }), 'CEO cannot work');
    await ue.click(screen.getByRole('button', { name: 'Change priority' }));
    await waitFor(() => expect(onUpdate).toHaveBeenCalledWith({ priority: 1, priorityReason: 'CEO cannot work' }));
  });
});

describe('batch 2 panels (SD-1.09 … SD-1.17)', () => {
  const work = (over: Partial<TicketWorkProps> = {}): TicketWorkProps => ({
    ticket: TICKET,
    detail: DETAIL,
    work: WORK,
    desks: [DESK],
    meId: 'u-suresh',
    onFindTicket: vi.fn().mockResolvedValue([]),
    onOpenTicket: vi.fn(),
    onLink: ok(),
    onUnlink: ok(),
    onMerge: ok(),
    onSplit: vi.fn().mockResolvedValue({ id: 'n' }),
    onSetParent: ok(),
    onSetTracker: ok(),
    onStartSide: ok(),
    onSideMessage: ok(),
    onCloseSide: ok(),
    onAddTask: ok(),
    onUpdateTask: ok(),
    onBreachReason: ok(),
    onExclude: ok(),
    onRemind: ok(),
    onSnooze: ok(),
    onDoneReminder: ok(),
    onUnmask: vi.fn().mockResolvedValue('ABCPE1234F'),
    ...over,
  });

  it('shows each response target with its stretches in words, and asks why a missed one was missed', async () => {
    const onBreachReason = ok();
    render(<TicketWorkRail {...work({ onBreachReason })} />);
    expect(screen.getByText('Missed')).toBeInTheDocument();
    expect(screen.getByRole('list', { name: 'Resolution timeline' })).toHaveTextContent(/Paused \(Waiting on requester\)/);
    await ue.type(screen.getByRole('textbox', { name: 'Why Resolution was missed' }), 'Vendor was slow');
    await ue.click(screen.getByRole('button', { name: 'Save reason' }));
    expect(onBreachReason).toHaveBeenCalledWith('x2', 'Vendor was slow');
  });

  it('task state is a single choice (Segment), not chips; adding a task sends what was chosen', async () => {
    const onUpdateTask = ok();
    const onAddTask = ok();
    render(<TicketWorkRail {...work({ onUpdateTask, onAddTask })} />);
    const group = screen.getByRole('radiogroup', { name: 'State of Check the VPN client version' });
    await ue.click(within(group).getByRole('radio', { name: 'Done' }));
    expect(onUpdateTask).toHaveBeenCalledWith(WORK.tasks[0], { state: 'done' });
    await ue.type(screen.getByRole('textbox', { name: 'New task' }), 'Replace the cable');
    await ue.click(screen.getByRole('button', { name: 'Add task' }));
    expect(onAddTask).toHaveBeenCalledWith({ title: 'Replace the cable' });
  });

  it('shows a masked value only on request', async () => {
    render(<TicketWorkRail {...work()} />);
    expect(screen.getByText('[PAN ••234F]')).toBeInTheDocument();
    await ue.click(screen.getByRole('button', { name: 'Show (recorded)' }));
    expect(await screen.findByText('ABCPE1234F')).toBeInTheDocument();
  });

  it('resolve needs a code and note when the desk asks', async () => {
    const onResolve = ok();
    render(<ResolveDialog open onOpenChange={() => {}} ticket={TICKET} codes={TEMPLATES.resolutionCodes} required linked={0} onResolve={onResolve} />);
    expect(screen.getByRole('button', { name: 'Resolve' })).toBeDisabled();
    await ue.click(screen.getByRole('combobox', { name: /Resolution code/ }));
    await ue.click(await screen.findByRole('option', { name: 'Fixed' }));
    await ue.type(screen.getByRole('textbox', { name: /What fixed it/ }), 'Updated the client');
    await ue.click(screen.getByRole('button', { name: 'Resolve' }));
    expect(onResolve).toHaveBeenCalledWith({ resolutionCode: 'fixed', resolutionNote: 'Updated the client' });
  });

  it('my calendar lists what is coming and makes the private iCal link once', async () => {
    const onNewFeed = vi.fn().mockResolvedValue('https://api.example.test/desk/calendar-feed/o/u/secret.ics');
    render(<MyCalendarScreen state="ready" items={CAL_ITEMS} tasks={WORK.tasks} feed={null} onOpenTicket={() => {}} onNewFeed={onNewFeed} onRevokeFeed={ok()} />);
    expect(screen.getByRole('button', { name: /Resolve by: IT-1043/ })).toBeInTheDocument();
    await ue.click(screen.getByRole('button', { name: 'Make my link' }));
    expect(await screen.findByDisplayValue(/secret\.ics/)).toBeInTheDocument();
  });

  it('the SLA tab shows targets by priority and the month at risk', () => {
    render(<SlaTab detail={DETAIL} calendars={[]} setup={SLA_SETUP} compliance={COMPLIANCE} month="2026-10" onMonth={() => {}} onCreatePolicy={ok()} onAddVersion={ok()} onUpdatePolicy={ok()} onSaveTargets={ok()} />);
    expect(screen.getByText(/Resolution: P1 4 h · P2 8 h/)).toBeInTheDocument();
    expect(screen.getByText('At risk')).toBeInTheDocument();
  });
});
