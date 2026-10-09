// Settings map · Group 6 · Hiring & Assessments (APX-D §3). One story per page plus a read-only variant.
import type { Meta, StoryObj } from '@storybook/react-vite';
import { SettingsGroupScreen, SettingsPageScreen } from './settings-screens';
import { SETTINGS_GROUPS } from './settings-groups';
import './settings.css';

const meta: Meta = {
  title: 'Screens/Settings/Group 6 · Hiring & Assessments',
  parameters: { layout: 'fullscreen' },
};
export default meta;
type S = StoryObj;

export const Overview: S = { name: 'Group 6 · Hiring & Assessments', render: () => <SettingsGroupScreen groups={SETTINGS_GROUPS} groupId={6} /> };
export const OverviewLoading: S = { name: 'Group 6 · loading', render: () => <SettingsGroupScreen groups={SETTINGS_GROUPS} groupId={6} state="loading" /> };

export const P6_1: S = { name: '6.1 Hiring', render: () => <SettingsPageScreen groups={SETTINGS_GROUPS} pageId="6.1" /> };
export const P6_1_ReadOnly: S = { name: '6.1 Hiring · read-only', render: () => <SettingsPageScreen groups={SETTINGS_GROUPS} pageId="6.1" readOnly /> };
export const P6_2: S = { name: '6.2 Staffing desk', render: () => <SettingsPageScreen groups={SETTINGS_GROUPS} pageId="6.2" /> };
export const P6_2_ReadOnly: S = { name: '6.2 Staffing desk · read-only', render: () => <SettingsPageScreen groups={SETTINGS_GROUPS} pageId="6.2" readOnly /> };
export const P6_3: S = { name: '6.3 Performance', render: () => <SettingsPageScreen groups={SETTINGS_GROUPS} pageId="6.3" /> };
export const P6_3_ReadOnly: S = { name: '6.3 Performance · read-only', render: () => <SettingsPageScreen groups={SETTINGS_GROUPS} pageId="6.3" readOnly /> };
export const P6_4: S = { name: '6.4 Learning', render: () => <SettingsPageScreen groups={SETTINGS_GROUPS} pageId="6.4" /> };
export const P6_4_ReadOnly: S = { name: '6.4 Learning · read-only', render: () => <SettingsPageScreen groups={SETTINGS_GROUPS} pageId="6.4" readOnly /> };
export const P6_5: S = { name: '6.5 Assessments', render: () => <SettingsPageScreen groups={SETTINGS_GROUPS} pageId="6.5" /> };
export const P6_5_ReadOnly: S = { name: '6.5 Assessments · read-only', render: () => <SettingsPageScreen groups={SETTINGS_GROUPS} pageId="6.5" readOnly /> };
