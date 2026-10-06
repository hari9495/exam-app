import type { Meta, StoryObj } from '@storybook/react-vite';
import { AssignmentRulesScreen } from './learn-admin';
import { RULES } from './learn-data';

const meta: Meta = { title: 'Screens/Learning/LRN-07 · Assignment rules', parameters: { layout: 'fullscreen' } };
export default meta;
type S = StoryObj;

export const List: S = { name: 'Rules list', render: () => <AssignmentRulesScreen rules={RULES} /> };
export const Editor: S = { name: 'Rule editor with preview', render: () => <AssignmentRulesScreen rules={RULES} openId="r2" /> };
export const Empty: S = { render: () => <AssignmentRulesScreen rules={[]} /> };
