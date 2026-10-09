import type { Meta, StoryObj } from '@storybook/react-vite';
import { useState } from 'react';
import { WorkspaceShell, type WorkspaceLink } from '../auth/shell';
import { SmsAccountEditor, SmsSettingsScreen, type SmsSettingsScreenProps } from './sms-settings';
import { ACCOUNTS, DELIVERIES, OVERVIEW, OVERVIEW_AT_LIMIT, OVERVIEW_PLATFORM, OVERVIEW_SHARED_ONLY } from './data';

const meta: Meta = { title: 'Screens/Notifications/SMS', parameters: { layout: 'fullscreen' } };
export default meta;
type S = StoryObj;

const wait = (ms = 600) => new Promise<void>((r) => setTimeout(r, ms));
const LINKS: WorkspaceLink[] = [
  { id: 'settings', label: 'Security settings', href: '#settings', group: 'Security' },
  { id: 'sms', label: 'Text messages', href: '#sms', group: 'Security' },
  { id: 'me', label: 'My security', href: '#me', group: 'Me' },
];

function Screen(over: Partial<SmsSettingsScreenProps>) {
  const [overview, setOverview] = useState(over.overview === undefined ? OVERVIEW : over.overview);
  return (
    <WorkspaceShell active="sms" links={LINKS} company="Kaveri Foods Pvt Ltd" profileHref="#profile" name="Arjun Kulkarni" email="arjun.k@kaverifoods.in" onSignOut={() => {}}>
      <SmsSettingsScreen
        state="ready"
        deliveries={DELIVERIES}
        deliveriesState="ready"
        hasMoreDeliveries
        onLoadMoreDeliveries={() => {}}
        myMobile="+91••••••••45"
        myMobileHref="#me"
        examplesHref="#examples"
        onSavePolicy={async (changes) => {
          await wait();
          setOverview((o) => (o && o.policy ? { ...o, policy: { ...o.policy, ...changes } } : o));
        }}
        onSaveAccount={() => wait()}
        onDeleteAccount={() => wait()}
        onTestAccount={async () => {
          await wait();
          return { status: 'sent', to: '+91••••••••45', error: null };
        }}
        {...over}
        overview={overview}
      />
    </WorkspaceShell>
  );
}

export const Ready: S = { name: 'SMS · own accounts, then YukthiX', render: () => <Screen /> };
export const SharedOnly: S = { name: 'SMS · YukthiX account only (default)', render: () => <Screen overview={OVERVIEW_SHARED_ONLY} deliveries={DELIVERIES.slice(5)} hasMoreDeliveries={false} /> };
export const NothingSends: S = {
  name: 'SMS · shared account off, no accounts',
  render: () => <Screen overview={{ ...OVERVIEW_SHARED_ONLY, policy: { useSharedAccount: false, monthlyCap: null } }} deliveries={[]} hasMoreDeliveries={false} />,
};
export const AtLimit: S = { name: 'SMS · monthly limit reached', render: () => <Screen overview={OVERVIEW_AT_LIMIT} /> };
export const NoVerifiedNumber: S = { name: 'SMS · send test off (number not verified)', render: () => <Screen myMobile={null} /> };
export const TestFailed: S = {
  name: 'SMS · test not sent',
  render: () => (
    <Screen
      onTestAccount={async () => {
        await wait(300);
        return { status: 'fallback', to: '+91••••••••45', error: 'all_providers_failed: Kaveri DLT gateway: gateway refused the message (HTTP 400)' };
      }}
    />
  ),
  play: async ({ canvasElement }) => {
    canvasElement.querySelector<HTMLButtonElement>('button[aria-label="Send test from Kaveri DLT gateway"]')?.click();
  },
};
export const Platform: S = { name: 'SMS · YukthiX shared account (platform staff)', render: () => <Screen overview={OVERVIEW_PLATFORM} /> };
export const Loading: S = { name: 'SMS · loading', render: () => <Screen state="loading" overview={null} /> };
export const LoadError: S = { name: 'SMS · could not load', render: () => <Screen state="error" overview={null} onRetry={() => {}} /> };
export const NoAccess: S = { name: 'SMS · no access', render: () => <Screen state="no-access" overview={null} /> };
export const LogLoading: S = { name: 'SMS · delivery log loading', render: () => <Screen deliveries={[]} deliveriesState="loading" hasMoreDeliveries={false} /> };
export const LogError: S = { name: 'SMS · delivery log could not load', render: () => <Screen deliveries={[]} deliveriesState="error" onRetryDeliveries={() => {}} hasMoreDeliveries={false} /> };
export const Phone: S = { name: 'SMS · phone', globals: { viewport: { value: 'phone' } }, render: () => <Screen /> };
export const PhoneSharedOnly: S = { name: 'SMS · YukthiX only · phone', globals: { viewport: { value: 'phone' } }, render: () => <Screen overview={OVERVIEW_SHARED_ONLY} /> };

function Editor({ account = null, onSave = () => wait() }: { account?: (typeof ACCOUNTS)[number] | null; onSave?: () => Promise<void> }) {
  const [open, setOpen] = useState(true);
  return <SmsAccountEditor account={account} open={open} onOpenChange={setOpen} examplesHref="#examples" allowDevProvider onSave={onSave} onDelete={() => wait()} />;
}
export const AddAccount: S = { name: 'SMS · add account', render: () => <Editor /> };
export const EditAccount: S = { name: 'SMS · edit account (secrets write-only)', render: () => <Editor account={ACCOUNTS[0]} /> };
export const EditPendingTemplate: S = { name: 'SMS · edit account · template pending', render: () => <Editor account={ACCOUNTS[1]} /> };
export const SaveRefused: S = {
  name: 'SMS · save refused',
  render: () => (
    <Editor
      account={ACCOUNTS[0]}
      onSave={async () => {
        await wait(300);
        throw new Error('The gateway URL must be a public https address');
      }}
    />
  ),
};
export const EditorPhone: S = { name: 'SMS · edit account · phone', globals: { viewport: { value: 'phone' } }, render: () => <Editor account={ACCOUNTS[0]} /> };
