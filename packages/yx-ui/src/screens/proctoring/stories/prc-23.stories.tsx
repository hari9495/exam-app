import type { Meta, StoryObj } from '@storybook/react-vite';
import { AccommodationRequestScreen } from '../candidate';

const meta: Meta<typeof AccommodationRequestScreen> = { title: 'Screens/Proctoring/PRC-23 · Accommodation request', component: AccommodationRequestScreen, parameters: { layout: 'fullscreen' } };
export default meta;
type S = StoryObj<typeof AccommodationRequestScreen>;

export const Form: S = { name: 'Request with evidence upload' };
export const Submitted: S = { args: { submitted: true } };
export const Employee: S = { name: 'Employee: HR / L&D decides', args: { submitted: true, employee: true } };
