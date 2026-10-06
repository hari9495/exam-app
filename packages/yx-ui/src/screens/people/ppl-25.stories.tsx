import type { Meta, StoryObj } from '@storybook/react-vite';
import { AssetAcknowledgePhone, AssetRegister } from './assets';
import { ASSETS } from './people-data';

const meta: Meta = { title: 'Screens/People/PPL-25 · Asset register', parameters: { layout: 'fullscreen' } };
export default meta;
type S = StoryObj;
const phone = { globals: { viewport: { value: 'mobile2', isRotated: false } } };

export const Register: S = { name: 'Admin · register', render: () => <AssetRegister rows={ASSETS} /> };
export const Issue: S = { name: 'Issue dialog', render: () => <AssetRegister rows={ASSETS} dialog="issue" /> };
export const Return: S = { name: 'Return dialog with recovery', render: () => <AssetRegister rows={ASSETS} dialog="return" /> };
export const Empty: S = { name: '· empty', render: () => <AssetRegister rows={[]} /> };
export const Acknowledge: S = { name: 'Employee · acknowledge (phone)', ...phone, render: () => <AssetAcknowledgePhone /> };
export const Acknowledged: S = { name: 'Employee · acknowledged (phone)', ...phone, render: () => <AssetAcknowledgePhone acknowledged /> };
