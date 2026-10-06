import type { Meta, StoryObj } from '@storybook/react-vite';
import { InterviewCalendarScreen } from './hiring-pipeline';
import { PANEL } from './hiring-data';
import { TODAY } from '../_kit/data';
import type { CalendarEvent } from '../../components/calendar';

const meta: Meta = { title: 'Screens/Hiring/HIR-06 · Interview calendar', parameters: { layout: 'fullscreen' } };
export default meta;
type S = StoryObj;

const at = (d: number, h: number, m = 0) => new Date(2026, 8, d, h, m);
const EVENTS: CalendarEvent[] = [
  { id: 'e1', title: 'Ananya Iyer · Panel 1', start: at(29, 11), end: at(29, 12), type: 'interview' },
  { id: 'e2', title: 'Vikram Reddy · Panel 1', start: at(29, 14, 30), end: at(29, 15, 30), type: 'interview' },
  { id: 'e3', title: 'Gurpreet Kaur · Recruiter screen', start: at(30, 10), end: at(30, 10, 30), type: 'interview' },
  { id: 'e4', title: 'Joseph George · HR round', start: at(30, 16), end: at(30, 16, 45), type: 'interview' },
  { id: 'e5', title: 'Hiring sync · QA', start: at(28, 17), end: at(28, 17, 30), type: 'meeting' },
  { id: 'e6', title: 'Gandhi Jayanti', start: new Date(2026, 9, 2), end: new Date(2026, 9, 2), allDay: true, type: 'holiday' },
];
const MINE = [
  { id: 'm1', candidate: 'Ananya Iyer', round: 'Panel 1', when: 'Today, 11:00 am', scorecard: 'due' as const },
  { id: 'm2', candidate: 'Vikram Reddy', round: 'Panel 1', when: '21 Sep 2026', scorecard: 'overdue' as const },
  { id: 'm3', candidate: 'Joseph George', round: 'Panel 2', when: '22 Sep 2026', scorecard: 'submitted' as const },
];
const NO_CAL = PANEL.map((p) => (p.id === 'p2' ? { ...p, busy: null } : p));

export const RecruiterWeek: S = { name: 'Recruiter · week', render: () => <InterviewCalendarScreen events={EVENTS} persona="recruiter" today={TODAY} panel={PANEL} /> };
export const SlotFinder: S = { name: 'Slot finder · proposed slots ranked', render: () => <InterviewCalendarScreen events={EVENTS} persona="recruiter" today={TODAY} panel={PANEL} slotFinderOpen /> };
export const UnknownAvailability: S = { name: 'Slot finder · required panelist has no calendar', render: () => <InterviewCalendarScreen events={EVENTS} persona="recruiter" today={TODAY} panel={NO_CAL} slotFinderOpen /> };
export const Interviewer: S = { name: 'Interviewer · my interviews and scorecards', render: () => <InterviewCalendarScreen events={EVENTS.slice(0, 2)} persona="interviewer" today={TODAY} myInterviews={MINE} /> };
export const Empty: S = { name: 'Empty · interviewer with nothing assigned', render: () => <InterviewCalendarScreen events={[]} persona="interviewer" today={TODAY} myInterviews={[]} /> };
