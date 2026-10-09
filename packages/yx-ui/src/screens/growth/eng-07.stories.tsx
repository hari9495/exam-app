import type { Meta, StoryObj } from '@storybook/react-vite';
import { ActionPlanScreen } from './engage-surveys';
import { PLAN, PLANS } from './engage-data';

const meta: Meta = { title: 'Screens/Engage/ENG-07 · Action plans', parameters: { layout: 'fullscreen' } };
export default meta;
type S = StoryObj;
const PHONE = { viewport: { value: 'mobile2', isRotated: false } };

export const Manager: S = { name: 'Manager · action plan', render: () => <ActionPlanScreen persona="mgr" plan={PLAN} /> };
export const ManagerPhone: S = { name: 'Manager · phone', globals: PHONE, render: () => <ActionPlanScreen persona="mgr" device="phone" plan={PLAN} /> };
export const HrCompletion: S = { name: 'HR · plan completion (one overdue)', render: () => <ActionPlanScreen persona="hr" plans={PLANS} /> };
export const HrEmpty: S = { name: 'HR · empty', render: () => <ActionPlanScreen persona="hr" plans={[]} /> };
