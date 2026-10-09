import type { Meta, StoryObj } from '@storybook/react-vite';
import { FieldVisitPhone } from './field';

const phone = { viewport: { value: 'mobile2', isRotated: false } };
const meta: Meta<typeof FieldVisitPhone> = { title: 'Screens/Time/TIM-33 · Visit check-in and beat plan', component: FieldVisitPhone, parameters: { layout: 'fullscreen' }, globals: phone };
export default meta;
type S = StoryObj<typeof FieldVisitPhone>;

export const Consent: S = { name: 'Consent (first use)', args: { view: 'consent' } };
export const Beat: S = { name: 'Beat plan · tracking banner' };
export const Visit: S = { name: 'Visit check-in · inside site', args: { view: 'visit' } };
export const VisitOutside: S = { name: 'Visit · outside site', args: { view: 'visit_outside' } };
export const Photo: S = { name: 'Camera photo', args: { view: 'photo' } };
export const Conveyance: S = { name: 'Distance → draft mileage', args: { view: 'conveyance' } };
export const Withdrawn: S = { name: 'Consent withdrawn', args: { view: 'withdrawn' } };
export const Pwa: S = { name: 'Web app · only while open', args: { view: 'pwa' } };
