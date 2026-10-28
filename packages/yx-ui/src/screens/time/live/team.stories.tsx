import type { Meta, StoryObj } from '@storybook/react-vite';
import { fails, fill, never, ok, play, press, pressFirst, type } from '../../_kit/story-play';
import { LeaveBalancesScreen, MusterScreen, TeamLeaveScreen, type LeaveBalancesScreenProps, type MusterScreenProps, type TeamLeaveScreenProps } from './team';
import { DAY_CARD, HR_BALANCES, LEDGER, MUSTER, TEAM_CALENDAR } from './fixtures';

// Team leave, the muster and HR's leave balances on the live app: the same components the pages render.
const meta: Meta = { title: 'Screens/Time/Live · Team, muster and balances', parameters: { layout: 'padded' } };
export default meta;
type S = StoryObj;

// ------------------------------------------------------------------ Team leave (manager, HR)
const team = (over: Partial<TeamLeaveScreenProps> = {}) => <TeamLeaveScreen state="ready" data={TEAM_CALENDAR} onRange={() => undefined} approvalsHref="/yx/approvals" onNavigate={() => undefined} {...over} />;
export const TeamLeave: S = { name: 'Team leave · manager, 4 weeks', render: () => team() };
export const TeamLeaveHr: S = { name: 'Team leave · HR, the people they look after', render: () => team({ data: { ...TEAM_CALENDAR, scope: 'granted' } }) };
export const TeamLeaveEmpty: S = { name: 'Team leave · no one to show', render: () => team({ data: { ...TEAM_CALENDAR, people: [] } }) };
export const TeamLeaveLoading: S = { name: 'Team leave · loading', render: () => team({ state: 'loading', data: null }) };
export const TeamLeaveError: S = { name: 'Team leave · could not load', render: () => team({ state: 'error', data: null, onRetry: () => undefined }) };
export const TeamLeaveNoAccess: S = { name: 'Team leave · no access', render: () => team({ state: 'no-access', data: null }) };

// ------------------------------------------------------------------ Muster (manager, HR)
const muster = (over: Partial<MusterScreenProps> = {}) => <MusterScreen state="ready" data={MUSTER} month="2026-10" onMonth={() => undefined} onOpenDay={async () => DAY_CARD} {...over} />;
export const Muster: S = { name: 'Muster · October, read only', render: () => muster() };
export const MusterDay: S = { name: 'Muster · a day opened (missing check-out)', render: () => muster(), play: play(press(/Arjun Kulkarni, Mon 12 Oct/)) };
export const MusterDayFailed: S = { name: 'Muster · a day could not be opened', render: () => muster({ onOpenDay: fails('This person moved out of your team on 20 Oct.') }), play: play(press(/Arjun Kulkarni, Mon 12 Oct/)) };
export const MusterHr: S = { name: 'Muster · HR, whole company', render: () => muster({ data: { ...MUSTER, scope: 'company' } }) };
export const MusterEmpty: S = { name: 'Muster · no one to show', render: () => muster({ data: { ...MUSTER, people: [] } }) };
export const MusterLoading: S = { name: 'Muster · loading', render: () => muster({ state: 'loading', data: null }) };
export const MusterError: S = { name: 'Muster · could not load', render: () => muster({ state: 'error', data: null, onRetry: () => undefined }) };

// ------------------------------------------------------------------ Leave balances (HR)
const balances = (over: Partial<LeaveBalancesScreenProps> = {}) => <LeaveBalancesScreen state="ready" data={HR_BALANCES} onLedger={async () => LEDGER} onAdjust={ok} {...over} />;
export const Balances: S = { name: 'Leave balances · HR (Adjust where allowed)', render: () => balances() };
export const BalancesViewOnly: S = { name: 'Leave balances · HR who can only read', render: () => balances({ data: { ...HR_BALANCES, people: HR_BALANCES.people.map((x) => ({ ...x, canAdjust: false })) } }) };
export const BalancesLedger: S = { name: 'Leave balances · a person’s ledger', render: () => balances(), play: play(pressFirst('Ledger')) };
export const BalancesAdjust: S = { name: 'Adjust a balance · open', render: () => balances(), play: play(pressFirst('Adjust')) };
export const BalancesAdjustFilled: S = { name: 'Adjust a balance · filled', render: () => balances(), play: play(pressFirst('Adjust'), fill(/^Days/, '1.5'), type(/^Reason/, 'Worked on Ayudha Puja, comp-off agreed by HR')) };
export const BalancesAdjustMissing: S = { name: 'Adjust a balance · Add pressed with nothing filled', render: () => balances(), play: play(pressFirst('Adjust'), press('Add to the ledger')) };
export const BalancesAdjustSaving: S = { name: 'Adjust a balance · saving', render: () => balances({ onAdjust: never }), play: play(pressFirst('Adjust'), fill(/^Days/, '1.5'), type(/^Reason/, 'Worked on Ayudha Puja'), press('Add to the ledger')) };
export const BalancesAdjustFailed: S = { name: 'Adjust a balance · the server refuses', render: () => balances({ onAdjust: fails('October is locked for Kaveri Foods Pvt Ltd; the change would land in a locked month.') }), play: play(pressFirst('Adjust'), fill(/^Days/, '1.5'), type(/^Reason/, 'Worked on Ayudha Puja'), press('Add to the ledger')) };
export const BalancesEmpty: S = { name: 'Leave balances · no one in scope', render: () => balances({ data: { ...HR_BALANCES, people: [] } }) };
export const BalancesLoading: S = { name: 'Leave balances · loading', render: () => balances({ state: 'loading', data: null }) };
export const BalancesError: S = { name: 'Leave balances · could not load', render: () => balances({ state: 'error', data: null, onRetry: () => undefined }) };
export const BalancesNoAccess: S = { name: 'Leave balances · no access', render: () => balances({ state: 'no-access', data: null }) };
