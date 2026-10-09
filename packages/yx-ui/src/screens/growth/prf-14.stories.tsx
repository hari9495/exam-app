import type { Meta, StoryObj } from '@storybook/react-vite';
import { CompetencyFrameworkScreen } from './perf-people';
import { COMPETENCIES } from './perf-data-2';

const meta: Meta = { title: 'Screens/Performance/PRF-14 · Competency framework', parameters: { layout: 'fullscreen' } };
export default meta;
type S = StoryObj;

export const Default: S = { name: 'Competency with levels and roles', render: () => <CompetencyFrameworkScreen items={COMPETENCIES} /> };
export const StarterItem: S = { name: 'Starter template item', render: () => <CompetencyFrameworkScreen items={COMPETENCIES} openId="k2" /> };
export const RetireInUse: S = { name: 'Retire (in use, cannot delete)', render: () => <CompetencyFrameworkScreen items={COMPETENCIES} openId="k3" retireOpen /> };
export const Empty: S = { render: () => <CompetencyFrameworkScreen items={[]} /> };
