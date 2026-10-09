import type { Meta, StoryObj } from '@storybook/react-vite';
import { LeaveTypeEditorScreen } from './leave-admin';

const meta: Meta<typeof LeaveTypeEditorScreen> = { title: 'Screens/Time/TIM-27 · Leave type editor', component: LeaveTypeEditorScreen, parameters: { layout: 'fullscreen' } };
export default meta;
type S = StoryObj<typeof LeaveTypeEditorScreen>;

export const Counting: S = { name: 'Counting · live example' };
export const Basics: S = { name: 'Basics', args: { section: 'basics' } };
export const Crediting: S = { name: 'Crediting', args: { section: 'crediting' } };
export const Rules: S = { name: 'Rules', args: { section: 'rules' } };
export const YearEnd: S = { name: 'Year end', args: { section: 'yearend' } };
export const Notice: S = { name: 'Absence & notice', args: { section: 'absence' } };
export const Statutory: S = { name: 'Statutory template · maternity', args: { statutory: true, section: 'basics' } };
