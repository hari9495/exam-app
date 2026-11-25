import type { Meta, StoryObj } from '@storybook/react-vite';
import { userEvent, within } from 'storybook/test';
import { ToastProvider } from '../../components/notify';
import { MyDocuments, MyDocumentsPhone, type LiveMyDocuments } from './documents';
import type { QueueDocument } from './live/types';
import { MY_DOCS } from './people-data';

const meta: Meta = { title: 'Screens/People/PPL-30 · My documents and letters', parameters: { layout: 'fullscreen' } };
export default meta;
type S = StoryObj;
const phone = { globals: { viewport: { value: 'mobile2', isRotated: false } } };

export const Desktop: S = { name: 'Employee · documents and letters', render: () => <MyDocuments rows={MY_DOCS} /> };
export const Share: S = { name: 'Share an expiring link', render: () => <MyDocuments rows={MY_DOCS} shareOpen /> };
export const Empty: S = { name: '· empty', render: () => <MyDocuments rows={[]} /> };
export const Phone: S = { name: '· phone', ...phone, render: () => <MyDocumentsPhone rows={MY_DOCS} /> };
export const Camera: S = { name: '· phone, camera upload', ...phone, render: () => <MyDocumentsPhone rows={MY_DOCS} cameraOpen /> };
export const PhoneEmpty: S = { name: '· phone, empty', ...phone, render: () => <MyDocumentsPhone rows={[]} /> };

/** Upload, as the app has it: from the page (choose the type) and from a row's menu (the type is fixed, read as text). */
const doc = (id: string, typeKey: string, typeName: string): QueueDocument => ({ id, personId: 'p', typeKey, typeName, sensitivity: 'personal', status: 'verified', expiresOn: null, rejectReason: null, file: { name: `${typeKey}.pdf`, scanStatus: 'clean', size: 214_000 }, uploadedAt: '2026-03-10T05:00:00Z', version: 1 }) as QueueDocument;
const none = async () => {};
const uploads: LiveMyDocuments = {
  state: 'ready',
  onRetry: () => {},
  uploads: [doc('u1', 'forklift_licence', 'Forklift licence'), doc('u2', 'education', 'Degree certificate')],
  letters: [],
  pay: [],
  esignAccepted: true,
  uploadTypes: [{ key: 'forklift_licence', name: 'Forklift licence', expiryTracked: true }, { key: 'education', name: 'Degree certificate', expiryTracked: false }],
  shares: [],
  onDownload: none,
  onUpload: none,
  certificateHref: '#',
  onShare: async () => '#',
  onStopSharing: none,
  onSignCode: none,
  onSign: none,
  verifyUrl: () => '#',
};
const page = () => <ToastProvider><MyDocuments rows={[]} live={uploads} /></ToastProvider>;
export const UploadNew: S = {
  name: 'Upload a document · nothing chosen yet, Upload pressed',
  render: page,
  play: async ({ canvasElement }) => {
    await userEvent.click(await within(canvasElement).findByRole('button', { name: 'Upload' }));
    const body = within(canvasElement.ownerDocument.body);
    await userEvent.click(within(await body.findByRole('dialog')).getByRole('button', { name: 'Upload' }));
  },
};
export const UploadVersion: S = {
  name: 'Upload a new version from a row (type fixed)',
  render: page,
  play: async ({ canvasElement }) => {
    const body = within(canvasElement.ownerDocument.body);
    await userEvent.click(within(await within(canvasElement).findByRole('row', { name: /Forklift licence/ })).getByRole('button', { name: /More actions/ }));
    await userEvent.click(await body.findByRole('menuitem', { name: 'Upload a new version' }));
  },
};
