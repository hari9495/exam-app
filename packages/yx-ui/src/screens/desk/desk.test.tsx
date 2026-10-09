import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { HelpCentreScreen, HelpDrawer, MyTicketScreen } from './help';
import { TicketScreen, eventText, type TicketScreenProps } from './ticket';
import { BUILT_IN_VIEWS, DeskTicketsScreen } from './tickets';
import { fillCanned, minutesText } from './desk-kit';
import { CAL_ITEMS, CANNED, COMPLIANCE, CONTEXT, DESK, DETAIL, MY_ROWS, MY_TICKET, RAISE_DESKS, ROWS, SLA_SETUP, TEMPLATES, TICKET, TIMELINE, WORK } from './data';
import { ResolveDialog, TicketWorkRail, type TicketWorkProps } from './work';
import { MyCalendarScreen } from './calendar';
import { SlaTab } from './setup-sla';
import { DeskSetupScreen } from './setup';
import { BannersTab, EmailTab, PortalTab, type EmailSetupProps } from './setup-channels';
import { CustomersScreen } from './customers';
import { PortalScreen, type PortalScreenProps } from './portal';
import { ACCOUNT, ACCOUNT_ROWS, BANNERS, BOUNCES, CS_DESK, INBOUND, MAILBOXES, MY_BANNERS, PORTALS, PORTAL_HOME, PORTAL_ROWS, PORTAL_TICKET, PRODUCTS, SENDING_DOMAINS } from './data';

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

