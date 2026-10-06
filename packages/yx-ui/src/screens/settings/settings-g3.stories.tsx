// Settings map · Group 3 · Time & Leave (APX-D §3). One story per page plus a read-only variant.
import type { Meta, StoryObj } from '@storybook/react-vite';
import { SettingsGroupScreen, SettingsPageScreen } from './settings-screens';
import { SETTINGS_GROUPS } from './settings-groups';
import './settings.css';

const meta: Meta = {
  title: 'Screens/Settings/Group 3 · Time & Leave',
  parameters: { layout: 'fullscreen' },
};
export default meta;
type S = StoryObj;

export const Overview: S = { name: 'Group 3 · Time & Leave', render: () => <SettingsGroupScreen groups={SETTINGS_GROUPS} groupId={3} /> };
export const OverviewLoading: S = { name: 'Group 3 · loading', render: () => <SettingsGroupScreen groups={SETTINGS_GROUPS} groupId={3} state="loading" /> };

export const P3_1: S = { name: '3.1 Attendance modes', render: () => <SettingsPageScreen groups={SETTINGS_GROUPS} pageId="3.1" /> };
export const P3_1_ReadOnly: S = { name: '3.1 Attendance modes · read-only', render: () => <SettingsPageScreen groups={SETTINGS_GROUPS} pageId="3.1" readOnly /> };
export const P3_2: S = { name: '3.2 Check-in & devices', render: () => <SettingsPageScreen groups={SETTINGS_GROUPS} pageId="3.2" /> };
export const P3_2_ReadOnly: S = { name: '3.2 Check-in & devices · read-only', render: () => <SettingsPageScreen groups={SETTINGS_GROUPS} pageId="3.2" readOnly /> };
export const P3_3: S = { name: '3.3 Shifts & patterns', render: () => <SettingsPageScreen groups={SETTINGS_GROUPS} pageId="3.3" /> };
export const P3_3_ReadOnly: S = { name: '3.3 Shifts & patterns · read-only', render: () => <SettingsPageScreen groups={SETTINGS_GROUPS} pageId="3.3" readOnly /> };
export const P3_4: S = { name: '3.4 Weekly offs', render: () => <SettingsPageScreen groups={SETTINGS_GROUPS} pageId="3.4" /> };
export const P3_4_ReadOnly: S = { name: '3.4 Weekly offs · read-only', render: () => <SettingsPageScreen groups={SETTINGS_GROUPS} pageId="3.4" readOnly /> };
export const P3_5: S = { name: '3.5 Late & regularisation', render: () => <SettingsPageScreen groups={SETTINGS_GROUPS} pageId="3.5" /> };
export const P3_5_ReadOnly: S = { name: '3.5 Late & regularisation · read-only', render: () => <SettingsPageScreen groups={SETTINGS_GROUPS} pageId="3.5" readOnly /> };
export const P3_6: S = { name: '3.6 Leave types', render: () => <SettingsPageScreen groups={SETTINGS_GROUPS} pageId="3.6" /> };
export const P3_6_ReadOnly: S = { name: '3.6 Leave types · read-only', render: () => <SettingsPageScreen groups={SETTINGS_GROUPS} pageId="3.6" readOnly /> };
export const P3_7: S = { name: '3.7 Leave policies', render: () => <SettingsPageScreen groups={SETTINGS_GROUPS} pageId="3.7" /> };
export const P3_7_ReadOnly: S = { name: '3.7 Leave policies · read-only', render: () => <SettingsPageScreen groups={SETTINGS_GROUPS} pageId="3.7" readOnly /> };
export const P3_8: S = { name: '3.8 Holiday calendars', render: () => <SettingsPageScreen groups={SETTINGS_GROUPS} pageId="3.8" /> };
export const P3_8_ReadOnly: S = { name: '3.8 Holiday calendars · read-only', render: () => <SettingsPageScreen groups={SETTINGS_GROUPS} pageId="3.8" readOnly /> };
export const P3_9: S = { name: '3.9 Leave year', render: () => <SettingsPageScreen groups={SETTINGS_GROUPS} pageId="3.9" /> };
export const P3_9_ReadOnly: S = { name: '3.9 Leave year · read-only', render: () => <SettingsPageScreen groups={SETTINGS_GROUPS} pageId="3.9" readOnly /> };
export const P3_10: S = { name: '3.10 Periods & locks', render: () => <SettingsPageScreen groups={SETTINGS_GROUPS} pageId="3.10" /> };
export const P3_10_ReadOnly: S = { name: '3.10 Periods & locks · read-only', render: () => <SettingsPageScreen groups={SETTINGS_GROUPS} pageId="3.10" readOnly /> };
export const P3_11: S = { name: '3.11 Projects & timesheets', render: () => <SettingsPageScreen groups={SETTINGS_GROUPS} pageId="3.11" /> };
export const P3_11_ReadOnly: S = { name: '3.11 Projects & timesheets · read-only', render: () => <SettingsPageScreen groups={SETTINGS_GROUPS} pageId="3.11" readOnly /> };
export const P3_12: S = { name: '3.12 Visitors', render: () => <SettingsPageScreen groups={SETTINGS_GROUPS} pageId="3.12" /> };
export const P3_12_ReadOnly: S = { name: '3.12 Visitors · read-only', render: () => <SettingsPageScreen groups={SETTINGS_GROUPS} pageId="3.12" readOnly /> };
