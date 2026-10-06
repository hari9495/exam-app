import type { Meta, StoryObj } from '@storybook/react-vite';
import { ExitInterview, ExitInterviewPhone } from './exits';

const meta: Meta = { title: 'Screens/People/PPL-21 · Exit interview', parameters: { layout: 'fullscreen' } };
export default meta;
type S = StoryObj;
const phone = { globals: { viewport: { value: 'mobile2', isRotated: false } } };

export const Employee: S = { name: 'Employee · survey', render: () => <ExitInterview /> };
export const Hr: S = { name: 'HR · answers and notes (confidential)', render: () => <ExitInterview persona="hr" /> };
export const Phone: S = { name: '· phone', ...phone, render: () => <ExitInterviewPhone /> };
