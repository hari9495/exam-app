import type { Meta, StoryObj } from '@storybook/react-vite';
import { GroupHealthScreen } from './special-pay';

const meta: Meta<typeof GroupHealthScreen> = { title: 'Screens/Pay/PAY-43 · Group health', component: GroupHealthScreen, parameters: { layout: 'fullscreen' } };
export default meta;
type S = StoryObj<typeof GroupHealthScreen>;

export const Quotes: S = { name: 'Neutral quote table' };
export const Disclosure: S = { name: 'Disclosure to acknowledge before quotes', args: { variant: 'disclosure' } };
export const Active: S = { name: 'Policy active · endorsement status', args: { variant: 'active' } };
export const NotEligible: S = { name: 'Not eligible · under minimum headcount', args: { variant: 'not-eligible' } };
export const LicenceExpired: S = { name: 'Partner licence expired · offers hidden', args: { variant: 'licence-expired' } };
