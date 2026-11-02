import type { Meta, StoryObj } from '@storybook/react-vite';
import { MyGoalsScreen } from './perf-goals';
import { ANANYA_GOALS, CHECKINS, GOALS } from './perf-data';
import { MANAGER_GOALS, MY_GOALS, GOAL_DETAIL } from './perf-live-samples';

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
export const DraftsToSend: S = { name: 'Employee · drafts to send to the manager', render: () => <MyGoalsScreen live={MY_GOALS} /> };
export const SendConfirm: S = { name: 'Employee · send goals to the manager (confirm)', render: () => <MyGoalsScreen live={MY_GOALS} defaultDialog="submit" /> };
export const AddGoal: S = { name: 'Employee · add goal form', render: () => <MyGoalsScreen live={MY_GOALS} defaultDialog="add" /> };
export const AlignGoal: S = { name: 'Employee · align to a goal (choose which)', render: () => <MyGoalsScreen live={MY_GOALS} defaultDialog="align" /> };
export const DraftOpen: S = { name: 'Employee · draft goal panel (edit, drop)', render: () => <MyGoalsScreen live={{ ...MY_GOALS, openGoalId: 'g2', goal: GOAL_DETAIL }} /> };
export const DropGoal: S = { name: 'Employee · drop goal with a reason', render: () => <MyGoalsScreen live={{ ...MY_GOALS, openGoalId: 'g2', goal: GOAL_DETAIL }} defaultDialog="drop" /> };
export const ManagerSendBack: S = { name: 'Manager · send back with what to change', render: () => <MyGoalsScreen live={MANAGER_GOALS} defaultDialog="send-back" /> };
export const ManagerSuggest: S = { name: 'Manager · suggest a goal (cascade)', render: () => <MyGoalsScreen live={MANAGER_GOALS} defaultDialog="suggest" /> };
export const CheckInByHand: S = { name: 'Employee · check-in, goal without key results', render: () => <MyGoalsScreen live={{ ...MY_GOALS, goals: MY_GOALS.goals.map((g) => (g.id === 'g2' ? { ...g, status: 'active' as const } : g)) }} /> };
