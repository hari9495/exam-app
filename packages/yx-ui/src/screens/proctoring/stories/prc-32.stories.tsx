import type { Meta, StoryObj } from '@storybook/react-vite';
import { liveReuse } from '../delivery-live-samples';
import { ResultReuseScreen } from '../candidate';

const meta: Meta<typeof ResultReuseScreen> = { title: 'Screens/Proctoring/PRC-32 · Result-reuse consent', component: ResultReuseScreen, parameters: { layout: 'fullscreen' } };
export default meta;
type S = StoryObj<typeof ResultReuseScreen>;

export const Reuse: S = { name: 'Reuse with consent' };
export const Retake: S = { name: 'Choose to retake', args: { choice: 'retake' } };
export const Expired: S = { name: 'Outside validity window', args: { expired: true } };

// AS-3: the candidate's real earlier result (live).
export const LiveOffer: S = { name: 'Live · earlier result offered', render: () => <ResultReuseScreen live={liveReuse()} /> };
export const LiveUsed: S = { name: 'Live · earlier result in use', render: () => <ResultReuseScreen live={liveReuse({ offer: null, reused: { takenAt: '2026-06-12T09:00:00.000Z' } })} /> };
export const LiveNone: S = { name: 'Live · nothing to reuse', render: () => <ResultReuseScreen live={liveReuse({ offer: null })} /> };
