import type { Meta, StoryObj } from '@storybook/react-vite';
import { PostComposerScreen } from './engage-feed';
import { BLOCKED, SPACES } from './engage-data';

const meta: Meta = { title: 'Screens/Engage/ENG-02 · Post composer', parameters: { layout: 'fullscreen' } };
export default meta;
type S = StoryObj;
const PHONE = { viewport: { value: 'mobile2', isRotated: false } };

export const Update: S = { name: 'Update', render: () => <PostComposerScreen spaces={SPACES} defaultSpace="quality" defaultText="Line 3 passed its FSSAI audit today with zero findings. Thank you, everyone." blockedWords={BLOCKED} /> };
export const Poll: S = { name: 'Poll', render: () => <PostComposerScreen kind="Poll" spaces={SPACES} defaultSpace="chennai" defaultText="What should we serve on 20 Oct?" blockedWords={BLOCKED} /> };
export const Event: S = { name: 'Event', render: () => <PostComposerScreen kind="Event" spaces={SPACES} defaultSpace="cricket" defaultText="Inter-plant tennis-ball tournament" blockedWords={BLOCKED} /> };
export const CompanySpace: S = { name: 'Company-wide space (needs approval)', render: () => <PostComposerScreen spaces={SPACES} defaultSpace="co" defaultText="Our Diwali gift boxes are ready for pickup at reception." blockedWords={BLOCKED} /> };
export const BlockedWord: S = { name: 'Blocked word warning', render: () => <PostComposerScreen spaces={SPACES} defaultSpace="chennai" defaultText="The new parking rule is a scam." blockedWords={BLOCKED} /> };
export const Phone: S = { name: 'Phone', globals: PHONE, render: () => <PostComposerScreen device="phone" kind="Poll" spaces={SPACES} defaultSpace="chennai" defaultText="What should we serve on 20 Oct?" blockedWords={BLOCKED} /> };
