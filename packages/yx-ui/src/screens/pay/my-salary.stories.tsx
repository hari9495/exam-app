import type { Meta, StoryObj } from '@storybook/react-vite';
import { MySalaryScreen, type LiveMySalary } from './my-salary';
import { MY_SALARY_HISTORY, MY_SALARY_SPLIT, MY_SALARY_TODAY } from './my-salary-samples';

// T2-B 63 (Keka B3): Me › My pay › My salary, the employee's salary timeline.
const meta: Meta = { title: 'Screens/Pay/My salary (T2-B 63)', parameters: { layout: 'fullscreen' } };
export default meta;
type S = StoryObj;
const live = (o: Partial<LiveMySalary> = {}): LiveMySalary => ({ state: 'ready', today: MY_SALARY_TODAY, history: MY_SALARY_HISTORY, onBreakdown: async () => MY_SALARY_SPLIT, ...o });

export const Timeline: S = { name: 'Current, a later raise and earlier salaries', render: () => <MySalaryScreen live={live()} /> };
export const Empty: S = { name: 'No salary yet', render: () => <MySalaryScreen live={live({ history: [] })} /> };
export const Loading: S = { name: 'Loading', render: () => <MySalaryScreen live={live({ state: 'loading', history: null })} /> };
export const Failed: S = { name: 'Could not load', render: () => <MySalaryScreen live={live({ state: 'error', history: null, onRetry: () => {} })} /> };
