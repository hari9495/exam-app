import type { Meta, StoryObj } from '@storybook/react-vite';
import { SessionsScreen } from './learn-admin';
import { SESSION_PAGE, SESSIONS, TRAINERS, VIRTUAL_PAGE } from './learn-data';

const meta: Meta = { title: 'Screens/Learning/LRN-04 · Sessions and trainers', parameters: { layout: 'fullscreen' } };
export default meta;
type S = StoryObj;

export const List: S = { name: 'L&D · sessions list', render: () => <SessionsScreen persona="ld" view="list" sessions={SESSIONS} trainers={TRAINERS} /> };
export const Attendees: S = { name: 'L&D · session attendees and waitlist', render: () => <SessionsScreen persona="ld" view="page" sessions={SESSIONS} page={SESSION_PAGE} /> };
export const Attendance: S = { name: 'L&D · attendance by slot', render: () => <SessionsScreen persona="ld" view="page" sessions={SESSIONS} page={SESSION_PAGE} tab="attendance" /> };
export const Results: S = { name: 'L&D · results (no-show stays no-show)', render: () => <SessionsScreen persona="ld" view="page" sessions={SESSIONS} page={SESSION_PAGE} tab="results" /> };
export const Feedback: S = { name: 'L&D · feedback', render: () => <SessionsScreen persona="ld" view="page" sessions={SESSIONS} page={SESSION_PAGE} tab="feedback" /> };
export const Cost: S = { name: 'L&D · cost', render: () => <SessionsScreen persona="ld" view="page" sessions={SESSIONS} page={SESSION_PAGE} tab="cost" /> };
export const VirtualMeeting: S = { name: 'L&D · virtual session with meeting created', render: () => <SessionsScreen persona="ld" view="page" sessions={SESSIONS} page={VIRTUAL_PAGE} tab="attendance" /> };
export const Trainers: S = { name: 'L&D · trainer master', render: () => <SessionsScreen persona="ld" view="trainers" sessions={SESSIONS} trainers={TRAINERS} /> };
export const TrainerPortal: S = { name: 'External trainer · portal session', render: () => <SessionsScreen persona="trn" view="page" sessions={SESSIONS.filter((s) => s.trainer === 'Ramesh Kamath')} page={SESSION_PAGE} tab="attendance" /> };
export const TrainerPortalList: S = { name: 'External trainer · my sessions', render: () => <SessionsScreen persona="trn" view="list" sessions={SESSIONS.filter((s) => s.trainer === 'Ramesh Kamath')} /> };
export const Empty: S = { render: () => <SessionsScreen persona="ld" view="list" sessions={[]} trainers={TRAINERS} /> };
export const Loading: S = { render: () => <SessionsScreen persona="ld" view="list" sessions={[]} state="loading" /> };
