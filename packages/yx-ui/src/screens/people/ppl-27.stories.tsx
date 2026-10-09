import type { Meta, StoryObj } from '@storybook/react-vite';
import { DocumentVerificationQueue } from './documents';
import { VERIFY_QUEUE } from './people-data';

const meta: Meta = { title: 'Screens/People/PPL-27 · Document verification queue', parameters: { layout: 'fullscreen' } };
export default meta;
type S = StoryObj;

export const Queue: S = { name: 'HR · queue with automated checks', render: () => <DocumentVerificationQueue rows={VERIFY_QUEUE} /> };
export const Review: S = { name: 'Review drawer (penny drop failed)', render: () => <DocumentVerificationQueue rows={VERIFY_QUEUE} defaultOpenId="v2" /> };
export const Reject: S = { name: 'Reject with reason', render: () => <DocumentVerificationQueue rows={VERIFY_QUEUE} defaultOpenId="v2" rejecting /> };
export const Special: S = { name: 'Special class (Aadhaar) review', render: () => <DocumentVerificationQueue rows={VERIFY_QUEUE} defaultOpenId="v5" /> };
export const Empty: S = { name: '· empty', render: () => <DocumentVerificationQueue rows={[]} /> };
