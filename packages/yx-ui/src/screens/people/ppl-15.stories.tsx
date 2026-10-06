import type { Meta, StoryObj } from '@storybook/react-vite';
import { PreboardingActionSheet } from './onboarding';

const meta: Meta = { title: 'Screens/People/PPL-15 · Pre-boarding actions', parameters: { layout: 'fullscreen' } };
export default meta;
type S = StoryObj;

export const Postpone: S = { name: 'Postpone (re-anchor preview)', render: () => <PreboardingActionSheet action="postpone" /> };
export const DidNotJoin: S = { name: 'Did not join (unwind)', render: () => <PreboardingActionSheet action="did-not-join" /> };
export const Reneged: S = { name: 'Reneged', render: () => <PreboardingActionSheet action="reneged" /> };
export const Withdraw: S = { name: 'Withdraw offer · reason missing', render: () => <PreboardingActionSheet action="withdraw" reasonError /> };
export const Rehire: S = { name: 'Rehire pre-boarder · did not join (rehire impact)', render: () => <PreboardingActionSheet action="did-not-join" rehire /> };
