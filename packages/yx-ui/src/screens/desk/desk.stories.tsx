import type { Meta, StoryObj } from '@storybook/react-vite';
import { WorkspaceShell, type WorkspaceLink, type WorkspacePage } from '../auth/shell';
import { HelpCentreScreen, HelpDrawer, MyTicketScreen } from './help';
import { BUILT_IN_VIEWS, DeskTicketsScreen } from './tickets';
import { TicketScreen } from './ticket';
import { DeskSetupScreen } from './setup';
import { CAL_ITEMS, CANNED, COMPLIANCE, CONTEXT, DESK, DETAIL, HR_DESK, MY_ROWS, MY_TICKET, RAISE_DESKS, ROWS, SLA_SETUP, TICKET, TIMELINE, WORK } from './data';
import { TicketWorkRail } from './work';
import { MyCalendarScreen } from './calendar';
import { SlaTab } from './setup-sla';
import { BannersTab, EmailTab, PortalTab, type EmailSetupProps } from './setup-channels';
import { CustomersScreen } from './customers';
import { PortalScreen, type PortalScreenProps } from './portal';
import { ACCOUNT, ACCOUNT_ROWS, BANNERS, BOUNCES, CS_DESK, INBOUND, MAILBOXES, MY_BANNERS, PORTALS, PORTAL_HOME, PORTAL_ROWS, PORTAL_TICKET, PRODUCTS, SENDING_DOMAINS } from './data';

const meta: Meta = { title: 'Screens/Service desk/Phase 3b-1 (wired screens)', parameters: { layout: 'fullscreen' } };
export default meta;
type S = StoryObj;

const wait = (ms = 400) => new Promise<void>((r) => setTimeout(r, ms));
const LINKS: WorkspaceLink[] = [
  { id: 'desk-help', label: 'Help centre', href: '#help', group: 'Service desk' },
  { id: 'desk-tickets', label: 'Tickets', href: '#tickets', group: 'Service desk' },
  { id: 'desk-setup', label: 'Desk set-up', href: '#setup', group: 'Service desk' },
  { id: 'desk-customers', label: 'Customers', href: '#customers', group: 'Service desk' },
  { id: 'me', label: 'My security', href: '#me', group: 'Me' },
];
const shell = (active: WorkspacePage, children: React.ReactNode) => (
  <WorkspaceShell active={active} links={LINKS} company="Kaveri Foods" profileHref="#" name="Suresh Pillai" email="it-agent@kaveri.test" onSignOut={() => {}}>
    <div className="yx-auth__page">{children}</div>
  </WorkspaceShell>
);
const noop = () => wait();

export const Help: S = { name: 'HLP-01 Help centre', render: () => shell('desk-help', <HelpCentreScreen state="ready" desks={RAISE_DESKS} tickets={MY_ROWS} onRaise={async () => ({ id: 'x', number: 'IT-1005' })} onOpen={() => {}} />) };
export const HelpEmpty: S = { name: 'HLP-01 Help centre · no tickets', render: () => shell('desk-help', <HelpCentreScreen state="ready" desks={RAISE_DESKS} tickets={[]} onRaise={async () => ({ id: 'x', number: 'IT-1005' })} onOpen={() => {}} />) };
export const MyTicket: S = {
  name: 'HLP-01 My ticket (requester view)',
  render: () => shell('desk-help', <MyTicketScreen state="ready" ticket={MY_TICKET} onBack={() => {}} onReply={noop} onUpload={async () => ({ ...MY_TICKET.attachments[0], id: 'n', scanStatus: 'pending' })} onOpenFile={noop} onAddWatcher={noop} />),
};

const list = (layout: 'list' | 'board') =>
  shell(
    'desk-tickets',
    <DeskTicketsScreen
      state="ready"
      desks={[DESK]}
      details={[DETAIL]}
      views={[]}
      page={{ items: ROWS, total: ROWS.length, nextCursor: null }}
      pageState="ready"
      query={{ viewId: 'open', filters: BUILT_IN_VIEWS[2].filters, layout }}
      onQueryChange={() => {}}
      onOpen={() => {}}
      onMove={noop}
      onBulk={async () => ({ done: [], failed: [] })}
      onSaveView={noop}
      onExport={noop}
      onSearchPeople={async () => []}
      onCreate={async () => ({ id: 'x' })}
    />,
  );
export const Tickets: S = { name: 'HLP-02 Agent desk · list', render: () => list('list') };
export const Board: S = { name: 'HLP-02 Agent desk · board', render: () => list('board') };

