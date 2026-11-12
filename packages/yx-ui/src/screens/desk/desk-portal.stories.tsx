import type { Meta, StoryObj } from '@storybook/react-vite';
import { LinksFrame, type StoryLink } from '../_kit/story-frame';
import { play, press, type } from '../_kit/story-play';
import { CustomersScreen } from './customers';
import { PortalScreen, type PortalScreenProps } from './portal';
import { ACCOUNT, ACCOUNT_ROWS, CS_DESK, PORTAL_HOME, PORTAL_ROWS, PORTAL_TICKET, PRODUCTS } from './data';

// Helpdesk › Customer portal: the outside customers' portal (/yx/portal/[org]/[portal]) and the Customers page that
// sets up their accounts, people and plans (/yx/desk/customers).
const meta: Meta = { title: 'Screens/Helpdesk/Customer portal', parameters: { layout: 'fullscreen' } };
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
// Answer 1646: the portal's raise form while the team is closed.
export const PortalRaiseClosed: S = { name: 'US-G-021 Outside portal · raise while the team is closed', render: () => portal({ me: ME, home: { ...PORTAL_HOME, desks: PORTAL_HOME.desks.map((d) => ({ ...d, closed: { message: "We're closed now. We open again {opens}. You can still raise a ticket; we answer it when we open.", opensAt: '2026-10-13T03:30:00Z' } })) } }), play: play(press('Raise a ticket')) };
export const CustomersPlanTooEarly: S = { name: 'SD-1.22 Customers · Add plan pressed with nothing filled', render: Customers.render, play: play(press('Add plan')) };
export const CustomersPersonTooEarly: S = { name: 'SD-1.22 Customers · Add person pressed with nothing filled', render: Customers.render, play: play(press('Add person')) };
export const CustomersProductTooEarly: S = { name: 'SD-1.22 Customers · Add product pressed with no name', render: Customers.render, play: play(press('Add product')) };
