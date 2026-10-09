// Settings map · Group 1 · Organisation (APX-D §3). One story per page plus a read-only variant.
import type { Meta, StoryObj } from '@storybook/react-vite';
import { SettingsGroupScreen, SettingsPageScreen } from './settings-screens';
import { SETTINGS_GROUPS } from './settings-groups';
import './settings.css';

const meta: Meta = {
  title: 'Screens/Settings/Group 1 · Organisation',
  parameters: { layout: 'fullscreen' },
};
export default meta;
type S = StoryObj;

export const Overview: S = { name: 'Group 1 · Organisation', render: () => <SettingsGroupScreen groups={SETTINGS_GROUPS} groupId={1} /> };
export const OverviewLoading: S = { name: 'Group 1 · loading', render: () => <SettingsGroupScreen groups={SETTINGS_GROUPS} groupId={1} state="loading" /> };

export const P1_1: S = { name: '1.1 Company & branding', render: () => <SettingsPageScreen groups={SETTINGS_GROUPS} pageId="1.1" /> };
export const P1_1_ReadOnly: S = { name: '1.1 Company & branding · read-only', render: () => <SettingsPageScreen groups={SETTINGS_GROUPS} pageId="1.1" readOnly /> };
export const P1_2: S = { name: '1.2 Legal entities', render: () => <SettingsPageScreen groups={SETTINGS_GROUPS} pageId="1.2" /> };
export const P1_2_ReadOnly: S = { name: '1.2 Legal entities · read-only', render: () => <SettingsPageScreen groups={SETTINGS_GROUPS} pageId="1.2" readOnly /> };
export const P1_3: S = { name: '1.3 Locations', render: () => <SettingsPageScreen groups={SETTINGS_GROUPS} pageId="1.3" /> };
export const P1_3_ReadOnly: S = { name: '1.3 Locations · read-only', render: () => <SettingsPageScreen groups={SETTINGS_GROUPS} pageId="1.3" readOnly /> };
export const P1_4: S = { name: '1.4 Structure masters', render: () => <SettingsPageScreen groups={SETTINGS_GROUPS} pageId="1.4" /> };
export const P1_4_ReadOnly: S = { name: '1.4 Structure masters · read-only', render: () => <SettingsPageScreen groups={SETTINGS_GROUPS} pageId="1.4" readOnly /> };
export const P1_5: S = { name: '1.5 Employee records', render: () => <SettingsPageScreen groups={SETTINGS_GROUPS} pageId="1.5" /> };
export const P1_5_ReadOnly: S = { name: '1.5 Employee records · read-only', render: () => <SettingsPageScreen groups={SETTINGS_GROUPS} pageId="1.5" readOnly /> };
export const P1_6: S = { name: '1.6 Set-up hub', render: () => <SettingsPageScreen groups={SETTINGS_GROUPS} pageId="1.6" /> };
export const P1_6_ReadOnly: S = { name: '1.6 Set-up hub · read-only', render: () => <SettingsPageScreen groups={SETTINGS_GROUPS} pageId="1.6" readOnly /> };
export const P1_7: S = { name: '1.7 Customisation', render: () => <SettingsPageScreen groups={SETTINGS_GROUPS} pageId="1.7" /> };
export const P1_7_ReadOnly: S = { name: '1.7 Customisation · read-only', render: () => <SettingsPageScreen groups={SETTINGS_GROUPS} pageId="1.7" readOnly /> };
export const P1_8: S = { name: '1.8 Policies, rules & automations', render: () => <SettingsPageScreen groups={SETTINGS_GROUPS} pageId="1.8" /> };
export const P1_8_ReadOnly: S = { name: '1.8 Policies, rules & automations · read-only', render: () => <SettingsPageScreen groups={SETTINGS_GROUPS} pageId="1.8" readOnly /> };
