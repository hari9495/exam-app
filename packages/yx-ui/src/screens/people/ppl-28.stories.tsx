import type { Meta, StoryObj } from '@storybook/react-vite';
import { userEvent, within } from 'storybook/test';
import { ToastProvider } from '../../components/notify';
import { REVIEW_ID } from '../../components/stepper';
import { BulkLetterWizard, IssuedLettersRegister, IssueLetterSheet } from './documents';
import { INCREMENT_LETTER_PDF, ISSUED_LETTERS, TODAY } from './people-data';
import type { Letter, LetterTemplate } from './live/types';

const meta: Meta = { title: 'Screens/People/PPL-28 · Issue letters', parameters: { layout: 'fullscreen' } };
export default meta;
type S = StoryObj;

export const Issue: S = { name: 'Issue letter · preview with real data', render: () => <IssueLetterSheet today={TODAY} /> };
export const Approval: S = { name: 'Issue letter · approval before issue', render: () => <IssueLetterSheet today={TODAY} pendingApproval /> };
export const Missing: S = { name: 'Issue letter · missing fields block generation', render: () => <IssueLetterSheet today={TODAY} missing /> };
export const Bulk: S = { name: 'Bulk issue · preview with failures', render: () => <BulkLetterWizard current="preview" /> };
export const BulkConfirm: S = { name: 'Bulk issue · typed confirmation', render: () => <BulkLetterWizard current={REVIEW_ID} confirmOpen /> };
export const Register: S = { name: 'Issued letters register (superseded, held)', render: () => <IssuedLettersRegister rows={ISSUED_LETTERS} /> };
export const Empty: S = { name: '· register empty', render: () => <IssuedLettersRegister rows={[]} /> };

/** The live sheet with the API's shapes: two templates, one needing approval; HR opened it from Arjun's record. */
const T = (id: string, letterType: string, name: string, requiresApproval: boolean): LetterTemplate => ({ id, letterType, name, legalEntityId: null, language: 'en', source: 'starter', fields: [], requiresApproval, personSigns: false, companyDsc: false, onePerPerson: false, version: 2, status: 'active', previewViewed: true, createdAt: '2026-09-01T00:00:00Z' });
const liveIssue = (onPreview: () => Promise<string>) => ({
  state: 'ready' as const,
  onRetry: () => {},
  rows: [],
  verifyUrl: (code: string) => `https://verify.example/${code}`,
  onDownload: () => {},
  issue: {
    templates: [T('t1', 'promotion', 'Promotion with pay change', true), T('t2', 'experience', 'Experience letter', false)],
    people: [{ value: 'p1', label: 'Arjun Kulkarni · KF-0142', legalEntityId: 'kf' }],
    approverFor: () => 'Lakshmi Venkatesan',
    onPreview,
    onIssue: async () => {},
    onBulk: () => {},
    person: 'p1',
  },
});
const pickType =
  (label: string): S['play'] =>
  async ({ canvasElement }) => {
    const body = within(canvasElement.ownerDocument.body);
    await userEvent.click(await body.findByRole('combobox', { name: 'Letter type' }));
    await userEvent.click(await body.findByRole('option', { name: label }));
  };
const missingFields = () => Promise.reject(Object.assign(new Error('This letter cannot be made yet.'), { code: 'LETTER_FIELDS_MISSING', body: { errors: { new_ctc: 'Annual CTC after the raise', effective_date: 'Raise effective from' } } }));
export const LiveIssue: S = { name: 'Live · issue letter · preview with real data', render: () => <ToastProvider><IssuedLettersRegister rows={[]} live={liveIssue(async () => INCREMENT_LETTER_PDF)} /></ToastProvider>, play: pickType('Experience letter') };
export const LiveApproval: S = { name: 'Live · issue letter · approval before issue', render: () => <ToastProvider><IssuedLettersRegister rows={[]} live={liveIssue(async () => INCREMENT_LETTER_PDF)} /></ToastProvider>, play: pickType('Promotion with pay change (approval required)') };
export const LiveMissing: S = { name: 'Live · issue letter · missing fields block generation', render: () => <ToastProvider><IssuedLettersRegister rows={[]} live={liveIssue(missingFields)} /></ToastProvider>, play: pickType('Promotion with pay change (approval required)') };

/** The live bulk issue with the API's shapes: four people chosen in the directory, two that can't get the letter. */
const liveBulk = {
  state: 'ready' as const,
  onRetry: () => {},
  templates: [T('t3', 'increment', 'Increment letter', false)],
  people: [{ value: 'p1', label: 'Arjun Kulkarni · KF-0142' }],
  picked: ['p1', 'p2', 'p3', 'p4'],
  letterType: 'increment',
  onCheck: async () => ({ letterType: 'increment', rows: [{ personId: 'p1', name: 'Arjun Kulkarni', ready: true, reason: null }, { personId: 'p2', name: 'Meera Pillai', ready: true, reason: null }, { personId: 'p3', name: 'Thomas George', ready: false, reason: 'This letter cannot be made yet. Missing: annual CTC after the raise.' }, { personId: 'p4', name: 'Aisha Khan', ready: false, reason: 'A letter of this type for this person is already on its way.' }] }),
  onPreview: async () => INCREMENT_LETTER_PDF,
  onIssue: async () => {},
};
const continueTo =
  (times: number): S['play'] =>
  async ({ canvasElement }) => {
    const body = within(canvasElement.ownerDocument.body);
    for (let i = 0; i < times; i++) await userEvent.click(await body.findByRole('button', { name: 'Continue' }));
  };
