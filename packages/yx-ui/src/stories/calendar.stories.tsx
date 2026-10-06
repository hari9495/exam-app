import '../components/calendar.css';
import type { Meta, StoryObj } from '@storybook/react-vite';
import { useState } from 'react';
import { Calendar, TeamCalendar, type CalendarEvent, type CalendarEventType, type TeamAbsence, type TeamMember } from '../components/calendar';
import type { Holiday } from '../lib/dates';

const meta: Meta = { title: 'Time and activity/Calendar', parameters: { layout: 'padded' } };
export default meta;
type S = StoryObj;

// Fixed "now" so stories are identical on every load: Tue 06 Oct 2026, 11:20 am.
const NOW = new Date(2026, 9, 6, 11, 20);
const HOLIDAYS: Holiday[] = [
  { date: new Date(2026, 9, 2), name: 'Gandhi Jayanti' },
  { date: new Date(2026, 9, 20), name: 'Dussehra' },
];

let n = 0;
const at = (day: number, h: number, m: number, h2: number, m2: number, type: CalendarEventType, title: string): CalendarEvent => ({
  id: `ev${++n}`,
  type,
  title,
  start: new Date(2026, 9, day, h, m),
  end: new Date(2026, 9, day, h2, m2),
});
const allDay = (from: number, to: number, type: CalendarEventType, title: string): CalendarEvent => ({
  id: `ev${++n}`,
  type,
  title,
  allDay: true,
  start: new Date(2026, 9, from),
  end: new Date(2026, 9, to),
});

const EVENTS: CalendarEvent[] = [
  allDay(1, 1, 'leave', 'Meera Iyer, casual leave'),
  at(1, 15, 0, 16, 0, 'meeting', 'Monthly attendance review'),
  // Tue 6 Oct: busy day with overlaps and overflow
  allDay(5, 9, 'leave', 'Karthik Subramanian, earned leave'),
  at(6, 9, 30, 10, 30, 'interview', 'Rahul Sharma, Senior QA Engineer'),
  at(6, 10, 0, 11, 0, 'interview', 'Fatima Shaikh, Payroll Executive'),
  at(6, 10, 30, 12, 0, 'meeting', 'Payroll cut-off review'),
  at(6, 14, 0, 15, 30, 'exam', 'Aptitude test, campus batch 2'),
  at(6, 16, 0, 16, 30, 'meeting', 'Shift roster sign-off, Hosur plant'),
  at(7, 11, 0, 12, 0, 'interview', 'Deepa Rao, HR Business Partner'),
  at(8, 9, 0, 13, 0, 'exam', 'Forklift safety certification'),
  at(8, 12, 30, 13, 30, 'meeting', 'Quarterly townhall prep'),
  allDay(12, 13, 'leave', 'Imran Qureshi, sick leave'),
  at(14, 15, 0, 16, 0, 'interview', 'Neha Joshi, Account Executive'),
  at(15, 10, 0, 11, 0, 'meeting', 'POSH committee meeting'),
  at(21, 10, 0, 12, 0, 'exam', 'Excel skills assessment'),
  allDay(22, 23, 'leave', 'Priya Nair, earned leave'),
  at(27, 14, 0, 15, 0, 'interview', 'Vikram Singh, Plant Supervisor'),
  at(29, 17, 0, 18, 0, 'meeting', 'Diwali bonus approval'),
];

function Controlled(props: Partial<Parameters<typeof Calendar>[0]>) {
  const [last, setLast] = useState('');
  return (
    <div style={{ maxWidth: 1200 }}>
      <Calendar events={EVENTS} holidays={HOLIDAYS} today={NOW} defaultDate={NOW} onEventClick={(e) => setLast(e.title)} aria-label="Leave, interviews and exams" {...props} />
      <p style={{ fontSize: 13, color: 'var(--yx-color-text-muted)' }} aria-live="polite">
        {last ? `Opened: ${last}` : 'Click an event to open it.'}
      </p>
    </div>
  );
}

