import type { Meta, StoryObj } from '@storybook/react-vite';
import { IdentityStrip } from './hiring-kit';
import { AiInterviewReviewScreen, CandidateRecordScreen, ScorecardScreen } from './hiring-pipeline';
import { AI_ANSWERS, CANDIDATES, D, ID_POINTS, ID_POINTS_CLEAR, SCORECARD_SKILLS } from './hiring-data';
import { TODAY } from '../_kit/data';

const meta: Meta = { title: 'Screens/Hiring/HIR-22 · Identity strip', parameters: { layout: 'fullscreen' } };
export default meta;
type S = StoryObj;

const REVERIFIED = ID_POINTS.map((p) => (p.id === 'i3' ? { ...p, result: 're-verified' as const, deepfake: 'clear' as const, at: D(2026, 9, 28) } : p));

export const Clear: S = { name: 'Strip · all matched, interviewer attested', render: () => <IdentityStrip points={ID_POINTS_CLEAR} /> };
export const Flagged: S = { name: 'Strip · mismatch and deepfake signal', render: () => <IdentityStrip points={ID_POINTS} onReverify={() => {}} onReview={() => {}} /> };
export const Reverified: S = { name: 'Strip · re-verified, flag closed', render: () => <IdentityStrip points={REVERIFIED} /> };
export const OnApplication: S = { name: 'On the application', render: () => <CandidateRecordScreen candidate={CANDIDATES[3]} viewer="recruiter" identity={ID_POINTS} applications={[]} activity={[]} now={TODAY} /> };
export const OnReviewPlayer: S = {
  name: 'On the AI interview review player',
  render: () => <AiInterviewReviewScreen candidate={CANDIDATES[3]} answers={AI_ANSWERS} integrity={['Face not matching the application capture at 0:42 (answer 2)']} identity={ID_POINTS} />,
};
export const OnScorecard: S = {
  name: 'On the panel scorecard',
  render: () => <ScorecardScreen candidate="Rahul Ghosh" round="Panel 1 · 1 Oct 2026" skills={SCORECARD_SKILLS} identity={ID_POINTS} />,
};
