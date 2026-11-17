import type { Meta, StoryObj } from '@storybook/react-vite';
import { liveFairness } from '../marking-live-samples';
import { FairnessScreen } from '../integrity';

const meta: Meta<typeof FairnessScreen> = { title: 'Screens/Proctoring/Extra · Fairness analytics', component: FairnessScreen, parameters: { layout: 'fullscreen' } };
export default meta;
type S = StoryObj<typeof FairnessScreen>;

export const Finding: S = { name: 'Adverse-impact finding' };
export const NoFinding: S = { name: 'No finding', args: { finding: false } };
export const ValiditySuppressed: S = { name: 'Predictive validity suppressed (small sample)', args: { validitySuppressed: true } };

// AS-6 (answer 2019): a test's pass rates per group from voluntary answers (live).
export const LiveFinding: S = { name: 'Live · finding, open a review', render: () => <FairnessScreen live={liveFairness()} /> };
export const LiveReviewOpen: S = { name: 'Live · review open', render: () => <FairnessScreen live={liveFairness({}, { review: { id: 'r1', finding: 'Pass rate for women is 66 % of the highest group’s', openedAt: '2026-11-17T05:00:00.000Z', decision: null, reason: null, decidedAt: null } })} /> };
export const LiveNoFinding: S = { name: 'Live · no finding, survey hidden', render: () => <FairnessScreen live={liveFairness({}, { finding: null, rows: [{ group: 'Men', attempts: 120, rate: 0.5, ratio: 1, status: 'ok' }, { group: 'Women', attempts: 98, rate: 0.48, ratio: 0.96, status: 'ok' }, { group: 'Another way', attempts: null, rate: null, ratio: null, status: 'hidden' }], survey: null })} /> };
