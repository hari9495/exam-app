import type { Meta, StoryObj } from '@storybook/react-vite';
import { MobileHomeScreen, type HomeTodo, type TeamToday } from './mobile-shell';
import { TODAY } from './t9-data';

const meta: Meta = { title: 'Screens/Mobile shell/MOB-02 · Tab bar and Home', parameters: { layout: 'fullscreen' }, globals: { viewport: { value: 'mobile2', isRotated: false } } };
export default meta;
type S = StoryObj;

const TODOS: HomeTodo[] = [
  { id: '1', kind: 'approval', text: 'Faisal Khan · casual leave, 5–6 Oct', due: 'Waiting 2 days' },
  { id: '2', kind: 'task', text: 'Upload rent receipts for HRA', due: 'Due 15 Oct 2026' },
  { id: '3', kind: 'ack', text: 'Read the updated travel policy', due: 'Due 30 Sep 2026' },
];
const TEAM: TeamToday = { in: 7, late: 2, leave: 1, wfh: 2, notIn: [{ name: 'Harpreet Kaur', shift: 'General · 9:30 am' }, { name: 'Tenzing Dorje', shift: 'General · 9:30 am' }] };
const base = { todos: TODOS, team: TEAM, today: TODAY };

export const Employee: S = { name: 'Employee · not checked in', render: () => <MobileHomeScreen {...base} checkedIn={null} /> };
export const CheckedIn: S = { name: 'Employee · checked in, tracking on', render: () => <MobileHomeScreen {...base} checkedIn="9:18 am" tracking /> };
export const Manager: S = { name: 'Manager · Me segment', render: () => <MobileHomeScreen {...base} manager checkedIn="9:18 am" /> };
export const Team: S = { name: 'Manager · Team segment', render: () => <MobileHomeScreen {...base} manager segment="team" checkedIn="9:18 am" /> };
export const Offline: S = { name: 'Offline · check-in pending sync', render: () => <MobileHomeScreen {...base} checkedIn={null} offline /> };
export const Empty: S = { name: 'Nothing to do', render: () => <MobileHomeScreen {...base} todos={[]} checkedIn="9:18 am" /> };
export const Loading: S = { render: () => <MobileHomeScreen {...base} checkedIn={null} loading /> };
