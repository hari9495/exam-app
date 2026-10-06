import type { Meta, StoryObj } from '@storybook/react-vite';
import { OtReviewScreen } from './requests';

const meta: Meta<typeof OtReviewScreen> = { title: 'Screens/Time/TIM-09 · OT review', component: OtReviewScreen, parameters: { layout: 'fullscreen' } };
export default meta;
type S = StoryObj<typeof OtReviewScreen>;

export const Manager: S = { name: 'Manager · own reports' };
export const PlantHead: S = { name: 'Plant head · over the legal limit', args: { manager: 'Ramesh Gowda' } };
export const Hr: S = { name: 'HR', args: { persona: 'hr' } };
export const Override: S = { name: 'HR · override limit with reason', args: { persona: 'hr', action: 'override' } };
export const CompOff: S = { name: 'Convert to comp-off', args: { action: 'comp' } };
export const Empty: S = { name: 'Empty', args: { state: 'empty' } };
export const Loading: S = { name: 'Loading', args: { state: 'loading' } };
export const Failed: S = { name: 'Error', args: { state: 'error' } };
