import type { Meta, StoryObj } from '@storybook/react-vite';
import { LicenceRequirementsScreen } from './roster';

const meta: Meta<typeof LicenceRequirementsScreen> = { title: 'Screens/Time/TIM-40 · Licence requirements', component: LicenceRequirementsScreen, parameters: { layout: 'fullscreen' } };
export default meta;
type S = StoryObj<typeof LicenceRequirementsScreen>;

export const List: S = { name: 'Requirements' };
export const Blocked: S = { name: 'Roster block · expired licence', args: { blocked: true } };
export const Empty: S = { name: 'Empty', args: { state: 'empty' } };
export const Loading: S = { name: 'Loading', args: { state: 'loading' } };
