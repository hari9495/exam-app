// Settings map · Group 4 · Payroll & Statutory (APX-D §3). One story per page plus a read-only variant.
import type { Meta, StoryObj } from '@storybook/react-vite';
import { SettingsGroupScreen, SettingsPageScreen } from './settings-screens';
import { SETTINGS_GROUPS } from './settings-groups';
import { PAY_SETTINGS, pendingOnPage, timeSettingsPage, type TimeSettingsData } from './time-settings-live';
import { TIME_REGISTRY_SAMPLE } from './time-settings-sample';
import { RegistrationSheet } from '../ops/contract';
import { FlexComponentSheet } from './benefits-live';
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
// CL-5 (answer 673): Add or change a site's principal-employer registration from the Registrations list.
export const P4_9_Registration: S = { name: '4.9 Contract labour · registration (CL-5)', render: () => <><SettingsPageScreen groups={SETTINGS_GROUPS} pageId="4.9" /><RegistrationSheet initial={{ id: 'r1', locationId: 'hosur', registrationNo: 'TN/OSH/REG/2026/0141', maxWorkers: 60, validTo: '2027-12-31', version: 1 }} sites={[{ id: 'hosur', name: 'Hosur plant' }, { id: 'blr', name: 'Bengaluru head office' }]} onClose={() => undefined} onSave={async () => undefined} onRemove={async () => undefined} /></> };
export const P4_10: S = { name: '4.10 Earned wage access', render: () => <SettingsPageScreen groups={SETTINGS_GROUPS} pageId="4.10" /> };
export const P4_10_ReadOnly: S = { name: '4.10 Earned wage access · read-only', render: () => <SettingsPageScreen groups={SETTINGS_GROUPS} pageId="4.10" readOnly /> };
export const P4_11: S = { name: '4.11 Benefits & FBP', render: () => <SettingsPageScreen groups={SETTINGS_GROUPS} pageId="4.11" /> };
export const P4_11_ReadOnly: S = { name: '4.11 Benefits & FBP · read-only', render: () => <SettingsPageScreen groups={SETTINGS_GROUPS} pageId="4.11" readOnly /> };
export const P4_11_FlexComponent: S = {
  name: '4.11 Benefits & FBP · flexible component (B8/E5)',
  render: () => (
    <>
      <SettingsPageScreen groups={SETTINGS_GROUPS} pageId="4.11" />
      <FlexComponentSheet initial={{ id: 'f1', code: 'phone', name: 'Phone and internet', monthlyAmount: '1500.00', taxableIfUnclaimed: true, expenseCategoryCode: 'phone_internet', active: true, version: 1 }} categories={[{ code: 'phone_internet', name: 'Phone and internet' }, { code: 'meals', name: 'Meals' }]} onClose={() => undefined} onSave={async () => undefined} />
    </>
  ),
};
export const P4_11_FlexComponentNew: S = { name: '4.11 Benefits & FBP · add flexible component (B8/E5)', render: () => <FlexComponentSheet initial={null} categories={[{ code: 'phone_internet', name: 'Phone and internet' }]} onClose={() => undefined} onSave={async () => undefined} /> };

// S-3 (answers 1323 to 1325): the Payroll & Statutory pages with the company's settings. `page` picks one (0 to 2). A
// change waits for a second person while the company switch is on (the default).
const PAY_PAGES = Object.keys(PAY_SETTINGS);
const PAY_DATA: TimeSettingsData = {
  registry: TIME_REGISTRY_SAMPLE,
  company: { 'payroll.net_rounding': 'rupee', 'tax.proof_cutoff': '02-15' },
  elsewhere: {},
  limits: { 'payroll.standard_daily_hours': { max: 9, act: 'Factories Act, 1948 s.54' }, 'payroll.document_retention_years': { min: 8, act: 'Companies Act, 2013 s.128(5)' } },
  canEdit: true,
  canGuard: true,
  lastChange: null,
};
const payPage = (i: number) => timeSettingsPage(SETTINGS_GROUPS.flatMap((g) => g.pages).find((p) => p.id === PAY_PAGES[i])!, PAY_DATA, new Set(['payslip.editor']));
type PageArgs = StoryObj<{ page: number }>;
export const PayLive: PageArgs = {
  name: 'Payroll page · live with the company settings (S-3)',
  args: { page: 0 },
  render: (args: { page: number }) => (
    <SettingsPageScreen groups={SETTINGS_GROUPS} pageId={PAY_PAGES[Number(args.page)]!} live={{ page: payPage(Number(args.page)), canEdit: true, lastChange: null, secondPerson: true, onSave: async () => {}, onOpenScreen: () => {} }} />
  ),
};
export const PayLiveWaiting: S = {
  name: 'Payroll policies · live, a change waiting for a second person (1325)',
  render: () => (
    <SettingsPageScreen
      groups={SETTINGS_GROUPS}
      pageId="4.3"
      live={{
        page: payPage(0),
        canEdit: true,
        lastChange: null,
        secondPerson: true,
        pending: pendingOnPage(payPage(0), [
          { id: 'r1', key: 'payroll.variance_threshold_pct', scopeType: 'tenant', from: null, to: '15', by: 'Lakshmi Venkatesan', at: '2026-11-12T09:30:00.000Z', mine: false },
          { id: 'r2', key: 'payroll.mid_period.cutoff_day', scopeType: 'tenant', from: null, to: '20', by: 'You', at: '2026-11-12T10:05:00.000Z', mine: true },
        ]),
        onApprove: async () => {},
        onReject: async () => {},
        onSave: async () => {},
      }}
    />
  ),
};
