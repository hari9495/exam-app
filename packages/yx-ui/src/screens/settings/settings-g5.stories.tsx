// Settings map · Group 5 · Documents & Communication (APX-D §3). One story per page plus a read-only variant.
import type { Meta, StoryObj } from '@storybook/react-vite';
import { SettingsGroupScreen, SettingsPageScreen } from './settings-screens';
import { SETTINGS_GROUPS } from './settings-groups';
import './settings.css';

const meta: Meta = {
  title: 'Screens/Settings/Group 5 · Documents & Communication',
  parameters: { layout: 'fullscreen' },
};
export default meta;
type S = StoryObj;

export const Overview: S = { name: 'Group 5 · Documents & Communication', render: () => <SettingsGroupScreen groups={SETTINGS_GROUPS} groupId={5} /> };
export const OverviewLoading: S = { name: 'Group 5 · loading', render: () => <SettingsGroupScreen groups={SETTINGS_GROUPS} groupId={5} state="loading" /> };

export const P5_1: S = { name: '5.1 Document types', render: () => <SettingsPageScreen groups={SETTINGS_GROUPS} pageId="5.1" /> };
export const P5_1_ReadOnly: S = { name: '5.1 Document types · read-only', render: () => <SettingsPageScreen groups={SETTINGS_GROUPS} pageId="5.1" readOnly /> };
export const P5_2: S = { name: '5.2 Letters', render: () => <SettingsPageScreen groups={SETTINGS_GROUPS} pageId="5.2" /> };
export const P5_2_ReadOnly: S = { name: '5.2 Letters · read-only', render: () => <SettingsPageScreen groups={SETTINGS_GROUPS} pageId="5.2" readOnly /> };
export const P5_3: S = { name: '5.3 Signatories & e-sign', render: () => <SettingsPageScreen groups={SETTINGS_GROUPS} pageId="5.3" /> };
export const P5_3_ReadOnly: S = { name: '5.3 Signatories & e-sign · read-only', render: () => <SettingsPageScreen groups={SETTINGS_GROUPS} pageId="5.3" readOnly /> };
export const P5_4: S = { name: '5.4 Notifications', render: () => <SettingsPageScreen groups={SETTINGS_GROUPS} pageId="5.4" /> };
export const P5_4_ReadOnly: S = { name: '5.4 Notifications · read-only', render: () => <SettingsPageScreen groups={SETTINGS_GROUPS} pageId="5.4" readOnly /> };
export const P5_5: S = { name: '5.5 WhatsApp & SMS', render: () => <SettingsPageScreen groups={SETTINGS_GROUPS} pageId="5.5" /> };
export const P5_5_ReadOnly: S = { name: '5.5 WhatsApp & SMS · read-only', render: () => <SettingsPageScreen groups={SETTINGS_GROUPS} pageId="5.5" readOnly /> };
export const P5_6: S = { name: '5.6 Announcements', render: () => <SettingsPageScreen groups={SETTINGS_GROUPS} pageId="5.6" /> };
export const P5_6_ReadOnly: S = { name: '5.6 Announcements · read-only', render: () => <SettingsPageScreen groups={SETTINGS_GROUPS} pageId="5.6" readOnly /> };
export const P5_7: S = { name: '5.7 Policies', render: () => <SettingsPageScreen groups={SETTINGS_GROUPS} pageId="5.7" /> };
export const P5_7_ReadOnly: S = { name: '5.7 Policies · read-only', render: () => <SettingsPageScreen groups={SETTINGS_GROUPS} pageId="5.7" readOnly /> };
export const P5_8: S = { name: '5.8 Helpdesk', render: () => <SettingsPageScreen groups={SETTINGS_GROUPS} pageId="5.8" /> };
export const P5_8_ReadOnly: S = { name: '5.8 Helpdesk · read-only', render: () => <SettingsPageScreen groups={SETTINGS_GROUPS} pageId="5.8" readOnly /> };
export const P5_9: S = { name: '5.9 Engage', render: () => <SettingsPageScreen groups={SETTINGS_GROUPS} pageId="5.9" /> };
export const P5_9_ReadOnly: S = { name: '5.9 Engage · read-only', render: () => <SettingsPageScreen groups={SETTINGS_GROUPS} pageId="5.9" readOnly /> };
