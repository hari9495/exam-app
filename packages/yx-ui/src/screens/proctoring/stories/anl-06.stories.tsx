import type { Meta, StoryObj } from '@storybook/react-vite';
import { ReportLibraryScreen } from '../analytics';

const meta: Meta<typeof ReportLibraryScreen> = { title: 'Screens/Analytics/ANL-06 · Report library', component: ReportLibraryScreen, parameters: { layout: 'fullscreen' } };
export default meta;
type S = StoryObj<typeof ReportLibraryScreen>;

export const ByQuestion: S = { name: 'Grouped by question' };
export const Favourites: S = { args: { favouritesOnly: true } };
export const Search: S = { args: { query: 'attrition' } };
export const NoMatch: S = { name: 'Search with no match', args: { query: 'canteen' } };
