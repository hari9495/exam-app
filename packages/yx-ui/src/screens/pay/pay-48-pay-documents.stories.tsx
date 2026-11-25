import type { Meta, StoryObj } from '@storybook/react-vite';
import { fails, play, press, pressFirst } from '../_kit/story-play';
import { PayDocumentsScreen, SAMPLE_DOCUMENTS } from './payroll-records';

// PAY-48 · Pay documents (founder decision 3, 29 Oct 2026): documents as issued with reference, SHA-256 and verify
// code; a correction supersedes, never changes; HR adds a nominee who reads them in the pay portal.
const meta: Meta<typeof PayDocumentsScreen> = { title: 'Screens/Pay/PAY-48 · Pay documents', component: PayDocumentsScreen, parameters: { layout: 'fullscreen' } };
export default meta;
type S = StoryObj<typeof PayDocumentsScreen>;

export const Ready: S = { name: 'Issued, superseded, awaiting signature, purged' };
export const OneEntity: S = { name: 'Filtered to one legal entity', args: { entityId: 'le-tn', data: { ...SAMPLE_DOCUMENTS, documents: SAMPLE_DOCUMENTS.documents.filter((x) => x.legalEntityId === 'le-tn') } } };
export const ReadOnly: S = { name: 'Cannot add a nominee', args: { canAddNominee: false } };
export const DownloadRefused: S = { name: 'Download refused', args: { onDownload: fails('This document was purged under the retention policy.') }, play: play(pressFirst('Download PDF')) };
export const Nominee: S = { name: 'Add a nominee (drawer)', args: { open: 'nominee' } };
export const NomineeMissing: S = { name: 'Add a nominee · pressed with nothing filled', args: { open: 'nominee' }, play: play(press('Add nominee')) };
export const Empty: S = { name: 'Empty · no documents yet', args: { data: { ...SAMPLE_DOCUMENTS, documents: [] } } };
export const Loading: S = { name: 'Loading', args: { state: 'loading', data: null } };
export const LoadError: S = { name: 'Error', args: { state: 'error', data: null } };
export const NoAccess: S = { name: 'No access', args: { state: 'no-access', data: null } };
