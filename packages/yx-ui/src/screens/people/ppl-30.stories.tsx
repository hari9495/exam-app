import type { Meta, StoryObj } from '@storybook/react-vite';
import { MyDocuments, MyDocumentsPhone } from './documents';
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
