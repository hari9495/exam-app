import type { Meta, StoryObj } from '@storybook/react-vite';
import { TripScreen } from './expenses';
import { TRIP } from './expenses-data';

const meta: Meta = { title: 'Screens/Expenses/EXP-04 · Trip', parameters: { layout: 'fullscreen' } };
export default meta;
type S = StoryObj;
const PHONE = { viewport: { value: 'mobile2', isRotated: false } };

export const Record: S = { name: 'Trip record · employee receives balance', render: () => <TripScreen trip={TRIP} /> };
export const ToReturn: S = { name: 'Settlement · advance to return', render: () => <TripScreen trip={TRIP} spent={7000} /> };
export const Settled: S = { render: () => <TripScreen trip={TRIP} spent={7000} settled /> };
export const Request: S = { name: 'Request sheet', render: () => <TripScreen trip={TRIP} view="request" /> };
export const PhoneRequest: S = { name: 'Request · phone', globals: PHONE, render: () => <TripScreen device="phone" trip={TRIP} view="request" /> };
export const PhoneRecord: S = { name: 'Trip · phone', globals: PHONE, render: () => <TripScreen device="phone" trip={TRIP} spent={7000} /> };
