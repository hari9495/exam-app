import type { Meta, StoryObj } from '@storybook/react-vite';
import { WorkspaceShell, type WorkspaceLink } from '../auth/shell';
import { EmailEditor, EmailSettingsScreen } from './email-settings';
import { EMAIL_OVERVIEW, EMAIL_PREVIEW_HTML } from './data';

const meta: Meta = { title: 'Screens/Notifications/Email', parameters: { layout: 'fullscreen' } };
export default meta;
type S = StoryObj;

const LINKS: WorkspaceLink[] = [
  { id: 'emails', label: 'Emails', href: '#emails', group: 'Security' },
  { id: 'me', label: 'My security', href: '#me', group: 'Me' },
];
const ok = async () => {};
const preview = async () => ({ subject: 'Reset your Kaveri Foods password', html: EMAIL_PREVIEW_HTML, fromName: 'Kaveri Foods via YukthiX', to: 'arjun.k@kaverifoods.in' });

const Shell = ({ children }: { children: React.ReactNode }) => (
  <WorkspaceShell active="emails" links={LINKS} company="Kaveri Foods Pvt Ltd" profileHref="#profile" name="Arjun Kulkarni" email="arjun.k@kaverifoods.in" onSignOut={() => {}}>
    {children}
  </WorkspaceShell>
);

export const List: S = {
  render: () => (
    <Shell>
      <EmailSettingsScreen state="ready" overview={EMAIL_OVERVIEW} onSaveBranding={ok} onSaveWording={ok} onResetWording={ok} onPreview={preview} onTest={async () => ({ to: 'arjun.k@kaverifoods.in' })} />
    </Shell>
  ),
};

export const Editor: S = {
  render: () => (
    <Shell>
      <EmailEditor row={EMAIL_OVERVIEW.emails[2]} overview={EMAIL_OVERVIEW} onBack={() => {}} onSave={ok} onReset={ok} onPreview={preview} onTest={async () => ({ to: 'arjun.k@kaverifoods.in' })} />
    </Shell>
  ),
};

export const Loading: S = { render: () => <Shell><EmailSettingsScreen state="loading" overview={null} onSaveBranding={ok} onSaveWording={ok} onResetWording={ok} onPreview={preview} onTest={async () => ({ to: '' })} /></Shell> };
