import type { Meta, StoryObj } from '@storybook/react-vite';
import { SkillsLibraryScreen } from './learn-admin';
import { LIBRARY } from './learn-data';

const meta: Meta = { title: 'Screens/Learning/LRN-14 · Skills library admin', parameters: { layout: 'fullscreen' } };
export default meta;
type S = StoryObj;

export const Library: S = { name: 'Library by domain', render: () => <SkillsLibraryScreen skills={LIBRARY} /> };
export const SkillRecord: S = { name: 'Skill record (starter item, views)', render: () => <SkillsLibraryScreen skills={LIBRARY} openId="s1" /> };
export const Merge: S = { name: 'Merge a skill in use', render: () => <SkillsLibraryScreen skills={LIBRARY} openId="s7" mergeOpen /> };
export const LearningTeam: S = { name: 'L&D view', render: () => <SkillsLibraryScreen persona="ld" skills={LIBRARY} /> };
