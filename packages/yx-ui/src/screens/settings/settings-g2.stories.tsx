// Settings map · Group 2 · People & Access (APX-D §3). One story per page plus a read-only variant.
import type { Meta, StoryObj } from '@storybook/react-vite';
import { SettingsGroupScreen, SettingsPageScreen } from './settings-screens';
import { SETTINGS_GROUPS } from './settings-groups';
import { PEOPLE_SETTINGS, timeSettingsPage, type TimeSettingsData } from './time-settings-live';
import { TIME_REGISTRY_SAMPLE } from './time-settings-sample';
import { AssetCategoryDrawer, assetSettingsPage, type AssetCategoryRow } from './asset-settings-live';
import { ToastProvider } from '../../components/notify';
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
// IT assets part 1 (answer 2712): 2.8 live with the company's categories, the acknowledgement and the recovery basis.
const ASSET_CATEGORIES: AssetCategoryRow[] = [
  { id: 'c1', name: 'Laptop', trackedBy: 'Serial number', defaultRecovery: '45000.00', usefulLifeYears: 3, tagPrefix: 'LAP', tagYear: true, tagDigits: 4, nextTag: 'LAP-2026-0043', assets: 42, version: 1 },
  { id: 'c2', name: 'Phone', trackedBy: 'IMEI', defaultRecovery: '15000.00', usefulLifeYears: 3, depreciationMethod: 'declining', depreciationRate: '40.00', tagPrefix: 'PH', tagYear: false, tagDigits: 3, nextTag: 'PH-019', assets: 18, version: 1 },
  { id: 'c3', name: 'SIM', trackedBy: 'Number', defaultRecovery: '500.00', usefulLifeYears: null, tagPrefix: null, tagYear: false, tagDigits: 4, nextTag: null, assets: 18, version: 1 },
  { id: 'c4', name: 'Tools', trackedBy: 'Tag', defaultRecovery: null, usefulLifeYears: null, tagPrefix: null, tagYear: false, tagDigits: 4, nextTag: null, assets: 3, version: 1 },
];
const assetPage = (canEdit: boolean) => {
  const design = SETTINGS_GROUPS.flatMap((g) => g.pages).find((p) => p.id === '2.8')!;
  const page = timeSettingsPage(design, { ...PEOPLE_DATA, canEdit }, new Set());
  return <SettingsPageScreen groups={SETTINGS_GROUPS} pageId="2.8" live={{ page: assetSettingsPage(page, design, ASSET_CATEGORIES, canEdit), canEdit, lastChange: null, onSave: async () => {}, onOpenScreen: () => {}, listEditors: canEdit ? { 'asset.categories': () => {} } : undefined }} />;
};
export const P2_8_Live: S = { name: '2.8 Assets · live (categories, acknowledgement, recovery)', render: () => <ToastProvider>{assetPage(true)}</ToastProvider> };
export const P2_8_LiveReadOnly: S = { name: '2.8 Assets · live, view only', render: () => <ToastProvider>{assetPage(false)}</ToastProvider> };
const drawer = (initial: AssetCategoryRow | null, onSave: () => Promise<unknown> = async () => undefined) => (
  <ToastProvider>
    <AssetCategoryDrawer initial={initial} onClose={() => {}} onSave={onSave} onRetire={initial ? async () => undefined : undefined} />
  </ToastProvider>
);
export const P2_8_AddCategory: S = { name: '2.8 Assets · add a category', render: () => drawer(null) };
export const P2_8_ChangeCategory: S = { name: '2.8 Assets · change a category', render: () => drawer(ASSET_CATEGORIES[0]!) };
// Answer 2713: a category depreciating by declining balance at a yearly rate.
export const P2_8_CategoryDeclining: S = { name: '2.8 Assets · a category on declining balance (2713)', render: () => drawer({ ...ASSET_CATEGORIES[0]!, depreciationMethod: 'declining', depreciationRate: '40.00' }) };
export const P2_8_CategoryRefused: S = { name: '2.8 Assets · change refused (name taken)', render: () => drawer(ASSET_CATEGORIES[1]!, () => Promise.reject(new Error('Another category already has that name.'))) };
export const P2_9: S = { name: '2.9 Employee relations & cases', render: () => <SettingsPageScreen groups={SETTINGS_GROUPS} pageId="2.9" /> };
export const P2_9_ReadOnly: S = { name: '2.9 Employee relations & cases · read-only', render: () => <SettingsPageScreen groups={SETTINGS_GROUPS} pageId="2.9" readOnly /> };
export const P2_10: S = { name: '2.10 Audit & data retention', render: () => <SettingsPageScreen groups={SETTINGS_GROUPS} pageId="2.10" /> };
export const P2_10_ReadOnly: S = { name: '2.10 Audit & data retention · read-only', render: () => <SettingsPageScreen groups={SETTINGS_GROUPS} pageId="2.10" readOnly /> };
export const P2_11: S = { name: '2.11 Partners', render: () => <SettingsPageScreen groups={SETTINGS_GROUPS} pageId="2.11" /> };
export const P2_11_ReadOnly: S = { name: '2.11 Partners · read-only', render: () => <SettingsPageScreen groups={SETTINGS_GROUPS} pageId="2.11" readOnly /> };

// S-4 (answers 1323, 1324): 2.7 and 2.10 with the company's settings. `page` picks one (0 or 1).
const PEOPLE_PAGES = Object.keys(PEOPLE_SETTINGS);
const PEOPLE_DATA: TimeSettingsData = {
  registry: TIME_REGISTRY_SAMPLE,
  company: { 'retirement.age': '60', 'exit.notice.confirmed': '2m' },
  elsewhere: { 'retirement.age': 1 },
  limits: { 'audit.retention_years': { min: 8, act: 'Companies (Accounts) Rules, 2014 r.3(1) with the Companies Act, 2013 s.128(5)' } },
  canEdit: true,
  canGuard: true,
  lastChange: null,
};
type PageArgs = StoryObj<{ page: number }>;
export const PeopleLive: PageArgs = {
  name: 'People page · live with the company settings (S-4)',
  args: { page: 0 },
  render: (args: { page: number }) => {
    const id = PEOPLE_PAGES[Number(args.page)]!;
    const page = timeSettingsPage(SETTINGS_GROUPS.flatMap((g) => g.pages).find((p) => p.id === id)!, PEOPLE_DATA, new Set());
    return <SettingsPageScreen groups={SETTINGS_GROUPS} pageId={id} live={{ page, canEdit: true, lastChange: null, onSave: async () => {}, onOpenScreen: () => {} }} />;
  },
};
