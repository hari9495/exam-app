import type { Meta, StoryObj } from '@storybook/react-vite';
import { MyChecklistTasks } from './checklists';
import { CHECKLIST_TASKS, TODAY } from './people-data';

const meta: Meta = { title: 'Screens/People/PPL-47 · My checklist tasks', parameters: { layout: 'fullscreen' } };
export default meta;
type S = StoryObj;

export const Default: S = { name: 'Manager · tasks by person', render: () => <MyChecklistTasks tasks={CHECKLIST_TASKS} today={TODAY} onOpen={() => {}} /> };
export const Empty: S = { name: '· nothing to do', render: () => <MyChecklistTasks tasks={[]} today={TODAY} /> };
export const Loading: S = { name: '· loading', render: () => <MyChecklistTasks tasks={[]} today={TODAY} state="loading" /> };
export const LoadError: S = { name: '· error', render: () => <MyChecklistTasks tasks={[]} today={TODAY} state="error" onRetry={() => {}} /> };
