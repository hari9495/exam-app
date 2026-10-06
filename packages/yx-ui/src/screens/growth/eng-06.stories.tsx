import type { Meta, StoryObj } from '@storybook/react-vite';
import { SurveyResultsScreen } from './engage-surveys';
import { RESULTS, TEAM_OK, TEAM_SMALL } from './engage-data';

const meta: Meta = { title: 'Screens/Engage/ENG-06 · Survey results', parameters: { layout: 'fullscreen' } };
export default meta;
type S = StoryObj;

export const Hr: S = { name: 'HR · eNPS, heatmap (People suppressed), comment themes', render: () => <SurveyResultsScreen persona="hr" results={RESULTS} /> };
export const ManagerTeam: S = { name: 'Manager · own team (14 responses)', render: () => <SurveyResultsScreen persona="mgr" results={RESULTS} team={TEAM_OK} /> };
export const ManagerSuppressed: S = { name: 'Manager · team below 5, rolled up', render: () => <SurveyResultsScreen persona="mgr" results={RESULTS} team={TEAM_SMALL} /> };
export const Loading: S = { render: () => <SurveyResultsScreen persona="hr" results={RESULTS} state="loading" /> };
