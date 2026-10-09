import type { Meta, StoryObj } from '@storybook/react-vite';
import { VisitorDeskScreen } from './visitors';
import { VISITS } from './visitors-data';
import { TODAY } from '../_kit/data';

const meta: Meta = { title: "Screens/Visitors/VIS-01 · Today's visitors", parameters: { layout: 'fullscreen' } };
export default meta;
type S = StoryObj;

export const Expected: S = { name: 'Expected · walk-in waiting for host', render: () => <VisitorDeskScreen visits={VISITS} today={TODAY} /> };
export const OnSite: S = { name: 'On site now (emergency list)', render: () => <VisitorDeskScreen visits={VISITS} today={TODAY} tab="onsite" /> };
export const CheckedOut: S = { name: 'Checked out', render: () => <VisitorDeskScreen visits={VISITS} today={TODAY} tab="out" /> };
export const CheckIn: S = { name: 'Check in · notice and badge', render: () => <VisitorDeskScreen visits={VISITS} today={TODAY} checkInId="v1" /> };
export const Blocked: S = { name: 'Blocked visitor stopped', render: () => <VisitorDeskScreen visits={VISITS} today={TODAY} blockedAlert /> };
export const Empty: S = { render: () => <VisitorDeskScreen visits={[]} today={TODAY} state="empty" /> };
export const Loading: S = { render: () => <VisitorDeskScreen visits={VISITS} today={TODAY} state="loading" /> };
