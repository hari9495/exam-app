import type { Meta, StoryObj } from '@storybook/react-vite';
import { COVERAGE, CoverageMonitorPanel } from './payroll-run';
import { PayFrame } from './pay-kit';

const meta: Meta<typeof CoverageMonitorPanel> = {
  title: 'Screens/Pay/PAY-30 · Coverage monitor',
  component: CoverageMonitorPanel,
  parameters: { layout: 'fullscreen' },
  decorators: [
    (Story) => (
      <PayFrame page="runs">
        <Story />
      </PayFrame>
    ),
  ],
};
export default meta;
type S = StoryObj<typeof CoverageMonitorPanel>;

export const Crossed: S = { name: 'Threshold crossed · blocks approval' };
export const Approaching: S = { name: 'Approaching only', args: { rows: COVERAGE.filter((c) => !c.status.startsWith('Crossed')) } };
export const Empty: S = { name: 'Empty · nothing near a threshold', args: { state: 'empty' } };
export const Loading: S = { name: 'Loading', args: { state: 'loading' } };
