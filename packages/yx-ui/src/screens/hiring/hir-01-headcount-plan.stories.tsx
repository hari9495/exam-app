import type { Meta, StoryObj } from '@storybook/react-vite';
import { HeadcountPlanScreen } from './hiring-plan';
import { PLAN_FY, PLAN_LINES, PLAN_REVISION_STEPS } from './hiring-data';
import { TODAY } from '../_kit/data';

const meta: Meta = { title: 'Screens/Hiring/HIR-01 · Headcount plan board', parameters: { layout: 'fullscreen' } };
export default meta;
type S = StoryObj;

export const HrApproved: S = { name: 'HR · approved plan', render: () => <HeadcountPlanScreen fy={PLAN_FY} lines={PLAN_LINES} persona="hr" planStatus="Approved" version={2} /> };
export const FinanceRevision: S = {
  name: 'Finance · revision pending approval',
  render: () => <HeadcountPlanScreen fy={PLAN_FY} lines={PLAN_LINES} persona="finance" planStatus="Revision pending" version={3} revisionSteps={PLAN_REVISION_STEPS} now={TODAY} />,
};
export const HiringManager: S = { name: 'Hiring manager · own department', render: () => <HeadcountPlanScreen fy={PLAN_FY} lines={PLAN_LINES} persona="hm" myDepartment="Engineering" planStatus="Approved" version={2} /> };
export const HrDepartments: S = {
  name: 'HR · departments at different steps',
  render: () => (
    <HeadcountPlanScreen
      fy={PLAN_FY}
      lines={PLAN_LINES}
      persona="hr"
      planStatus="Draft"
      version={2}
      departmentStatus={{ Engineering: { label: 'Approved · v2', tone: 'success' }, Operations: { label: 'Revision pending', tone: 'warning' }, Sales: { label: 'Approved · v1', tone: 'success' }, Finance: { label: 'Sent back', tone: 'danger' }, Quality: { label: 'Draft', tone: 'neutral' } }}
    />
  ),
};
export const HrRevisePlan: S = { name: 'HR · revise plan sheet', render: () => <HeadcountPlanScreen fy={PLAN_FY} lines={PLAN_LINES} persona="hr" planStatus="Approved" version={2} editorOpen /> };
export const FinanceSendBack: S = {
  name: 'Finance · send back with a reason',
  render: () => <HeadcountPlanScreen fy={PLAN_FY} lines={PLAN_LINES} persona="finance" planStatus="Revision pending" version={3} revisionSteps={PLAN_REVISION_STEPS} now={TODAY} sendBackOpen />,
};
export const HrOnly: S = { name: 'Hiring manager · company shows HR only', render: () => <HeadcountPlanScreen fy={PLAN_FY} lines={PLAN_LINES} persona="hm" myDepartment="Engineering" planStatus="Approved" version={2} state="hr-only" /> };
export const NoAccess: S = { name: 'No access · no hiring role', render: () => <HeadcountPlanScreen fy={PLAN_FY} lines={PLAN_LINES} persona="hr" planStatus="Approved" version={2} state="no-access" /> };
export const Empty: S = { name: 'Empty · no plan for the year', render: () => <HeadcountPlanScreen fy="FY 2027–28" lines={[]} persona="hr" planStatus="Draft" version={1} /> };
export const Loading: S = { name: 'Loading', render: () => <HeadcountPlanScreen fy={PLAN_FY} lines={PLAN_LINES} persona="hr" planStatus="Approved" version={2} state="loading" /> };
export const Error: S = { name: 'Error', render: () => <HeadcountPlanScreen fy={PLAN_FY} lines={PLAN_LINES} persona="hr" planStatus="Approved" version={2} state="error" /> };
