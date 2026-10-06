import type { Meta, StoryObj } from '@storybook/react-vite';
import { RulesBrowserScreen } from './compliance';
import { ADVISORIES, RULE_SETS } from './compliance-data';

const meta: Meta = { title: 'Screens/Compliance/CMP-08 · Statutory rules & updates', parameters: { layout: 'fullscreen' } };
export default meta;
type S = StoryObj;

export const Rules: S = { name: 'Rules browser + updates banner', render: () => <RulesBrowserScreen rules={RULE_SETS} advisories={ADVISORIES} /> };
export const History: S = { name: 'Rule history and source', render: () => <RulesBrowserScreen rules={RULE_SETS} advisories={ADVISORIES} openRuleId="rs1" /> };
export const Updates: S = { name: 'Labour-law updates feed', render: () => <RulesBrowserScreen rules={RULE_SETS} advisories={ADVISORIES} tab="updates" /> };
export const MarkReviewed: S = { name: 'Mark reviewed with note', render: () => <RulesBrowserScreen rules={RULE_SETS} advisories={ADVISORIES} tab="updates" reviewId="adv2" /> };
export const NoUpdates: S = { name: 'No unreviewed updates', render: () => <RulesBrowserScreen rules={RULE_SETS} advisories={ADVISORIES.map((a) => ({ ...a, reviewed: true }))} /> };
