import type { Meta, StoryObj } from '@storybook/react-vite';
import { HomeClockCard } from './my-attendance';
import type { MyAttendance, PunchKind } from './types';

// "Attendance today" on the live Home (PLT-02): the designed clock card on the person's real day.
const meta: Meta = { title: 'Screens/Time/Live · Attendance today on Home', parameters: { layout: 'padded' } };
export default meta;
type S = StoryObj;

const NOW = new Date('2026-10-19T04:12:15Z'); // 9:42 am in India
const DAY: MyAttendance = {
  employee: { id: 'e1', name: 'Arjun Kulkarni' },
  today: '2026-10-19',
  zone: 'Asia/Kolkata',
  mode: 'punch',
  shift: { name: 'General', start: 570, end: 1110, grace: 10, checkIn: 'restricted' },
  fences: [{ name: 'Bengaluru head office', lat: 12.97, lng: 77.59, radiusM: 150 }],
  punches: [],
  next: 'in',
  days: [],
  requests: [],
  regularise: { limit: 4, used: 0 },
  wfh: { limit: 4, used: 0 },
};
const punch = (id: string, kind: PunchKind, at: string) => ({ id, kind, at, source: 'web', accepted: true, refusal: null, verdict: 'network', distanceM: null, accuracyM: null, where: 'Bengaluru head office' });
const props = { now: NOW, getLocation: async () => ({ pin: null, problem: 'Location is turned off.' }), onPunch: async (kind: PunchKind) => ({ accepted: true, duplicate: false, kind, message: 'Recorded', verdict: 'network', distanceM: null }), attendanceHref: '#attendance', onRegularise: () => {} };
const Frame = ({ data }: { data: MyAttendance }) => <HomeClockCard data={data} {...props} />;

export const NotIn: S = { name: 'Not checked in yet', render: () => <Frame data={DAY} /> };
export const Working: S = { name: 'Working', render: () => <Frame data={{ ...DAY, next: 'out', punches: [punch('p1', 'in', '2026-10-19T04:08:00Z')] }} /> };
export const OnBreak: S = { name: 'On a break', render: () => <Frame data={{ ...DAY, next: 'out', onBreak: true, punches: [punch('p1', 'in', '2026-10-19T03:58:00Z'), punch('p2', 'break_start', '2026-10-19T04:05:00Z')] }} /> };
export const BackFromBreak: S = { name: 'Back from a break', render: () => <Frame data={{ ...DAY, next: 'out', punches: [punch('p1', 'in', '2026-10-19T03:58:00Z'), punch('p2', 'break_start', '2026-10-19T04:00:00Z'), punch('p3', 'break_end', '2026-10-19T04:10:00Z')] }} /> };
export const WorkFromHome: S = { name: 'Working from home today (approved)', render: () => <Frame data={{ ...DAY, wfhToday: true }} /> };
export const Done: S = { name: 'Done for the day', render: () => <Frame data={{ ...DAY, punches: [punch('p1', 'in', '2026-10-19T04:08:00Z'), punch('p2', 'out', '2026-10-19T13:05:00Z')] }} /> };
export const OnLeave: S = { name: 'On leave', render: () => <Frame data={{ ...DAY, days: [{ on: '2026-10-19', status: 'leave', leavePart: 'full', workedMinutes: null, lateMinutes: null, regularised: false }] }} /> };
export const WeeklyOff: S = { name: 'Weekly off', render: () => <Frame data={{ ...DAY, shift: { ...DAY.shift, off: true } }} /> };
