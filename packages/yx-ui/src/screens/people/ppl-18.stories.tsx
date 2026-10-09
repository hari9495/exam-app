import type { Meta, StoryObj } from '@storybook/react-vite';
import { ResignationPhone, ResignationSheet } from './exits';
import { d, TODAY } from './people-data';

const meta: Meta = { title: 'Screens/People/PPL-18 · Resignation', parameters: { layout: 'fullscreen' } };
export default meta;
type S = StoryObj;
const phone = { globals: { viewport: { value: 'mobile2', isRotated: false } } };

export const Form: S = { name: 'Employee · resign with standard notice', render: () => <ResignationSheet today={TODAY} /> };
export const Shortfall: S = { name: 'Early last day (notice shortfall)', render: () => <ResignationSheet today={TODAY} requested={d(2026, 11, 6)} /> };
export const Pending: S = { name: 'Submitted, pending (withdraw directly)', render: () => <ResignationSheet today={TODAY} submitted /> };
export const Accepted: S = { name: 'Accepted (withdraw needs approval)', render: () => <ResignationSheet today={TODAY} submitted accepted /> };
export const Phone: S = { name: '· phone', ...phone, render: () => <ResignationPhone today={TODAY} /> };
