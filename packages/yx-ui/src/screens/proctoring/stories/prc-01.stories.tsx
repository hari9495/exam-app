import type { Meta, StoryObj } from '@storybook/react-vite';
import { QuestionBankScreen } from '../bank-tests';
import { QUESTIONS } from '../proctoring-data';

const meta: Meta<typeof QuestionBankScreen> = { title: 'Screens/Proctoring/PRC-01 · Question bank', component: QuestionBankScreen, parameters: { layout: 'fullscreen' }, args: { questions: QUESTIONS } };
export default meta;
type S = StoryObj<typeof QuestionBankScreen>;

export const Default: S = {};
export const BulkSelected: S = { name: 'Bulk actions', args: { defaultSelected: ['Q-1060', 'Q-1061', 'Q-1071'] } };
export const RowOpen: S = { name: 'Question drawer with item stats', args: { defaultOpenId: 'Q-1042' } };
export const LibraryPacks: S = { name: 'Library packs', args: { tab: 'library' } };
export const Empty: S = { args: { state: 'empty' } };
export const Loading: S = { args: { state: 'loading' } };
export const Error: S = { args: { state: 'error' } };
