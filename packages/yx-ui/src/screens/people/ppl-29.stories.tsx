import type { Meta, StoryObj } from '@storybook/react-vite';
import { userEvent, within } from 'storybook/test';
import { ToastProvider } from '../../components/notify';
import { LetterTemplatesList, type LiveLetterTemplates } from './documents';
import { INCREMENT_LETTER_PDF, TEMPLATES } from './people-data';
import type { EditorParagraph, LetterTemplate } from './live/types';

const meta: Meta = { title: 'Screens/People/PPL-29 · Letter templates', parameters: { layout: 'fullscreen' } };
export default meta;
type S = StoryObj;

export const List: S = { name: 'Templates list', render: () => <LetterTemplatesList rows={TEMPLATES} /> };
export const Empty: S = { name: '· empty', render: () => <LetterTemplatesList rows={[]} /> };

/** The template workspace with the API's shapes: an uploaded draft, and one made in the editor that was test-rendered. */
const T = (id: string, name: string, x: Partial<LetterTemplate> = {}): LetterTemplate => ({ id, letterType: 'relieving', name, legalEntityId: null, language: 'en', source: 'upload', fields: ['employee_name', 'designation', 'joining_date', 'last_working_day', 'pan'], requiresApproval: false, personSigns: false, companyDsc: false, onePerPerson: true, version: 1, status: 'draft', previewViewed: false, createdAt: '2026-10-01T00:00:00Z', ...x });
const PARAS: EditorParagraph[] = [
  { kind: 'normal', runs: [{ text: 'Dear {{employee_name}},' }] },
  { kind: 'normal', runs: [{ text: 'This is to certify that {{employee_name}} worked with {{legal_entity}} as {{designation}} from {{joining_date}} to {{last_working_day}}.' }] },
  { kind: 'normal', runs: [{ text: 'We wish you the very best.' }] },
];
const unknownField = () => Promise.reject(Object.assign(new Error('Unknown placeholders.'), { code: 'TEMPLATE_FIELDS', body: { errors: { emp_nme: 'employee_name' } } }));
const live: LiveLetterTemplates = {
  state: 'ready',
  onRetry: () => {},
  data: {
    templates: [T('t1', 'Relieving and experience'), T('t2', 'Experience certificate', { letterType: 'experience', source: 'editor', previewViewed: true, onePerPerson: false })],
    starters: [{ letterType: 'relieving', name: 'Relieving letter', onePerPerson: true, added: true, update: false }],
    fields: [
      { key: 'employee_name', label: 'Full name', cls: 'internal', flag: false, optional: false },
      { key: 'designation', label: 'Designation', cls: 'internal', flag: false, optional: false },
      { key: 'joining_date', label: 'Joining date', cls: 'internal', flag: false, optional: false },
      { key: 'last_working_day', label: 'Last working day', cls: 'internal', flag: false, optional: false },
      { key: 'pan', label: 'PAN', cls: 'pay', flag: false, optional: false },
      { key: 'probation', label: 'On probation (yes / no)', cls: 'internal', flag: true, optional: false },
    ],
  },
  entities: [],
  people: [{ value: 'p1', label: 'Meera Iyer · KF-0118' }],
  onUpload: unknownField,
  onCompose: async (x) => T('t3', x.name, { source: 'editor', version: 2 }),
  onStarter: async () => T('t4', 'Relieving letter', { source: 'starter' }),
  onParagraphs: async () => PARAS,
  onWord: () => {},
  wordFile: async () => new File(['x'], 'relieving-experience.docx'),
  onTestRender: async () => INCREMENT_LETTER_PDF,
  onStatus: async () => {},
  listHref: '#',
};
const page = () => (
  <ToastProvider>
    <LetterTemplatesList rows={[]} live={live} />
  </ToastProvider>
);
const open =
  (name: string, tab?: string, then?: (body: ReturnType<typeof within>) => Promise<void>): S['play'] =>
  async ({ canvasElement }) => {
    const body = within(canvasElement);
    await userEvent.click(await body.findByText(name));
    if (tab) await userEvent.click(await body.findByRole('tab', { name: tab }));
    if (then) await then(body);
  };
export const Upload: S = {
  name: 'Word upload with validation report',
  render: page,
  play: open('Relieving and experience', undefined, async (body) => {
    const input = (await body.findByText(/Drop|Choose|Browse/i)).closest('.yx-upload')?.querySelector('input[type=file]') as HTMLInputElement;
    await userEvent.upload(input, new File(['x'], 'relieving-experience.docx', { type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' }));
    await body.findByRole('button', { name: 'Use suggestion' });
  }),
};
export const Editor: S = { name: 'In-app editor with merge fields', render: page, play: open('Experience certificate', 'Editor') };
export const Fields: S = { name: 'Field cheat-sheet', render: page, play: open('Relieving and experience', 'Field cheat-sheet') };
export const TestRender: S = { name: 'Test render (activate after viewing)', render: page, play: open('Experience certificate', 'Test render') };
