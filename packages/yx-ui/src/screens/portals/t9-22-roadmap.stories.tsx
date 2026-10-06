import type { Meta, StoryObj } from '@storybook/react-vite';
import { RoadmapScreen } from './t9-public';
import { ROADMAP } from './t9-pub-data';

const meta: Meta = { title: 'Screens/Portals/T9-22 · Public roadmap', parameters: { layout: 'fullscreen' } };
export default meta;
type S = StoryObj;

export const SignedOut: S = { name: 'Signed out (read only)', render: () => <RoadmapScreen items={ROADMAP} userId={null} /> };
export const SignedIn: S = { name: 'Signed in · can vote', render: () => <RoadmapScreen items={ROADMAP} userId="u-divya" defaultVoted={['r2']} /> };
export const Phone: S = { name: 'Signed in · phone', globals: { viewport: { value: 'mobile2', isRotated: false } }, render: () => <RoadmapScreen items={ROADMAP} userId="u-divya" /> };
export const Empty: S = { name: 'No public items', render: () => <RoadmapScreen items={[]} userId={null} /> };
