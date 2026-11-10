import type { Meta, StoryObj } from '@storybook/react-vite';
import { VisitorWatchListScreen, WATCH_ENTRIES } from './visitor-watchlist';

// Visitors slice 3 (answer 605): the blocked-visitor watch-list, for HR and Facility admins only.
const meta: Meta = { title: 'Screens/Visitors/VIS-05 · Visitor watch-list', parameters: { layout: 'fullscreen' } };
export default meta;
type S = StoryObj;
const TODAY = new Date(2026, 8, 29);

export const List: S = { name: 'Watch-list', render: () => <VisitorWatchListScreen entries={WATCH_ENTRIES} today={TODAY} /> };
export const Add: S = { name: 'Add a person', render: () => <VisitorWatchListScreen entries={WATCH_ENTRIES} today={TODAY} addOpen /> };
export const Remove: S = { name: 'Remove an entry', render: () => <VisitorWatchListScreen entries={WATCH_ENTRIES} today={TODAY} removeId="w2" /> };
export const Empty: S = { render: () => <VisitorWatchListScreen entries={[]} today={TODAY} state="empty" /> };
export const Loading: S = { render: () => <VisitorWatchListScreen entries={WATCH_ENTRIES} today={TODAY} state="loading" /> };