const rail = (ticket: typeof TICKET) => (
  <TicketWorkRail
    ticket={ticket}
    detail={DETAIL}
    work={WORK}
    desks={[DESK]}
    meId="u-suresh"
    onFindTicket={async () => []}
    onOpenTicket={() => {}}
    onLink={noop}
    onUnlink={noop}
    onMerge={noop}
    onSplit={async () => ({ id: 'n' })}
    onSetParent={noop}
    onSetTracker={noop}
    onStartSide={noop}
    onSideMessage={noop}
    onCloseSide={noop}
    onAddTask={noop}
    onUpdateTask={noop}
    onBreachReason={noop}
    onExclude={noop}
    onRemind={noop}
    onSnooze={noop}
    onDoneReminder={noop}
    onUnmask={async () => 'ABCPE1234F'}
  />
);
const workspace = (ticket = TICKET, others = [{ userId: 'u-farah', name: 'Farah Khan', typing: true }]) =>
  shell(
    'desk-tickets',
    <TicketScreen
      state="ready"
      ticket={ticket}
      detail={DETAIL}
      canned={CANNED}
      timeline={TIMELINE}
      context={CONTEXT}
      others={others}
      meName="Suresh Pillai"
      meId="u-suresh"
      onBack={() => {}}
      onUpdate={noop}
      onAssign={noop}
      onPost={noop}
      onUpload={async () => ({ ...TICKET.attachments[0], id: 'n', scanStatus: 'pending', messageId: null })}
      onOpenFile={noop}
      onAddTime={noop}
      onRunScenario={noop}
      onConvert={noop}
      onAddCollaborator={noop}
      onRemoveCollaborator={noop}
      onAddWatcher={noop}
      onRemoveWatcher={noop}
      onSearchPeople={async () => []}
      onTyping={() => {}}
      onOpenTicket={() => {}}
      rail={rail(ticket)}
      onResolveClick={() => {}}
      onEscalateClick={() => {}}
    />,
  );
export const Workspace: S = { name: 'HLP-03 Ticket workspace · agent, colleague typing', render: () => workspace() };
export const WorkspaceCollaborator: S = { name: 'HLP-03 Ticket workspace · collaborator (notes only)', render: () => workspace({ ...TICKET, access: 'collaborator', canWork: false }, []) };

export const Setup: S = {
  name: 'Desk set-up',
  render: () =>
    shell(
      'desk-setup',
      <DeskSetupScreen
        state="ready"
        desks={[DESK, HR_DESK]}
        canCreate
        selectedId="d-it"
        onSelect={() => {}}
        detail={{ ...DETAIL, canSetUp: true, canManageMembers: true }}
        canned={CANNED}
        calendars={[{ id: 'cal-1', name: 'Office hours', timeZone: 'Asia/Kolkata', version: 1, hours: [1, 2, 3, 4, 5].map((weekday) => ({ id: `h${weekday}`, weekday, startMinute: 540, endMinute: 1080, validFrom: '2026-01-01', validTo: null })), holidays: [{ id: 'hol1', on: '2026-10-20', name: 'Dussehra', halfDay: false }] }]}
        canCalendars
        onCreateDesk={noop}
        onUpdateDesk={noop}
        onSearchUsers={async () => [{ id: 'u-new', name: 'Ravi Menon', email: 'ravi.menon@kaveri.test' }]}
        onSeatCost={async () => ({ paid: true, reason: 'Adds ₹999 a month (one agent).' })}
        onAddMember={noop}
        onEndMember={noop}
        onSaveGroup={noop}
        onSaveCategory={noop}
        onSaveType={noop}
        onSaveStatus={noop}
        onSaveMatrix={noop}
        onSaveCanned={noop}
        onSaveScenario={noop}
        onAddHoliday={noop}
        onSetHours={noop}
      />,
    ),
};

export const Calendar: S = { name: 'SD-1.11 My calendar', render: () => shell('desk-tickets', <MyCalendarScreen state="ready" items={CAL_ITEMS} tasks={WORK.tasks} feed={null} onOpenTicket={() => {}} onNewFeed={async () => 'https://api.example.test/desk/calendar-feed/o/u/secret.ics'} onRevokeFeed={noop} />) };
export const SlaSetupTab: S = { name: 'SD-1.14 Response targets (desk set-up tab)', render: () => shell('desk-setup', <SlaTab detail={DETAIL} calendars={[]} setup={SLA_SETUP} compliance={COMPLIANCE} month="2026-10" onMonth={() => {}} onCreatePolicy={noop} onAddVersion={noop} onUpdatePolicy={noop} onSaveTargets={noop} />) };

// ---- batch 3 (SD-1.18 to SD-1.23, SD-1.28) ----

