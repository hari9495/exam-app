import type { Meta, StoryObj } from '@storybook/react-vite';
import { PrivacyCentreScreen } from '../candidate';

const meta: Meta<typeof PrivacyCentreScreen> = { title: 'Screens/Proctoring/PRC-28 · Privacy centre', component: PrivacyCentreScreen, parameters: { layout: 'fullscreen' } };
export default meta;
type S = StoryObj<typeof PrivacyCentreScreen>;

export const Default: S = {};
export const ConfirmErase: S = { name: 'Erase: confirmation', args: { confirmErase: true } };
export const LegalHold: S = { name: 'Erasure blocked by open appeal', args: { legalHold: true } };
export const Requested: S = { name: 'Erasure requested', args: { requested: true } };
