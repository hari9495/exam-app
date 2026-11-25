// Settings map · Group 8 · Billing & Account (APX-D §3). One story per page plus a read-only variant.
import type { Meta, StoryObj } from '@storybook/react-vite';
import { SettingsGroupScreen, SettingsPageScreen } from './settings-screens';
import { SETTINGS_GROUPS } from './settings-groups';
import { ClosureRequestDrawer, dataPage, invoicesPage, planPage, usagePage, type AccountBilling, type AccountData } from './account-live';
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

// Settings S-9 (answers 1328, 1332): group 8 live, read-only billing and the data page, and the closure drawer.
const BILLING: AccountBilling = {
  plan: { name: 'Growth', priceLabel: '₹99 a person a month', billingInterval: 'month' },
  lifecycle: 'active',
  trialEndsAt: null,
  products: [{ code: 'hrms', name: 'YukthiX HR', since: '2026-04-01' }, { code: 'service_desk', name: 'YukthiX Service Desk', since: '2026-07-15' }],
  usage: { seats: { used: 412, limit: 500 }, candidates: { used: 1280, limit: 5000 }, aiCredits: { used: 3100, limit: 10000 }, proctoringMinutes: { used: 0, limit: 600 }, periodStart: '2026-11-01' },
  invoices: [{ number: 'YX-2026-0412', status: 'paid', amountPaid: 4078800, currency: 'inr', createdAt: '2026-11-01T00:00:00Z', invoicePdf: null }],
};
const DATA: AccountData = {
  companyName: 'Kaveri Foods Pvt Ltd',
  linkHours: 24,
  keepDays: 30,
  exports: [{ id: 'x1', by: 'Arjun Kulkarni', at: '2026-11-13T09:30:00Z', expiresAt: '2026-11-14T09:30:00Z', open: true, sizeBytes: 4_800_000, tables: 212, rows: 184_220, downloads: 1 }],
  closure: null,
};
const g8 = (id: string) => SETTINGS_GROUPS.flatMap((g) => g.pages).find((p) => p.id === id)!;
const live = (id: string, page: ReturnType<typeof planPage>) => <SettingsPageScreen groups={SETTINGS_GROUPS} pageId={id} live={{ page, canEdit: false, lastChange: null, onSave: async () => undefined }} />;
export const P8_1_Live: S = { name: '8.1 Plan & add-ons · live, read-only', render: () => live('8.1', planPage(g8('8.1'), BILLING)) };
export const P8_2_Live: S = { name: '8.2 Usage & caps · live, read-only', render: () => live('8.2', usagePage(g8('8.2'), BILLING)) };
export const P8_3_Live: S = { name: '8.3 Invoices & payment · live, read-only', render: () => live('8.3', invoicesPage(g8('8.3'), BILLING)) };
export const P8_5_Live: S = { name: '8.5 Data export & closure · live', render: () => live('8.5', dataPage(g8('8.5'), DATA, true)) };
export const P8_5_Asked: S = { name: '8.5 · closing asked for', render: () => live('8.5', dataPage(g8('8.5'), { ...DATA, closure: { id: 'c1', status: 'requested', by: 'Arjun Kulkarni', at: '2026-11-13T10:00:00Z', reason: 'Moving to another tool', keepUntil: null } }, true)) };
export const ClosureRequest: S = { name: '8.5 · Ask YukthiX to close the account', render: () => <ClosureRequestDrawer companyName="Kaveri Foods Pvt Ltd" keepDays={30} onClose={() => {}} onSend={async () => undefined} /> };
