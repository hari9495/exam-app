import type { Meta, StoryObj } from '@storybook/react-vite';
import { MyDataScreen, WhoAccessedPhone } from './selfservice';

const meta: Meta = { title: 'Screens/People/PPL-33 · My data and who accessed it', parameters: { layout: 'fullscreen' } };
export default meta;
type S = StoryObj;
const phone = { globals: { viewport: { value: 'mobile2', isRotated: false } } };

export const MyData: S = { name: 'My data (classes, retention, download, correction)', render: () => <MyDataScreen /> };
export const Accessed: S = { name: 'Who accessed my data', render: () => <MyDataScreen tab="access" /> };
export const Off: S = { name: 'Who accessed · turned off by the company', render: () => <MyDataScreen tab="access" viewOff /> };
export const Phone: S = { name: '· phone', ...phone, render: () => <WhoAccessedPhone /> };
