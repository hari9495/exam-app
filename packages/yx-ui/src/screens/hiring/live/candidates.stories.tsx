import type { Meta, StoryObj } from '@storybook/react-vite';
import { TalentPoolsScreen, type TalentPoolsScreenProps } from './talent';

// Recruitment, wired (batch AT4; M10-BUILD-DESIGN §7.3): talent pools until HIR-20. The candidate list, record,
// duplicates and retention are the designed HIR-05 screens. In the affordance guard set ('screens-hiring-live').
// The lower-case exports are sample props shared with the tests, not stories.
const meta: Meta = { title: 'Screens/Hiring/Live · Candidates', parameters: { layout: 'fullscreen' }, excludeStories: /^[a-z]/ };
export default meta;
type S = StoryObj;

const ok = async () => ({});

export const pools: TalentPoolsScreenProps = {
  state: 'ready',
  lists: [{ id: 'l1', name: 'Finance talent', kind: 'pool', description: null, members: 4 }, { id: 'l2', name: 'Cashiers this week', kind: 'hotlist', description: 'Mysuru store', members: 2 }],
  selectedId: 'l1',
  onSelect: () => undefined,
  members: [{ candidateId: 'c1', addedAt: '2026-09-05T00:00:00.000Z', candidate: { id: 'c1', name: 'Priya Raman', email: 'priya@example.com', globalStage: 'engaged' } }],
  canManage: true,
  onCreate: ok,
  onArchive: ok,
  onRemove: ok,
  onOpenCandidate: () => undefined,
};

export const Pools: S = { render: () => <TalentPoolsScreen {...pools} /> };
