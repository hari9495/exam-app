import type { Meta, StoryObj } from '@storybook/react-vite';
import { TakeSurveyScreen } from './engage-surveys';
import { PULSE_QUESTIONS } from './engage-data';
import { d } from './perf-data';

const meta: Meta = { title: 'Screens/Engage/ENG-05 · Take survey, pulse and eNPS', parameters: { layout: 'fullscreen' } };
export default meta;
type S = StoryObj;
const PHONE = { viewport: { value: 'mobile2', isRotated: false } };
const base = { title: 'Monthly pulse, September 2026', anonymity: 'Anonymous' as const, closes: d(30), questions: PULSE_QUESTIONS };

export const Pulse: S = { name: 'Pulse (anonymous)', render: () => <TakeSurveyScreen {...base} prefill /> };
export const Enps: S = { name: 'eNPS only', render: () => <TakeSurveyScreen {...base} title="eNPS, Q3 FY 2026-27" questions={PULSE_QUESTIONS.slice(0, 1)} /> };
export const Named: S = { name: 'Named onboarding survey', render: () => <TakeSurveyScreen {...base} title="Onboarding, day 30" anonymity="Named" questions={PULSE_QUESTIONS.slice(1)} /> };
export const Phone: S = { name: 'Phone', globals: PHONE, render: () => <TakeSurveyScreen {...base} device="phone" prefill /> };
export const Submitted: S = { name: 'Submitted', render: () => <TakeSurveyScreen {...base} submitted /> };
export const Closed: S = { name: 'Closed', render: () => <TakeSurveyScreen {...base} closed /> };
