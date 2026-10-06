import type { Meta, StoryObj } from '@storybook/react-vite';
import { TemplateBuilderScreen } from './comp-setup';

const meta: Meta<typeof TemplateBuilderScreen> = { title: 'Screens/Pay/PAY-13 · Template builder', component: TemplateBuilderScreen, parameters: { layout: 'fullscreen' } };
export default meta;
type S = StoryObj<typeof TemplateBuilderScreen>;

export const Default: S = { name: 'Formula editor · live test employee' };
export const Autocomplete: S = { name: 'Autocomplete open', args: { variant: 'autocomplete' } };
export const Cycle: S = { name: 'Validation error · circular formula', args: { variant: 'cycle' } };
export const AddBack: S = { name: 'Code wage add-back flagged', args: { variant: 'add-back' } };
export const Published: S = { name: 'Published new version', args: { variant: 'saved' } };
