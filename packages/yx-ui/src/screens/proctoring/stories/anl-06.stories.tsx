import type { Meta, StoryObj } from '@storybook/react-vite';
import { ReportLibraryScreen } from '../analytics';

const meta: Meta<typeof ReportLibraryScreen> = { title: 'Screens/Analytics/ANL-06 · Report library', component: ReportLibraryScreen, parameters: { layout: 'fullscreen' } };
export default meta;
type S = StoryObj<typeof ReportLibraryScreen>;

export const ByQuestion: S = { name: 'Grouped by question' };
export const Favourites: S = { args: { favouritesOnly: true } };
export const Search: S = { args: { query: 'attrition' } };
export const NoMatch: S = { name: 'Search with no match', args: { query: 'canteen' } };
const LIVE_REPORTS = [
  { id: 'pay.register', name: 'Salary register', question: 'How much do we pay, and is it right?', area: 'Payroll', href: '#', format: 'Table · CSV', sensitivity: 'Confidential' as const, favourite: true },
  { id: 'learning.compliance', name: 'Mandatory training compliance', question: 'Are people trained for their work?', area: 'Learning', href: '#', format: 'Table · CSV', sensitivity: 'Internal' as const, favourite: false },
];
export const Live: S = { name: 'Live · the reports you may open', render: () => <ReportLibraryScreen live={{ state: 'ready', reports: LIVE_REPORTS, onFavourite: () => Promise.resolve(), onOpen: () => {} }} /> };
