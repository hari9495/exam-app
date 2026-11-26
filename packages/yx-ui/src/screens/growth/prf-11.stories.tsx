import type { Meta, StoryObj } from '@storybook/react-vite';
import { OneOnOneScreen, type LiveOneOnOnes } from './perf-people';
import { ONE_ON_ONES } from './perf-data-2';

const meta: Meta = { title: 'Screens/Performance/PRF-11 · 1:1s', parameters: { layout: 'fullscreen' } };
export default meta;
type S = StoryObj;
const PHONE = { viewport: { value: 'mobile2', isRotated: false } };

export const ManagerList: S = { name: 'Manager · list', render: () => <OneOnOneScreen persona="mgr" items={ONE_ON_ONES} /> };
export const ManagerRecord: S = { name: 'Manager · 1:1 record', render: () => <OneOnOneScreen persona="mgr" items={ONE_ON_ONES} openId="o1" /> };
export const EmployeeRecord: S = { name: 'Employee · 1:1 record', render: () => <OneOnOneScreen persona="emp" items={ONE_ON_ONES.filter((o) => o.employee === 'Divya Raghunathan')} openId="o2" /> };
export const Phone: S = { name: 'Employee · phone', globals: PHONE, render: () => <OneOnOneScreen persona="emp" device="phone" items={ONE_ON_ONES.filter((o) => o.employee === 'Divya Raghunathan')} openId="o2" /> };
export const Empty: S = { render: () => <OneOnOneScreen persona="mgr" items={[]} /> };
export const Loading: S = { render: () => <OneOnOneScreen persona="mgr" items={[]} state="loading" /> };
export const Schedule: S = { name: 'Manager · schedule 1:1', render: () => <OneOnOneScreen persona="mgr" items={ONE_ON_ONES} scheduleOpen /> };
export const AddAction: S = { name: 'Manager · add action item', render: () => <OneOnOneScreen persona="mgr" items={ONE_ON_ONES} openId="o1" actionOpen /> };
export const Reschedule: S = { name: 'Manager · reschedule', render: () => <OneOnOneScreen persona="mgr" items={ONE_ON_ONES} openId="o1" rescheduleOpen /> };
// T2-C item 70 (answer 2843): pick an agenda template (the company's and my own) to fill the agenda; a manager saves the
// agenda as their own template.
const ok = async () => ({});
const LIVE: LiveOneOnOnes = { today: new Date(2026, 8, 29), onRetry: () => {}, record: ONE_ON_ONES[0]!, recordState: 'ready', onOpen: () => {}, partners: [], defaultCadence: 14, owners: [], goals: [], onSchedule: ok, onAgenda: ok, onSharedNotes: ok, onPrivateNote: ok, onAction: ok, onActionDone: ok, onHeld: ok, onReschedule: ok, templates: [{ value: 't1', label: 'Weekly check-in (company)' }, { value: 't2', label: 'Career talk (mine)' }], onUseTemplate: ok, onSaveTemplate: ok };
export const AgendaTemplates: S = { name: 'Manager · start the agenda from a template', render: () => <OneOnOneScreen persona="mgr" items={ONE_ON_ONES} openId="o1" live={LIVE} /> };

