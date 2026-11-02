import type { Meta, StoryObj } from '@storybook/react-vite';
import { CompetencyFrameworkScreen } from './perf-people';
import { COMPETENCIES } from './perf-data-2';

const meta: Meta = { title: 'Screens/Performance/PRF-14 · Competency framework', parameters: { layout: 'fullscreen' } };
export default meta;
type S = StoryObj;

export const Default: S = { name: 'Competency with levels and roles', render: () => <CompetencyFrameworkScreen items={COMPETENCIES} /> };
export const StarterItem: S = { name: 'Starter template item', render: () => <CompetencyFrameworkScreen items={COMPETENCIES} openId="k2" /> };
export const RetireInUse: S = { name: 'Retire (in use, cannot delete)', render: () => <CompetencyFrameworkScreen items={COMPETENCIES} openId="k3" retireOpen /> };
export const AddCompetency: S = { name: 'Add competency', render: () => <CompetencyFrameworkScreen items={COMPETENCIES} addOpen /> };
export const MapRole: S = { name: 'Map a role to a level', render: () => <CompetencyFrameworkScreen items={COMPETENCIES} mapOpen /> };
export const MergeInto: S = { name: 'Merge into another competency', render: () => <CompetencyFrameworkScreen items={COMPETENCIES} openId="k3" mergeOpen /> };
export const Empty: S = { render: () => <CompetencyFrameworkScreen items={[]} /> };
