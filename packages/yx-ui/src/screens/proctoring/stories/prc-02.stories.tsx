import type { Meta, StoryObj } from '@storybook/react-vite';
import { QuestionEditorScreen } from '../bank-tests';
import { QUESTIONS } from '../proctoring-data';

const meta: Meta<typeof QuestionEditorScreen> = { title: 'Screens/Proctoring/PRC-02 · Question editor', component: QuestionEditorScreen, parameters: { layout: 'fullscreen' }, args: { question: QUESTIONS[0] } };
export default meta;
type S = StoryObj<typeof QuestionEditorScreen>;

export const Default: S = {};
export const MajorEdit: S = { name: 'Major edit creates a new version', args: { issue: 'major' } };
export const DuplicateBlocked: S = { name: 'Duplicate blocks approval', args: { issue: 'duplicate', question: QUESTIONS[3] } };
export const MissingAltText: S = { name: 'Missing alt text blocks approval', args: { issue: 'alt', question: QUESTIONS[3] } };
export const AiDraft: S = { name: 'AI-drafted question', args: { question: QUESTIONS[4] } };
export const MobilePreviewTamil: S = { name: 'Mobile preview, untranslated language', args: { defaultDevice: 'mobile', defaultLanguage: 'Tamil' } };
export const HindiPreview: S = { name: 'Hindi preview', args: { defaultLanguage: 'Hindi' } };
export const Versions: S = { args: { defaultTab: 'versions' } };
export const ItemStats: S = { name: 'Item stats', args: { defaultTab: 'stats' } };
export const Translations: S = { args: { defaultTab: 'translations' } };
