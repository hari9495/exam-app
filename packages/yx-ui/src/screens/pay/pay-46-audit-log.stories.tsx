import type { Meta, StoryObj } from '@storybook/react-vite';
import { fails, never, play, press } from '../_kit/story-play';
import { PayAuditScreen, SAMPLE_CHAIN_BROKEN, SAMPLE_CHAIN_OK } from './payroll-records';

// PAY-46 · Audit log (founder decision 3, 29 Oct 2026): business events in scope with Confidential values masked, a
// record's timeline, the daily chain check with "Check now", and the export (which is itself recorded).
const meta: Meta<typeof PayAuditScreen> = { title: 'Screens/Pay/PAY-46 · Audit log', component: PayAuditScreen, parameters: { layout: 'fullscreen' } };
export default meta;
type S = StoryObj<typeof PayAuditScreen>;

export const Ready: S = { name: 'Events · chain OK, export allowed' };
export const ReadOnly: S = { name: 'Events · read only (no export, no Check now)', args: { canExport: false, chain: { ...SAMPLE_CHAIN_OK, canVerify: false } } };
export const Broken: S = { name: 'Chain check found a break', args: { chain: SAMPLE_CHAIN_BROKEN } };
export const NotChecked: S = { name: 'Chain not checked yet', args: { chain: { canVerify: true, checks: [] } } };
export const Details: S = { name: 'An event’s details · pay values masked (drawer)', args: { open: 'details' } };
export const Timeline: S = { name: 'A record’s timeline (drawer)', args: { open: 'timeline' } };
export const Checking: S = { name: 'Check now · checking', args: { onVerify: never }, play: play(press('Check now')) };
export const CheckRefused: S = { name: 'Check now · refused', args: { onVerify: fails('A check is already running; try again in a minute.') }, play: play(press('Check now')) };
export const NothingFound: S = { name: 'Empty · nothing matches the filters', args: { filters: { action: 'payroll.bonus' }, data: { entries: [], next: null } } };
export const Empty: S = { name: 'Empty · no events yet', args: { data: { entries: [], next: null } } };
export const Loading: S = { name: 'Loading', args: { state: 'loading', data: null, chain: null } };
export const LoadError: S = { name: 'Error', args: { state: 'error', data: null, chain: null } };
export const NoAccess: S = { name: 'No access', args: { state: 'no-access', data: null, chain: null } };
