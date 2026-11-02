import type { Meta, StoryObj } from '@storybook/react-vite';
import { ReviewsScreen } from './reviews';

// The reviews list, wired (batch PM4). The cycles, the review and the acknowledgement are the PRF-04 / 05 / 06 designs.
const meta: Meta = { title: 'Screens/Performance/Live · Reviews', parameters: { layout: 'fullscreen' } };
export default meta;
type S = StoryObj;

const noop = () => undefined;
const next = { stage: 'self', label: 'Self review', owner: 'Arjun Rao', dueOn: '2026-10-20' };

export const MyReviews: S = { render: () => <ReviewsScreen state="ready" view="mine" onView={noop} hasTeam canScope={false} reviews={[{ id: 'r1', cycle: 'FY 2025-26 annual review', cycleId: 'c1', employee: 'Arjun Rao', employeeId: 'e1', manager: 'Priya Nair', status: 'open', next, finalScore: null, band: null }]} onOpen={noop} /> };
export const TeamHandovers: S = { render: () => <ReviewsScreen state="ready" view="team" onView={noop} hasTeam canScope={false} reviews={[]} onOpen={noop} handovers={[{ id: 'h1', employee: 'Meena Iyer', from: 'Priya Nair', to: 'Arun Kumar', direction: 'to_me', artefactType: 'review', artefactId: 'r9', effectiveOn: '2026-11-01', decisionNeeded: false }, { id: 'h2', employee: 'Meena Iyer', from: 'Priya Nair', to: 'Arun Kumar', direction: 'to_me', artefactType: 'goal_parent', artefactId: 'g9', effectiveOn: '2026-11-01', decisionNeeded: true }]} /> };
