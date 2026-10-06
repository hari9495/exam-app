import type { Meta, StoryObj } from '@storybook/react-vite';
import { MyTestsScreen } from './learn-me';
import { MY_TESTS } from './learn-data';

const meta: Meta = { title: 'Screens/Learning/LRN-13 · My tests', parameters: { layout: 'fullscreen' } };
export default meta;
type S = StoryObj;
const PHONE = { viewport: { value: 'mobile2', isRotated: false } };

export const Default: S = { name: 'Assigned tests and results', render: () => <MyTestsScreen tests={MY_TESTS} /> };
export const StartConsent: S = { name: 'Start test (consent per attempt)', render: () => <MyTestsScreen tests={MY_TESTS} consentFor="x3" /> };
export const Phone: S = { name: 'Phone', globals: PHONE, render: () => <MyTestsScreen device="phone" tests={MY_TESTS} /> };
export const PhoneStart: S = { name: 'Phone · start', globals: PHONE, render: () => <MyTestsScreen device="phone" tests={MY_TESTS} consentFor="x1" /> };
export const Empty: S = { render: () => <MyTestsScreen tests={[]} /> };
