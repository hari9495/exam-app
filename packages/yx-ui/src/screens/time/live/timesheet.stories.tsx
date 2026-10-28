import type { Meta, StoryObj } from '@storybook/react-vite';
import { fails, never, ok, play, press } from '../../_kit/story-play';
import { MyTimesheetScreen, type MyTimesheetScreenProps } from './timesheet';
import { MY_TIMESHEET, TODAY } from './fixtures';

// Me › Timesheet on the live app: the same component the page renders, with Kaveri Foods projects.
const meta: Meta = { title: 'Screens/Time/Live · My timesheet', parameters: { layout: 'padded' } };
export default meta;
type S = StoryObj;

const sheet = (over: Partial<MyTimesheetScreenProps> = {}) => <MyTimesheetScreen state="ready" data={MY_TIMESHEET} week={MY_TIMESHEET.week} today={TODAY} onWeek={() => undefined} onSave={ok} onSubmit={ok} onWithdraw={ok} {...over} />;
const days = MY_TIMESHEET.days;

export const Draft: S = { name: 'My timesheet · this week, a draft', render: () => sheet() };
export const Empty: S = { name: 'My timesheet · a new week, nothing logged', render: () => sheet({ data: { ...MY_TIMESHEET, sheet: null, lines: [], recent: [] } }) };
export const Waiting: S = { name: 'My timesheet · sent, waiting for the project manager', render: () => sheet({ data: { ...MY_TIMESHEET, sheet: { ...MY_TIMESHEET.sheet!, status: 'pending' } } }) };
export const Approved: S = { name: 'My timesheet · approved', render: () => sheet({ data: { ...MY_TIMESHEET, sheet: { ...MY_TIMESHEET.sheet!, status: 'approved' } } }) };
export const SentBack: S = { name: 'My timesheet · sent back', render: () => sheet({ data: { ...MY_TIMESHEET, sheet: { ...MY_TIMESHEET.sheet!, status: 'rejected' } } }) };
export const Locked: S = { name: 'My timesheet · part of the week locked, a holiday and leave', render: () => sheet({ data: { ...MY_TIMESHEET, days: days.map((x, i) => (i < 2 ? { ...x, locked: true } : i === 3 ? { ...x, holiday: 'Kannada Rajyotsava' } : i === 4 ? { ...x, leave: 'full' } : x)) } }) };
export const CheckIns: S = { name: 'My timesheet · someone who checks in (hours do not change attendance)', render: () => sheet({ data: { ...MY_TIMESHEET, mode: 'punch' } }) };
export const Submitting: S = { name: 'My timesheet · submitting', render: () => sheet({ onSubmit: never }), play: play(press('Submit week')) };
export const SubmitFailed: S = { name: 'My timesheet · submit refused', render: () => sheet({ onSubmit: fails('Hosur line 4 commissioning is closed for hours.') }), play: play(press('Submit week')) };
export const SaveFailed: S = { name: 'My timesheet · save refused', render: () => sheet({ onSave: fails('The week has more than 24 hours on Mon 26 Oct.') }), play: play(press('Save draft')) };
export const WithdrawFailed: S = { name: 'My timesheet · withdraw refused', render: () => sheet({ data: { ...MY_TIMESHEET, sheet: { ...MY_TIMESHEET.sheet!, status: 'pending' } }, onWithdraw: fails('Divya Raghunathan approved it a moment ago.') }), play: play(press('Withdraw to change it')) };
export const Loading: S = { name: 'My timesheet · loading', render: () => sheet({ state: 'loading', data: null }) };
export const CouldNotLoad: S = { name: 'My timesheet · could not load', render: () => sheet({ state: 'error', data: null, onRetry: () => undefined }) };
