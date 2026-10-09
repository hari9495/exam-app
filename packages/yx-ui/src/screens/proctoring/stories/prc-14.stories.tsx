import type { Meta, StoryObj } from '@storybook/react-vite';
import { ProctorPlannerScreen } from '../live';

const meta: Meta<typeof ProctorPlannerScreen> = { title: 'Screens/Proctoring/PRC-14 · Proctor planner', component: ProctorPlannerScreen, parameters: { layout: 'fullscreen' } };
export default meta;
type S = StoryObj<typeof ProctorPlannerScreen>;

export const WithYukthixPool: S = { name: 'Own staff + YukthiX pool' };
export const OwnStaffOnly: S = { name: 'Not opted in: own staff only', args: { optedIn: false } };
