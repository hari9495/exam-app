import type { Meta, StoryObj } from '@storybook/react-vite';
import { ActuarialScreen } from './offcycle';

const meta: Meta<typeof ActuarialScreen> = { title: 'Screens/Pay/PAY-38 · Actuarial census and valuation', component: ActuarialScreen, parameters: { layout: 'fullscreen' } };
export default meta;
type S = StoryObj<typeof ActuarialScreen>;

export const Census: S = { name: 'Census versions' };
export const Upload: S = { name: 'Valuation upload · figures to enter', args: { step: 'valuation' } };
export const Uploaded: S = { name: 'Valuation uploaded', args: { step: 'valuation', uploaded: true } };
export const Posting: S = { name: 'Provision posting', args: { step: 'post', uploaded: true } };
export const JournalPreview: S = { name: 'Provision posting · journal preview', args: { step: 'post', uploaded: true, journalOpen: true } };
export const Posted: S = { name: 'Journal posted', args: { step: 'post', uploaded: true, posted: true } };
