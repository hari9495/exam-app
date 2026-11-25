import type { Meta, StoryObj } from '@storybook/react-vite';
import { play, pressFirst } from '../_kit/story-play';
import { MyPayDocumentsScreen, NomineeDrawer } from './employee-pay';

// PAY-54 · My pay documents (founder decision 12: the accepted "Me · Pay documents" story, now a design in My pay) and
// the nominee drawer HR uses on Payroll › Pay documents.
const meta: Meta<typeof MyPayDocumentsScreen> = { title: 'Screens/Pay/PAY-54 · My pay documents', component: MyPayDocumentsScreen, render: (args) => <MyPayDocumentsScreen {...args} />, parameters: { layout: 'fullscreen' } };
export default meta;
type S = StoryObj<typeof MyPayDocumentsScreen>;

const people = async () => [
  { id: 'e1', name: 'Arjun Kulkarni', employeeCode: 'KF-0142' },
  { id: 'e2', name: 'Divya Raghunathan', employeeCode: 'KF-0007' },
];

export const Documents: S = { name: 'Current and superseded' };
export const Purged: S = { name: 'One deleted after its retention period', args: { variant: 'purged' } };
export const DownloadFailed: S = { name: 'Download refused', args: { variant: 'download-failed' }, play: play(pressFirst(/^Download/)) };
export const Empty: S = { name: 'Empty · none yet', args: { variant: 'empty' } };
export const Loading: S = { name: 'Loading', args: { state: 'loading' } };
export const LoadError: S = { name: 'Error · retry', args: { state: 'error' } };
export const NoAccess: S = { name: 'No access', args: { state: 'no-access' } };
export const Nominee: S = { name: 'Add a nominee (HR)', render: () => <NomineeDrawer onSearch={people} onClose={() => undefined} onSave={async () => undefined} /> };
