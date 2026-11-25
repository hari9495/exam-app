import type { Meta, StoryObj } from '@storybook/react-vite';
import { SkillsProfileScreen } from './learn-me';
import { MY_SKILLS } from './learn-data';
import { SKILL_PROFILE, liveSkillsProfile } from './learn-skills-samples';

const meta: Meta = { title: 'Screens/Learning/LRN-10 · Skills profile', parameters: { layout: 'fullscreen' } };
export default meta;
type S = StoryObj;
const PHONE = { viewport: { value: 'mobile2', isRotated: false } };

export const Employee: S = { name: 'Employee · my skills', render: () => <SkillsProfileScreen persona="emp" person="Divya Raghunathan" role="Senior QA Engineer" nextRole="QA Lead" skills={MY_SKILLS} pending={3} /> };
export const Manager: S = { name: 'Manager · report’s skills', render: () => <SkillsProfileScreen persona="mgr" person="Divya Raghunathan" role="Senior QA Engineer" nextRole="QA Lead" skills={MY_SKILLS} pending={0} /> };
export const Phone: S = { name: 'Employee · phone', globals: PHONE, render: () => <SkillsProfileScreen persona="emp" device="phone" person="Divya Raghunathan" role="Senior QA Engineer" nextRole="QA Lead" skills={MY_SKILLS} pending={3} /> };
export const Empty: S = { render: () => <SkillsProfileScreen persona="emp" person="Ananya Das" role="Quality Inspector" nextRole="Senior Quality Inspector" skills={[]} pending={0} state="empty" /> };
export const Live: S = { name: 'Live · my skills', render: () => <SkillsProfileScreen live={liveSkillsProfile()} /> };
export const LiveManager: S = { name: 'Live · manager sets a level', render: () => <SkillsProfileScreen live={liveSkillsProfile({ data: { ...SKILL_PROFILE, self: false, canAssess: true } })} /> };
