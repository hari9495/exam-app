import type { Meta, StoryObj } from '@storybook/react-vite';
import { HelpCentreScreen } from './t9-public';
import { HELP_ARTICLE, HELP_PRODUCTS, HELP_RESULTS } from './t9-pub-data';

const meta: Meta = { title: 'Screens/Portals/T9-16 · Public help centre', parameters: { layout: 'fullscreen' } };
export default meta;
type S = StoryObj;
const base = { products: HELP_PRODUCTS, article: HELP_ARTICLE, results: HELP_RESULTS };

export const Home: S = { render: () => <HelpCentreScreen {...base} view="home" /> };
export const Results: S = { name: 'Search results', render: () => <HelpCentreScreen {...base} view="search" /> };
export const NoResults: S = { name: 'Search · no results', render: () => <HelpCentreScreen {...base} view="no-results" /> };
export const Article: S = { name: 'Article with captioned video', render: () => <HelpCentreScreen {...base} view="article" /> };
export const Untranslated: S = { name: 'Article · translation missing', render: () => <HelpCentreScreen {...base} view="untranslated" /> };
export const Feedback: S = { name: 'Article · feedback sent', render: () => <HelpCentreScreen {...base} view="feedback" /> };
export const Phone: S = { name: 'Article · phone', globals: { viewport: { value: 'mobile2', isRotated: false } }, render: () => <HelpCentreScreen {...base} view="article" /> };
