import type { Meta, StoryObj } from '@storybook/react-vite';
import { play, pressFirst } from '../../_kit/story-play';
import { StatutoryRulesScreen } from './setup';
import {
  RULE_SETS,
  SETUP_ENTITIES,
} from './fixtures-5ab';

// Payroll batch 5b on the live app: set-up, pay groups, payslip layout, statutory rules and coverage, imports, the
// component library, salary templates and compensation. The same components the pages render, with Kaveri Foods data.
const meta: Meta = { title: 'Screens/Pay/Live · Set-up and pay structures', parameters: { layout: 'fullscreen' } };
export default meta;
type S = StoryObj;

// ------------------------------------------------------------------ Statutory rules and coverage (read only)
export const Rules: S = { name: 'Statutory rules in force', render: () => <StatutoryRulesScreen state="ready" entities={SETUP_ENTITIES} entityId="le-kfpl" onEntity={() => undefined} rules={RULE_SETS} /> };
export const RulesValues: S = { name: 'Statutory rules · source and values', render: () => <StatutoryRulesScreen state="ready" entities={SETUP_ENTITIES} entityId="le-kfpl" onEntity={() => undefined} rules={RULE_SETS} />, play: play(pressFirst('Source and values')) };
export const RulesEmpty: S = { name: 'Statutory rules · none published', render: () => <StatutoryRulesScreen state="ready" entities={SETUP_ENTITIES} entityId="le-kfpl" onEntity={() => undefined} rules={[]} /> };
export const RulesLoading: S = { name: 'Statutory rules · loading', render: () => <StatutoryRulesScreen state="loading" entities={SETUP_ENTITIES} entityId="le-kfpl" onEntity={() => undefined} rules={null} /> };
export const RulesError: S = { name: 'Statutory rules · could not load', render: () => <StatutoryRulesScreen state="error" onRetry={() => undefined} entities={SETUP_ENTITIES} entityId="le-kfpl" onEntity={() => undefined} rules={null} /> };
