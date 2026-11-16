import type { Meta, StoryObj } from '@storybook/react-vite';
import { MY_TESTS, livePortal } from '../delivery-live-samples';
import { CandidatePortalHomeScreen } from '../candidate';

const meta: Meta<typeof CandidatePortalHomeScreen> = { title: 'Screens/Proctoring/PRC-21 · Candidate portal home', component: CandidatePortalHomeScreen, parameters: { layout: 'fullscreen' } };
export default meta;
type S = StoryObj<typeof CandidatePortalHomeScreen>;

export const MyTests: S = { name: 'My tests (booked, under review, missed)' };
export const Booking: S = { name: 'Book a slot', args: { state: 'booking' } };
export const Reschedule: S = { name: 'Change slot', args: { reschedule: true, rescheduleCount: 1 } };
export const RescheduleBlocked: S = { name: 'Change slot blocked (2 used)', args: { reschedule: true, rescheduleCount: 2 } };
export const Empty: S = { args: { state: 'empty' } };
export const Phone: S = { name: 'My tests · phone', globals: { viewport: { value: 'mobile2', isRotated: false } } };

// AS-3: the candidate's own tests at this company (live).
export const LiveMyTests: S = { name: 'Live · my tests', render: () => <CandidatePortalHomeScreen live={livePortal()} /> };
export const LiveReuseOffered: S = { name: 'Live · earlier result can be used', render: () => <CandidatePortalHomeScreen live={livePortal({ reuseOffer: true })} /> };
export const LiveSubmitted: S = { name: 'Live · submitted', render: () => <CandidatePortalHomeScreen live={livePortal({ tests: [{ ...MY_TESTS[0]!, status: 'completed' }] })} /> };
export const LiveEmpty: S = { name: 'Live · no tests', render: () => <CandidatePortalHomeScreen live={livePortal({ tests: [] })} /> };
export const LiveError: S = { name: 'Live · could not load', render: () => <CandidatePortalHomeScreen live={livePortal({ state: 'error' })} /> };
