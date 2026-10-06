import type { Meta, StoryObj } from '@storybook/react-vite';
import { TeamTodayPhone, TodayBoardScreen } from './attendance';

const meta: Meta<typeof TodayBoardScreen> = { title: 'Screens/Time/TIM-01 · Today board', component: TodayBoardScreen, parameters: { layout: 'fullscreen' } };
export default meta;
type S = StoryObj<typeof TodayBoardScreen>;
const phone = { globals: { viewport: { value: 'mobile2', isRotated: false } } };

export const Manager: S = { name: 'Manager · team' };
export const Hr: S = { name: 'HR · entity', args: { persona: 'hr' } };
export const Nudged: S = { name: 'Nudge sent', args: { nudged: 't5' } };
export const FieldTab: S = { name: 'Field tab', args: { defaultTab: 'field' } };
export const OnSite: S = { name: 'HR · on site now', args: { persona: 'hr', defaultTab: 'onsite' } };
export const Empty: S = { name: 'Empty · no one rostered', args: { state: 'empty' } };
export const Loading: S = { name: 'Loading', args: { state: 'loading' } };
export const Failed: S = { name: 'Error', args: { state: 'error' } };
export const Phone: StoryObj<typeof TeamTodayPhone> = { name: 'Phone · Team today', render: () => <TeamTodayPhone />, ...phone };
