import type { Meta, StoryObj } from '@storybook/react-vite';
import { PerformanceHomeScreen } from './perf-goals';
import { CYCLES, EMP_ACTIONS, FEEDBACK_RECEIVED, GOALS, HR_ACTIONS, MGR_ACTIONS, MY_STAGES, NUDGES, RATING_DIST, TEAM_PERF, d } from './perf-data';

const meta: Meta = { title: 'Screens/Performance/PRF-01 · Performance home', parameters: { layout: 'fullscreen' } };
export default meta;
type S = StoryObj;
const PHONE = { viewport: { value: 'mobile2', isRotated: false } };
const mine = GOALS.filter((g) => g.owner.name === 'Divya Raghunathan');

export const Employee: S = { render: () => <PerformanceHomeScreen persona="emp" name="Divya" actions={EMP_ACTIONS} goals={mine} stages={MY_STAGES} feedback={FEEDBACK_RECEIVED} nextOneOnOne={{ with: 'Karthik Subramanian', at: d(1, 9), agenda: 3 }} /> };
export const Manager: S = { render: () => <PerformanceHomeScreen persona="mgr" name="Karthik" actions={MGR_ACTIONS} goals={GOALS.filter((g) => ['q1', 'p1', 'r1'].includes(g.id))} team={TEAM_PERF} coach={{ nudges: NUDGES, weekOf: d(28) }} /> };
export const HrAdmin: S = { name: 'HR admin', render: () => <PerformanceHomeScreen persona="hr" name="Lakshmi" actions={HR_ACTIONS} goals={GOALS} cycles={CYCLES} ratingDistribution={RATING_DIST} /> };
export const EmployeePhone: S = { name: 'Employee · phone', globals: PHONE, render: () => <PerformanceHomeScreen persona="emp" device="phone" name="Divya" actions={EMP_ACTIONS} goals={mine} stages={MY_STAGES} /> };
export const ManagerPhone: S = { name: 'Manager · phone', globals: PHONE, render: () => <PerformanceHomeScreen persona="mgr" device="phone" name="Karthik" actions={MGR_ACTIONS} goals={[]} team={TEAM_PERF} coach={{ nudges: NUDGES, weekOf: d(28) }} /> };
export const NoCycleRunning: S = { name: 'HR · empty (no cycle)', render: () => <PerformanceHomeScreen persona="hr" state="empty" name="Lakshmi" actions={[]} goals={[]} /> };
export const Loading: S = { render: () => <PerformanceHomeScreen persona="emp" state="loading" name="Divya" actions={[]} goals={[]} /> };
export const Failed: S = { name: 'Error', render: () => <PerformanceHomeScreen persona="mgr" state="error" name="Karthik" actions={[]} goals={[]} /> };
