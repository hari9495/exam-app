import type { Meta, StoryObj } from '@storybook/react-vite';
import { HomeClockScreen, MyAttendanceTodayScreen } from './attendance';
import type { Punch } from './time-logic';
import { TODAY_PUNCHES } from './time-data';

// Founder extra 1 · Web clock-in / clock-out page ("My attendance today") + Home widget.
const meta: Meta<typeof MyAttendanceTodayScreen> = { title: 'Screens/Time/Extra · My attendance today (web clock-in)', component: MyAttendanceTodayScreen, parameters: { layout: 'fullscreen' } };
export default meta;
type S = StoryObj<typeof MyAttendanceTodayScreen>;

// Same network and browser detail as today's real punch (TODAY_PUNCHES), so every story shows the same web punch line.
const at = (id: string, kind: Punch['kind'], time: string): Punch => ({ ...TODAY_PUNCHES[0], id, kind, time });

export const Working: S = { name: 'Working since 9:38 am' };
export const NotClockedIn: S = { name: 'Not clocked in', args: { clock: { defaultState: 'not_in', defaultPunches: [] } } };
export const LateClockIn: S = { name: 'Late · clocked in 9:52 am', args: { clock: { defaultState: 'working', defaultPunches: [at('l', 'in', '09:52')], now: 600 } } };
export const OnBreak: S = { name: 'On break', args: { clock: { defaultState: 'break', now: 13 * 60 + 25, defaultPunches: [at('a', 'in', '09:38'), at('b', 'break_start', '13:15')] } } };
export const ClockedOut: S = { name: 'Clocked out · already clocked out', args: { clock: { defaultState: 'out', now: 19 * 60, defaultPunches: [at('a', 'in', '09:38'), at('b', 'break_start', '13:15'), at('c', 'break_end', '13:52'), at('d', 'out', '18:41')] } } };
export const LeftEarly: S = { name: 'Clocked out early', args: { clock: { defaultState: 'out', now: 17 * 60 + 20, defaultPunches: [at('a', 'in', '09:38'), at('b', 'out', '17:10')] } } };
export const OutsideNetwork: S = { name: 'Blocked · outside office network', args: { clock: { defaultState: 'not_in', defaultPunches: [], inside: false } } };
export const ChoseWfh: S = { name: 'Outside → clock in as WFH', args: { clock: { defaultState: 'not_in', defaultPunches: [], inside: false, defaultWorkMode: 'wfh' } } };
export const ShiftNotStarted: S = { name: 'Blocked · shift not started yet', args: { clock: { defaultState: 'not_in', defaultPunches: [], now: 7 * 60 + 50 } } };
export const DeviceNotApproved: S = { name: 'Blocked · device not approved', args: { clock: { defaultState: 'not_in', defaultPunches: [], deviceApproved: false } } };
export const WithNote: S = { name: 'Note open', args: { clock: { defaultNoteOpen: true } } };
export const Live: S = { name: 'Live ticking clock', args: { clock: { live: true } } };
export const RegulariseOpen: S = { name: 'Regularise link → sheet', args: { regulariseOpen: true } };

export const HomeWidget: StoryObj<typeof HomeClockScreen> = { name: 'Home · ClockCard not clocked in', render: () => <HomeClockScreen /> };
export const HomeWidgetWorking: StoryObj<typeof HomeClockScreen> = { name: 'Home · ClockCard working', render: () => <HomeClockScreen clock={{ defaultState: 'working', defaultPunches: [at('a', 'in', '09:38')] }} /> };
