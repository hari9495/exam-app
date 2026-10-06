import type { Meta, StoryObj } from '@storybook/react-vite';
import { VisitorInviteScreen } from './t9-business';
import { VISIT } from './t9-biz-data';
import { KAVERI_ACCENT, TENANT, TODAY } from './t9-data';

const meta: Meta = { title: 'Screens/Portals/T9-14 · Visitor invite page', parameters: { layout: 'fullscreen' } };
export default meta;
type S = StoryObj;
const phone = { viewport: { value: 'mobile2', isRotated: false } };
const base = { tenant: TENANT, accent: KAVERI_ACCENT, visit: VISIT, today: TODAY };

export const Details: S = { name: 'Your details', globals: phone, render: () => <VisitorInviteScreen {...base} stage="details" /> };
export const Id: S = { name: 'ID', globals: phone, render: () => <VisitorInviteScreen {...base} stage="id" /> };
export const Photo: S = { name: 'Photo · camera live', globals: phone, render: () => <VisitorInviteScreen {...base} stage="photo" /> };
export const PhotoBlocked: S = { name: 'Photo · camera blocked', globals: phone, render: () => <VisitorInviteScreen {...base} stage="photo" camera="blocked" /> };
export const Notice: S = { name: 'Privacy notice, induction and NDA', globals: phone, render: () => <VisitorInviteScreen {...base} stage="notice" /> };
export const Pass: S = { name: 'QR pass', globals: phone, render: () => <VisitorInviteScreen {...base} stage="pass" /> };
export const PassDesktop: S = { name: 'QR pass · desktop', render: () => <VisitorInviteScreen {...base} stage="pass" /> };
export const Expired: S = { name: 'Pass expired', globals: phone, render: () => <VisitorInviteScreen {...base} stage="expired" /> };
export const Blocked: S = { name: 'Visit blocked', globals: phone, render: () => <VisitorInviteScreen {...base} stage="blocked" /> };
