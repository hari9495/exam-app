import type { Meta, StoryObj } from '@storybook/react-vite';
import { fails, never, ok, play, press, pressFirst, type } from '../../_kit/story-play';
import { MyOvertimeScreen, OvertimeReviewScreen, type MyOvertimeScreenProps, type OvertimeReviewScreenProps } from './overtime';
import { MY_OVERTIME, OT_REVIEW } from './fixtures';

// Me › Overtime (claims) and Time › Overtime (manager and HR review) on the live app: the same components the pages render.
const meta: Meta = { title: 'Screens/Time/Live · Overtime', parameters: { layout: 'padded' } };
export default meta;
type S = StoryObj;

// ------------------------------------------------------------------ My overtime
const mine = (over: Partial<MyOvertimeScreenProps> = {}) => <MyOvertimeScreen state="ready" data={MY_OVERTIME} onClaim={ok} onWithdraw={ok} {...over} />;
const why = type(/^What was it for/, 'Line 2 changeover for the Deepavali sweets order');
export const Mine: S = { name: 'My overtime · days to claim and my claims', render: () => mine() };
export const MineEmpty: S = { name: 'My overtime · nothing to claim, no claims yet', render: () => mine({ data: { ...MY_OVERTIME, open: [], claims: [] } }) };
export const MineWithdrawFailed: S = { name: 'My overtime · withdraw refused', render: () => mine({ onWithdraw: fails('Your manager approved this a moment ago.') }), play: play(pressFirst('Withdraw')) };
export const MineLoading: S = { name: 'My overtime · loading', render: () => mine({ state: 'loading', data: null }) };
export const MineError: S = { name: 'My overtime · could not load', render: () => mine({ state: 'error', data: null, onRetry: () => undefined }) };
export const Claim: S = { name: 'Claim overtime · open (Factories Act rate)', render: () => mine(), play: play(pressFirst('Claim overtime')) };
export const ClaimFilled: S = { name: 'Claim overtime · filled', render: () => mine(), play: play(pressFirst('Claim overtime'), why) };
export const ClaimMissing: S = { name: 'Claim overtime · Send pressed with no reason', render: () => mine(), play: play(pressFirst('Claim overtime'), press('Send for approval')) };
export const ClaimNoApproval: S = { name: 'Claim overtime · no approval needed', render: () => mine({ data: { ...MY_OVERTIME, open: MY_OVERTIME.open.map((x) => ({ ...x, needsApproval: false, settle: 'comp_off' as const })) } }), play: play(pressFirst('Claim overtime')) };
export const ClaimSending: S = { name: 'Claim overtime · sending', render: () => mine({ onClaim: never }), play: play(pressFirst('Claim overtime'), why, press('Send for approval')) };
export const ClaimFailed: S = { name: 'Claim overtime · the server refuses', render: () => mine({ onClaim: fails('October is locked for Kaveri Foods Pvt Ltd (Tamil Nadu).') }), play: play(pressFirst('Claim overtime'), why, press('Send for approval')) };

// ------------------------------------------------------------------ Review (manager, HR)
const review = (over: Partial<OvertimeReviewScreenProps> = {}) => <OvertimeReviewScreen state="ready" data={OT_REVIEW} month="2026-10" onMonth={() => undefined} onOverride={ok} {...over} />;
const overWhy = type(/^Why/, 'Boiler breakdown; plant head approved the extra hours');
export const Review: S = { name: 'Overtime review · HR (pay over the limit where allowed)', render: () => review() };
export const ReviewManager: S = { name: 'Overtime review · manager, read only', render: () => review({ data: { ...OT_REVIEW, claims: OT_REVIEW.claims.map((c) => ({ ...c, canOverride: false })) } }) };
export const ReviewEmpty: S = { name: 'Overtime review · no claims this month', render: () => review({ data: { ...OT_REVIEW, claims: [] } }) };
export const ReviewLoading: S = { name: 'Overtime review · loading', render: () => review({ state: 'loading', data: null }) };
export const ReviewError: S = { name: 'Overtime review · could not load', render: () => review({ state: 'error', data: null, onRetry: () => undefined }) };
export const ReviewNoAccess: S = { name: 'Overtime review · no access', render: () => review({ state: 'no-access', data: null }) };
export const Override: S = { name: 'Pay over the limit · open', render: () => review(), play: play(pressFirst('Pay over the limit')) };
export const OverrideFilled: S = { name: 'Pay over the limit · reason given', render: () => review(), play: play(pressFirst('Pay over the limit'), overWhy) };
export const OverrideMissing: S = { name: 'Pay over the limit · pressed with no reason', render: () => review(), play: play(pressFirst('Pay over the limit'), press('Pay over the limit')) };
export const OverrideFailed: S = { name: 'Pay over the limit · the server refuses', render: () => review({ onOverride: fails('The quarterly limit of 125 hours is reached; the law does not allow more.') }), play: play(pressFirst('Pay over the limit'), overWhy, press('Pay over the limit')) };
