import type { Meta, StoryObj } from '@storybook/react-vite';
import { ResultReuseScreen } from '../candidate';

const meta: Meta<typeof ResultReuseScreen> = { title: 'Screens/Proctoring/PRC-32 · Result-reuse consent', component: ResultReuseScreen, parameters: { layout: 'fullscreen' } };
export default meta;
type S = StoryObj<typeof ResultReuseScreen>;

export const Reuse: S = { name: 'Reuse with consent' };
export const Retake: S = { name: 'Choose to retake', args: { choice: 'retake' } };
export const Expired: S = { name: 'Outside validity window', args: { expired: true } };