const emailProps: EmailSetupProps = {
  state: 'ready',
  mailboxes: MAILBOXES,
  domains: SENDING_DOMAINS,
  bounces: BOUNCES,
  inbound: INBOUND,
  verdict: 'held',
  onVerdict: () => {},
  onCreateMailbox: async () => ({ ...MAILBOXES[0], webhookUrl: 'https://api.example.test/desk/inbound/email/kaveri/abc', signingSecret: 'whsec_demo' }),
  onUpdateMailbox: noop,
  onRotate: async () => ({ webhookUrl: 'https://api.example.test/desk/inbound/email/kaveri/new', signingSecret: 'whsec_new' }),
  onLoadRules: async () => [{ id: 'r1', name: 'Orders to Orders', field: 'subject', op: 'contains', value: 'order', action: 'route', actionValue: { categoryId: 'c-net' }, stop: false, active: true }],
  onSaveRule: noop,
  onDeleteRule: noop,
  onOpenOriginal: async () => ({ id: 'in1', from: INBOUND[0].from, fromName: INBOUND[0].fromName, to: 'it-help@kaveri.test', subject: INBOUND[0].subject, verdict: 'held', reason: INBOUND[0].reason, flags: INBOUND[0].flags, receivedAt: INBOUND[0].receivedAt, text: 'Please wire 5 lakh to the account below today.', files: [] }),
  onRelease: noop,
  onAddDomain: noop,
  onCheckDomain: noop,
  onClearBounce: noop,
};
export const EmailSetup: S = { name: 'SD-1.18 Email (desk set-up tab)', render: () => shell('desk-setup', <EmailTab {...emailProps} detail={{ ...DETAIL, canSetUp: true }} />) };
export const PortalSetup: S = { name: 'SD-1.21 Help pages (desk set-up tab)', render: () => shell('desk-setup', <PortalTab state="ready" portals={PORTALS} desks={[DESK, CS_DESK]} onSave={noop} />) };
export const BannerSetup: S = { name: 'SD-1.23 Banners (desk set-up tab)', render: () => shell('desk-setup', <BannersTab state="ready" banners={BANNERS} openTickets={[{ id: 't9', number: 'IT-1031', subject: 'VPN slow on Fridays' }]} onSave={noop} onEnd={noop} />) };
export const Customers: S = {
  name: 'SD-1.22 Customers',
  render: () =>
    shell(
      'desk-customers',
      <CustomersScreen
        state="ready"
        canManage
        accounts={ACCOUNT_ROWS}
        search=""
        onSearch={() => {}}
        selectedId="ac1"
        onSelect={() => {}}
        account={ACCOUNT}
        products={PRODUCTS}
        desks={[CS_DESK]}
        onCreateAccount={noop}
        onUpdateAccount={noop}
        onAddContact={noop}
        onUpdateContact={noop}
        onAddPlan={noop}
        onEndPlan={noop}
        onSaveProduct={noop}
        onSearchUsers={async () => [{ id: 'u-suresh', name: 'Suresh Pillai', email: 'it-agent@kaveri.test' }]}
        onLoadAgentAccounts={async () => []}
        onSetAgentAccounts={noop}
      />,
    ),
};
export const HelpWithBanner: S = { name: 'US-G-020 Help centre · known issue and reading aids', render: () => shell('desk-help', <HelpCentreScreen state="ready" desks={RAISE_DESKS} tickets={MY_ROWS} onRaise={async () => ({ id: 'x', number: 'IT-1005' })} onOpen={() => {}} banners={MY_BANNERS} onMeToo={noop} timeZone="Asia/Kolkata" />) };
export const HelpDrawerOpen: S = { name: 'US-B-100 In-app Help drawer', render: () => shell('desk-tickets', <HelpDrawer open onOpenChange={() => {}} desks={RAISE_DESKS} tickets={MY_ROWS} banners={MY_BANNERS} onMeToo={noop} onRaise={async () => ({ id: 'x', number: 'IT-1005' })} ticketHref={(id) => `#${id}`} />) };
export const WorkspaceUnverified: S = { name: 'SD-1.19 Ticket workspace · sender not verified, customer', render: () => workspace({ ...TICKET, channel: 'email', senderVerified: false, customer: { account: { id: 'ac1', name: 'Sunrise Retail' }, plan: 'gold' }, product: { id: 'pr1', name: 'Kaveri billing app' }, fields: { order_number: '4471' } }, []) };

const portal = (over: Partial<PortalScreenProps>) => (
  <PortalScreen
    state="ready"
    home={PORTAL_HOME}
    me={null}
    tickets={PORTAL_ROWS}
    ticket={null}
    timeZone="Asia/Kolkata"
    onSendCode={noop}
    onVerify={noop}
    onAsk={noop}
    onMeToo={noop}
    onRaise={async () => ({ id: 'pt9', number: 'CS-1009' })}
    onOpenTicket={() => {}}
    onBack={() => {}}
    onReply={noop}
    onSignOut={noop}
    {...over}
  />
);
const ME = { name: 'Kiran Shetty', email: 'kiran@sunrise.example', account: 'Sunrise Retail', seesAccountTickets: true };
export const PortalLogin: S = { name: 'US-G-021 Outside portal · sign in', render: () => portal({}) };
export const PortalHomeStory: S = { name: 'US-G-021 Outside portal · my tickets', render: () => portal({ me: ME, notice: 'Ticket CS-1004 is open.' }) };
export const PortalTicketStory: S = { name: 'US-G-021 Outside portal · one ticket', render: () => portal({ me: ME, ticket: PORTAL_TICKET, ticketState: 'ready' }) };
