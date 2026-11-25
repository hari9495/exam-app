import type { Meta, StoryObj } from '@storybook/react-vite';
import { CompanyDocumentsScreen, SAMPLE_DOCS } from './company-docs';

const meta: Meta = { title: 'Screens/People/PPL-51 · Company documents', parameters: { layout: 'fullscreen' } };
export default meta;
type S = StoryObj;

export const Manager: S = { name: 'Document manager · folders with expiry', render: () => <CompanyDocumentsScreen sample={SAMPLE_DOCS} /> };
export const Employee: S = { name: 'Employee · read and download', render: () => <CompanyDocumentsScreen sample={{ ...SAMPLE_DOCS, canManage: false, folders: SAMPLE_DOCS.folders.filter((f) => f.audience === 'everyone') }} /> };
export const Empty: S = { name: 'No folders yet', render: () => <CompanyDocumentsScreen sample={{ ...SAMPLE_DOCS, folders: [], folderId: null, documents: [] }} /> };
export const Loading: S = { render: () => <CompanyDocumentsScreen state="loading" sample={undefined} /> };
