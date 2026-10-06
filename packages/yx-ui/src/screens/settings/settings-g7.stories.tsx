// Settings map · Group 7 · Integrations & Developers (APX-D §3). One story per page plus a read-only variant.
import type { Meta, StoryObj } from '@storybook/react-vite';
import { SettingsGroupScreen, SettingsPageScreen } from './settings-screens';
import { SETTINGS_GROUPS } from './settings-groups';
import './settings.css';

const meta: Meta = {
  title: 'Screens/Settings/Group 7 · Integrations & Developers',
  parameters: { layout: 'fullscreen' },
};
export default meta;
type S = StoryObj;

export const Overview: S = { name: 'Group 7 · Integrations & Developers', render: () => <SettingsGroupScreen groups={SETTINGS_GROUPS} groupId={7} /> };
export const OverviewLoading: S = { name: 'Group 7 · loading', render: () => <SettingsGroupScreen groups={SETTINGS_GROUPS} groupId={7} state="loading" /> };

export const P7_1: S = { name: '7.1 Integrations', render: () => <SettingsPageScreen groups={SETTINGS_GROUPS} pageId="7.1" /> };
export const P7_1_ReadOnly: S = { name: '7.1 Integrations · read-only', render: () => <SettingsPageScreen groups={SETTINGS_GROUPS} pageId="7.1" readOnly /> };
export const P7_2: S = { name: '7.2 Biometric devices', render: () => <SettingsPageScreen groups={SETTINGS_GROUPS} pageId="7.2" /> };
export const P7_2_ReadOnly: S = { name: '7.2 Biometric devices · read-only', render: () => <SettingsPageScreen groups={SETTINGS_GROUPS} pageId="7.2" readOnly /> };
export const P7_3: S = { name: '7.3 Payouts, banks & accounting', render: () => <SettingsPageScreen groups={SETTINGS_GROUPS} pageId="7.3" /> };
export const P7_3_ReadOnly: S = { name: '7.3 Payouts, banks & accounting · read-only', render: () => <SettingsPageScreen groups={SETTINGS_GROUPS} pageId="7.3" readOnly /> };
export const P7_4: S = { name: '7.4 Verification', render: () => <SettingsPageScreen groups={SETTINGS_GROUPS} pageId="7.4" /> };
export const P7_4_ReadOnly: S = { name: '7.4 Verification · read-only', render: () => <SettingsPageScreen groups={SETTINGS_GROUPS} pageId="7.4" readOnly /> };
export const P7_5: S = { name: '7.5 Calendar & chat', render: () => <SettingsPageScreen groups={SETTINGS_GROUPS} pageId="7.5" /> };
export const P7_5_ReadOnly: S = { name: '7.5 Calendar & chat · read-only', render: () => <SettingsPageScreen groups={SETTINGS_GROUPS} pageId="7.5" readOnly /> };
export const P7_6: S = { name: '7.6 AI', render: () => <SettingsPageScreen groups={SETTINGS_GROUPS} pageId="7.6" /> };
export const P7_6_ReadOnly: S = { name: '7.6 AI · read-only', render: () => <SettingsPageScreen groups={SETTINGS_GROUPS} pageId="7.6" readOnly /> };
export const P7_7: S = { name: '7.7 Developers', render: () => <SettingsPageScreen groups={SETTINGS_GROUPS} pageId="7.7" /> };
export const P7_7_ReadOnly: S = { name: '7.7 Developers · read-only', render: () => <SettingsPageScreen groups={SETTINGS_GROUPS} pageId="7.7" readOnly /> };
export const P7_8: S = { name: '7.8 Analytics', render: () => <SettingsPageScreen groups={SETTINGS_GROUPS} pageId="7.8" /> };
export const P7_8_ReadOnly: S = { name: '7.8 Analytics · read-only', render: () => <SettingsPageScreen groups={SETTINGS_GROUPS} pageId="7.8" readOnly /> };
export const P7_9: S = { name: '7.9 Deepfake detection', render: () => <SettingsPageScreen groups={SETTINGS_GROUPS} pageId="7.9" /> };
export const P7_9_ReadOnly: S = { name: '7.9 Deepfake detection · read-only', render: () => <SettingsPageScreen groups={SETTINGS_GROUPS} pageId="7.9" readOnly /> };
