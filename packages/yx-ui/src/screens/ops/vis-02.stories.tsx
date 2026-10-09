import type { Meta, StoryObj } from '@storybook/react-vite';
import { PreRegisterScreen } from './visitors';
import { MY_VISITORS } from './visitors-data';
import { TODAY } from '../_kit/data';

const meta: Meta = { title: 'Screens/Visitors/VIS-02 · Pre-register + my visitors', parameters: { layout: 'fullscreen' } };
export default meta;
type S = StoryObj;
const PHONE = { viewport: { value: 'mobile2', isRotated: false } };

export const MyVisitors: S = { name: 'My visitors', render: () => <PreRegisterScreen visits={MY_VISITORS} today={TODAY} /> };
export const Invite: S = { name: 'Invite a visitor', render: () => <PreRegisterScreen visits={MY_VISITORS} today={TODAY} formOpen /> };
export const Sent: S = { name: 'Invite sent', render: () => <PreRegisterScreen visits={MY_VISITORS} today={TODAY} sent /> };
export const Empty: S = { render: () => <PreRegisterScreen visits={[]} today={TODAY} /> };
export const Phone: S = { name: 'My visitors · phone', globals: PHONE, render: () => <PreRegisterScreen device="phone" visits={MY_VISITORS} today={TODAY} /> };
export const PhoneApproval: S = { name: 'Walk-in approval card · phone', globals: PHONE, render: () => <PreRegisterScreen device="phone" visits={MY_VISITORS} today={TODAY} approval /> };
export const PhoneInvite: S = { name: 'Invite · phone', globals: PHONE, render: () => <PreRegisterScreen device="phone" visits={MY_VISITORS} today={TODAY} formOpen /> };
