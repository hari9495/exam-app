import { useState } from 'react';
import type { Meta, StoryObj } from '@storybook/react-vite';
import { WorkspaceShell, type WorkspaceLink } from '../auth/shell';
import { YukthixSupportScreen } from './yukthix-support';
import { YX_ROWS, YX_TICKET } from './yukthix-support-data';

const meta: Meta = { title: 'Screens/Service desk/Contact YukthiX (SD-1.31)', parameters: { layout: 'fullscreen' } };
export default meta;
type S = StoryObj;

const wait = () => new Promise<void>((r) => setTimeout(r, 400));
const LINKS: WorkspaceLink[] = [
  { id: 'support-access', label: 'Support access', href: '#access', group: 'Security' },
  { id: 'yukthix-support', label: 'Contact YukthiX', href: '#support', group: 'Security' },
];

function Page({ empty }: { empty?: boolean }) {
  const [openId, setOpenId] = useState<string | null>(null);
  return (
    <WorkspaceShell active="yukthix-support" links={LINKS} company="Godavari Agro" profileHref="#" name="Sunita Rao" email="sunita@godavari.test" onSignOut={() => {}}>
      <div className="yx-auth__page">
        <YukthixSupportScreen
          state="ready"
          tickets={empty ? [] : YX_ROWS}
          onRaise={async () => ({ number: 'YXS-1050', sending: false })}
          fromPage="/yx/settings/structure"
          openId={openId}
          onOpen={setOpenId}
          ticket={openId ? YX_TICKET : null}
          ticketState={openId ? 'ready' : 'loading'}
          onReply={wait}
          supportAccessHref="#access"
        />
      </div>
    </WorkspaceShell>
  );
}

export const Contact: S = { name: 'Contact YukthiX', render: () => <Page /> };
export const Empty: S = { name: 'Contact YukthiX · no tickets', render: () => <Page empty /> };
