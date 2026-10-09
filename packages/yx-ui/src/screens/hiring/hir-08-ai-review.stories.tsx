import type { Meta, StoryObj } from '@storybook/react-vite';
import { AiInterviewReviewScreen } from './hiring-pipeline';
import { AI_ANSWERS, CANDIDATES, ID_POINTS, ID_POINTS_CLEAR } from './hiring-data';

const meta: Meta = { title: 'Screens/Hiring/HIR-08 · AI interview review player', parameters: { layout: 'fullscreen' } };
export default meta;
type S = StoryObj;

const rahul = CANDIDATES[3];

export const LowScore: S = { name: 'Low advisory score · stays in review', render: () => <AiInterviewReviewScreen candidate={rahul} answers={AI_ANSWERS} integrity={[]} identity={ID_POINTS_CLEAR} /> };
export const IdentityFlag: S = {
  name: 'Identity and deepfake flag',
  render: () => <AiInterviewReviewScreen candidate={rahul} answers={AI_ANSWERS} integrity={['Tab switched 3 times during answer 3', 'Face not matching the application capture at 0:42 (answer 2)']} identity={ID_POINTS} />,
};
export const Decided: S = { name: 'Decided · moved to panel', render: () => <AiInterviewReviewScreen candidate={CANDIDATES[0]} answers={AI_ANSWERS.map((a) => ({ ...a, score: a.score + 38 }))} integrity={[]} identity={ID_POINTS_CLEAR} decided="progressed" /> };
export const AlternativeProcess: S = { name: 'Candidate asked for a human process', render: () => <AiInterviewReviewScreen candidate={rahul} answers={AI_ANSWERS} integrity={[]} identity={ID_POINTS_CLEAR} alternativeRequested /> };
