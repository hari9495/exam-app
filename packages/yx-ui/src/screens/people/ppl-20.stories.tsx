import type { Meta, StoryObj } from '@storybook/react-vite';
import { ClearancePhone, ClearanceSignoffs } from './exits';

const meta: Meta = { title: 'Screens/People/PPL-20 · Clearance sign-offs', parameters: { layout: 'fullscreen' } };
export default meta;
type S = StoryObj;
const phone = { globals: { viewport: { value: 'mobile2', isRotated: false } } };

export const Hr: S = { name: 'HR · all departments', render: () => <ClearanceSignoffs /> };
export const ItOwner: S = { name: 'IT owner · own items', render: () => <ClearanceSignoffs owner="Rohit Bhat" /> };
export const FinanceOwner: S = { name: 'Finance owner · blocked item', render: () => <ClearanceSignoffs owner="Deepa Rao" /> };
export const Empty: S = { name: '· empty', render: () => <ClearanceSignoffs owner="Nobody" /> };
export const Phone: S = { name: '· phone', ...phone, render: () => <ClearancePhone /> };
