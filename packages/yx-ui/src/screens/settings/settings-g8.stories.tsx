// Settings map · Group 8 · Billing & Account (APX-D §3). One story per page plus a read-only variant.
import type { Meta, StoryObj } from '@storybook/react-vite';
import { SettingsGroupScreen, SettingsPageScreen } from './settings-screens';
import { SETTINGS_GROUPS } from './settings-groups';
import './settings.css';

const meta: Meta = {
  title: 'Screens/Settings/Group 8 · Billing & Account',
  parameters: { layout: 'fullscreen' },
};
export default meta;
type S = StoryObj;

export const Overview: S = { name: 'Group 8 · Billing & Account', render: () => <SettingsGroupScreen groups={SETTINGS_GROUPS} groupId={8} /> };
export const OverviewLoading: S = { name: 'Group 8 · loading', render: () => <SettingsGroupScreen groups={SETTINGS_GROUPS} groupId={8} state="loading" /> };

export const P8_1: S = { name: '8.1 Plan & add-ons', render: () => <SettingsPageScreen groups={SETTINGS_GROUPS} pageId="8.1" /> };
export const P8_1_ReadOnly: S = { name: '8.1 Plan & add-ons · read-only', render: () => <SettingsPageScreen groups={SETTINGS_GROUPS} pageId="8.1" readOnly /> };
export const P8_2: S = { name: '8.2 Usage & caps', render: () => <SettingsPageScreen groups={SETTINGS_GROUPS} pageId="8.2" /> };
export const P8_2_ReadOnly: S = { name: '8.2 Usage & caps · read-only', render: () => <SettingsPageScreen groups={SETTINGS_GROUPS} pageId="8.2" readOnly /> };
export const P8_3: S = { name: '8.3 Invoices & payment', render: () => <SettingsPageScreen groups={SETTINGS_GROUPS} pageId="8.3" /> };
export const P8_3_ReadOnly: S = { name: '8.3 Invoices & payment · read-only', render: () => <SettingsPageScreen groups={SETTINGS_GROUPS} pageId="8.3" readOnly /> };
export const P8_4: S = { name: '8.4 Sandbox', render: () => <SettingsPageScreen groups={SETTINGS_GROUPS} pageId="8.4" /> };
export const P8_4_ReadOnly: S = { name: '8.4 Sandbox · read-only', render: () => <SettingsPageScreen groups={SETTINGS_GROUPS} pageId="8.4" readOnly /> };
export const P8_5: S = { name: '8.5 Data export & closure', render: () => <SettingsPageScreen groups={SETTINGS_GROUPS} pageId="8.5" /> };
export const P8_5_ReadOnly: S = { name: '8.5 Data export & closure · read-only', render: () => <SettingsPageScreen groups={SETTINGS_GROUPS} pageId="8.5" readOnly /> };
export const P8_6: S = { name: '8.6 Analytics, status & tips', render: () => <SettingsPageScreen groups={SETTINGS_GROUPS} pageId="8.6" /> };
export const P8_6_ReadOnly: S = { name: '8.6 Analytics, status & tips · read-only', render: () => <SettingsPageScreen groups={SETTINGS_GROUPS} pageId="8.6" readOnly /> };
