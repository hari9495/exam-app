import type { Meta, StoryObj } from '@storybook/react-vite';
import { PreclearancePhone, PreclearanceQueue, TradingPreclearance } from './selfservice';
import { d, TODAY } from './people-data';

const meta: Meta = { title: 'Screens/People/PPL-44 · Trading pre-clearance', parameters: { layout: 'fullscreen' } };
export default meta;
type S = StoryObj;
const phone = { globals: { viewport: { value: 'mobile2', isRotated: false } } };

export const Request: S = { name: 'Employee · request', render: () => <TradingPreclearance today={TODAY} /> };
export const Approved: S = { name: 'Approved · validity window and trade report', render: () => <TradingPreclearance view="approved" today={TODAY} /> };
export const Blocked: S = { name: 'Blocked · trading window closed', render: () => <TradingPreclearance view="blocked" today={TODAY} /> };
export const Expired: S = { name: 'Expired without report', render: () => <TradingPreclearance view="expired" today={TODAY} /> };
export const Reported: S = { name: 'Trade reported', render: () => <TradingPreclearance view="report" today={d(2026, 10, 1)} /> };
export const Officer: S = { name: 'Compliance officer · decisions', render: () => <PreclearanceQueue /> };
export const Phone: S = { name: '· phone', ...phone, render: () => <PreclearancePhone today={TODAY} /> };
