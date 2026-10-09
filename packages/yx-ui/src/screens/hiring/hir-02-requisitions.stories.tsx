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
