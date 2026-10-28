import type { Meta, StoryObj } from '@storybook/react-vite';
import { fails, ok, play, press, pressFirst, tab, type } from '../../_kit/story-play';
import { ShiftsSetupScreen, type ShiftsSetupScreenProps } from './shifts-setup';
import { SHIFT_SETUP } from './fixtures';

// HR › Shifts set-up on the live app (shifts, patterns, overtime, timesheet projects, night work): the same component the page renders.
const meta: Meta = { title: 'Screens/Time/Live · Shifts set-up', parameters: { layout: 'padded' } };
export default meta;
type S = StoryObj;

const props: ShiftsSetupScreenProps = {
  state: 'ready',
  data: SHIFT_SETUP,
  onCreateShift: ok,
  onShiftTimes: ok,
  onShiftDetails: ok,
  onCreatePattern: ok,
  onAssignPattern: ok,
  onRemoveAssignment: ok,
  onCreateOtRule: ok,
  onRemoveOtRule: ok,
  onSaveProject: ok,
  onAddConsent: ok,
  onWithdrawConsent: ok,
  onAttest: ok,
};
const screen = (over: Partial<ShiftsSetupScreenProps> = {}) => <ShiftsSetupScreen {...props} {...over} />;
const refused = fails('Someone changed this a moment ago. Reload to see their change.');

export const Shifts: S = { name: 'Shifts', render: () => screen() };
export const Loading: S = { name: 'Shifts set-up · loading', render: () => screen({ state: 'loading', data: null }) };
export const CouldNotLoad: S = { name: 'Shifts set-up · could not load', render: () => screen({ state: 'error', data: null, onRetry: () => undefined }) };
export const NoAccess: S = { name: 'Shifts set-up · no access', render: () => screen({ state: 'no-access', data: null }) };
export const Empty: S = { name: 'Shifts set-up · nothing yet', render: () => screen({ data: { ...SHIFT_SETUP, shifts: [], patterns: [], otRules: [], projects: [] } }) };

export const ShiftAdd: S = { name: 'Add a shift · open', render: () => screen(), play: play(press('Add a shift')) };
export const ShiftAddFilled: S = { name: 'Add a shift · filled', render: () => screen(), play: play(press('Add a shift'), type(/^Code/, 'G'), type(/^Name/, 'General')) };
export const ShiftAddMissing: S = { name: 'Add a shift · Save pressed with nothing filled', render: () => screen(), play: play(press('Add a shift'), press('Save')) };
export const ShiftTimes: S = { name: 'Change a shift’s times from a date · open', render: () => screen(), play: play(pressFirst('Change times')) };
export const ShiftTimesFailed: S = { name: 'Change a shift’s times · the server refuses', render: () => screen({ onShiftTimes: refused }), play: play(pressFirst('Change times'), press('Save')) };

export const Patterns: S = { name: 'Patterns', render: () => screen(), play: play(tab('Patterns')) };
export const PatternAdd: S = { name: 'Add a pattern · open', render: () => screen(), play: play(tab('Patterns'), press('Add a pattern')) };
export const PatternAddMissing: S = { name: 'Add a pattern · Save pressed with nothing filled', render: () => screen(), play: play(tab('Patterns'), press('Add a pattern'), press('Save')) };
export const PatternAssign: S = { name: 'Apply a pattern · open', render: () => screen(), play: play(tab('Patterns'), pressFirst('Apply to')) };
export const PatternAssignFailed: S = { name: 'Apply a pattern · the server refuses', render: () => screen({ onAssignPattern: refused }), play: play(tab('Patterns'), pressFirst('Apply to'), press('Apply')) };

export const Overtime: S = { name: 'Overtime rules', render: () => screen(), play: play(tab('Overtime')) };
export const OtAdd: S = { name: 'Add an overtime rule · open', render: () => screen(), play: play(tab('Overtime'), press('Add an overtime rule')) };
export const OtAddMissing: S = { name: 'Add an overtime rule · Save pressed with nothing filled', render: () => screen(), play: play(tab('Overtime'), press('Add an overtime rule'), press('Save')) };
export const OtAddFailed: S = { name: 'Add an overtime rule · the server refuses', render: () => screen({ onCreateOtRule: fails('Hosur plant already has a rule from 1 Jan 2026.') }), play: play(tab('Overtime'), press('Add an overtime rule'), type(/^Name/, 'Hosur weekend overtime'), press('Save')) };

export const Projects: S = { name: 'Timesheet projects', render: () => screen(), play: play(tab('Timesheet projects')) };
export const ProjectAdd: S = { name: 'Add a project · open', render: () => screen(), play: play(tab('Timesheet projects'), press('Add a project')) };
export const ProjectAddMissing: S = { name: 'Add a project · Save pressed with nothing filled', render: () => screen(), play: play(tab('Timesheet projects'), press('Add a project'), press('Save')) };
export const ProjectChangeFailed: S = { name: 'Change a project · the server refuses', render: () => screen({ onSaveProject: refused }), play: play(tab('Timesheet projects'), pressFirst('Change'), press('Save')) };

export const Night: S = { name: 'Night work (safeguards, consents, opt-ins)', render: () => screen(), play: play(tab('Night work')) };
export const NightConsent: S = { name: 'Record a night-work consent · open', render: () => screen(), play: play(tab('Night work'), press('Record a consent')) };
export const NightConsentMissing: S = { name: 'Record a night-work consent · Record pressed with nothing filled', render: () => screen(), play: play(tab('Night work'), press('Record a consent'), press('Record')) };
export const NightCheck: S = { name: 'Record a safeguard check · open', render: () => screen(), play: play(tab('Night work'), pressFirst('Record a check')) };
export const NightCheckMissing: S = { name: 'Record a safeguard check · Record pressed with nothing filled', render: () => screen(), play: play(tab('Night work'), pressFirst('Record a check'), press('Record')) };
export const NightWithdraw: S = { name: 'Record a withdrawal of consent · open', render: () => screen(), play: play(tab('Night work'), pressFirst('Record a withdrawal')) };
export const NightWithdrawFailed: S = { name: 'Record a withdrawal of consent · the server refuses', render: () => screen({ onWithdrawConsent: fails('Rekha Balan is on the published roster for nights this week; change the roster first.') }), play: play(tab('Night work'), pressFirst('Record a withdrawal'), press('Record')) };
