import type { Meta, StoryObj } from '@storybook/react-vite';
import { fails, fill, never, ok, play, press, pressFirst, see, tab, type } from '../../_kit/story-play';
import { MyLeaveScreen, type MyLeaveScreenProps } from './my-leave';
import { LEAVE_PLAN, MY_LEAVE, PEOPLE_OPTIONS } from './fixtures';

// Me › Leave on the live app (TIM-17 / 18 / 19 / 23): the same component the page renders, with Kaveri Foods data.
const meta: Meta = { title: 'Screens/Time/Live · My leave', parameters: { layout: 'padded' } };
export default meta;
type S = StoryObj;

const props: MyLeaveScreenProps = {
  state: 'ready',
  data: MY_LEAVE,
  onPreview: async () => LEAVE_PLAN,
  onApply: ok,
  onWithdraw: ok,
  onCancel: ok,
  onChooseHoliday: ok,
  onFindPeople: async () => PEOPLE_OPTIONS,
};
const screen = (over: Partial<MyLeaveScreenProps> = {}) => <MyLeaveScreen {...props} {...over} />;
const fillDates = [fill(/^First day/, '2026-11-23'), fill(/^Last day/, '2026-11-24'), see('Balance after')];

export const Page: S = { name: 'My leave · balances and requests', render: () => screen() };
export const Holidays: S = { name: 'My leave · holidays, choose an optional day', render: () => screen(), play: play(tab('Holidays')) };
export const Empty: S = { name: 'My leave · new joiner, nothing yet', render: () => screen({ data: { ...MY_LEAVE, balances: [], requests: [], holidays: { calendar: null, list: [] } } }) };
export const Loading: S = { name: 'My leave · loading', render: () => screen({ state: 'loading', data: null }) };
export const CouldNotLoad: S = { name: 'My leave · could not load', render: () => screen({ state: 'error', data: null, onRetry: () => undefined }) };
export const WithdrawFailed: S = { name: 'My leave · withdraw refused by the server', render: () => screen({ onWithdraw: fails('This request was approved a moment ago; cancel it instead.') }), play: play(pressFirst('Withdraw')) };

export const Apply: S = { name: 'Apply for leave · open', render: () => screen({ startApplying: true }) };
export const ApplyFilled: S = { name: 'Apply for leave · filled, live summary from the rules', render: () => screen({ startApplying: true }), play: play(...fillDates, type(/^Reason/, 'Family pooja at home in Tumakuru')) };
export const ApplyMissing: S = { name: 'Apply for leave · Send pressed with nothing filled', render: () => screen({ startApplying: true }), play: play(press('Send for approval')) };
export const ApplyBlocked: S = {
  name: 'Apply for leave · the rules refuse the dates',
  render: () => screen({ startApplying: true, onPreview: async () => ({ ...LEAVE_PLAN, blocks: ['Earned leave needs 3 days’ notice.'], balanceAfter: null }) }),
  play: play(fill(/^First day/, '2026-10-29'), see('Your team'), press('Send for approval')),
};
export const ApplyCertificate: S = {
  name: 'Apply for leave · sick leave over 2 days asks for a certificate',
  render: () => screen({ startApplying: true, onPreview: async () => ({ ...LEAVE_PLAN, type: { ...LEAVE_PLAN.type, name: 'Sick leave', rules: { certificateAfterDays: 2, medical: true, halfDays: true } }, total: 3, certificateNeeded: true }) }),
  play: play(fill(/^First day/, '2026-11-23'), fill(/^Last day/, '2026-11-25'), see('Certificate'), press('Send for approval')),
};
export const ApplySending: S = { name: 'Apply for leave · sending', render: () => screen({ startApplying: true, onApply: never }), play: play(...fillDates, press('Send for approval')) };
export const ApplyFailed: S = { name: 'Apply for leave · the server refuses', render: () => screen({ startApplying: true, onApply: fails('You already have leave on Mon 23 Nov.') }), play: play(...fillDates, press('Send for approval')) };

export const Cancel: S = { name: 'Cancel approved leave · open', render: () => screen(), play: play(pressFirst('Cancel leave')) };
export const CancelFilled: S = { name: 'Cancel approved leave · reason given', render: () => screen(), play: play(pressFirst('Cancel leave'), type(/^Why/, 'The client visit moved to December')) };
export const CancelMissing: S = { name: 'Cancel approved leave · Ask pressed with no reason', render: () => screen(), play: play(pressFirst('Cancel leave'), press('Ask to cancel')) };
export const CancelFailed: S = { name: 'Cancel approved leave · the server refuses', render: () => screen({ onCancel: fails('The month is locked; ask HR to correct it.') }), play: play(pressFirst('Cancel leave'), type(/^Why/, 'The client visit moved to December'), press('Ask to cancel')) };
