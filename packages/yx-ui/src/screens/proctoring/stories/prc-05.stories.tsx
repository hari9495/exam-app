import type { Meta, StoryObj } from '@storybook/react-vite';
import { liveItems } from '../bank-live-samples';
import { ItemAnalysisScreen } from '../bank-tests';
import { QUESTIONS } from '../proctoring-data';

const meta: Meta<typeof ItemAnalysisScreen> = { title: 'Screens/Proctoring/PRC-05 · Item analysis', component: ItemAnalysisScreen, parameters: { layout: 'fullscreen' }, args: { questions: QUESTIONS } };
export default meta;
type S = StoryObj<typeof ItemAnalysisScreen>;

export const Default: S = {};
export const Provisional: S = { name: 'Provisional (under 200 attempts)', args: { state: 'provisional' } };
export const Loading: S = { args: { state: 'loading' } };

// AS-1: the states the real question bank has (answers 2009, 2010, 2017).
export const CompanyItems: S = { name: 'Company items with provisional band', render: () => <ItemAnalysisScreen live={liveItems()} /> };
export const NoStatistics: S = { name: 'No statistics yet', render: () => <ItemAnalysisScreen live={liveItems({ rows: [] })} /> };
