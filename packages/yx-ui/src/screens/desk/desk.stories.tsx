import type { Meta, StoryObj } from '@storybook/react-vite';
import { LinksFrame, type StoryLink } from '../_kit/story-frame';
import { pick, play, press, pressFirst, tab, type } from '../_kit/story-play';
import { HelpDrawer, MyTicketScreen } from './help';
import { DeskSetupScreen } from './setup';
import { CAL_ITEMS, CANNED, COMPLIANCE, CONTEXT, DESK, DETAIL, HR_DESK, MY_ROWS, MY_TICKET, RAISE_DESKS, ROWS, SLA_SETUP, TEMPLATES, TICKET, TIMELINE, WORK } from './data';
import { ResolveDialog } from './work';
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
const LINKS: StoryLink[] = [
  { id: 'desk-help', label: 'Help centre', href: '#help', group: 'Service desk' },
  { id: 'desk-tickets', label: 'Tickets', href: '#tickets', group: 'Service desk' },
  { id: 'desk-setup', label: 'Desk set-up', href: '#setup', group: 'Service desk' },
  { id: 'desk-customers', label: 'Customers', href: '#customers', group: 'Service desk' },
  { id: 'me', label: 'My security', href: '#me', group: 'Me' },
];
const shell = (active: string, children: React.ReactNode) => (
  <LinksFrame active={active} links={LINKS}>
    <div className="yx-auth__page">{children}</div>
  </LinksFrame>
);
const noop = () => wait();

export const MyTicket: S = {
  name: 'HLP-01 My ticket (requester view)',
  render: () => shell('desk-help', <MyTicketScreen state="ready" ticket={MY_TICKET} onBack={() => {}} onReply={noop} onUpload={async () => ({ ...MY_TICKET.attachments[0], id: 'n', scanStatus: 'pending' })} onOpenFile={noop} onAddWatcher={noop} />),
};


const setupProps: React.ComponentProps<typeof DeskSetupScreen> = {
  state: 'ready',
  desks: [DESK, HR_DESK],
  canCreate: true,
  selectedId: 'd-it',
  onSelect: () => {},
  detail: { ...DETAIL, canSetUp: true, canManageMembers: true },
  canned: CANNED,
  calendars: [{ id: 'cal-1', name: 'Office hours', timeZone: 'Asia/Kolkata', version: 1, hours: [1, 2, 3, 4, 5].map((weekday) => ({ id: `h${weekday}`, weekday, startMinute: 540, endMinute: 1080, validFrom: '2026-01-01', validTo: null })), holidays: [{ id: 'hol1', on: '2026-10-20', name: 'Dussehra', halfDay: false }] }],
  canCalendars: true,
  onCreateDesk: noop,
  onUpdateDesk: noop,
  onSearchUsers: async () => [{ id: 'u-new', name: 'Ravi Menon', email: 'ravi.menon@kaveri.test' }],
  onSeatCost: async () => ({ paid: true, reason: 'Adds ₹999 a month (one agent).' }),
  onAddMember: noop,
  onEndMember: noop,
  onSaveGroup: noop,
  onSaveCategory: noop,
  onSaveType: noop,
  onSaveStatus: noop,
  onSaveMatrix: noop,
  onSaveCanned: noop,
  onSaveScenario: noop,
  onAddHoliday: noop,
  onSetHours: noop,
};
export const Setup: S = { name: 'Desk set-up', render: () => shell('desk-setup', <DeskSetupScreen {...setupProps} />) };
// HLP-04 (founder 3 Nov 2026): the article review interval is a company setting, on the Settings tab for the company's
// Service Desk owner (desk.desk.create).
export const SetupKbReview: S = { name: 'Desk set-up · Settings · check help articles again every', render: () => shell('desk-setup', <DeskSetupScreen {...setupProps} initialTab="settings" kbReviewMonths={12} onKbReviewMonths={noop} />) };

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
export const HelpDrawerOpen: S = { name: 'US-B-100 In-app Help drawer', render: () => shell('desk-tickets', <HelpDrawer open onOpenChange={() => {}} desks={RAISE_DESKS} tickets={MY_ROWS} banners={MY_BANNERS} onMeToo={noop} onRaise={async () => ({ id: 'x', number: 'IT-1005' })} ticketHref={(id) => `#${id}`} />) };

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

