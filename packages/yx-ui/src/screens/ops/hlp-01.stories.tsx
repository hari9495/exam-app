import type { Meta, StoryObj } from '@storybook/react-vite';
import { HelpCentreScreen } from './helpdesk';
import { ARTICLES, ASSISTANT_THREAD, MY_TICKETS } from './helpdesk-data';
import { TODAY } from '../_kit/data';

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