export const Month: S = { render: () => <Controlled /> };
export const MonthOverflowOpen: S = { name: 'Month, "+N more" open', render: () => <Controlled defaultMoreOpen={new Date(2026, 9, 6)} /> };
export const MonthFocus: S = { name: 'Month, keyboard focus', parameters: { pseudo: { focusVisible: ['.yx-cal__day[tabindex="0"]'] } }, render: () => <Controlled /> };
export const WeekWithOverlaps: S = { name: 'Week, overlaps and current time', render: () => <Controlled defaultView="week" /> };
export const Day: S = { render: () => <Controlled defaultView="day" /> };
export const DayHoliday: S = { name: 'Day, holiday', render: () => <Controlled defaultView="day" defaultDate={new Date(2026, 9, 2)} /> };
export const Agenda: S = { render: () => <Controlled defaultView="agenda" /> };
export const AgendaEmpty: S = { name: 'Agenda, empty month', render: () => <Controlled defaultView="agenda" events={[]} holidays={[]} /> };
export const MonthEmpty: S = { name: 'Month, no events', render: () => <Controlled events={[]} /> };
export const MobileMonth: S = {
  name: 'Mobile month (dots + day list)',
  globals: { viewport: { value: 'mobile2', isRotated: false } },
  render: () => <Controlled />,
};

/* Team calendar */
const TEAM: TeamMember[] = [
  { id: 't1', name: 'Divya Raghunathan', team: 'Operations' },
  { id: 't2', name: 'Arjun Kulkarni', team: 'Operations' },
  { id: 't3', name: 'Sana Nizami', team: 'Finance' },
  { id: 't4', name: 'Prakash Menon', team: 'Operations' },
  { id: 't5', name: 'Lakshmi Venkatesan', team: 'Finance' },
  { id: 't6', name: 'Karthik Subramanian', team: 'Engineering' },
  { id: 't7', name: 'Meera Iyer', team: 'Engineering' },
  { id: 't8', name: 'Imran Qureshi', team: 'People' },
  { id: 't9', name: 'Gurpreet Kaur', team: 'Engineering' },
  { id: 't10', name: 'Venkata Subrahmanya Lakshminarayana Ramachandran', team: 'Operations' },
];
const d = (day: number) => new Date(2026, 9, day);
const ABSENCES: TeamAbsence[] = [
  { memberId: 't6', start: d(5), end: d(9), code: 'EL' },
  { memberId: 't3', start: d(6), end: d(6), code: 'CL' },
  { memberId: 't8', start: d(12), end: d(13), code: 'SL' },
  { memberId: 't2', start: d(6), end: d(7), code: 'OD' },
  { memberId: 't7', start: d(1), end: d(1), code: 'CL' },
  { memberId: 't5', start: d(14), end: d(16), code: 'EL' },
  { memberId: 't9', start: d(21), end: d(21), code: 'CO' },
  { memberId: 't1', start: d(26), end: d(30), code: 'ML', name: 'Maternity leave' },
  { memberId: 't10', start: d(15), end: d(15), code: 'LOP' },
];

export const TeamFortnight: S = {
  name: 'Team calendar, fortnight',
  render: () => <TeamCalendar members={TEAM} absences={ABSENCES} holidays={HOLIDAYS} start={d(5)} days={14} today={NOW} />,
};
export const TeamMonth: S = {
  name: 'Team calendar, month',
  render: () => <TeamCalendar members={TEAM} absences={ABSENCES} holidays={HOLIDAYS} start={d(1)} days={31} today={NOW} />,
};
export const TeamFiltered: S = {
  name: 'Team calendar, filtered to one team',
  render: () => <TeamCalendar members={TEAM} absences={ABSENCES} holidays={HOLIDAYS} start={d(5)} days={14} today={NOW} defaultTeam="Engineering" />,
};
export const TeamNobodyAway: S = {
  name: 'Team calendar, nobody away',
  render: () => <TeamCalendar members={TEAM.slice(0, 4)} absences={[]} holidays={HOLIDAYS} start={d(19)} days={14} today={d(19)} />,
};
export const TeamMobile: S = {
  name: 'Team calendar, mobile',
  globals: { viewport: { value: 'mobile2', isRotated: false } },
  render: () => <TeamCalendar members={TEAM} absences={ABSENCES} holidays={HOLIDAYS} start={d(5)} days={14} today={NOW} />,
};
