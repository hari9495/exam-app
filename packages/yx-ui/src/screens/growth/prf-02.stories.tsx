import type { Meta, StoryObj } from '@storybook/react-vite';
import { MyGoalsScreen } from './perf-goals';
import { ANANYA_GOALS, CHECKINS, GOALS } from './perf-data';

const meta: Meta = { title: 'Screens/Performance/PRF-02 · My goals and check-in', parameters: { layout: 'fullscreen' } };
export default meta;
type S = StoryObj;
const PHONE = { viewport: { value: 'mobile2', isRotated: false } };
const mine = GOALS.filter((g) => g.owner.name === 'Divya Raghunathan');

export const GoalTree: S = { name: 'Employee · goal tree', render: () => <MyGoalsScreen persona="emp" ownerName="Divya Raghunathan" goals={mine} allGoals={GOALS} checkIns={CHECKINS} /> };
export const GoalOpen: S = { name: 'Employee · goal panel with alignment', render: () => <MyGoalsScreen persona="emp" ownerName="Divya Raghunathan" goals={mine} allGoals={GOALS} checkIns={CHECKINS} openGoalId="p1" /> };
export const CheckIn: S = { name: 'Employee · check-in sheet', render: () => <MyGoalsScreen persona="emp" ownerName="Divya Raghunathan" goals={mine} allGoals={GOALS} checkIns={CHECKINS} checkInGoalId="p1" /> };
export const ManagerApproval: S = { name: 'Manager · approve goals (weights 90%)', render: () => <MyGoalsScreen persona="mgr" ownerName="Ananya Das" goals={ANANYA_GOALS} allGoals={[...GOALS.filter((g) => ['c2', 'q1'].includes(g.id)), ...ANANYA_GOALS]} /> };
export const Phone: S = { name: 'Employee · phone', globals: PHONE, render: () => <MyGoalsScreen persona="emp" device="phone" ownerName="Divya Raghunathan" goals={mine} allGoals={GOALS} /> };
export const PhoneCheckIn: S = { name: 'Employee · phone check-in', globals: PHONE, render: () => <MyGoalsScreen persona="emp" device="phone" ownerName="Divya Raghunathan" goals={mine} allGoals={GOALS} checkInGoalId="p3" /> };
export const Empty: S = { render: () => <MyGoalsScreen persona="emp" state="empty" ownerName="Divya Raghunathan" goals={[]} allGoals={[]} /> };
export const Loading: S = { render: () => <MyGoalsScreen persona="emp" state="loading" ownerName="Divya Raghunathan" goals={mine} allGoals={GOALS} /> };
