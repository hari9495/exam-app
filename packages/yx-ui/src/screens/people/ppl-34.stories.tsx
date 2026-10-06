import type { Meta, StoryObj } from '@storybook/react-vite';
import { IdentityPanel, PersonWorkspace } from './record';
import { TODAY } from './people-data';

const meta: Meta = { title: 'Screens/People/PPL-34 · Identity panel', parameters: { layout: 'fullscreen' } };
export default meta;
type S = StoryObj;

export const OnRecord: S = { name: 'On the person record (consented)', render: () => <PersonWorkspace persona="hr" relation="other" today={TODAY} panel="identity" /> };
export const Refused: S = { name: 'Face consent refused (ID check and attestation)', render: () => <PersonWorkspace persona="hr" relation="other" today={TODAY} panel="identity" identityState="refused" /> };
export const Mismatch: S = { name: 'Day-1 mismatch flagged for HR review', render: () => <div className="yx-screen"><IdentityPanel state="mismatch" /></div> };
