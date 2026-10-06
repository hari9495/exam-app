// Settings map · Group 4 · Payroll & Statutory (APX-D §3). One story per page plus a read-only variant.
import type { Meta, StoryObj } from '@storybook/react-vite';
import { SettingsGroupScreen, SettingsPageScreen } from './settings-screens';
import { SETTINGS_GROUPS } from './settings-groups';
import './settings.css';

const meta: Meta = {
  title: 'Screens/Settings/Group 4 · Payroll & Statutory',
  parameters: { layout: 'fullscreen' },
};
export default meta;
type S = StoryObj;

export const Overview: S = { name: 'Group 4 · Payroll & Statutory', render: () => <SettingsGroupScreen groups={SETTINGS_GROUPS} groupId={4} /> };
export const OverviewLoading: S = { name: 'Group 4 · loading', render: () => <SettingsGroupScreen groups={SETTINGS_GROUPS} groupId={4} state="loading" /> };

export const P4_1: S = { name: '4.1 Pay groups & calendars', render: () => <SettingsPageScreen groups={SETTINGS_GROUPS} pageId="4.1" /> };
export const P4_1_ReadOnly: S = { name: '4.1 Pay groups & calendars · read-only', render: () => <SettingsPageScreen groups={SETTINGS_GROUPS} pageId="4.1" readOnly /> };
export const P4_2: S = { name: '4.2 Components & templates', render: () => <SettingsPageScreen groups={SETTINGS_GROUPS} pageId="4.2" /> };
export const P4_2_ReadOnly: S = { name: '4.2 Components & templates · read-only', render: () => <SettingsPageScreen groups={SETTINGS_GROUPS} pageId="4.2" readOnly /> };
export const P4_3: S = { name: '4.3 Payroll policies', render: () => <SettingsPageScreen groups={SETTINGS_GROUPS} pageId="4.3" /> };
export const P4_3_ReadOnly: S = { name: '4.3 Payroll policies · read-only', render: () => <SettingsPageScreen groups={SETTINGS_GROUPS} pageId="4.3" readOnly /> };
export const P4_4: S = { name: '4.4 Payslip layout', render: () => <SettingsPageScreen groups={SETTINGS_GROUPS} pageId="4.4" /> };
export const P4_4_ReadOnly: S = { name: '4.4 Payslip layout · read-only', render: () => <SettingsPageScreen groups={SETTINGS_GROUPS} pageId="4.4" readOnly /> };
export const P4_5: S = { name: '4.5 Tax', render: () => <SettingsPageScreen groups={SETTINGS_GROUPS} pageId="4.5" /> };
export const P4_5_ReadOnly: S = { name: '4.5 Tax · read-only', render: () => <SettingsPageScreen groups={SETTINGS_GROUPS} pageId="4.5" readOnly /> };
export const P4_6: S = { name: '4.6 Loans & advances', render: () => <SettingsPageScreen groups={SETTINGS_GROUPS} pageId="4.6" /> };
export const P4_6_ReadOnly: S = { name: '4.6 Loans & advances · read-only', render: () => <SettingsPageScreen groups={SETTINGS_GROUPS} pageId="4.6" readOnly /> };
export const P4_7: S = { name: '4.7 Statutory set-up', render: () => <SettingsPageScreen groups={SETTINGS_GROUPS} pageId="4.7" /> };
export const P4_7_ReadOnly: S = { name: '4.7 Statutory set-up · read-only', render: () => <SettingsPageScreen groups={SETTINGS_GROUPS} pageId="4.7" readOnly /> };
export const P4_8: S = { name: '4.8 Expenses & travel', render: () => <SettingsPageScreen groups={SETTINGS_GROUPS} pageId="4.8" /> };
export const P4_8_ReadOnly: S = { name: '4.8 Expenses & travel · read-only', render: () => <SettingsPageScreen groups={SETTINGS_GROUPS} pageId="4.8" readOnly /> };
export const P4_9: S = { name: '4.9 Contract labour', render: () => <SettingsPageScreen groups={SETTINGS_GROUPS} pageId="4.9" /> };
export const P4_9_ReadOnly: S = { name: '4.9 Contract labour · read-only', render: () => <SettingsPageScreen groups={SETTINGS_GROUPS} pageId="4.9" readOnly /> };
export const P4_10: S = { name: '4.10 Earned wage access', render: () => <SettingsPageScreen groups={SETTINGS_GROUPS} pageId="4.10" /> };
export const P4_10_ReadOnly: S = { name: '4.10 Earned wage access · read-only', render: () => <SettingsPageScreen groups={SETTINGS_GROUPS} pageId="4.10" readOnly /> };
export const P4_11: S = { name: '4.11 Benefits & FBP', render: () => <SettingsPageScreen groups={SETTINGS_GROUPS} pageId="4.11" /> };
export const P4_11_ReadOnly: S = { name: '4.11 Benefits & FBP · read-only', render: () => <SettingsPageScreen groups={SETTINGS_GROUPS} pageId="4.11" readOnly /> };
