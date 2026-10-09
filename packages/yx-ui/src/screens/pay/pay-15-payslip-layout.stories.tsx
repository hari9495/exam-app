import type { Meta, StoryObj } from '@storybook/react-vite';
import { PayslipLayoutScreen } from './comp-setup';

const meta: Meta<typeof PayslipLayoutScreen> = { title: 'Screens/Pay/PAY-15 · Payslip layout editor', component: PayslipLayoutScreen, parameters: { layout: 'fullscreen' } };
export default meta;
type S = StoryObj<typeof PayslipLayoutScreen>;

export const Draft: S = { name: 'Draft · sample-employee preview' };
export const Bilingual: S = { name: 'Second language on', args: { variant: 'bilingual' } };
export const Published: S = { name: 'Published version', args: { variant: 'published' } };
