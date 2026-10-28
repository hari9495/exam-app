import type { Meta, StoryObj } from '@storybook/react-vite';
import { PersonWorkspace } from './record';
import { PayAccessDialog, PayAccessRequests } from './pay-access';
import { PAY_ACCESS_ROWS, TODAY } from './people-data';

// PPL-50 Team pay access (founder decisions 28 Oct 2026): the manager asks from the Pay tab; two different HR people
// approve on People › Team pay access (length and who it covers can change); access ends by itself.
const meta: Meta = { title: 'Screens/People/PPL-50 · Team pay access', parameters: { layout: 'fullscreen' } };
export default meta;
type S = StoryObj;

const decide = async () => undefined;
const [first, second, , active, ended, refused] = PAY_ACCESS_ROWS;

export const ManagerAsk: S = {
  name: 'Manager · ask for access (Pay tab)',
  render: () => (
    <>
      <PersonWorkspace persona="mgr" relation="team" today={TODAY} defaultTab="pay" />
      <PayAccessDialog person={{ id: 't1', name: 'Arjun Kulkarni' }} teamSize={6} defaultScope="team" days={30} onSubmit={decide} onClose={() => undefined} />
    </>
  ),
};
export const ManagerWaiting: S = { name: 'Manager · waiting for HR (approval 2 of 2)', render: () => <PersonWorkspace persona="mgr" relation="team" today={TODAY} defaultTab="pay" payAccess={{ ...first, state: 'second', first: { by: 'Lakshmi Venkatesan', at: '2026-10-27T11:00:00Z', note: null } }} /> };
export const ManagerActive: S = { name: 'Manager · access open until a day', render: () => <PersonWorkspace persona="mgr" relation="team" today={TODAY} defaultTab="pay" payGrant payAccess={{ ...active, manager: first.manager, person: first.person, covers: 'Arjun Kulkarni', scope: 'person' }} /> };
export const ManagerEnded: S = { name: 'Manager · access ended (pay hidden again)', render: () => <PersonWorkspace persona="mgr" relation="team" today={TODAY} defaultTab="pay" payAccess={{ ...ended, manager: first.manager, person: first.person, covers: 'Arjun Kulkarni' }} /> };
export const ManagerRefused: S = { name: 'Manager · refused by HR', render: () => <PersonWorkspace persona="mgr" relation="team" today={TODAY} defaultTab="pay" payAccess={{ ...refused, manager: first.manager }} /> };

export const HrWaiting: S = { name: 'HR · waiting requests', render: () => <PayAccessRequests rows={PAY_ACCESS_ROWS} onDecide={decide} /> };
export const HrFirstStep: S = { name: 'HR · first approval (length and who it covers)', render: () => <PayAccessRequests rows={PAY_ACCESS_ROWS} onDecide={decide} defaultOpenId={first.id} /> };
export const HrSecondStep: S = { name: 'HR · second approval (a different HR person)', render: () => <PayAccessRequests rows={PAY_ACCESS_ROWS} onDecide={decide} defaultOpenId={second.id} /> };
export const Empty: S = { name: '· nothing waiting', render: () => <PayAccessRequests rows={[]} onDecide={decide} /> };
export const Loading: S = { name: '· loading', render: () => <PayAccessRequests rows={[]} state="loading" /> };
export const LoadError: S = { name: '· error', render: () => <PayAccessRequests rows={[]} state="error" onRetry={() => undefined} /> };
export const NoAccess: S = { name: '· no access', render: () => <PayAccessRequests rows={[]} state="no-access" /> };
