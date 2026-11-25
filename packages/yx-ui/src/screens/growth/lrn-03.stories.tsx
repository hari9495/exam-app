import type { Meta, StoryObj } from '@storybook/react-vite';
import { CourseBuilderScreen } from './learn-admin';
import { BUILDER_ITEMS, COURSES, PATHS } from './learn-data';

const meta: Meta = { title: 'Screens/Learning/LRN-03 · Course builder and learning paths', parameters: { layout: 'fullscreen' } };
export default meta;
type S = StoryObj;

export const Content: S = { name: 'Content items', render: () => <CourseBuilderScreen course={COURSES[0]} items={BUILDER_ITEMS} paths={PATHS} /> };
export const Assessment: S = { name: 'Assessment picker', render: () => <CourseBuilderScreen course={COURSES[0]} items={BUILDER_ITEMS} paths={PATHS} tab="assessment" /> };
export const Certificate: S = { name: 'Certificate with Open Badge and Credly', render: () => <CourseBuilderScreen course={COURSES[0]} items={BUILDER_ITEMS} paths={PATHS} tab="certificate" /> };
export const Skills: S = { name: 'Skill mapping', render: () => <CourseBuilderScreen course={COURSES[5]} items={BUILDER_ITEMS} tab="skills" /> };
export const Settings: S = { name: 'Settings (cost, attendance, bond, live class)', render: () => <CourseBuilderScreen course={COURSES[5]} items={BUILDER_ITEMS} tab="settings" status="Published" /> };
export const Paths: S = { name: 'Learning paths', render: () => <CourseBuilderScreen course={COURSES[0]} items={BUILDER_ITEMS} paths={PATHS} tab="paths" /> };
export const NoRequiredItem: S = { name: 'Blocked: no required item', render: () => <CourseBuilderScreen course={COURSES[0]} items={BUILDER_ITEMS.map((i) => ({ ...i, required: false }))} /> };
