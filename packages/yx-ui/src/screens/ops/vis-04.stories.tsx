import type { Meta, StoryObj } from '@storybook/react-vite';
import { VisitorLogScreen } from './visitors';
import { LOG } from './visitors-data';
import { TODAY } from '../_kit/data';

const meta: Meta = { title: 'Screens/Visitors/VIS-04 · Visitor log & reports', parameters: { layout: 'fullscreen' } };
export default meta;
type S = StoryObj;

export const Log: S = { name: 'Log · retention countdown', render: () => <VisitorLogScreen log={LOG} today={TODAY} /> };
export const Reports: S = { name: 'Reports by location, purpose, host', render: () => <VisitorLogScreen log={LOG} today={TODAY} tab="reports" /> };
export const Empty: S = { render: () => <VisitorLogScreen log={[]} today={TODAY} /> };
export const Loading: S = { render: () => <VisitorLogScreen log={LOG} today={TODAY} loading /> };
