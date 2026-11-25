import type { Meta, StoryObj } from '@storybook/react-vite';
import { AccommodationRequestScreen } from '../candidate';
import { HELP_APPROVED, HELP_WAITING, liveRequest } from '../before-test-live-samples';

const meta: Meta<typeof AccommodationRequestScreen> = { title: 'Screens/Proctoring/PRC-23 · Accommodation request', component: AccommodationRequestScreen, parameters: { layout: 'fullscreen' } };
export default meta;
type S = StoryObj<typeof AccommodationRequestScreen>;

export const Form: S = { name: 'Request with evidence upload' };
export const Submitted: S = { args: { submitted: true } };
export const Employee: S = { name: 'Employee: HR / L&D decides', args: { submitted: true, employee: true } };

// AS-4b (answer 2011): the candidate's own request and what was approved.
export const LiveAsk: S = { name: 'Candidate: ask with evidence', render: () => <AccommodationRequestScreen live={liveRequest()} /> };
export const LiveWaiting: S = { name: 'Candidate: request waiting', render: () => <AccommodationRequestScreen live={liveRequest({ help: HELP_WAITING })} /> };
export const LiveApproved: S = { name: 'Candidate: approved for you', render: () => <AccommodationRequestScreen live={liveRequest({ help: HELP_APPROVED })} /> };
