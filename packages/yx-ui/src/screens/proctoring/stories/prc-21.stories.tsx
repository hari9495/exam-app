import type { Meta, StoryObj } from '@storybook/react-vite';
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
