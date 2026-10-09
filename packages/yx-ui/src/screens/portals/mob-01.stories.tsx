import type { Meta, StoryObj } from '@storybook/react-vite';
import { FirstRunScreen } from './mobile-shell';

const meta: Meta = { title: 'Screens/Mobile shell/MOB-01 · First run', parameters: { layout: 'fullscreen' }, globals: { viewport: { value: 'mobile2', isRotated: false } } };
export default meta;
type S = StoryObj;

export const Welcome: S = { render: () => <FirstRunScreen step="welcome" /> };
export const Phone: S = { name: 'Mobile number', render: () => <FirstRunScreen step="phone" /> };
export const Otp: S = { name: 'OTP code', render: () => <FirstRunScreen step="otp" /> };
export const OtpWrong: S = { name: 'OTP · wrong code', render: () => <FirstRunScreen step="otp-wrong" /> };
export const OtpLocked: S = { name: 'OTP · locked', render: () => <FirstRunScreen step="otp-locked" /> };
export const Language: S = { render: () => <FirstRunScreen step="language" /> };
export const Notifications: S = { render: () => <FirstRunScreen step="notifications" /> };
export const Device: S = { name: 'Device binding', render: () => <FirstRunScreen step="device" /> };
export const DeviceTaken: S = { name: 'Device binding · another phone bound', render: () => <FirstRunScreen step="device-taken" /> };
export const Pin: S = { name: 'Biometric or app PIN', render: () => <FirstRunScreen step="pin" /> };
export const Install: S = { render: () => <FirstRunScreen step="install" /> };
