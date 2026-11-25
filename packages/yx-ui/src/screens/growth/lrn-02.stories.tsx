import type { Meta, StoryObj } from '@storybook/react-vite';
import { CoursePlayerScreen } from './learn-me';
import { COURSES, PLAYER_ITEMS } from './learn-data';

const meta: Meta = { title: 'Screens/Learning/LRN-02 · Course player', parameters: { layout: 'fullscreen' } };
export default meta;
type S = StoryObj;
const PHONE = { viewport: { value: 'mobile2', isRotated: false } };

export const PdfItem: S = { name: 'PDF item (mark as done)', render: () => <CoursePlayerScreen course={COURSES[0]} items={PLAYER_ITEMS} currentId="i3" /> };
export const Scorm: S = { name: 'SCORM package (status from package)', render: () => <CoursePlayerScreen course={COURSES[0]} items={PLAYER_ITEMS} currentId="i4" scormStatus="incomplete" /> };
export const ScormFailed: S = { name: 'SCORM failed', render: () => <CoursePlayerScreen course={COURSES[0]} items={PLAYER_ITEMS} currentId="i4" scormStatus="failed" /> };
export const Quiz: S = { name: 'Quiz item', render: () => <CoursePlayerScreen course={COURSES[0]} items={PLAYER_ITEMS} currentId="i6" /> };
export const Completed: S = { name: 'Completed with certificate', render: () => <CoursePlayerScreen course={COURSES[0]} items={PLAYER_ITEMS.map((i) => ({ ...i, done: true }))} currentId="i6" completed /> };
export const Phone: S = { name: 'Phone', globals: PHONE, render: () => <CoursePlayerScreen device="phone" course={COURSES[0]} items={PLAYER_ITEMS} currentId="i2" /> };
