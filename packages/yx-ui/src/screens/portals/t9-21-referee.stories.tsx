import type { Meta, StoryObj } from '@storybook/react-vite';
import { RefereeQuestionnaireScreen } from './t9-candidate';
import { REFEREE_REQUEST } from './t9-cand-data';
import { KAVERI_ACCENT, TENANT, TODAY } from './t9-data';

const meta: Meta = { title: 'Screens/Portals/T9-21 · Referee questionnaire', parameters: { layout: 'fullscreen' } };
export default meta;
type S = StoryObj;
const base = { tenant: TENANT, accent: KAVERI_ACCENT, request: REFEREE_REQUEST, today: TODAY };

export const Form: S = { name: 'Questionnaire', render: () => <RefereeQuestionnaireScreen {...base} /> };
export const Phone: S = { name: 'Questionnaire · phone', globals: { viewport: { value: 'mobile2', isRotated: false } }, render: () => <RefereeQuestionnaireScreen {...base} /> };
export const Submitted: S = { render: () => <RefereeQuestionnaireScreen {...base} state="submitted" /> };
export const Expired: S = { render: () => <RefereeQuestionnaireScreen {...base} state="expired" /> };
export const Declined: S = { render: () => <RefereeQuestionnaireScreen {...base} state="declined" /> };
