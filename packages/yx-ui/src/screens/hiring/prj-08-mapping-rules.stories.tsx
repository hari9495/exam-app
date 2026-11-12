import type { Meta, StoryObj } from '@storybook/react-vite';
import { MappingRulesScreen, type LiveMappingRules } from './projects-billing';
import { LIVE_MAPPING_DATA, LIVE_MAPPING_TEST } from './mapping-live';
import { LAST_WEEK_ITEMS, MAPPING_RULES } from './projects-data';

const meta: Meta = { title: 'Screens/Projects/PRJ-08 · Timesheet mapping rules', parameters: { layout: 'fullscreen' } };
export default meta;
type S = StoryObj;

export const Rules: S = { name: 'HR · rules by priority', render: () => <MappingRulesScreen rules={MAPPING_RULES} items={LAST_WEEK_ITEMS} /> };
export const Tested: S = { name: 'Test against last week', render: () => <MappingRulesScreen rules={MAPPING_RULES} items={LAST_WEEK_ITEMS} tested /> };
export const Edit: S = { name: 'Edit rule', render: () => <MappingRulesScreen rules={MAPPING_RULES} items={LAST_WEEK_ITEMS} editOpen /> };
export const PrefillOff: S = { name: 'Pre-fill switched off', render: () => <MappingRulesScreen rules={MAPPING_RULES} items={LAST_WEEK_ITEMS} prefillOn={false} /> };
export const Empty: S = { name: 'Empty · no rules', render: () => <MappingRulesScreen rules={[]} items={LAST_WEEK_ITEMS} /> };

// Projects P-3 (answers 1409, 1410): the live states.
const ok = async () => undefined;
const live = (over: Partial<LiveMappingRules> = {}): LiveMappingRules => ({ state: 'ready', data: LIVE_MAPPING_DATA, onSwitchPrefill: ok, onSave: ok, onRemove: ok, onTest: async () => LIVE_MAPPING_TEST, ...over });
export const LiveRules: S = { name: 'Live · rules by priority (one not applying)', render: () => <MappingRulesScreen live={live()} /> };
export const LiveTested: S = { name: 'Live · tested against my last week', render: () => <MappingRulesScreen live={live({ defaultTest: LIVE_MAPPING_TEST })} /> };
export const LiveNotConnected: S = { name: 'Live · test with no tools connected', render: () => <MappingRulesScreen live={live({ defaultTest: { ...LIVE_MAPPING_TEST, connected: false, items: [] } })} /> };
export const LiveAdd: S = { name: 'Live · add rule drawer', render: () => <MappingRulesScreen live={live({ defaultEdit: 'new' })} /> };
export const LiveEdit: S = { name: 'Live · change rule drawer', render: () => <MappingRulesScreen live={live({ defaultEdit: 'r1' })} /> };
export const LivePrefillOff: S = { name: 'Live · pre-fill off (System Admin)', render: () => <MappingRulesScreen live={live({ data: { ...LIVE_MAPPING_DATA, prefillOn: false } })} /> };
export const LiveManager: S = { name: 'Live · Projects manager (pre-fill read-only)', render: () => <MappingRulesScreen live={live({ data: { ...LIVE_MAPPING_DATA, canSwitchPrefill: false } })} /> };
export const LiveEmpty: S = { name: 'Live · no rules yet', render: () => <MappingRulesScreen live={live({ data: { ...LIVE_MAPPING_DATA, rules: [] } })} /> };
export const LiveNoAccess: S = { name: 'Live · no access or Projects off', render: () => <MappingRulesScreen live={live({ state: 'no-access', data: null })} /> };
export const LiveError: S = { name: 'Live · error', render: () => <MappingRulesScreen live={live({ state: 'error', data: null })} /> };
