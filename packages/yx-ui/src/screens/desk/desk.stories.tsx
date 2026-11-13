import type { Meta, StoryObj } from '@storybook/react-vite';
import { LinksFrame, type StoryLink } from '../_kit/story-frame';
import { play, press, pressFirst, tab, type } from '../_kit/story-play';
import { DeskSetupScreen } from './setup';
import { CANNED, COMPLIANCE, DESK, DETAIL, HR_DESK, SLA_SETUP } from './data';
import { SlaTab } from './setup-sla';
import { SAMPLE_FIELDS } from './ticket-fields-sample';
import { BannersTab, EmailTab, PortalTab, type EmailSetupProps } from './setup-channels';
import { BANNERS, BOUNCES, CS_DESK, INBOUND, MAILBOXES, PORTALS, SENDING_DOMAINS } from './data';

// Helpdesk › Desk set-up (the founder, 12 Nov 2026: plain names under Helpdesk): desks, calendars, response targets, email,
// help pages and banners, as /yx/desk/setup renders them. The catalogue, rules, lifecycle, chat, organisation, schedules
// and messaging tabs are drawn in HLP-18.
const meta: Meta = { title: 'Screens/Helpdesk/Desk set-up', parameters: { layout: 'fullscreen' } };
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
// HLP-05b (founder 3 Nov 2026): each desk chooses its at-risk point (default 80 %), on the same Settings tab.
export const SetupAtRisk: S = { name: 'Desk set-up · Tickets · at risk from (per desk)', render: () => shell('desk-setup', <DeskSetupScreen {...setupProps} initialTab="settings" detail={{ ...setupProps.detail!, desk: { ...setupProps.detail!.desk, atRiskPercent: 60 } }} />) };
// Answer 1643: the reasons a requester may pick after a rating, per desk (a starter list until changed).
export const SetupRatingReasons: S = { name: 'Desk set-up · Requesters · reasons to pick after a rating', render: () => shell('desk-setup', <DeskSetupScreen {...setupProps} initialTab="requesters" detail={{ ...setupProps.detail!, desk: { ...setupProps.detail!.desk, ratingReasons: ['Quick help', 'Solved my problem', 'Friendly and clear', 'Slow', 'Not solved', 'Had to explain again'] } }} />) };
// Answer 1646: the message the help centre and portal show while the desk is closed.
export const SetupClosedMessage: S = { name: 'Desk set-up · Requesters · message while closed', render: () => shell('desk-setup', <DeskSetupScreen {...setupProps} initialTab="requesters" detail={{ ...setupProps.detail!, desk: { ...setupProps.detail!.desk, closedMessage: "We're closed now. We open again {opens}. You can still raise a ticket; we answer it when we open." } }} />) };
// Answers 1641, 1650: the desk's own ticket fields (a drop-down narrowing the next; who sees each).
export const SetupFields: S = { name: 'Desk set-up · Fields', render: () => shell('desk-setup', <DeskSetupScreen {...setupProps} initialTab="fields" detail={{ ...setupProps.detail!, fields: SAMPLE_FIELDS }} onSaveField={noop} />) };
export const SetupFieldEdit: S = { name: 'Desk set-up · Fields · a drop-down narrowed by another', render: SetupFields.render, play: play(press('Edit Floor')) };
export const SetupFieldNewMissing: S = { name: 'Desk set-up · Fields · Save pressed with nothing filled', render: SetupFields.render, play: play(press('New field'), press('Save field')) };
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
export const NewDeskTooEarly: S = { name: 'Desk set-up · Create desk pressed with nothing filled', render: Setup.render, play: play(press('New desk'), press('Create desk')) };
export const HolidayTooEarly: S = { name: 'Desk set-up · Add holiday pressed with no date or name', render: Setup.render, play: play(tab('Calendars'), press('Add holiday')) };

// Founder rules (28 Oct 2026, set-up tabs): buttons are never greyed out; pressed too early they say what is missing.
export const MailboxTooEarly: S = { name: 'SD-1.18 Email · Add mailbox pressed with nothing filled', render: EmailSetup.render, play: play(pressFirst('Add a mailbox'), press('Add mailbox')) };
export const DomainTooEarly: S = { name: 'SD-1.18 Email · Add domain pressed with no domain', render: EmailSetup.render, play: play(press('Add domain')) };
export const PortalTooEarly: S = { name: 'SD-1.21 Help pages · Save pressed with nothing filled', render: () => shell('desk-setup', <PortalTab state="ready" portals={PORTALS} desks={[DESK, CS_DESK]} onSave={noop} />), play: play(press('New help page'), press('Save help page')) };
export const PortalNoDesk: S = { name: 'SD-1.21 Help pages · New help page with no customer desk (toast)', render: () => shell('desk-setup', <PortalTab state="ready" portals={[]} desks={[DESK]} onSave={noop} />), play: play(press('New help page')) };
export const BannerTooEarly: S = { name: 'SD-1.23 Banners · Post pressed with nothing written', render: BannerSetup.render, play: play(press('Post a banner'), press('Post banner')) };
