import type { Meta, StoryObj } from '@storybook/react-vite';
import { REVIEW_ID } from '../../components/stepper';
import { BulkLetterWizard, IssuedLettersRegister, IssueLetterSheet } from './documents';
import { ISSUED_LETTERS, TODAY } from './people-data';

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
