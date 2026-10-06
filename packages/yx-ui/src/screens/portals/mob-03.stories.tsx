import type { Meta, StoryObj } from '@storybook/react-vite';
import { MobileSettingsScreen, type DeviceRow } from './mobile-shell';

const meta: Meta = { title: 'Screens/Mobile shell/MOB-03 · Settings and security', parameters: { layout: 'fullscreen' }, globals: { viewport: { value: 'mobile2', isRotated: false } } };
export default meta;
type S = StoryObj;

const DEVICES: DeviceRow[] = [
  { id: 'd1', name: 'Redmi Note 13', platform: 'Android', version: '3.4.1', bound: true, lastSeen: 'now', current: true },
  { id: 'd2', name: 'Chrome on office laptop', platform: 'Web', version: '3.4.1', bound: false, lastSeen: '28 Sep 2026, 6:40 pm' },
  { id: 'd3', name: 'Old Galaxy M31', platform: 'Android', version: '3.1.0', bound: false, lastSeen: '2 Aug 2026' },
];

export const All: S = { name: 'Settings and security', render: () => <MobileSettingsScreen devices={DEVICES} /> };
export const Notifications: S = { name: 'Notification matrix · WhatsApp opted in', render: () => <MobileSettingsScreen section="notifications" devices={DEVICES} whatsappOptIn /> };
export const Devices: S = { name: 'Devices and sessions', render: () => <MobileSettingsScreen section="security" devices={DEVICES} /> };
export const RemoteSignOut: S = { name: 'Remote sign-out', render: () => <MobileSettingsScreen section="security" devices={DEVICES} signOutId="d3" /> };
export const Reauth: S = { name: 'Re-authentication (Pay after 15 min idle)', render: () => <MobileSettingsScreen devices={DEVICES} reauth /> };
