import type { Meta, StoryObj } from '@storybook/react-vite';
import { JourneyRecord } from './onboarding';
import { d, KAVYA_JOIN, ONBOARDING_TASKS, TODAY } from './people-data';

const meta: Meta = { title: 'Screens/People/PPL-13 · Journey record', parameters: { layout: 'fullscreen' } };
export default meta;
type S = StoryObj;

export const Hr: S = { name: 'HR · all tasks with owners and relative dates', render: () => <JourneyRecord tasks={ONBOARDING_TASKS} joining={KAVYA_JOIN} today={TODAY} /> };
export const It: S = { name: 'IT · own tasks', render: () => <JourneyRecord tasks={ONBOARDING_TASKS} joining={KAVYA_JOIN} today={TODAY} view="it" /> };
export const Manager: S = { name: 'Manager · manager and buddy tasks', render: () => <JourneyRecord tasks={ONBOARDING_TASKS} joining={KAVYA_JOIN} today={TODAY} view="mgr" /> };
export const NewHire: S = { name: 'New hire · own tasks', render: () => <JourneyRecord tasks={ONBOARDING_TASKS} joining={KAVYA_JOIN} today={TODAY} view="hire" /> };
export const LetterOverdue: S = { name: 'Appointment letter overdue (compliance alert)', render: () => <JourneyRecord tasks={ONBOARDING_TASKS} joining={KAVYA_JOIN} today={d(2026, 10, 3)} /> };
