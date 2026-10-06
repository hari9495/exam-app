import type { Meta, StoryObj } from '@storybook/react-vite';
import { PayslipViewerScreen } from './employee-pay';

const meta: Meta<typeof PayslipViewerScreen> = {
  title: 'Screens/Pay/PAY-40 · Why is my pay different',
  component: PayslipViewerScreen,
  parameters: { layout: 'fullscreen' },
  args: { variant: 'why' },
};
export default meta;
type S = StoryObj<typeof PayslipViewerScreen>;
const phone = { globals: { viewport: { value: 'mobile2', isRotated: false } } };

export const Explained: S = { name: 'Every change explained' };
export const NotExplained: S = { name: 'Not explained row · raise payslip query', args: { variant: 'why-unexplained' } };
export const Chat: S = { name: 'Chat panel (wave 5, own payslip only)', args: { variant: 'why-chat' } };
export const Same: S = { name: 'No change from last month', args: { variant: 'why-same' } };
export const Phone: S = { name: 'phone', args: { layout: 'phone' }, ...phone };
export const PhoneUnexplained: S = { name: 'phone · not explained', args: { layout: 'phone', variant: 'why-unexplained' }, ...phone };
