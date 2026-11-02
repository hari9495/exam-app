import type { Meta, StoryObj } from '@storybook/react-vite';
import { CompanyGoalMapScreen } from './perf-goals';
import { GOALS, UNALIGNED } from './perf-data';
import { DEPARTMENTS } from '../_kit/data';
import { MAP } from './perf-live-samples';

const meta: Meta = { title: 'Screens/Performance/PRF-03 · Company goal map', parameters: { layout: 'fullscreen' } };
export default meta;
type S = StoryObj;

export const Default: S = { name: 'HR · goal map', render: () => <CompanyGoalMapScreen goals={GOALS} unaligned={UNALIGNED} departments={DEPARTMENTS} /> };
export const Empty: S = { name: 'Empty (no company goals)', render: () => <CompanyGoalMapScreen state="empty" goals={[]} unaligned={[]} departments={DEPARTMENTS} /> };
export const Loading: S = { render: () => <CompanyGoalMapScreen state="loading" goals={GOALS} unaligned={UNALIGNED} departments={DEPARTMENTS} /> };
export const Failed: S = { name: 'Error', render: () => <CompanyGoalMapScreen state="error" goals={GOALS} unaligned={UNALIGNED} departments={DEPARTMENTS} /> };
export const Leadership: S = { name: 'Leadership · read-only map', render: () => <CompanyGoalMapScreen persona="exec" goals={GOALS} unaligned={UNALIGNED} departments={DEPARTMENTS} /> };
export const AddCompanyGoal: S = { name: 'HR · add company or team goal', render: () => <CompanyGoalMapScreen live={MAP} defaultDialog="add" /> };
export const AddPeriod: S = { name: 'HR · add a goal period', render: () => <CompanyGoalMapScreen live={MAP} defaultDialog="period" /> };
export const DepartmentFilter: S = { name: 'HR · unaligned goal to suggest a parent for', render: () => <CompanyGoalMapScreen live={MAP} /> };
export const LeadershipLive: S = { name: 'Leadership · read-only, no goals yet', render: () => <CompanyGoalMapScreen live={{ ...MAP, persona: 'exec', map: { goals: [], unaligned: [], offTrack: [] } }} /> };
