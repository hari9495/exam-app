import type { Meta, StoryObj } from '@storybook/react-vite';
import { userEvent, within } from 'storybook/test';
import { ToastProvider } from '../../components/notify';
import { REVIEW_ID } from '../../components/stepper';
import { BulkLetterWizard, IssuedLettersRegister, IssueLetterSheet } from './documents';
import { INCREMENT_LETTER_PDF, ISSUED_LETTERS, TODAY } from './people-data';
import type { LetterTemplate } from './live/types';

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
const T = (id: string, letterType: string, name: string, requiresApproval: boolean): LetterTemplate => ({ id, letterType, name, legalEntityId: null, language: 'en', source: 'starter', fields: [], requiresApproval, personSigns: false, companyDsc: false, version: 2, status: 'active', previewViewed: true, createdAt: '2026-09-01T00:00:00Z' });
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
