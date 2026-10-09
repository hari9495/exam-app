import type { Meta, StoryObj } from '@storybook/react-vite';
import { WorkspaceShell, type WorkspaceLink } from './shell';

const meta: Meta = { title: 'Screens/Workspace/Navigation', parameters: { layout: 'fullscreen' } };
export default meta;
type S = StoryObj;

// Everything an HR admin with access rights sees (founder review 7 Oct 2026: ~20 pages, the 800 px menu broke).
const HR_LINKS: WorkspaceLink[] = [
  { id: 'profile', label: 'Profile', href: '#profile', group: 'People' },
  { id: 'directory', label: 'Directory', href: '#directory', group: 'People' },
  { id: 'org-chart', label: 'Org chart', href: '#org-chart', group: 'People' },
  { id: 'team', label: 'My team', href: '#team', group: 'People' },
  { id: 'job-history', label: 'Job history', href: '#history', group: 'People' },
  { id: 'job-changes', label: 'Job changes', href: '#changes', group: 'People' },
  { id: 'probation', label: 'Probation', href: '#probation', group: 'People' },
  { id: 'bulk-changes', label: 'Bulk changes', href: '#bulk', group: 'People' },
  { id: 'profile-requests', label: 'Identity and bank changes', href: '#id-changes', group: 'People' },
  { id: 'entities', label: 'Legal entities', href: '#entities', group: 'Organisation' },
  { id: 'locations', label: 'Locations', href: '#locations', group: 'Organisation' },
  { id: 'structure', label: 'Structure', href: '#structure', group: 'Organisation' },
  { id: 'company-rules', label: 'Company rules', href: '#rules', group: 'Organisation' },
  { id: 'access', label: 'Roles & access', href: '#access', group: 'Access' },
  { id: 'access-settings', label: 'Access and privacy', href: '#access-settings', group: 'Access' },
  { id: 'activity', label: 'Login activity', href: '#activity', group: 'Security' },
  { id: 'settings', label: 'Security settings', href: '#settings', group: 'Security' },
  { id: 'me', label: 'My security', href: '#me', group: 'Me' },
  { id: 'privacy', label: 'Who accessed my data', href: '#privacy', group: 'Me' },
];

const Frame = ({ hiring }: { hiring?: boolean }) => (
  <WorkspaceShell
    active="org-chart"
    links={HR_LINKS}
    company="Kaveri Foods Pvt Ltd"
    hiringHref={hiring ? '#hiring' : undefined}
    profileHref="#profile"
    name="Lakshmi Venkatesan"
    email="lakshmi.v@kaverifoods.in"
    onSignOut={() => {}}
  >
    <div className="yx-auth__page">
      <h1>Org chart</h1>
    </div>
  </WorkspaceShell>
);

export const HrMenu: S = { name: 'HR · full menu', render: () => <Frame /> };
export const HrMenuWithHiring: S = { name: 'HR with hiring access', render: () => <Frame hiring /> };
