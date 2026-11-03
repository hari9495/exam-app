import type { Meta, StoryObj } from '@storybook/react-vite';
import { PerfNoAccessScreen } from './perf-access';

const meta: Meta = { title: 'Screens/Performance/No access', parameters: { layout: 'fullscreen' } };
export default meta;
type S = StoryObj;

export const Disputes: S = { name: 'Rating disputes · no access', render: () => <PerfNoAccessScreen title="Rating disputes" what="rating disputes" grantedBy="your System Admin" active="Reviews & cycles" /> };
export const Competencies: S = { name: 'Competency framework · no access', render: () => <PerfNoAccessScreen title="Competency framework" what="the competency framework" grantedBy="your System Admin" active="Skills & competencies" /> };
