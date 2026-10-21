import type { Meta, StoryObj } from '@storybook/react-vite';
import { MyAttendanceScreen, type MyAttendanceScreenProps } from './my-attendance';
import type { MyAttendance } from './types';

// Me › Attendance on the live app, with "Request work from home" (TIM-07's work-from-home request made live).
const meta: Meta = { title: 'Screens/Time/Live · My attendance', parameters: { layout: 'padded' } };
export default meta;
type S = StoryObj;

const wait = (ms = 600) => new Promise<void>((r) => setTimeout(r, ms));
const DATA: MyAttendance = {
  employee: { id: 'e1', name: 'Arjun Kulkarni' },
  today: '2026-10-19',
  zone: 'Asia/Kolkata',
  mode: 'punch',
  shift: { name: 'General', start: 570, end: 1110, grace: 10, checkIn: 'restricted' },
  fences: [{ name: 'Bengaluru head office', lat: 12.97, lng: 77.59, radiusM: 150 }],
  punches: [],
  next: 'in',
  days: [
    { on: '2026-10-16', status: 'present', leavePart: null, firstIn: '2026-10-16T04:00:00Z', lastOut: '2026-10-16T13:00:00Z', workedMinutes: 495, lateMinutes: 0, regularised: false },
    { on: '2026-10-15', status: 'present', leavePart: null, firstIn: '2026-10-15T03:58:00Z', lastOut: '2026-10-15T12:40:00Z', workedMinutes: 492, lateMinutes: 0, regularised: false },
  ],
  requests: [
    { id: 'r2', on: '2026-10-22', kind: 'wfh', inMinute: null, outMinute: null, reason: 'Internet engineer visit', status: 'pending' },
    { id: 'r1', on: '2026-10-15', kind: 'wfh', inMinute: null, outMinute: null, reason: 'Plumber visit at home in the morning', status: 'approved' },
  ],
  regularise: { limit: 4, used: 0 },
  wfh: { limit: 4, used: 2 },
};
const props: MyAttendanceScreenProps = {
  state: 'ready',
  data: DATA,
  month: '2026-10',
  onMonth: () => {},
  getLocation: async () => ({ pin: null, problem: 'Location is turned off.' }),
  onPunch: async (kind) => ({ accepted: true, duplicate: false, kind, message: 'Recorded', verdict: 'network', distanceM: null }),
  onFix: () => wait(),
  onWithdrawFix: () => wait(),
  onWfh: () => wait(),
};

export const Page: S = { name: 'My attendance · work from home asked and approved', render: () => <MyAttendanceScreen {...props} /> };
export const RequestWfh: S = { name: 'Request work from home', render: () => <MyAttendanceScreen {...props} defaultWfhOpen /> };
export const RequestWfhHr: S = { name: 'Request work from home · over the monthly limit, HR approves too', render: () => <MyAttendanceScreen {...props} data={{ ...DATA, wfh: { limit: 4, used: 4 } }} defaultWfhOpen /> };
