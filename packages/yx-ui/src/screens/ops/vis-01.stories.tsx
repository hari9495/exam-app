import type { Meta, StoryObj } from '@storybook/react-vite';
import { VisitorDeskScreen } from './visitors';
import { MINOR_VISIT, VISITS } from './visitors-data';
import { TODAY } from '../_kit/data';

const meta: Meta = { title: "Screens/Visitors/VIS-01 · Today's visitors", parameters: { layout: 'fullscreen' } };
export default meta;
type S = StoryObj;

export const Expected: S = { name: 'Expected · walk-in waiting for host', render: () => <VisitorDeskScreen visits={VISITS} today={TODAY} /> };
export const OnSite: S = { name: 'On site now (emergency list)', render: () => <VisitorDeskScreen visits={VISITS} today={TODAY} tab="onsite" /> };
export const CheckedOut: S = { name: 'Checked out', render: () => <VisitorDeskScreen visits={VISITS} today={TODAY} tab="out" /> };
export const CheckIn: S = { name: 'Check in · notice and badge', render: () => <VisitorDeskScreen visits={VISITS} today={TODAY} checkInId="v1" /> };
// Visitors slice 3: the location keeps a photo of the ID (answer 603; never of an Aadhaar card), and a visitor under 18 (614).
export const CheckInIdPhoto: S = { name: 'Check in · ID type, last 4 and photo of the ID', render: () => <VisitorDeskScreen visits={VISITS} today={TODAY} checkInId="v1" idCapture="with_image" /> };
export const CheckInMinor: S = { name: 'Check in · visitor under 18 with an adult', render: () => <VisitorDeskScreen visits={[...VISITS, MINOR_VISIT]} today={TODAY} checkInId="v7" /> };
// Visitors slice 1: "Scan QR pass" takes a scanned or typed pass code (the scanner types it), then opens the check-in.
export const FindPass: S = { name: 'Scan or type the QR pass', render: () => <VisitorDeskScreen visits={VISITS} today={TODAY} findOpen /> };
export const Blocked: S = { name: 'Blocked visitor stopped', render: () => <VisitorDeskScreen visits={VISITS} today={TODAY} blockedAlert /> };
export const Empty: S = { render: () => <VisitorDeskScreen visits={[]} today={TODAY} state="empty" /> };
export const Loading: S = { render: () => <VisitorDeskScreen visits={VISITS} today={TODAY} state="loading" /> };
