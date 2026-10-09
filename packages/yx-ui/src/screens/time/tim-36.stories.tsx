import type { Meta, StoryObj } from '@storybook/react-vite';
import { PresenceDayScreen } from './field';

const meta: Meta<typeof PresenceDayScreen> = { title: 'Screens/Time/TIM-36 · Presence-based attendance', component: PresenceDayScreen, parameters: { layout: 'fullscreen' } };
export default meta;
type S = StoryObj<typeof PresenceDayScreen>;

export const Employee: S = { name: 'Employee · what was recorded', args: { openId: 'me0' } };export const Manager: S = { name: 'Manager · status and total only', args: { persona: 'mgr' } };
export const Hr: S = { name: 'HR', args: { persona: 'hr' } };
export const NoConsent: S = { name: 'No consent', args: { consent: 'none', openId: 'me0' } };
export const Withdrawn: S = { name: 'Consent withdrawn · manager', args: { persona: 'mgr', consent: 'withdrawn', openId: 'f1' } };
