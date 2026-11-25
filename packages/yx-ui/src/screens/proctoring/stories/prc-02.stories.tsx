import type { Meta, StoryObj } from '@storybook/react-vite';
import { BANK_QUESTION, BANK_QUESTION_IMAGE, BANK_QUESTION_MAJOR, CODE_QUESTION, liveEditor } from '../bank-live-samples';
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

// AS-1: the states the real question bank has (answers 2009, 2010, 2017).
export const ApprovedQuestion: S = { name: 'Approved question with versions and a Hindi translation', render: () => <QuestionEditorScreen live={liveEditor()} /> };
export const MajorChangeInReview: S = { name: 'Major change in review, possible duplicate', render: () => <QuestionEditorScreen live={liveEditor({ question: BANK_QUESTION_MAJOR })} /> };
export const ChangesAskedFor: S = { name: 'Reviewer asked for changes', render: () => <QuestionEditorScreen live={liveEditor({ question: { ...BANK_QUESTION, status: 'draft', approvedBy: null, approvedAt: null, history: [], translations: [], openChange: { id: 'r1', kind: 'new', state: 'changes_requested', version: 1, content: BANK_QUESTION.content, mine: true, note: 'Name the terminal operation too.', fieldComments: {}, duplicate: null, rowVersion: 3 } } })} /> };
export const AltTextMissing: S = { name: 'Image without alt text', render: () => <QuestionEditorScreen live={liveEditor({ question: { ...BANK_QUESTION, status: 'draft', content: { ...BANK_QUESTION.content, imageUrl: 'questions/line.png', imageAlt: '' } } })} /> };
export const EnglishOnly: S = { name: 'English only (no other language switched on)', render: () => <QuestionEditorScreen live={liveEditor({ settings: { languages: [], secondApproverCollections: [], duplicatePercent: 90, provisionalAnswers: 200, packs: [] } })} /> };
export const NewQuestion: S = { name: 'New question', render: () => <QuestionEditorScreen live={liveEditor({ question: null, stats: null })} /> };
// Bank follow-ups: code tests (2125) and images with alt text (2126).
export const CodeQuestion: S = { name: 'Code question with test cases', render: () => <QuestionEditorScreen live={liveEditor({ question: CODE_QUESTION, stats: null })} /> };
export const ImageAdded: S = { name: 'Question image added, alt text written', render: () => <QuestionEditorScreen live={liveEditor({ question: { ...BANK_QUESTION, status: 'draft', approvedBy: null, approvedAt: null, content: { ...BANK_QUESTION.content, imageUrl: 'question-images/packing-line.png', imageAlt: 'A packing line with four stations' } } })} /> };
// Answer 2143: the candidate preview shows the question's image through a short-lived signed link.
export const PreviewWithImage: S = { name: 'Candidate preview with an image', render: () => <QuestionEditorScreen live={liveEditor({ question: BANK_QUESTION_IMAGE })} /> };
