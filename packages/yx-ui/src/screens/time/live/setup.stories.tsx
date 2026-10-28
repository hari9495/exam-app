import type { Meta, StoryObj } from '@storybook/react-vite';
import { clear, fails, fill, ok, play, press, pressFirst, see, tab, type } from '../../_kit/story-play';
import { TimeSetupScreen, type TimeSetupScreenProps } from './setup';
import { TIME_SETUP, YEAR_END } from './fixtures';

// HR › Leave and attendance set-up on the live app: the same component the page renders, with Kaveri Foods data.
const meta: Meta = { title: 'Screens/Time/Live · Leave and attendance set-up', parameters: { layout: 'padded' } };
export default meta;
type S = StoryObj;

const props: TimeSetupScreenProps = {
  state: 'ready',
  data: TIME_SETUP,
  onSaveType: ok,
  onCreatePolicy: ok,
  onAddVersion: ok,
  onAssign: ok,
  onRemoveAssignment: ok,
  onCreateCalendar: ok,
  onAddHoliday: ok,
  onRemoveHoliday: ok,
  onSetRule: ok,
  onYearEndPreview: async () => YEAR_END,
  onYearEndRun: ok,
};
const screen = (over: Partial<TimeSetupScreenProps> = {}) => <TimeSetupScreen {...props} {...over} />;
const refused = fails('Someone changed this a moment ago. Reload to see their change.');

export const Types: S = { name: 'Leave types', render: () => screen() };
export const Loading: S = { name: 'Set-up · loading', render: () => screen({ state: 'loading', data: null }) };
export const CouldNotLoad: S = { name: 'Set-up · could not load', render: () => screen({ state: 'error', data: null, onRetry: () => undefined }) };
export const NoAccess: S = { name: 'Set-up · no access (needs the set-up key)', render: () => screen({ state: 'no-access', data: null }) };
export const Empty: S = { name: 'Set-up · a new company, nothing yet', render: () => screen({ data: { ...TIME_SETUP, types: [], policies: [], calendars: [] } }) };

export const TypeAdd: S = { name: 'Add a leave type · open', render: () => screen(), play: play(press('Add a leave type')) };
export const TypeAddFilled: S = { name: 'Add a leave type · filled', render: () => screen(), play: play(press('Add a leave type'), type(/^Code/, 'BL'), type(/^Name/, 'Bereavement leave')) };
export const TypeAddMissing: S = { name: 'Add a leave type · Save pressed with nothing filled', render: () => screen(), play: play(press('Add a leave type'), press('Save')) };
export const TypeChange: S = { name: 'Change a leave type · code and kind fixed', render: () => screen(), play: play(pressFirst('Change')) };
export const TypeChangeFailed: S = { name: 'Change a leave type · the server refuses', render: () => screen({ onSaveType: refused }), play: play(pressFirst('Change'), press('Save')) };

export const Policies: S = { name: 'Policies', render: () => screen(), play: play(tab('Policies')) };
export const PolicyAddMissing: S = { name: 'Add a policy · pressed with no name', render: () => screen(), play: play(tab('Policies'), press('Add policy')) };
export const PolicyVersion: S = { name: 'Change a policy from a date · open', render: () => screen(), play: play(tab('Policies'), pressFirst('Change from a date')) };
export const PolicyVersionFailed: S = { name: 'Change a policy from a date · the server refuses', render: () => screen({ onAddVersion: fails('A version already starts on 1 Jan 2026.') }), play: play(tab('Policies'), pressFirst('Change from a date'), press('Save')) };
export const PolicyAssign: S = { name: 'Apply a policy · open', render: () => screen(), play: play(tab('Policies'), pressFirst('Apply to')) };
export const PolicyAssignFailed: S = { name: 'Apply a policy · the server refuses', render: () => screen({ onAssign: refused }), play: play(tab('Policies'), pressFirst('Apply to'), press('Apply')) };

export const Holidays: S = { name: 'Holidays', render: () => screen(), play: play(tab('Holidays')) };
export const HolidayMissing: S = { name: 'Holidays · Add pressed with nothing filled', render: () => screen(), play: play(tab('Holidays'), press(/^Add holiday/)) };
export const HolidayFilled: S = { name: 'Holidays · a holiday filled', render: () => screen(), play: play(tab('Holidays'), fill(/^Date/, '2026-12-31'), type(/^Name/, 'New Year’s Eve (half day)')) };
export const HolidayFailed: S = { name: 'Holidays · the server refuses', render: () => screen({ onAddHoliday: fails('A holiday is already on 31 Dec 2026.') }), play: play(tab('Holidays'), fill(/^Date/, '2026-12-31'), type(/^Name/, 'New Year’s Eve'), press(/^Add holiday/)) };
export const CalendarMissing: S = { name: 'Holidays · Add calendar pressed with no location', render: () => screen(), play: play(tab('Holidays'), press('Add calendar')) };

export const Attendance: S = { name: 'Shifts and weekly offs', render: () => screen(), play: play(tab('Shifts and weekly offs')) };
export const RuleChange: S = { name: 'Change a location’s shift from a date · open', render: () => screen(), play: play(tab('Shifts and weekly offs'), pressFirst('Change from a date')) };
export const RuleMissing: S = { name: 'Change a location’s shift · Save pressed with no name', render: () => screen(), play: play(tab('Shifts and weekly offs'), pressFirst('Change from a date'), clear(/^Shift name/), press('Save')) };
export const RuleFailed: S = { name: 'Change a location’s shift · the server refuses', render: () => screen({ onSetRule: refused }), play: play(tab('Shifts and weekly offs'), pressFirst('Change from a date'), press('Save')) };

export const YearEnd: S = { name: 'Year end · preview', render: () => screen(), play: play(tab('Year end'), fill(/^Last day of the leave year/, '2026-12-31'), press('Preview'), see('Divya Raghunathan')) };
export const YearEndConfirm: S = { name: 'Year end · confirm posting', render: () => screen(), play: play(tab('Year end'), fill(/^Last day of the leave year/, '2026-12-31'), press('Preview'), press('Post year end')) };
export const YearEndNothing: S = { name: 'Year end · nothing to process', render: () => screen({ onYearEndPreview: async () => ({ yearEnd: '2026-12-31', lapses: 0, rows: [] }) }), play: play(tab('Year end'), press('Preview')) };
export const YearEndFailed: S = { name: 'Year end · preview refused', render: () => screen({ onYearEndPreview: fails('Year end for 31 Dec 2025 is already posted.') }), play: play(tab('Year end'), press('Preview')) };
