import type { Meta, StoryObj } from '@storybook/react-vite';
import { LetterTemplatesList, LetterTemplateWorkspace } from './documents';
import { TEMPLATES } from './people-data';

const meta: Meta = { title: 'Screens/People/PPL-29 · Letter templates', parameters: { layout: 'fullscreen' } };
export default meta;
type S = StoryObj;

export const List: S = { name: 'Templates list', render: () => <LetterTemplatesList rows={TEMPLATES} /> };
export const Upload: S = { name: 'Word upload with validation report', render: () => <LetterTemplateWorkspace /> };
export const Editor: S = { name: 'In-app editor with merge fields', render: () => <LetterTemplateWorkspace tab="editor" /> };
export const Fields: S = { name: 'Field cheat-sheet', render: () => <LetterTemplateWorkspace tab="fields" /> };
export const TestRender: S = { name: 'Test render (activate after viewing)', render: () => <LetterTemplateWorkspace tab="test" previewViewed /> };
export const Empty: S = { name: '· empty', render: () => <LetterTemplatesList rows={[]} /> };