export const LiveBulk: S = { name: 'Live · bulk issue · preview with failures', render: () => <ToastProvider><BulkLetterWizard live={liveBulk} /></ToastProvider>, play: continueTo(2) };
export const LiveBulkConfirm: S = {
  name: 'Live · bulk issue · typed confirmation',
  render: () => <ToastProvider><BulkLetterWizard live={liveBulk} /></ToastProvider>,
  play: async (ctx) => {
    await continueTo(3)!(ctx);
    await userEvent.click(await within(ctx.canvasElement.ownerDocument.body).findByRole('button', { name: 'Issue 2 letters' }));
  },
};

/** PPL-15 / PPL-28 live: a drafted withdrawal letter to review, one discarded, and one that couldn't be made. */
const L = (over: Partial<Letter>): Letter => ({ id: 'l1', title: 'Experience letter: Arjun Kulkarni', letterType: 'experience', personId: 'p1', person: 'Arjun Kulkarni', referenceNo: 'KFPL/EXP/2026/000014', verifyCode: 'Q7K2M9', status: 'issued', renderError: null, issuedAt: '2026-10-20T09:30:00Z', personSigns: false, acceptedAt: null, signature: null, supersededById: null, ...over });
const DRAFT_ROWS: Letter[] = [
  L({}),
  L({ id: 'l2', title: 'Offer withdrawal letter: Tarun Sample', letterType: 'offer_withdrawal', personId: 'p2', person: 'Tarun Sample', referenceNo: null, verifyCode: null, status: 'draft', issuedAt: null }),
  L({ id: 'l3', title: 'Offer withdrawal letter: Ilango Sample', letterType: 'offer_withdrawal', personId: 'p3', person: 'Ilango Sample', referenceNo: null, verifyCode: null, status: 'discarded', issuedAt: null }),
  L({ id: 'l4', title: 'Offer withdrawal letter: Malar Sample', letterType: 'offer_withdrawal', personId: 'p4', person: 'Malar Sample', referenceNo: 'KFPL-TN/OWD/2026/000001', verifyCode: null, status: 'rendering', renderError: 'The letter template file is missing from storage. Upload the template again in Settings › Letter templates, then try again.', issuedAt: null }),
];
const liveDrafts = { state: 'ready' as const, onRetry: () => {}, rows: DRAFT_ROWS, verifyUrl: (code: string) => `https://verify.example/${code}`, onDownload: () => {}, draft: { onPreview: async () => INCREMENT_LETTER_PDF, onIssue: async () => {}, onDiscard: async () => {} }, onRetryRender: async () => {} };
const rowMenu =
  (who: RegExp, item?: string, after?: (body: ReturnType<typeof within>) => Promise<void>): S['play'] =>
  async ({ canvasElement }) => {
    const body = within(canvasElement.ownerDocument.body);
    await userEvent.click(within(await body.findByRole('row', { name: who })).getByRole('button', { name: /More actions/ }));
    if (!item) return;
    await userEvent.click(await body.findByRole('menuitem', { name: item }));
    if (after) await after(body);
  };
export const LiveDrafts: S = { name: 'Live · a draft to review, a discarded draft, a letter that couldn’t be made', render: () => <ToastProvider><IssuedLettersRegister rows={[]} live={liveDrafts} /></ToastProvider> };
export const LiveDraftMenu: S = { name: 'Live · draft row menu: Review and issue, Discard draft', render: () => <ToastProvider><IssuedLettersRegister rows={[]} live={liveDrafts} /></ToastProvider>, play: rowMenu(/Tarun Sample/) };
export const LiveReview: S = { name: 'Live · review a drafted letter, then issue', render: () => <ToastProvider><IssuedLettersRegister rows={[]} live={{ ...liveDrafts, rows: [DRAFT_ROWS[1]] }} /></ToastProvider>, play: rowMenu(/Offer withdrawal letter/, 'Review and issue') };
export const LiveDiscardError: S = {
  name: 'Live · discard a draft · reason missing',
  render: () => <ToastProvider><IssuedLettersRegister rows={[]} live={{ ...liveDrafts, rows: [DRAFT_ROWS[1]] }} /></ToastProvider>,
  play: rowMenu(/Offer withdrawal letter/, 'Discard draft', async (body) => {
    const dialog = within(await body.findByRole('dialog', { name: 'Discard this draft?' }));
    await userEvent.click(dialog.getByRole('button', { name: 'Discard draft' }));
  }),
};
export const LiveCouldNotMake: S = { name: 'Live · couldn’t be made: the reason, and Try again', render: () => <ToastProvider><IssuedLettersRegister rows={[]} live={{ ...liveDrafts, rows: [DRAFT_ROWS[3]] }} /></ToastProvider>, play: rowMenu(/KFPL-TN\/OWD\/2026\/000001/) };
