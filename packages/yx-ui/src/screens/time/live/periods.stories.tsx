import type { Meta, StoryObj } from '@storybook/react-vite';
import { fails, never, ok, play, press, pressFirst, see, type } from '../../_kit/story-play';
import { PayrollFeedScreen, PeriodsScreen, type PayrollFeedScreenProps, type PeriodsScreenProps } from './periods';
import { PAYROLL_FEED, PERIODS, PREFLIGHT_BLOCKED, PREFLIGHT_READY } from './fixtures';

// Time › Attendance periods (lock and reopen) and the payroll feed on the live app: the same components the pages render.
const meta: Meta = { title: 'Screens/Time/Live · Periods and payroll feed', parameters: { layout: 'padded' } };
export default meta;
type S = StoryObj;

// ------------------------------------------------------------------ Periods
const periods = (over: Partial<PeriodsScreenProps> = {}) => <PeriodsScreen state="ready" data={PERIODS} year="2026" onYear={() => undefined} onPreflight={async () => PREFLIGHT_READY} onLock={ok} onUnlock={ok} {...over} />;
const reopenWhy = type(/^Why/, 'Two night shifts of Rekha Balan were missed in the roster');
export const Periods: S = { name: 'Periods · two legal entities, 2026', render: () => periods() };
export const PeriodsEmpty: S = { name: 'Periods · no legal entity to lock', render: () => periods({ data: { ...PERIODS, entities: [] } }) };
export const PeriodsLoading: S = { name: 'Periods · loading', render: () => periods({ state: 'loading', data: null }) };
export const PeriodsError: S = { name: 'Periods · could not load', render: () => periods({ state: 'error', data: null, onRetry: () => undefined }) };
export const PeriodsNoAccess: S = { name: 'Periods · no access', render: () => periods({ state: 'no-access', data: null }) };
export const Lock: S = { name: 'Lock a month · ready to lock', render: () => periods(), play: play(pressFirst(/^Lock$/), see('Ready to lock')) };
export const LockChecking: S = { name: 'Lock a month · checks still running, Lock pressed', render: () => periods({ onPreflight: never }), play: play(pressFirst(/^Lock$/), press('Lock the month')) };
export const LockBlocked: S = { name: 'Lock a month · requests still waiting, Lock pressed', render: () => periods({ onPreflight: async () => PREFLIGHT_BLOCKED }), play: play(pressFirst(/^Lock$/), see('Not ready to lock'), press('Lock the month')) };
export const LockFailed: S = { name: 'Lock a month · the server refuses', render: () => periods({ onLock: fails('Confirm it is you first: the second sign-in step timed out.') }), play: play(pressFirst(/^Lock$/), see('Ready to lock'), press('Lock the month')) };
export const Reopen: S = { name: 'Ask to reopen · open', render: () => periods(), play: play(pressFirst('Ask to reopen')) };
export const ReopenFilled: S = { name: 'Ask to reopen · reason given', render: () => periods(), play: play(pressFirst('Ask to reopen'), reopenWhy) };
export const ReopenMissing: S = { name: 'Ask to reopen · Send pressed with no reason', render: () => periods(), play: play(pressFirst('Ask to reopen'), press('Send for approval')) };
export const ReopenFailed: S = { name: 'Ask to reopen · the server refuses', render: () => periods({ onUnlock: fails('August payslips are issued, so the month cannot be reopened.') }), play: play(pressFirst('Ask to reopen'), reopenWhy, press('Send for approval')) };

// ------------------------------------------------------------------ Payroll feed (payroll, HR)
const ENTITIES = [{ id: 'le-kfpl', name: 'Kaveri Foods Pvt Ltd' }, { id: 'le-tn', name: 'Kaveri Foods Pvt Ltd (Tamil Nadu)' }];
const feed = (over: Partial<PayrollFeedScreenProps> = {}) => <PayrollFeedScreen state="ready" data={PAYROLL_FEED} entities={ENTITIES} entityId="le-tn" onEntity={() => undefined} month="2026-09" onMonth={() => undefined} {...over} />;
export const Feed: S = { name: 'Payroll feed · September, frozen at the lock', render: () => feed() };
export const FeedPreview: S = { name: 'Payroll feed · October, a preview while the month is open', render: () => feed({ month: '2026-10', data: { ...PAYROLL_FEED, month: '2026-10', frozen: false, lockedAt: null } }) };
export const FeedNoEntity: S = { name: 'Payroll feed · choose a legal entity', render: () => feed({ entityId: null, data: null }) };
export const FeedEmpty: S = { name: 'Payroll feed · no one in scope', render: () => feed({ data: { ...PAYROLL_FEED, rows: [] } }) };
export const FeedLoading: S = { name: 'Payroll feed · loading', render: () => feed({ state: 'loading', data: null }) };
export const FeedError: S = { name: 'Payroll feed · could not load', render: () => feed({ state: 'error', data: null, onRetry: () => undefined }) };
export const FeedNoAccess: S = { name: 'Payroll feed · no access', render: () => feed({ state: 'no-access', data: null }) };
