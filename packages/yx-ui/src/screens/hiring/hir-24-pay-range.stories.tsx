import type { Meta, StoryObj } from '@storybook/react-vite';
import { JobPayRangePanel, JobWorkspaceScreen } from './hiring-plan';
import { JOBS, JOB_ACTIVITY, POSTINGS } from './hiring-data';
import { TODAY } from '../_kit/data';

const meta: Meta = { title: 'Screens/Hiring/HIR-24 · Job pay range fields', parameters: { layout: 'fullscreen' } };
export default meta;
type S = StoryObj;

const LAW_REQUIRED = { rangeRequired: true, historyBanned: true, source: 'New York City pay transparency law (P07 rules)' };
const LAW_NONE = { rangeRequired: false, historyBanned: false };

export const RequiredMissing: S = {
  name: 'Required by law · missing, publish blocked',
  render: () => <div style={{ maxWidth: 720 }}><JobPayRangePanel location="New York office" law={LAW_REQUIRED} /></div>,
};
export const RequiredFilled: S = {
  name: 'Required by law · filled, pay-history banned',
  render: () => <div style={{ maxWidth: 720 }}><JobPayRangePanel location="New York office" law={LAW_REQUIRED} defaultRange={{ min: 95_00_000, max: 1_20_00_000 }} /></div>,
};
export const CompanySetting: S = {
  name: 'Company setting · range shown',
  render: () => <div style={{ maxWidth: 720 }}><JobPayRangePanel location="Chennai office" law={LAW_NONE} defaultRange={{ min: 14_00_000, max: 18_00_000 }} defaultHistoryQuestion /></div>,
};
export const InvalidRange: S = {
  name: 'Error · minimum above maximum',
  render: () => <div style={{ maxWidth: 720 }}><JobPayRangePanel location="Chennai office" law={LAW_NONE} defaultRange={{ min: 20_00_000, max: 16_00_000 }} /></div>,
};
export const InWorkspace: S = {
  name: 'In the job workspace',
  render: () => <JobWorkspaceScreen job={JOBS[0]} postings={POSTINGS} law={LAW_NONE} range={{ min: 14_00_000, max: 18_00_000 }} activity={JOB_ACTIVITY} defaultTab="pay" now={TODAY} />,
};
