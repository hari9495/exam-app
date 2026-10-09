import type { Meta, StoryObj } from '@storybook/react-vite';
import { RecruitingCostsScreen } from './hiring-plan';
import { COSTS } from './hiring-data';

const meta: Meta = { title: 'Screens/Hiring/HIR-11 · Recruiting costs entry', parameters: { layout: 'fullscreen' } };
export default meta;
type S = StoryObj;

export const Default: S = { name: 'Costs by type with cost per hire', render: () => <RecruitingCostsScreen rows={COSTS} hires={11} /> };
export const AddCost: S = { name: 'Add cost sheet', render: () => <RecruitingCostsScreen rows={COSTS} hires={11} addOpen /> };
export const Empty: S = { name: 'Empty', render: () => <RecruitingCostsScreen rows={[]} hires={0} /> };
export const Loading: S = { name: 'Loading', render: () => <RecruitingCostsScreen rows={[]} hires={0} state="loading" /> };
export const Error: S = { name: 'Error', render: () => <RecruitingCostsScreen rows={[]} hires={0} state="error" /> };
