import type { Meta, StoryObj } from '@storybook/react-vite';
import { ToastProvider } from '../../components/notify';
import { ConsoleShell } from './console-shell';
import { PlatformSettingsScreen, type PlatformSettingRow } from './platform-settings';

// Answer 1125: Console › Platform settings, added to the kit first (no drawn screen existed).
const meta: Meta = { title: 'Screens/YukthiX console/Platform settings (1125)', parameters: { layout: 'fullscreen' } };
export default meta;
type S = StoryObj;

export const settingRows: PlatformSettingRow[] = [
  { key: 'breach.certin_hours', label: 'CERT-In: report a cyber security incident within (hours)', value: '6', default: '6', allowed: 'a whole number from 1 to 24', verify: false, editable: true },
  { key: 'breach.dpdp_board_report_hours', label: 'DPDP Rules 2025: detailed report of a personal data breach to the Data Protection Board within (hours)', value: '72', default: '72', allowed: 'a whole number from 1 to 168', verify: true, editable: true },
  { key: 'cs.alert.health_below', label: 'Alert when the health score is below', value: '50', default: '50', allowed: 'a whole number from 1 to 99', verify: false, editable: true },
  { key: 'maintenance.block_dates', label: 'No windows on these statutory dates (days of the month)', value: '7,15,20', default: '7,15,20', allowed: 'up to 10 days of the month, each from 1 to 28, separated by commas', verify: false, editable: true },
  { key: 'maintenance.max_hours', label: 'Longest window (hours)', value: '4', default: '4', allowed: 'a whole number from 1 to 12', verify: false, editable: true },
];
const shell = (ui: React.ReactNode) => (
  <ToastProvider>
    <ConsoleShell active="platform-settings" name="Anand Iyer" email="anand@yukthix.test" securityHref="#" onSignOut={() => {}}>
      {ui}
    </ConsoleShell>
  </ToastProvider>
);
const wait = () => new Promise<void>((r) => setTimeout(r, 400));

export const List: S = { name: 'Platform settings · list (one to verify with counsel)', render: () => shell(<PlatformSettingsScreen state="ready" rows={settingRows} canChange onChange={wait} />) };
export const ReadOnly: S = { name: 'Platform settings · without the key', render: () => shell(<PlatformSettingsScreen state="no-access" rows={[]} canChange={false} onChange={wait} />) };
