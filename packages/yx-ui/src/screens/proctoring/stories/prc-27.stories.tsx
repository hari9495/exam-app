import type { Meta, StoryObj } from '@storybook/react-vite';
import { ResultAppealScreen } from '../candidate';

const meta: Meta<typeof ResultAppealScreen> = { title: 'Screens/Proctoring/PRC-27 · Result and appeal', component: ResultAppealScreen, parameters: { layout: 'fullscreen' } };
export default meta;
type S = StoryObj<typeof ResultAppealScreen>;

export const Released: S = {};
export const Held: S = { name: 'Under review (held)', args: { state: 'held' } };
export const Verdict: S = { name: 'Verdict with appeal window', args: { state: 'verdict' } };
export const AppealForm: S = { name: 'Appeal form', args: { state: 'appeal-form' } };
export const AppealSent: S = { name: 'Appeal sent', args: { state: 'appeal-sent' } };
export const WindowClosed: S = { name: 'Appeal window closed', args: { state: 'window-closed' } };
export const Phone: S = { name: 'Result · phone', args: { state: 'verdict' }, globals: { viewport: { value: 'mobile2', isRotated: false } } };