// Pressed too early: the buttons stay pressable and say what is missing (founder rule, no greyed-out buttons).
export const ResolveTooEarly: S = { name: 'SD-1.10 Resolve · pressed without a code or note', render: () => shell('desk-tickets', <ResolveDialog open onOpenChange={() => {}} ticket={TICKET} codes={TEMPLATES.resolutionCodes} required linked={0} onResolve={noop} />), play: play(press('Resolve')) };
export const NewDeskTooEarly: S = { name: 'Desk set-up · Create desk pressed with nothing filled', render: Setup.render, play: play(press('New desk'), press('Create desk')) };
export const HolidayTooEarly: S = { name: 'Desk set-up · Add holiday pressed with no date or name', render: Setup.render, play: play(tab('Calendars'), press('Add holiday')) };

// Founder rules (28 Oct 2026, set-up tabs): buttons are never greyed out; pressed too early they say what is missing.
export const MailboxTooEarly: S = { name: 'SD-1.18 Email · Add mailbox pressed with nothing filled', render: EmailSetup.render, play: play(pressFirst('Add a mailbox'), press('Add mailbox')) };
export const DomainTooEarly: S = { name: 'SD-1.18 Email · Add domain pressed with no domain', render: EmailSetup.render, play: play(press('Add domain')) };
export const PortalTooEarly: S = { name: 'SD-1.21 Help pages · Save pressed with nothing filled', render: () => shell('desk-setup', <PortalTab state="ready" portals={PORTALS} desks={[DESK, CS_DESK]} onSave={noop} />), play: play(press('New help page'), press('Save help page')) };
export const PortalNoDesk: S = { name: 'SD-1.21 Help pages · New help page with no customer desk (toast)', render: () => shell('desk-setup', <PortalTab state="ready" portals={[]} desks={[DESK]} onSave={noop} />), play: play(press('New help page')) };
export const BannerTooEarly: S = { name: 'SD-1.23 Banners · Post pressed with nothing written', render: BannerSetup.render, play: play(press('Post a banner'), press('Post banner')) };

// Helpdesk founder rules (28 Oct 2026): too early says what is missing; done is a toast.
export const HelpDrawerTooEarly: S = { name: 'US-B-100 Help drawer · Raise ticket pressed with nothing filled', render: () => shell('desk-tickets', <HelpDrawer open onOpenChange={() => {}} desks={RAISE_DESKS} tickets={MY_ROWS} banners={MY_BANNERS} onMeToo={noop} onRaise={async () => ({ id: 'x', number: 'IT-1005' })} ticketHref={(id) => `#${id}`} />), play: play(press('Raise ticket')) };
export const MyTicketReplyTooEarly: S = { name: 'HLP-01 My ticket · Send reply pressed with nothing written', render: MyTicket.render, play: play(press('Send reply')) };
export const MyTicketWatchTooEarly: S = { name: 'HLP-01 My ticket · Add colleague pressed with no email', render: MyTicket.render, play: play(press('Add')) };
export const CustomersPlanTooEarly: S = { name: 'SD-1.22 Customers · Add plan pressed with nothing filled', render: Customers.render, play: play(press('Add plan')) };
export const CustomersPersonTooEarly: S = { name: 'SD-1.22 Customers · Add person pressed with nothing filled', render: Customers.render, play: play(press('Add person')) };
export const CustomersProductTooEarly: S = { name: 'SD-1.22 Customers · Add product pressed with no name', render: Customers.render, play: play(press('Add product')) };
