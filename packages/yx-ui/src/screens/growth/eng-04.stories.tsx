import type { Meta, StoryObj } from '@storybook/react-vite';
import { SurveyBuilderScreen, SurveysListScreen } from './engage-surveys';
import { PULSE_QUESTIONS, SURVEYS } from './engage-data';

const meta: Meta = { title: 'Screens/Engage/ENG-04 · Surveys list and builder', parameters: { layout: 'fullscreen' } };
export default meta;
type S = StoryObj;

export const List: S = { name: 'Surveys list', render: () => <SurveysListScreen surveys={SURVEYS} /> };
export const Template: S = { name: 'Builder · template', render: () => <SurveyBuilderScreen defaultStep="template" questions={PULSE_QUESTIONS} /> };
export const Questions: S = { name: 'Builder · question library and preview', render: () => <SurveyBuilderScreen questions={PULSE_QUESTIONS} /> };
export const Audience: S = { name: 'Builder · audience and schedule', render: () => <SurveyBuilderScreen defaultStep="audience" questions={PULSE_QUESTIONS} /> };
export const Anonymity: S = { name: 'Builder · anonymity mode', render: () => <SurveyBuilderScreen defaultStep="anonymity" questions={PULSE_QUESTIONS} /> };
export const Empty: S = { name: 'List · empty', render: () => <SurveysListScreen surveys={[]} /> };
