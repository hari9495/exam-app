import type { Meta, StoryObj } from '@storybook/react-vite';
import { LinksFrame, type StoryLink } from '../_kit/story-frame';
import { play, press, tab, type } from '../_kit/story-play';
import { HelpDrawer, MyTicketScreen } from './help';
import { WhatsNewPanel } from '../platform-b/growth-screens';
import { CAL_ITEMS, MY_ROWS, MY_TICKET, RAISE_DESKS, TEMPLATES, TICKET, WORK } from './data';
import { REQUESTER_TICKET_FIELDS } from './ticket-fields-sample';
import { ResolveDialog } from './work';
import { MyCalendarScreen } from './calendar';
import { MY_BANNERS } from './data';

// Helpdesk › a requester's own ticket, the in-app Help drawer, an agent's calendar and the resolve dialog, as the live
// pages render them.
const meta: Meta = { title: 'Screens/Helpdesk/My ticket, help drawer and calendar', parameters: { layout: 'fullscreen' } };
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

export const Calendar: S = { name: 'SD-1.11 My calendar', render: () => shell('desk-tickets', <MyCalendarScreen state="ready" items={CAL_ITEMS} tasks={WORK.tasks} feed={null} onOpenTicket={() => {}} onNewFeed={async () => 'https://api.example.test/desk/calendar-feed/o/u/secret.ics'} onRevokeFeed={noop} />) };
export const HelpDrawerOpen: S = { name: 'US-B-100 In-app Help drawer', render: () => shell('desk-tickets', <HelpDrawer open onOpenChange={() => {}} desks={RAISE_DESKS} tickets={MY_ROWS} banners={MY_BANNERS} onMeToo={noop} onRaise={async () => ({ id: 'x', number: 'IT-1005' })} ticketHref={(id) => `#${id}`} />) };

// Pressed too early: the buttons stay pressable and say what is missing (founder rule, no greyed-out buttons).
export const ResolveTooEarly: S = { name: 'SD-1.10 Resolve · pressed without a code or note', render: () => shell('desk-tickets', <ResolveDialog open onOpenChange={() => {}} ticket={TICKET} codes={TEMPLATES.resolutionCodes} required linked={0} onResolve={noop} />), play: play(press('Resolve')) };

// Helpdesk founder rules (28 Oct 2026): too early says what is missing; done is a toast.
// Help H-4 (answer 943): What's new in the Help drawer until H-1 gives it its own tab.
export const HelpDrawerWhatsNew: S = {
  name: "US-B-100 Help drawer · What's new (H-4)",
  render: () =>
    shell(
      'desk-tickets',
      <HelpDrawer
        open
        onOpenChange={() => {}}
        desks={RAISE_DESKS}
        tickets={MY_ROWS}
        banners={MY_BANNERS}
        onMeToo={noop}
        onRaise={async () => ({ id: 'x', number: 'IT-1005' })}
        ticketHref={(id) => `#${id}`}
        defaultTab="new"
        whatsNew={<WhatsNewPanel live={{ state: 'ready', onRetry: () => {}, unread: 1, onMarkAllRead: async () => {}, entries: [{ id: 'n1', date: '2026-11-10', product: 'YukthiX HR', title: 'Comp-off expiry on the balance card', body: 'Employees now see when comp-off days lapse, on web and mobile.', unread: true }, { id: 'n2', date: '2026-11-02', product: 'YukthiX HR', title: 'Press ? for keyboard shortcuts', body: 'Every page lists the shortcuts that work for you.', unread: false }] }} />}
      />,
    ),
};
export const HelpDrawerTooEarly: S = { name: 'US-B-100 Help drawer · Raise ticket pressed with nothing filled', render: () => shell('desk-tickets', <HelpDrawer open onOpenChange={() => {}} desks={RAISE_DESKS} tickets={MY_ROWS} banners={MY_BANNERS} onMeToo={noop} onRaise={async () => ({ id: 'x', number: 'IT-1005' })} ticketHref={(id) => `#${id}`} />), play: play(press('Raise ticket')) };
// Answers 1641, 1650: the requester sees only the filled fields meant for everyone.
export const MyTicketFields: S = { name: 'HLP-01 My ticket · the desk fields I may see', render: () => shell('desk-help', <MyTicketScreen state="ready" ticket={{ ...MY_TICKET, deskFields: REQUESTER_TICKET_FIELDS }} onBack={() => {}} onReply={noop} onUpload={async () => ({ ...MY_TICKET.attachments[0], id: 'n', scanStatus: 'pending' as const })} onOpenFile={noop} onAddWatcher={noop} />) };
export const MyTicketReplyTooEarly: S = { name: 'HLP-01 My ticket · Send reply pressed with nothing written', render: MyTicket.render, play: play(press('Send reply')) };
export const MyTicketWatchTooEarly: S = { name: 'HLP-01 My ticket · Add colleague pressed with no email', render: MyTicket.render, play: play(press('Add')) };
