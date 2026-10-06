import type { Meta, StoryObj } from '@storybook/react-vite';
import { SkillSuggestionsScreen } from './learn-me';
import { SUGGESTIONS } from './learn-data';

const meta: Meta = { title: 'Screens/Learning/LRN-15 · Skill suggestions to confirm', parameters: { layout: 'fullscreen' } };
export default meta;
type S = StoryObj;
const PHONE = { viewport: { value: 'mobile2', isRotated: false } };

export const Employee: S = { name: 'Employee · confirm or reject', render: () => <SkillSuggestionsScreen persona="emp" person="Divya Raghunathan" suggestions={SUGGESTIONS} /> };
export const Manager: S = { name: 'Manager · confirm for a report', render: () => <SkillSuggestionsScreen persona="mgr" person="Divya Raghunathan" suggestions={SUGGESTIONS} /> };
export const Phone: S = { name: 'Employee · phone', globals: PHONE, render: () => <SkillSuggestionsScreen persona="emp" device="phone" person="Divya Raghunathan" suggestions={SUGGESTIONS} /> };
export const Empty: S = { render: () => <SkillSuggestionsScreen persona="emp" person="Divya Raghunathan" suggestions={[]} /> };
