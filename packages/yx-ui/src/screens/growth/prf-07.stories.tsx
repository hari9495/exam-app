import type { Meta, StoryObj } from '@storybook/react-vite';
import { NominationsScreen } from './perf-reviews';
import { NOMINATIONS } from './perf-data-3';
import { PEOPLE } from './perf-data-2';

const meta: Meta = { title: 'Screens/Performance/PRF-07 · 360° nominations', parameters: { layout: 'fullscreen' } };
export default meta;
type S = StoryObj;
const PHONE = { viewport: { value: 'mobile2', isRotated: false } };

export const EmployeeNominates: S = { name: 'Employee · nominate', render: () => <NominationsScreen persona="emp" employee="Divya Raghunathan" people={PEOPLE} nominations={NOMINATIONS} /> };
export const BelowMinimum: S = { name: 'Employee · below minimum', render: () => <NominationsScreen persona="emp" employee="Divya Raghunathan" people={PEOPLE} nominations={NOMINATIONS.slice(0, 2)} /> };
export const Sent: S = { name: 'Employee · sent for approval', render: () => <NominationsScreen persona="emp" employee="Divya Raghunathan" people={PEOPLE} nominations={NOMINATIONS} submitted /> };
export const ManagerApproves: S = { name: 'Manager · approve list', render: () => <NominationsScreen persona="mgr" employee="Divya Raghunathan" people={PEOPLE} nominations={NOMINATIONS} /> };
export const Phone: S = { name: 'Employee · phone', globals: PHONE, render: () => <NominationsScreen persona="emp" device="phone" employee="Divya Raghunathan" people={PEOPLE} nominations={NOMINATIONS} /> };
export const ManagerPhone: S = { name: 'Manager · phone', globals: PHONE, render: () => <NominationsScreen persona="mgr" device="phone" employee="Divya Raghunathan" people={PEOPLE} nominations={NOMINATIONS} /> };
export const Empty: S = { render: () => <NominationsScreen persona="emp" employee="Divya Raghunathan" people={PEOPLE} nominations={[]} /> };
