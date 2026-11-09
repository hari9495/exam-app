import type { Meta, StoryObj } from '@storybook/react-vite';
import { ScorecardTemplatesScreen, type ScorecardTemplatesScreenProps } from './interviews';

// Recruitment, wired (batch AT5; M10-BUILD-DESIGN §9): the scorecard templates until Settings 6.1 is wired. The
// interviewer's list and the scorecard went to the designed HIR-06 / HIR-07 screens (their "Live ·" stories were deleted
// with the stand-ins). In the affordance guard set ('screens-hiring-live').
// The lower-case exports are sample props shared with the tests, not stories.
const meta: Meta = { title: 'Screens/Hiring/Live · Job workspace and interviews', parameters: { layout: 'fullscreen' }, excludeStories: /^[a-z]/ };
export default meta;
type S = StoryObj;

const ok = async () => ({});

export const templates: ScorecardTemplatesScreenProps = {
  state: 'ready',
  templates: [{ id: 'tp1', name: 'Engineer round 1', scaleMax: 4, passBar: 2.5, inUse: true, items: [{ id: 'a', label: 'Plant safety', guidance: null, weight: 2, competencyId: null }] }],
  competencies: [{ value: 'cp1', label: 'Problem solving' }],
  canManage: true,
  onSave: ok,
  onArchive: ok,
};

export const Scorecards: S = { render: () => <ScorecardTemplatesScreen {...templates} /> };
