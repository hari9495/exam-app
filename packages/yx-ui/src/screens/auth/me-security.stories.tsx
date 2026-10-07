import type { Meta, StoryObj } from '@storybook/react-vite';
import { useState } from 'react';
import { MeSecurityScreen, type HistoryFilter, type MeSecurityScreenProps } from './me-security';
import { WorkspaceShell, type WorkspaceLink } from './shell';
import { MFA_ENROLLED, MFA_NONE, MY_HISTORY, MY_SESSIONS, NOW, RECOVERY_CODES, TOTP_SETUP } from './data';

const meta: Meta = { title: 'Screens/Security/My security', parameters: { layout: 'fullscreen' } };
export default meta;
type S = StoryObj;

const wait = (ms = 500) => new Promise<void>((r) => setTimeout(r, ms));

const LINKS: WorkspaceLink[] = [
  { id: 'directory', label: 'Directory', href: '#directory', group: 'People' },
  { id: 'activity', label: 'Login activity', href: '#activity', group: 'Security' },
  { id: 'settings', label: 'Security settings', href: '#settings', group: 'Security' },
  { id: 'me', label: 'My security', href: '#me', group: 'Me' },
];

function Page(over: Partial<MeSecurityScreenProps>) {
  const [filter, setFilter] = useState<HistoryFilter>('all');
  const history = filter === 'all' ? MY_HISTORY : { ...MY_HISTORY, data: MY_HISTORY.data.filter((e) => (filter === 'success' ? e.result === 'success' : e.result !== 'success')) };
  return (
    <WorkspaceShell active="me" links={LINKS} company="Kaveri Foods Pvt Ltd" profileHref="#profile" name="Divya Raghunathan" email="divya.r@kaverifoods.in" onSignOut={() => {}}>
      <MeSecurityScreen
        state="ready"
        mfa={MFA_ENROLLED}
        sessions={MY_SESSIONS}
        history={history}
        historyState="ready"
        historyFilter={filter}
        onHistoryFilter={setFilter}
        onHistoryPage={() => {}}
        onAddPasskey={async () => (await wait(), {})}
        onStartTotp={async () => (await wait(), TOTP_SETUP)}
        onConfirmTotp={async () => (await wait(), {})}
        onRemoveFactor={() => wait()}
        onNewRecoveryCodes={async () => (await wait(), RECOVERY_CODES)}
        onSendMobileCode={async (n) => (await wait(), n)}
        onVerifyMobile={() => wait()}
        onRemoveMobile={() => wait()}
        onSignOutSession={() => wait()}
        onSignOutOthers={() => wait()}
        now={NOW}
        {...over}
      />
    </WorkspaceShell>
  );
}

export const Default: S = { name: 'My security', render: () => <Page /> };
export const NotSetUp: S = { name: 'My security · second step not set up', render: () => <Page mfa={MFA_NONE} sessions={MY_SESSIONS.slice(0, 1)} /> };
export const Loading: S = { name: 'My security · loading', render: () => <Page state="loading" /> };
export const Error: S = { name: 'My security · could not load', render: () => <Page state="error" onRetry={() => {}} /> };
export const HistoryError: S = { name: 'My security · history could not load', render: () => <Page historyState="error" history={null} /> };
export const Empty: S = {
  name: 'My security · nothing yet',
  render: () => <Page mfa={{ ...MFA_NONE, required: false }} sessions={[]} history={{ data: [], total: 0, page: 1, pageSize: 25 }} />,
};
export const Phone: S = { name: 'My security · phone', globals: { viewport: { value: 'phone' } }, render: () => <Page /> };
export const Tablet: S = { name: 'My security · tablet', globals: { viewport: { value: 'tablet' } }, render: () => <Page /> };
