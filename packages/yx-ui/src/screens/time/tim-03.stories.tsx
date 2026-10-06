import type { Meta, StoryObj } from '@storybook/react-vite';
import { DayCardPhone, DayCardScreen } from './attendance';

const meta: Meta<typeof DayCardScreen> = { title: 'Screens/Time/TIM-03 · Day card', component: DayCardScreen, parameters: { layout: 'fullscreen' } };
export default meta;
type S = StoryObj<typeof DayCardScreen>;
const phone = { globals: { viewport: { value: 'mobile2', isRotated: false } } };

export const Employee: S = { name: 'Employee · outside-geofence punch' };
export const MissingOut: S = { name: 'Employee · missing check-out, Fix', args: { day: 10 } };
export const OnDuty: S = { name: 'On duty · field-recorded, offline punch', args: { day: 21 } };
export const Late: S = { name: 'Manager · late day', args: { persona: 'mgr', day: 23 } };
export const Overtime: S = { name: 'HR · overtime day', args: { persona: 'hr', day: 25 } };
export const PendingOt: S = { name: 'Manager · pending overtime', args: { persona: 'mgr', person: 'Arun Prakash', day: 14 } };
export const HrFix: S = { name: 'HR · resolve missing punch', args: { persona: 'hr', day: 10 } };
export const Phone: StoryObj<typeof DayCardPhone> = { name: 'Phone', render: () => <DayCardPhone />, ...phone };
export const PhoneOd: StoryObj<typeof DayCardPhone> = { name: 'Phone · on duty', render: () => <DayCardPhone day={21} />, ...phone };
