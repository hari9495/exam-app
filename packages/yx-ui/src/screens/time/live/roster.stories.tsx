import type { Meta, StoryObj } from '@storybook/react-vite';
import { fails, never, ok, pick, play, press, pressFirst, type } from '../../_kit/story-play';
import { MyShiftsScreen, RosterPlannerScreen, type MyShiftsScreenProps, type RosterPlannerScreenProps } from './roster';
import { MY_SHIFTS, ROSTER, TODAY } from './fixtures';

// The roster planner (manager, HR) and My shifts with swaps (employee) on the live app: the same components the pages render.
const meta: Meta = { title: 'Screens/Time/Live · Roster and my shifts', parameters: { layout: 'padded' } };
export default meta;
type S = StoryObj;

// ------------------------------------------------------------------ Roster planner
const planner = (over: Partial<RosterPlannerScreenProps> = {}) => <RosterPlannerScreen state="ready" data={ROSTER} week={ROSTER.week} onWeek={() => undefined} onCells={ok} onCopy={ok} onPublish={ok} {...over} />;
const published = { ...ROSTER, drafts: 0, people: ROSTER.people.map((x) => ({ ...x, cells: x.cells.map((c) => ({ ...c, draft: undefined, conflicts: [] })) })) };
export const Planner: S = { name: 'Roster · Hosur plant shift supervisor, a draft with a rule check', render: () => planner() };
export const PlannerPublished: S = { name: 'Roster · published week', render: () => planner({ data: published }) };
export const PlannerPublishConfirm: S = { name: 'Roster · Publish pressed, confirm', render: () => planner({ data: { ...published, drafts: 1 } }), play: play(pressFirst('Publish roster')) };
export const PlannerHr: S = { name: 'Roster · HR, the people they look after', render: () => planner({ data: { ...ROSTER, scope: 'granted' } }) };
export const PlannerCopyFailed: S = { name: 'Roster · Copy last week refused', render: () => planner({ onCopy: fails('Last week has no published roster to copy.') }), play: play(press('Copy last week')) };
export const PlannerCopying: S = { name: 'Roster · copying last week', render: () => planner({ onCopy: never }), play: play(press('Copy last week')) };
export const PlannerEmpty: S = { name: 'Roster · no one to plan', render: () => planner({ data: { ...ROSTER, people: [] } }) };
export const PlannerLoading: S = { name: 'Roster · loading', render: () => planner({ state: 'loading', data: null }) };
export const PlannerError: S = { name: 'Roster · could not load', render: () => planner({ state: 'error', data: null, onRetry: () => undefined }) };
export const PlannerNoAccess: S = { name: 'Roster · no access', render: () => planner({ state: 'no-access', data: null }) };

// ------------------------------------------------------------------ My shifts and swaps
const mine = (over: Partial<MyShiftsScreenProps> = {}) => <MyShiftsScreen state="ready" data={MY_SHIFTS} today={TODAY} onSwap={ok} onWithdrawSwap={ok} {...over} />;
const fillSwap = [press('Ask to swap a shift'), pick(/^Colleague/, 'Rekha Balan'), type(/^Why/, 'Daughter’s school annual day in the evening')];
export const MyShifts: S = { name: 'My shifts · this week and my swaps', render: () => mine() };
export const MyShiftsNoSwaps: S = { name: 'My shifts · no swaps yet', render: () => mine({ data: { ...MY_SHIFTS, swaps: [] } }) };
export const MyShiftsWithdrawFailed: S = { name: 'My shifts · withdraw refused', render: () => mine({ onWithdrawSwap: fails('Rekha Balan already agreed; ask your manager to turn it down.') }), play: play(pressFirst('Withdraw')) };
export const MyShiftsLoading: S = { name: 'My shifts · loading', render: () => mine({ state: 'loading', data: null }) };
export const MyShiftsError: S = { name: 'My shifts · could not load', render: () => mine({ state: 'error', data: null, onRetry: () => undefined }) };
export const Swap: S = { name: 'Ask to swap a shift · open', render: () => mine(), play: play(press('Ask to swap a shift')) };
export const SwapFilled: S = { name: 'Ask to swap a shift · filled', render: () => mine(), play: play(...fillSwap) };
export const SwapMissing: S = { name: 'Ask to swap a shift · Send pressed with nothing filled', render: () => mine(), play: play(press('Ask to swap a shift'), press('Send to my colleague')) };
export const SwapFailed: S = { name: 'Ask to swap a shift · the server refuses', render: () => mine({ onSwap: fails('Rekha Balan is on leave that day.') }), play: play(...fillSwap, press('Send to my colleague')) };
