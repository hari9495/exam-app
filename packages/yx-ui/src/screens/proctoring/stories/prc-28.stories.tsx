import type { Meta, StoryObj } from '@storybook/react-vite';
import { PrivacyCentreScreen } from '../candidate';

const meta: Meta<typeof PrivacyCentreScreen> = { title: 'Screens/Proctoring/PRC-28 · Privacy centre', component: PrivacyCentreScreen, parameters: { layout: 'fullscreen' } };
export default meta;
type S = StoryObj<typeof PrivacyCentreScreen>;

export const Default: S = {};
export const ConfirmErase: S = { name: 'Erase: confirmation', args: { confirmErase: true } };
export const LegalHold: S = { name: 'Erasure blocked by open appeal', args: { legalHold: true } };
export const Requested: S = { name: 'Erasure requested', args: { requested: true } };

// AS-5 part 3: the candidate's own data at a company; erasure waits while a review or appeal holds it.
export const LivePrivacy: S = {
  name: 'Live · my data',
  args: {
    live: {
      state: 'ready',
      onRetry: () => {},
      company: 'Kaveri Foods',
      consents: [
        { what: 'Camera, screen and activity monitoring', test: 'Java Backend Developer · L2', on: '17 Nov 2026' },
        { what: 'Face check (biometric)', test: 'Java Backend Developer · L2', on: '17 Nov 2026' },
      ],
      recordings: { frames: 12, deleteOn: '17 Dec 2026' },
      face: { kept: true, deleteOn: '17 Dec 2026' },
      held: false,
      request: null,
      onErase: async () => undefined,
      onDownload: async () => undefined,
    },
  },
};
