import type { Meta, StoryObj } from '@storybook/react-vite';
import { CompensationScreen } from './comp-setup';

const meta: Meta<typeof CompensationScreen> = {
  title: 'Screens/Pay/PAY-42 · Suggest split',
  component: CompensationScreen,
  parameters: { layout: 'fullscreen' },
  args: { variant: 'split' },
};
export default meta;
type S = StoryObj<typeof CompensationScreen>;

export const Options: S = { name: 'Options side by side · one not offered' };
export const Stale: S = { name: 'Stale after a law change', args: { variant: 'split-stale' } };
export const Chosen: S = { name: 'Option chosen (HR)', args: { persona: 'hr', splitChosen: 'c' } };
