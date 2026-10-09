import type { Meta, StoryObj } from '@storybook/react-vite';
import { ChangeActionSheet } from './changes';
import { d, TODAY } from './people-data';

const meta: Meta = { title: 'Screens/People/PPL-04 · Change action', parameters: { layout: 'fullscreen' } };
export default meta;
type S = StoryObj;

export const Start: S = { name: 'HR · find a person, changes waiting', render: () => <ChangeActionSheet persona="hr" kind="Promotion" effective={d(2026, 10, 1)} today={TODAY} startOpen={false} /> };
export const Promotion: S = { name: 'HR · promotion with pay change', render: () => <ChangeActionSheet persona="hr" kind="Promotion" effective={d(2026, 10, 1)} today={TODAY} /> };
export const Transfer: S = { name: 'HR · transfer with impact preview (PT state)', render: () => <ChangeActionSheet persona="hr" kind="Transfer" effective={d(2026, 10, 5)} today={TODAY} /> };
export const InterEntity: S = { name: 'HR · inter-entity transfer options', render: () => <ChangeActionSheet persona="hr" kind="Inter-entity transfer" effective={d(2026, 10, 5)} today={TODAY} /> };
export const Retro: S = { name: 'HR · correction into processed payroll', render: () => <ChangeActionSheet persona="hr" kind="Promotion" effective={d(2026, 8, 1)} today={TODAY} payrollProcessedTo={d(2026, 9, 30)} /> };
export const Manager: S = { name: 'Manager · promotion without salary grant', render: () => <ChangeActionSheet persona="mgr" kind="Promotion" effective={d(2026, 10, 1)} today={TODAY} /> };
