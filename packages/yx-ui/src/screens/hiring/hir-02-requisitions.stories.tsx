import type { Meta, StoryObj } from '@storybook/react-vite';
import { RequisitionsScreen } from './hiring-plan';
import { PLAN_LINES, REDISCOVERY, REQUISITIONS } from './hiring-data';
import { TODAY } from '../_kit/data';

const meta: Meta = { title: 'Screens/Hiring/HIR-02 · Requisitions', parameters: { layout: 'fullscreen' } };
export default meta;
type S = StoryObj;

export const Recruiter: S = { name: 'Recruiter · all requisitions', render: () => <RequisitionsScreen rows={REQUISITIONS} planLines={PLAN_LINES} persona="recruiter" now={TODAY} /> };
export const OutsidePlan: S = {
  name: 'Outside plan · extra CFO approval',
  render: () => <RequisitionsScreen rows={REQUISITIONS} planLines={PLAN_LINES} persona="recruiter" openId="r3" rediscovery={REDISCOVERY} now={TODAY} />,
};
export const InPlan: S = { name: 'In plan · short chain', render: () => <RequisitionsScreen rows={REQUISITIONS} planLines={PLAN_LINES} persona="recruiter" openId="r2" now={TODAY} /> };
export const HiringManagerSentBack: S = { name: 'Hiring manager · sent back', render: () => <RequisitionsScreen rows={REQUISITIONS} planLines={PLAN_LINES} persona="hm" openId="r4" me="Sneha Rao" now={TODAY} /> };
export const NewRequisition: S = { name: 'New requisition sheet', render: () => <RequisitionsScreen rows={REQUISITIONS} planLines={PLAN_LINES} persona="hm" sheetOpen now={TODAY} /> };
export const Empty: S = { name: 'Empty', render: () => <RequisitionsScreen rows={[]} planLines={PLAN_LINES} persona="hm" /> };
export const Loading: S = { name: 'Loading', render: () => <RequisitionsScreen rows={[]} planLines={PLAN_LINES} persona="recruiter" state="loading" /> };
export const Error: S = { name: 'Error', render: () => <RequisitionsScreen rows={[]} planLines={PLAN_LINES} persona="recruiter" state="error" /> };
// Drawn 13 Nov 2026 (re-walk of answer 476): opened by a plain employee with no requisition key.
export const NoAccess: S = { name: 'No access · no requisition key', render: () => <RequisitionsScreen rows={[]} planLines={PLAN_LINES} persona="hm" state="no-access" /> };
export const Approver: S = { name: 'Approver · approve or send back', render: () => <RequisitionsScreen rows={REQUISITIONS} planLines={PLAN_LINES} persona="recruiter" openId="r2" approver now={TODAY} /> };
export const CancelRequisition: S = { name: 'Cancel requisition · reason', render: () => <RequisitionsScreen rows={REQUISITIONS} planLines={PLAN_LINES} persona="recruiter" cancelId="r2" now={TODAY} /> };
// Founder answer 293: a hiring manager cancels their own requisition while it waits for approval, with a reason.
export const HiringManagerCancel: S = { name: 'Hiring manager · cancel own waiting requisition', render: () => <RequisitionsScreen rows={REQUISITIONS} planLines={PLAN_LINES} persona="hm" me="Karthik Subramanian" cancelId="r3" now={TODAY} /> };
export const AssignRecruiter: S = { name: 'Assign recruiter', render: () => <RequisitionsScreen rows={REQUISITIONS} planLines={PLAN_LINES} persona="recruiter" assignOpen now={TODAY} /> };
