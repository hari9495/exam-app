import type { Meta, StoryObj } from '@storybook/react-vite';
import { JobsScreen, JobWorkspaceScreen } from './hiring-plan';
import { JOBS, JOB_ACTIVITY, POSTINGS } from './hiring-data';
import { TODAY } from '../_kit/data';

const meta: Meta = { title: 'Screens/Hiring/HIR-03 · Jobs and job workspace', parameters: { layout: 'fullscreen' } };
export default meta;
type S = StoryObj;

const LAW = { rangeRequired: false, historyBanned: false };

export const List: S = { name: 'Jobs list', render: () => <JobsScreen rows={JOBS} /> };
export const Workspace: S = { name: 'Job workspace · overview', render: () => <JobWorkspaceScreen job={JOBS[0]} postings={POSTINGS} law={LAW} range={{ min: 14_00_000, max: 18_00_000 }} activity={JOB_ACTIVITY} now={TODAY} /> };
export const Postings: S = {
  name: 'Job workspace · board postings (one failed)',
  render: () => <JobWorkspaceScreen job={JOBS[0]} postings={POSTINGS} law={LAW} range={{ min: 14_00_000, max: 18_00_000 }} activity={JOB_ACTIVITY} defaultTab="postings" now={TODAY} />,
};
export const Empty: S = { name: 'Empty', render: () => <JobsScreen rows={[]} /> };
export const Loading: S = { name: 'Loading', render: () => <JobsScreen rows={[]} state="loading" /> };
export const Error: S = { name: 'Error', render: () => <JobsScreen rows={[]} state="error" /> };
