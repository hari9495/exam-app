import type { Meta, StoryObj } from '@storybook/react-vite';
import { ResignationPhone, ResignationSheet } from './exits';
import { d, TODAY } from './people-data';

const meta: Meta = { title: 'Screens/People/PPL-18 · Resignation', parameters: { layout: 'fullscreen' } };
export default meta;
type S = StoryObj;
const phone = { globals: { viewport: { value: 'mobile2', isRotated: false } } };

export const Form: S = { name: 'Employee · resign with standard notice', render: () => <ResignationSheet today={TODAY} /> };
export const Shortfall: S = { name: 'Early last day (notice shortfall)', render: () => <ResignationSheet today={TODAY} requested={d(2026, 11, 6)} /> };
export const Vrs: S = { name: 'A voluntary retirement scheme is open', render: () => <ResignationSheet today={TODAY} vrs /> };
export const NoEmployment: S = { name: '· nothing to resign from', render: () => <ResignationSheet today={TODAY} live={{ state: 'ready', onRetry: () => {}, data: { today: '2026-09-29', notice: null, reasons: [], current: null, last: null }, onResign: async () => {}, onWithdraw: async () => {}, interviewHref: '#' }} /> };
export const Pending: S = { name: 'Submitted, pending (withdraw directly)', render: () => <ResignationSheet today={TODAY} current={{ requestedLwd: '2026-11-20' }} /> };
export const Accepted: S = { name: 'Accepted (withdraw needs approval)', render: () => <ResignationSheet today={TODAY} current={{ status: 'accepted', approvedLwd: '2026-11-28' }} /> };
export const WithdrawalAsked: S = { name: 'Accepted, withdrawal asked for', render: () => <ResignationSheet today={TODAY} current={{ status: 'accepted', pendingChange: { kind: 'withdrawal', reason: 'Staying on.' } }} /> };
export const InterviewReady: S = { name: 'Serving notice: exit interview ready, letter on hold', render: () => <ResignationSheet today={TODAY} current={{ status: 'accepted', interview: 'sent', lettersHeld: true }} /> };
const off = { onRetry: () => {}, data: null, onResign: async () => {}, onWithdraw: async () => {}, interviewHref: '#' };
export const Loading: S = { name: '· loading', render: () => <ResignationSheet live={{ ...off, state: 'loading' }} /> };
export const Failed: S = { name: "· couldn't load", render: () => <ResignationSheet live={{ ...off, state: 'error' }} /> };
export const Phone: S = { name: '· phone', ...phone, render: () => <ResignationPhone today={TODAY} /> };
