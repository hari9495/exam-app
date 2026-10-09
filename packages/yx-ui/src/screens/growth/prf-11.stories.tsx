import type { Meta, StoryObj } from '@storybook/react-vite';
import { OneOnOneScreen } from './perf-people';
import { ONE_ON_ONES } from './perf-data-2';

const meta: Meta = { title: 'Screens/Performance/PRF-11 · 1:1s', parameters: { layout: 'fullscreen' } };
export default meta;
type S = StoryObj;
const PHONE = { viewport: { value: 'mobile2', isRotated: false } };

export const ManagerList: S = { name: 'Manager · list', render: () => <OneOnOneScreen persona="mgr" items={ONE_ON_ONES} /> };
export const ManagerRecord: S = { name: 'Manager · 1:1 record', render: () => <OneOnOneScreen persona="mgr" items={ONE_ON_ONES} openId="o1" /> };
export const EmployeeRecord: S = { name: 'Employee · 1:1 record', render: () => <OneOnOneScreen persona="emp" items={ONE_ON_ONES.filter((o) => o.employee === 'Divya Raghunathan')} openId="o2" /> };
export const Phone: S = { name: 'Employee · phone', globals: PHONE, render: () => <OneOnOneScreen persona="emp" device="phone" items={ONE_ON_ONES.filter((o) => o.employee === 'Divya Raghunathan')} openId="o2" /> };
export const Empty: S = { render: () => <OneOnOneScreen persona="mgr" items={[]} /> };
export const Loading: S = { render: () => <OneOnOneScreen persona="mgr" items={[]} state="loading" /> };
