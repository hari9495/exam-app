import type { Meta, StoryObj } from '@storybook/react-vite';
import { CareersJobScreen, CareersSiteScreen } from './t9-candidate';
import { CAREERS_CONFIG, CAREERS_JOBS, JOB_DETAIL } from './t9-cand-data';
import { KAVERI_ACCENT, TENANT, TODAY } from './t9-data';

const meta: Meta = { title: 'Screens/Portals/T9-09 · Careers site', parameters: { layout: 'fullscreen' } };
export default meta;
type S = StoryObj;
const phone = { viewport: { value: 'mobile2', isRotated: false } };

export const Home: S = { name: 'Careers home', render: () => <CareersSiteScreen config={CAREERS_CONFIG} jobs={CAREERS_JOBS} /> };
export const HomePhone: S = { name: 'Careers home · phone', globals: phone, render: () => <CareersSiteScreen config={CAREERS_CONFIG} jobs={CAREERS_JOBS} /> };
export const WhiteLabel: S = { name: 'Careers home · white-label', render: () => <CareersSiteScreen config={{ ...CAREERS_CONFIG, whiteLabel: true }} jobs={CAREERS_JOBS} /> };
export const NoJobs: S = { name: 'Careers home · no open jobs', render: () => <CareersSiteScreen config={CAREERS_CONFIG} jobs={[]} /> };
export const Job: S = { name: 'Job page with pay range and apply', render: () => <CareersJobScreen tenant={TENANT} accent={KAVERI_ACCENT} detail={JOB_DETAIL} today={TODAY} /> };
export const JobPhone: S = { name: 'Job page · phone', globals: phone, render: () => <CareersJobScreen tenant={TENANT} accent={KAVERI_ACCENT} detail={JOB_DETAIL} today={TODAY} /> };
export const Applied: S = { name: 'Job page · application sent', render: () => <CareersJobScreen tenant={TENANT} accent={KAVERI_ACCENT} detail={JOB_DETAIL} today={TODAY} state="sent" /> };
export const Closed: S = { name: 'Job page · closed', render: () => <CareersJobScreen tenant={TENANT} accent={KAVERI_ACCENT} detail={JOB_DETAIL} today={TODAY} state="closed" /> };
