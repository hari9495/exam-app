import type { Meta, StoryObj } from '@storybook/react-vite';
import { HelpCentreScreen } from './helpdesk';
import { ARTICLES, ASSISTANT_THREAD, MY_TICKETS } from './helpdesk-data';
import { TODAY } from '../_kit/data';
import { HELP_BANNERS, HELP_CHANNELS, HELP_CHAT, liveHelp } from './helpdesk-live-samples';
import { RAISE_DESKS } from '../desk/data';

const meta: Meta = { title: 'Screens/Helpdesk/HLP-01 · Help centre', parameters: { layout: 'fullscreen' } };
export default meta;
type S = StoryObj;
const PHONE = { viewport: { value: 'mobile2', isRotated: false } };

export const Default: S = { render: () => <HelpCentreScreen articles={ARTICLES} tickets={MY_TICKETS} today={TODAY} assistant={ASSISTANT_THREAD} /> };
export const SearchResults: S = { name: 'Search results', render: () => <HelpCentreScreen articles={ARTICLES} tickets={MY_TICKETS} today={TODAY} defaultQuery="payslip loss of pay" assistant={ASSISTANT_THREAD} /> };
export const SearchNoMatch: S = { name: 'Search · no match', render: () => <HelpCentreScreen articles={ARTICLES} tickets={MY_TICKETS} today={TODAY} defaultQuery="gym membership" /> };
export const RaiseTicket: S = { name: 'Raise ticket · article suggestions', render: () => <HelpCentreScreen articles={ARTICLES} tickets={MY_TICKETS} today={TODAY} raiseOpen raiseSubject="LOP on my September payslip" /> };
export const RateResolved: S = { name: 'Resolved ticket · rate or reopen', render: () => <HelpCentreScreen articles={ARTICLES} tickets={MY_TICKETS} today={TODAY} rateTicketId="HD-2248" /> };
export const NoTickets: S = { name: 'Empty (no tickets, assistant not yet on)', render: () => <HelpCentreScreen articles={ARTICLES} tickets={[]} today={TODAY} /> };
export const Loading: S = { render: () => <HelpCentreScreen articles={ARTICLES} tickets={MY_TICKETS} today={TODAY} state="loading" /> };
export const Error: S = { render: () => <HelpCentreScreen articles={ARTICLES} tickets={MY_TICKETS} today={TODAY} state="error" /> };
export const Phone: S = { name: 'Help centre · phone', globals: PHONE, render: () => <HelpCentreScreen device="phone" articles={ARTICLES} tickets={MY_TICKETS} today={TODAY} /> };
export const PhoneRaise: S = { name: 'Raise ticket · phone', globals: PHONE, render: () => <HelpCentreScreen device="phone" articles={ARTICLES} tickets={MY_TICKETS} today={TODAY} raiseOpen raiseSubject="Form 16 not visible" /> };

// States only the real record has (Helpdesk design wiring, round 1): drawn in the same layout as the stories above.
export const KnownIssue: S = { name: 'Known issue · Me too, reading aids and my data', render: () => <HelpCentreScreen live={liveHelp({ banners: HELP_BANNERS })} /> };
export const ArticleOpen: S = { name: 'Article open · was it helpful, this solved it', render: () => <HelpCentreScreen live={liveHelp({ kb: { ...liveHelp().kb, openNumber: 12 } })} /> };
export const ChatAndPhone: S = { name: 'Chat offer and help on WhatsApp or SMS', render: () => <HelpCentreScreen live={liveHelp({ chatPrompt: HELP_CHAT, channels: HELP_CHANNELS })} /> };
// Answer 1643: after the stars, an optional reason from the desk's own list.
export const RateWithReason: S = { name: 'Resolved ticket · rate with a reason', render: () => <HelpCentreScreen live={liveHelp()} /> };
// Answer 1646: outside the desk's calendar the raise form says so, with the next opening time (the desk's own words).
export const ClosedNow: S = { name: 'Raise ticket · the team is closed now', render: () => <HelpCentreScreen live={liveHelp({ startRaise: true, desks: RAISE_DESKS.map((d) => ({ ...d, closed: { message: "We're closed now. We open again {opens}. You can still raise a ticket; we answer it when we open.", opensAt: '2026-10-13T03:30:00Z' } })) })} /> };
// Answer 1662: a plain IT ticket asks "Which device?" when the person has devices assigned (the catalogue's picker).
export const RaiseWhichDevice: S = { name: 'Raise ticket · which device? (IT desk)', render: () => <HelpCentreScreen live={liveHelp({ startRaise: true, desks: [{ ...RAISE_DESKS[0], categories: [], askDevice: true }], onPickDevice: async () => [{ id: 'as1', label: 'Dell Latitude 5440 (KF-LT-0142)', detail: 'Laptop' }, { id: 'as2', label: 'Logitech headset (KF-HS-0077)', detail: 'Accessory' }] })} /> };
// Answer 1801: people who may raise for others pick a colleague; "Which device?" follows that colleague.
export const RaiseOnBehalf: S = { name: 'Raise ticket · on behalf of a colleague', render: () => <HelpCentreScreen live={liveHelp({ startRaise: true, desks: [{ ...RAISE_DESKS[0], categories: [] }], onPickDevice: async () => [{ id: 'as9', label: 'HP EliteBook (KF-LT-0009)', detail: 'Laptop' }], onBehalf: { onPickPeople: async () => [{ id: 'p-ravi', label: 'Ravi Kumar', detail: 'Sales' }], onDesksFor: async () => [{ ...RAISE_DESKS[0], categories: [], askDevice: true }] } })} /> };
export const NoAccess: S = { name: 'No access (acting for someone else)', render: () => <HelpCentreScreen live={liveHelp({ state: 'no-access' })} /> };
