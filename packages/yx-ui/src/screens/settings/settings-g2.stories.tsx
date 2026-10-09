// Settings map · Group 2 · People & Access (APX-D §3). One story per page plus a read-only variant.
import type { Meta, StoryObj } from '@storybook/react-vite';
import { SettingsGroupScreen, SettingsPageScreen } from './settings-screens';
import { SETTINGS_GROUPS } from './settings-groups';
import './settings.css';

const meta: Meta = {
  title: 'Screens/Settings/Group 2 · People & Access',
  parameters: { layout: 'fullscreen' },
};
export default meta;
type S = StoryObj;

export const Overview: S = { name: 'Group 2 · People & Access', render: () => <SettingsGroupScreen groups={SETTINGS_GROUPS} groupId={2} /> };
export const OverviewLoading: S = { name: 'Group 2 · loading', render: () => <SettingsGroupScreen groups={SETTINGS_GROUPS} groupId={2} state="loading" /> };

export const P2_1: S = { name: '2.1 Roles & access', render: () => <SettingsPageScreen groups={SETTINGS_GROUPS} pageId="2.1" /> };
export const P2_1_ReadOnly: S = { name: '2.1 Roles & access · read-only', render: () => <SettingsPageScreen groups={SETTINGS_GROUPS} pageId="2.1" readOnly /> };
export const P2_2: S = { name: '2.2 Directory & privacy', render: () => <SettingsPageScreen groups={SETTINGS_GROUPS} pageId="2.2" /> };
export const P2_2_ReadOnly: S = { name: '2.2 Directory & privacy · read-only', render: () => <SettingsPageScreen groups={SETTINGS_GROUPS} pageId="2.2" readOnly /> };
export const P2_3: S = { name: '2.3 Security', render: () => <SettingsPageScreen groups={SETTINGS_GROUPS} pageId="2.3" /> };
export const P2_3_ReadOnly: S = { name: '2.3 Security · read-only', render: () => <SettingsPageScreen groups={SETTINGS_GROUPS} pageId="2.3" readOnly /> };
export const P2_4: S = { name: '2.4 Approvals', render: () => <SettingsPageScreen groups={SETTINGS_GROUPS} pageId="2.4" /> };
export const P2_4_ReadOnly: S = { name: '2.4 Approvals · read-only', render: () => <SettingsPageScreen groups={SETTINGS_GROUPS} pageId="2.4" readOnly /> };
export const P2_5: S = { name: '2.5 Onboarding & probation', render: () => <SettingsPageScreen groups={SETTINGS_GROUPS} pageId="2.5" /> };
export const P2_5_ReadOnly: S = { name: '2.5 Onboarding & probation · read-only', render: () => <SettingsPageScreen groups={SETTINGS_GROUPS} pageId="2.5" readOnly /> };
export const P2_6: S = { name: '2.6 Job changes & transfers', render: () => <SettingsPageScreen groups={SETTINGS_GROUPS} pageId="2.6" /> };
export const P2_6_ReadOnly: S = { name: '2.6 Job changes & transfers · read-only', render: () => <SettingsPageScreen groups={SETTINGS_GROUPS} pageId="2.6" readOnly /> };
export const P2_7: S = { name: '2.7 Exit & lifecycle policies', render: () => <SettingsPageScreen groups={SETTINGS_GROUPS} pageId="2.7" /> };
export const P2_7_ReadOnly: S = { name: '2.7 Exit & lifecycle policies · read-only', render: () => <SettingsPageScreen groups={SETTINGS_GROUPS} pageId="2.7" readOnly /> };
export const P2_8: S = { name: '2.8 Assets', render: () => <SettingsPageScreen groups={SETTINGS_GROUPS} pageId="2.8" /> };
export const P2_8_ReadOnly: S = { name: '2.8 Assets · read-only', render: () => <SettingsPageScreen groups={SETTINGS_GROUPS} pageId="2.8" readOnly /> };
export const P2_9: S = { name: '2.9 Employee relations & cases', render: () => <SettingsPageScreen groups={SETTINGS_GROUPS} pageId="2.9" /> };
export const P2_9_ReadOnly: S = { name: '2.9 Employee relations & cases · read-only', render: () => <SettingsPageScreen groups={SETTINGS_GROUPS} pageId="2.9" readOnly /> };
export const P2_10: S = { name: '2.10 Audit & data retention', render: () => <SettingsPageScreen groups={SETTINGS_GROUPS} pageId="2.10" /> };
export const P2_10_ReadOnly: S = { name: '2.10 Audit & data retention · read-only', render: () => <SettingsPageScreen groups={SETTINGS_GROUPS} pageId="2.10" readOnly /> };
export const P2_11: S = { name: '2.11 Partners', render: () => <SettingsPageScreen groups={SETTINGS_GROUPS} pageId="2.11" /> };
export const P2_11_ReadOnly: S = { name: '2.11 Partners · read-only', render: () => <SettingsPageScreen groups={SETTINGS_GROUPS} pageId="2.11" readOnly /> };
