import type { Meta, StoryObj } from '@storybook/react-vite';
import { TeamSkillsMatrixScreen } from './learn-admin';
import { SKILL_COLUMNS, TEAM_SKILLS } from './learn-data';

const meta: Meta = { title: 'Screens/Learning/LRN-09 · Team skills matrix', parameters: { layout: 'fullscreen' } };
export default meta;
type S = StoryObj;

export const Default: S = { name: 'Manager · people × skills with gaps', render: () => <TeamSkillsMatrixScreen people={TEAM_SKILLS} skills={SKILL_COLUMNS} /> };
export const Empty: S = { render: () => <TeamSkillsMatrixScreen people={[]} skills={SKILL_COLUMNS} /> };
export const Loading: S = { render: () => <TeamSkillsMatrixScreen people={TEAM_SKILLS} skills={SKILL_COLUMNS} state="loading" /> };
