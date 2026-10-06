import type { Meta, StoryObj } from '@storybook/react-vite';
import { MappingRulesScreen } from './projects-billing';
import { LAST_WEEK_ITEMS, MAPPING_RULES } from './projects-data';

const meta: Meta = { title: 'Screens/Projects/PRJ-08 · Timesheet mapping rules', parameters: { layout: 'fullscreen' } };
export default meta;
type S = StoryObj;

export const Rules: S = { name: 'HR · rules by priority', render: () => <MappingRulesScreen rules={MAPPING_RULES} items={LAST_WEEK_ITEMS} /> };
export const Tested: S = { name: 'Test against last week', render: () => <MappingRulesScreen rules={MAPPING_RULES} items={LAST_WEEK_ITEMS} tested /> };
export const Edit: S = { name: 'Edit rule', render: () => <MappingRulesScreen rules={MAPPING_RULES} items={LAST_WEEK_ITEMS} editOpen /> };
export const PrefillOff: S = { name: 'Pre-fill switched off', render: () => <MappingRulesScreen rules={MAPPING_RULES} items={LAST_WEEK_ITEMS} prefillOn={false} /> };
export const Empty: S = { name: 'Empty · no rules', render: () => <MappingRulesScreen rules={[]} items={LAST_WEEK_ITEMS} /> };
