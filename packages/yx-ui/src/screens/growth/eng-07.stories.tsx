import type { Meta, StoryObj } from '@storybook/react-vite';
import { ActionPlanScreen } from './engage-surveys';
import { PLAN, PLANS } from './engage-data';
import { liveActionPlan } from './engage-live-samples';

const meta: Meta = { title: 'Screens/Engage/ENG-07 · Action plans', parameters: { layout: 'fullscreen' } };
export default meta;
type S = StoryObj;
const PHONE = { viewport: { value: 'mobile2', isRotated: false } };

export const Manager: S = { name: 'Manager · action plan', render: () => <ActionPlanScreen persona="mgr" plan={PLAN} /> };
export const ManagerPhone: S = { name: 'Manager · phone', globals: PHONE, render: () => <ActionPlanScreen persona="mgr" device="phone" plan={PLAN} /> };
export const HrCompletion: S = { name: 'HR · plan completion (one overdue)', render: () => <ActionPlanScreen persona="hr" plans={PLANS} /> };
export const HrEmpty: S = { name: 'HR · empty', render: () => <ActionPlanScreen persona="hr" plans={[]} /> };
// Batch G2 item 74: a manager's plan from their team results; HR's list of plans.
export const TeamPlan: S = { name: 'Manager · new plan from team results', render: () => <ActionPlanScreen live={liveActionPlan()} /> };
export const PlansForHr: S = { name: 'HR · every manager’s plan', render: () => <ActionPlanScreen live={liveActionPlan({ persona: 'hr', plans: [{ id: 'p1', manager: 'Divya R.', focus: 'Clarity', status: 'shared', items: [{ id: 'a1', action: 'Weekly priorities in the stand-up', dueOn: '2026-10-20', done: true }] }] })} /> };
