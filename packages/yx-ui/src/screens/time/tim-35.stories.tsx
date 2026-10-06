import type { Meta, StoryObj } from '@storybook/react-vite';
import { OpenShiftsPhone, OpenShiftsScreen } from './roster';

const meta: Meta<typeof OpenShiftsScreen> = { title: 'Screens/Time/TIM-35 · Open shifts and bids', component: OpenShiftsScreen, parameters: { layout: 'fullscreen' } };
export default meta;
type S = StoryObj<typeof OpenShiftsScreen>;
type P = StoryObj<typeof OpenShiftsPhone>;
const phone = { globals: { viewport: { value: 'mobile2', isRotated: false } } };

export const Manager: S = { name: 'Manager · open shifts' };
export const Empty: S = { name: 'Empty', args: { state: 'empty' } };
export const Loading: S = { name: 'Loading', args: { state: 'loading' } };
export const Phone: P = { name: 'Phone · eligible open shifts', render: () => <OpenShiftsPhone />, ...phone };
export const PhoneClaimed: P = { name: 'Phone · claimed, awaiting manager', render: () => <OpenShiftsPhone view="claimed" />, ...phone };
export const PhoneBid: P = { name: 'Phone · rank bids', render: () => <OpenShiftsPhone view="bid" />, ...phone };
export const PhoneNone: P = { name: 'Phone · none eligible', render: () => <OpenShiftsPhone view="none" />, ...phone };
