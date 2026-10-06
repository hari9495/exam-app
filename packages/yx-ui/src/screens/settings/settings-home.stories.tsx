// Settings home (search across every setting) and the shared page states (APX-D §3 rules 3–6).
import type { Meta, StoryObj } from '@storybook/react-vite';
import { SettingsHomeScreen, SettingsPageScreen } from './settings-screens';
import { SETTINGS_GROUPS } from './settings-groups';
import type { HistoryEntry } from './settings-kit';
import './settings.css';

const meta: Meta = {
  title: 'Screens/Settings/Settings home and page states',
  parameters: { layout: 'fullscreen' },
};
export default meta;
type S = StoryObj;
const G = SETTINGS_GROUPS;

const HISTORY: HistoryEntry[] = [
  { id: 'h2', by: 'Lakshmi Venkatesan', role: 'HR Business Partner', at: '2026-08-12T15:20', what: 'Changed paternity leave from 5 to 7 days' },
  { id: 'h3', by: 'Arjun Kulkarni', role: 'System Admin', at: '2026-06-02T10:00', what: 'Applied the YukthiX starter template for leave' },
];

export const Home: S = { name: 'Settings home', render: () => <SettingsHomeScreen groups={G} /> };
export const HomeSearch: S = { name: 'Settings home · search "probation"', render: () => <SettingsHomeScreen groups={G} defaultQuery="probation" /> };
export const HomeSearchPf: S = { name: 'Settings home · search "PF ceiling"', render: () => <SettingsHomeScreen groups={G} defaultQuery="pf" /> };
export const HomeSearchLate: S = { name: 'Settings home · search "late coming"', render: () => <SettingsHomeScreen groups={G} defaultQuery="late" /> };
export const HomeSearchEmpty: S = { name: 'Settings home · no results', render: () => <SettingsHomeScreen groups={G} defaultQuery="canteen menu" /> };
export const HomeLimited: S = {
  name: 'Settings home · HR admin (only manageable pages)',
  render: () => <SettingsHomeScreen groups={G} manageable={['2.5', '2.6', '2.7', '2.8', '3.4', '3.5', '3.6', '3.7', '3.8', '3.9', '5.2', '5.7']} defaultQuery="notice" />,
};
export const HomeLoading: S = { name: 'Settings home · loading', render: () => <SettingsHomeScreen groups={G} state="loading" /> };
export const HomeError: S = { name: 'Settings home · error', render: () => <SettingsHomeScreen groups={G} state="error" /> };

export const PageFromSearch: S = {
  name: 'Page · opened from search (field highlighted)',
  render: () => <SettingsPageScreen groups={G} pageId="3.6" highlightKey="leave.maternity_days" />,
};
export const PageDirty: S = {
  name: 'Page · unsaved changes',
  render: () => <SettingsPageScreen groups={G} pageId="3.3" defaultDraft={{ 'shift.max_daily_hours': 8 }} />,
};
export const PageBelowLegalMinimum: S = {
  name: 'Page · below the legal minimum (blocked)',
  render: () => <SettingsPageScreen groups={G} pageId="3.6" defaultDraft={{ 'leave.maternity_days': 120 }} defaultShowErrors />,
};
export const PageAboveLegalMaximum: S = {
  name: 'Page · above the legal maximum (blocked)',
  render: () => <SettingsPageScreen groups={G} pageId="3.3" defaultDraft={{ 'shift.max_weekly_hours': 54 }} defaultShowErrors />,
};
export const PagePayrollApproval: S = {
  name: 'Page · payroll change needs a second approver',
  render: () => <SettingsPageScreen groups={G} pageId="4.3" defaultDraft={{ 'pay.protected_net': 60 }} />,
};
export const PageSaveFailed: S = {
  name: 'Page · save failed (edits kept)',
  render: () => <SettingsPageScreen groups={G} pageId="2.7" saveOutcome="fail" />,
};
export const PageSecurity: S = {
  name: 'Page · security change asks to confirm',
  render: () => <SettingsPageScreen groups={G} pageId="2.3" defaultDraft={{ 'security.mfa.everyone': true }} />,
};
export const PageScopeOverride: S = {
  name: 'Page · editing overrides for a location',
  render: () => <SettingsPageScreen groups={G} pageId="3.1" defaultScope="Location" />,
};
export const PageHistory: S = {
  name: 'Page · change history',
  render: () => <SettingsPageScreen groups={G} pageId="3.6" history={HISTORY} />,
};
export const PageReadOnly: S = { name: 'Page · read-only (no permission)', render: () => <SettingsPageScreen groups={G} pageId="4.7" readOnly /> };
export const PageLoading: S = { name: 'Page · loading', render: () => <SettingsPageScreen groups={G} pageId="1.4" state="loading" /> };
export const PageError: S = { name: 'Page · error', render: () => <SettingsPageScreen groups={G} pageId="1.4" state="error" /> };