describe('batch 3 (SD-1.18 … SD-1.23, SD-1.28)', () => {
  const ticketProps = (over: Partial<TicketScreenProps> = {}): TicketScreenProps => ({
    state: 'ready', ticket: TICKET, detail: DETAIL, canned: CANNED, timeline: TIMELINE, context: CONTEXT, others: [], meName: 'Suresh Pillai', meId: 'u-suresh',
    onBack: () => {}, onUpdate: ok(), onAssign: ok(), onPost: ok(), onUpload: vi.fn(), onOpenFile: ok(), onAddTime: ok(), onRunScenario: ok(), onConvert: ok(), onAddCollaborator: ok(), onRemoveCollaborator: ok(), onAddWatcher: ok(), onRemoveWatcher: ok(), onSearchPeople: async () => [], onTyping: () => {}, onOpenTicket: () => {},
    ...over,
  });
  const email = (over: Partial<EmailSetupProps> = {}): EmailSetupProps => ({
    state: 'ready',
    mailboxes: MAILBOXES,
    domains: SENDING_DOMAINS,
    bounces: BOUNCES,
    inbound: INBOUND,
    verdict: 'held',
    onVerdict: vi.fn(),
    onCreateMailbox: vi.fn().mockResolvedValue({ ...MAILBOXES[0], webhookUrl: 'https://api.example.test/desk/inbound/email/o/tok', signingSecret: 'whsec_123' }),
    onUpdateMailbox: ok(),
    onRotate: vi.fn().mockResolvedValue({ webhookUrl: 'https://api.example.test/desk/inbound/email/o/new', signingSecret: 'whsec_new' }),
    onLoadRules: vi.fn().mockResolvedValue([]),
    onSaveRule: ok(),
    onDeleteRule: ok(),
    onOpenOriginal: vi.fn().mockResolvedValue({ id: 'in1', from: 'ceo@kaveri-foods.example', fromName: 'Ananya Rao', to: 'it-help@kaveri.test', subject: 'Urgent: wire the payment today', verdict: 'held', reason: null, flags: [], receivedAt: '2026-10-08T04:10:00Z', text: 'Please wire 5 lakh today.', files: [] }),
    onRelease: ok(),
    onAddDomain: ok(),
    onCheckDomain: ok(),
    onClearBounce: ok(),
    ...over,
  });

  it('email: held mail explains the checks in words, shows the original as plain text and lets it through', async () => {
    const onRelease = ok();
    const onVerdict = vi.fn();
    render(<EmailTab {...email({ onRelease, onVerdict })} detail={DETAIL} />);
    expect(screen.getByText(/Sender proven: no · Signed by their domain: no/)).toBeInTheDocument();
    expect(screen.getByText('Name looks like a known sender')).toBeInTheDocument();
    await ue.click(within(screen.getByRole('radiogroup', { name: 'Which mail' })).getByRole('radio', { name: 'Automatic (loop)' }));
    expect(onVerdict).toHaveBeenCalledWith('loop');
    await ue.click(screen.getAllByRole('button', { name: 'Show original' })[0]);
    expect(await screen.findByText('Please wire 5 lakh today.')).toBeInTheDocument();
    await ue.click(screen.getAllByRole('button', { name: 'Close' })[0]);
    await ue.click(screen.getByRole('button', { name: 'Let it through' }));
    expect(onRelease).toHaveBeenCalledWith('in1');
    expect(screen.getAllByRole('button', { name: 'Show original' })).toHaveLength(2);
    expect(screen.getByRole('textbox', { name: 'Record 2 name' })).toHaveValue('yx1._domainkey.kaveri.test');
    expect(screen.getByRole('button', { name: 'Copy record 2 value' })).toBeInTheDocument();
    expect(screen.getByText(/Until all checks pass, desk email goes from YukthiX’s address/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Remove old.vendor@example.com from list' })).toBeInTheDocument();
  });

  it('email: a new forward mailbox shows its webhook address and secret once', async () => {
    const base = email();
    render(<EmailTab {...base} detail={DETAIL} />);
    await ue.click(screen.getByRole('button', { name: 'Add a mailbox' }));
    await ue.type(screen.getByRole('textbox', { name: /Email address/ }), 'help@kaveri.test');
    await ue.click(screen.getByRole('button', { name: 'Add mailbox' }));
    await waitFor(() => expect(base.onCreateMailbox).toHaveBeenCalledWith(expect.objectContaining({ address: 'help@kaveri.test', kind: 'forward', autoAck: true })));
    expect(await screen.findByText('Copy now, shown once')).toBeInTheDocument();
    expect(screen.getByRole('textbox', { name: 'Signing secret' })).toHaveValue('whsec_123');
    expect(screen.getByRole('button', { name: 'Copy webhook address' })).toBeInTheDocument();
  });

  it('email: IMAP needs its sign-in details before the mailbox can be added', async () => {
    render(<EmailTab {...email()} detail={DETAIL} />);
    await ue.click(screen.getByRole('button', { name: 'Add a mailbox' }));
    await ue.click(screen.getByRole('combobox', { name: /How mail reaches us/ }));
    await ue.click(await screen.findByRole('option', { name: 'Your mail server (IMAP)' }));
    await ue.type(screen.getByRole('textbox', { name: /Email address/ }), 'help@kaveri.test');
    expect(screen.getByRole('button', { name: 'Add mailbox' })).toBeDisabled();
    expect(screen.getByRole('textbox', { name: /Server name/ })).toBeInTheDocument();
  });

  it('banners: severity and audience are single choices; me-too count and linked ticket are shown', async () => {
    const onSave = ok();
    render(<BannersTab state="ready" banners={BANNERS} openTickets={[{ id: 't9', number: 'IT-1031', subject: 'VPN slow' }]} onSave={onSave} onEnd={ok()} />);
    expect(screen.getByText(/12 people said me too · linked to IT-1031/)).toBeInTheDocument();
    await ue.click(screen.getByRole('button', { name: 'Post a banner' }));
    expect(within(screen.getByRole('radiogroup', { name: 'How serious' })).getAllByRole('radio')).toHaveLength(3);
    await ue.type(screen.getByRole('textbox', { name: /What people see/ }), 'Email is slow');
    await ue.click(within(screen.getByRole('radiogroup', { name: 'Who sees it' })).getByRole('radio', { name: 'Customers' }));
    await ue.click(screen.getByRole('button', { name: 'Post banner' }));
    await waitFor(() => expect(onSave).toHaveBeenCalledWith(null, expect.objectContaining({ text: 'Email is slow', severity: 'warning', audience: 'customers' })));
  });

  it('portal set-up: who can sign in is a Segment and the address is a link', async () => {
    render(<PortalTab state="ready" portals={PORTALS} desks={[DESK, CS_DESK]} onSave={ok()} />);
    expect(screen.getByRole('link', { name: PORTALS[0].address })).toHaveAttribute('href', PORTALS[0].address);
    await ue.click(screen.getByRole('button', { name: 'Edit Kaveri customer help' }));
    const g = screen.getByRole('radiogroup', { name: 'Who can sign in' });
    expect(within(g).getByRole('radio', { name: 'People from these email domains' })).toBeChecked();
  });

  it('calendar: the half-day choice is “Working half”, Morning or Afternoon', async () => {
    const onSetHalfDay = ok();
    const cal = { id: 'cal-1', name: 'Office hours', timeZone: 'Asia/Kolkata', version: 1, hours: [], holidays: [] };
    render(<DeskSetupScreen state="ready" desks={[DESK]} canCreate={false} selectedId="d-it" onSelect={() => {}} detail={DETAIL} canned={[]} calendars={[cal]} canCalendars onCreateDesk={ok()} onUpdateDesk={ok()} onSearchUsers={async () => []} onSeatCost={vi.fn()} onAddMember={ok()} onEndMember={ok()} onSaveGroup={ok()} onSaveCategory={ok()} onSaveType={ok()} onSaveStatus={ok()} onSaveMatrix={ok()} onSaveCanned={ok()} onSaveScenario={ok()} onAddHoliday={ok()} onSetHours={ok()} onSetHalfDay={onSetHalfDay} />);
    await ue.click(screen.getByRole('tab', { name: 'Calendars' }));
    await ue.click(within(screen.getByRole('radiogroup', { name: 'Working half' })).getByRole('radio', { name: 'Afternoon' }));
    expect(onSetHalfDay).toHaveBeenCalledWith(cal, 'second');
  });

  it('ticket: an unproven sender gets a clear warning; customer, plan, product and source are shown', () => {
    render(<TicketScreen {...ticketProps({ ticket: { ...TICKET, senderVerified: false, customer: { account: { id: 'ac1', name: 'Sunrise Retail' }, plan: 'gold' }, product: { id: 'pr1', name: 'Kaveri billing app' }, screen: '/yx/people/directory', fields: { screen: '/yx/people/directory', order_number: '4471' } } })} />);
    expect(screen.getByText('We could not prove who sent this email. Do not share private details until you are sure.')).toBeInTheDocument();
    expect(screen.getByText('Sunrise Retail')).toBeInTheDocument();
    expect(screen.getByText('Kaveri billing app')).toBeInTheDocument();
    expect(screen.getByText('Raised from')).toBeInTheDocument();
    expect(screen.getByText('Order number (from the email)')).toBeInTheDocument();
  });

  it('ticket list: an unproven email sender shows “Not verified”', () => {
    render(
      <DeskTicketsScreen state="ready" desks={[DESK]} details={[DETAIL]} views={[]} page={{ items: [{ ...ROWS[0], senderVerified: false }], total: 1, nextCursor: null }} pageState="ready" query={{ viewId: 'open', filters: BUILT_IN_VIEWS[2].filters, layout: 'list' }} onQueryChange={() => {}} onOpen={() => {}} onMove={ok()} onBulk={vi.fn()} onSaveView={ok()} onExport={ok()} onSearchPeople={async () => []} onCreate={vi.fn()} />,
    );
    expect(screen.getByText('Not verified')).toBeInTheDocument();
  });

  it('help centre: “Me too” joins the known issue once; times name the time zone', async () => {
    const onMeToo = vi.fn().mockResolvedValue({ linked: true, already: false });
    render(<HelpCentreScreen state="ready" desks={RAISE_DESKS} tickets={MY_ROWS} onRaise={vi.fn()} onOpen={() => {}} banners={MY_BANNERS} onMeToo={onMeToo} timeZone="Asia/Kolkata" />);
    await ue.click(screen.getByRole('button', { name: 'Me too' }));
    expect(onMeToo).toHaveBeenCalledWith('bn1');
    expect(await screen.findByRole('button', { name: 'You are on it' })).toBeDisabled();
    expect(screen.getByText(/We added you to this issue/)).toBeInTheDocument();
    expect(screen.getByText('Times are in your time zone: Asia/Kolkata.')).toBeInTheDocument();
    await ue.click(screen.getByRole('switch', { name: /Larger text/ }));
    expect(document.querySelector('.yx-reading')).toHaveAttribute('data-large', 'true');
  });

  it('help drawer: raises from any page and links my open tickets', async () => {
    const onRaise = vi.fn().mockResolvedValue({ id: 'n', number: 'IT-1010' });
    render(<HelpDrawer open onOpenChange={() => {}} desks={[RAISE_DESKS[0]]} tickets={MY_ROWS} banners={[]} onMeToo={ok()} onRaise={onRaise} ticketHref={(id) => `/yx/desk/help/${id}`} />);
    expect(screen.getByRole('link', { name: 'VPN keeps disconnecting from home' })).toHaveAttribute('href', '/yx/desk/help/t1');
    await ue.type(screen.getByRole('textbox', { name: /Subject/ }), 'Payslip page is blank');
    await ue.type(screen.getByRole('textbox', { name: /Details/ }), 'Since this morning');
    await ue.click(screen.getByRole('button', { name: 'Raise ticket' }));
    await waitFor(() => expect(onRaise).toHaveBeenCalledWith(expect.objectContaining({ deskId: 'd-it', subject: 'Payslip page is blank' })));
    expect(await screen.findByText(/IT-1010/)).toBeInTheDocument();
  });

  it('customers: people, plans and the company’s ticket sharing', async () => {
    const onUpdateContact = ok();
    const onAddPlan = ok();
    render(<CustomersScreen state="ready" canManage accounts={ACCOUNT_ROWS} search="" onSearch={() => {}} selectedId="ac1" onSelect={() => {}} account={ACCOUNT} products={PRODUCTS} desks={[CS_DESK]} onCreateAccount={ok()} onUpdateAccount={ok()} onAddContact={ok()} onUpdateContact={onUpdateContact} onAddPlan={onAddPlan} onEndPlan={ok()} onSaveProduct={ok()} onSearchUsers={async () => []} onLoadAgentAccounts={async () => []} onSetAgentAccounts={ok()} />);
    expect(screen.getByText(/Gold support \(gold\) · from the parent company/)).toBeInTheDocument();
    await ue.click(screen.getByRole('checkbox', { name: "Leela Das can see all the company's tickets" }));
    expect(onUpdateContact).toHaveBeenCalledWith('co2', { seesAccountTickets: true });
    await ue.type(screen.getByRole('textbox', { name: /Plan name/ }), 'Silver');
    await ue.type(screen.getByRole('textbox', { name: /Tier/ }), 'silver');
    await ue.click(screen.getByRole('radio', { name: 'Hold new tickets' }));
    await ue.click(screen.getByRole('button', { name: 'Add plan' }));
    expect(onAddPlan).toHaveBeenCalledWith(expect.objectContaining({ plan: 'Silver', tier: 'silver', whenUsedUp: 'hold' }));
    expect(screen.getByRole('button', { name: 'End plan Gold support' })).toBeInTheDocument();
  });

  const portal = (over: Partial<PortalScreenProps> = {}): PortalScreenProps => ({
    state: 'ready',
    home: PORTAL_HOME,
    me: null,
    tickets: [],
    ticket: null,
    timeZone: 'Asia/Kolkata',
    onSendCode: ok(),
    onVerify: ok(),
    onAsk: ok(),
    onMeToo: ok(),
    onRaise: vi.fn().mockResolvedValue({ id: 'pt9', number: 'CS-1009' }),
    onOpenTicket: vi.fn(),
    onBack: () => {},
    onReply: ok(),
    onSignOut: ok(),
    ...over,
  });

  it('portal: email, then a 6-digit code; anyone can ask without an account', async () => {
    const onSendCode = ok();
    const onVerify = ok();
    const onAsk = ok();
    render(<PortalScreen {...portal({ onSendCode, onVerify, onAsk })} />);
    expect(screen.getByText('Help for Kaveri Foods partners')).toBeInTheDocument();
    await ue.type(screen.getAllByRole('textbox', { name: /Your email/ })[0], 'Kiran@sunrise.example');
    await ue.click(screen.getByRole('button', { name: 'Send me a code' }));
    expect(onSendCode).toHaveBeenCalledWith('kiran@sunrise.example');
    expect(await screen.findByText('If this email can use the help page, a 6-digit code is on its way.')).toBeInTheDocument();
    await ue.type(screen.getByRole('textbox', { name: /6-digit code/ }), '12a3456');
    await ue.click(screen.getByRole('button', { name: 'Sign in' }));
    expect(onVerify).toHaveBeenCalledWith('kiran@sunrise.example', '123456');
    await ue.click(screen.getByRole('button', { name: 'Ask without an account' }));
    await ue.type(screen.getByRole('textbox', { name: /Your name/ }), 'Ravi');
    await ue.type(screen.getAllByRole('textbox', { name: /Your email/ })[0], 'ravi@shop.example');
    await ue.type(screen.getByRole('textbox', { name: /Subject/ }), 'Late order');
    await ue.type(screen.getByRole('textbox', { name: /Details/ }), 'Order 88 is late');
    await ue.click(screen.getByRole('button', { name: 'Send request' }));
    expect(onAsk).toHaveBeenCalledWith({ deskId: 'd-cs', subject: 'Late order', description: 'Order 88 is late', name: 'Ravi', email: 'ravi@shop.example' });
    expect(await screen.findByText('Check your email and open the link to send your request.')).toBeInTheDocument();
  });

  it('portal: signed in, my tickets show who raised the company’s others; a ticket shows the conversation and resolve-by', async () => {
    const onOpenTicket = vi.fn();
    const { unmount } = render(<PortalScreen {...portal({ me: { name: 'Kiran Shetty', email: 'kiran@sunrise.example', account: 'Sunrise Retail', seesAccountTickets: true }, tickets: PORTAL_ROWS, onOpenTicket, notice: 'Ticket CS-1004 is open.' })} />);
    expect(screen.getByText('Ticket CS-1004 is open.')).toBeInTheDocument();
    expect(screen.getByText(/raised by Leela Das/)).toBeInTheDocument();
    expect(within(screen.getByRole('radiogroup', { name: 'Which tickets' })).getByRole('radio', { name: 'Open' })).toBeChecked();
    expect(screen.getByRole('button', { name: 'Me too' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Sign out' })).toBeInTheDocument();
    await ue.click(screen.getByRole('button', { name: 'Order 4471 not delivered' }));
    expect(onOpenTicket).toHaveBeenCalledWith('pt1');
    unmount();
    const onReply = ok();
    render(<PortalScreen {...portal({ me: { name: 'Kiran Shetty', email: 'kiran@sunrise.example', account: null, seesAccountTickets: false }, ticket: PORTAL_TICKET, ticketState: 'ready', onReply })} />);
    expect(screen.getByText('Suresh Pillai · Support team')).toBeInTheDocument();
    expect(screen.getByText(/We aim to resolve it by 9 Oct 2026, 6:00 pm \(Asia\/Kolkata\)/)).toBeInTheDocument();
    await ue.type(screen.getByRole('textbox', { name: 'Your reply' }), 'Thanks');
    await ue.click(screen.getByRole('button', { name: 'Send reply' }));
    expect(onReply).toHaveBeenCalledWith('Thanks');
  });

  it('portal: an unknown address says so', () => {
    render(<PortalScreen {...portal({ state: 'not-found', home: null })} />);
    expect(screen.getByText('No such help page')).toBeInTheDocument();
  });
});
