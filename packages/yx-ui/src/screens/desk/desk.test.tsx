import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { HelpCentreScreen, MyTicketScreen } from './help';
import { TicketScreen, eventText, type TicketScreenProps } from './ticket';
import { BUILT_IN_VIEWS, DeskTicketsScreen } from './tickets';
import { fillCanned, minutesText } from './desk-kit';
import { CANNED, CONTEXT, DESK, DETAIL, MY_ROWS, MY_TICKET, RAISE_DESKS, ROWS, TICKET, TIMELINE } from './data';

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
