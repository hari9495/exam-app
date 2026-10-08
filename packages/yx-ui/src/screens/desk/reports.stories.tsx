import { useState } from 'react';
import type { Meta, StoryObj } from '@storybook/react-vite';
import { WorkspaceShell, type WorkspaceLink } from '../auth/shell';
import { ReportsScreen, WallScreen, type ReportsScreenProps, type ReportsTab } from './reports';
import { WALL, reportsProps } from './report-data';

const meta: Meta = { title: 'Screens/Service desk/Reports (HLP-05)', parameters: { layout: 'fullscreen' } };
export default meta;
type S = StoryObj;

const LINKS: WorkspaceLink[] = [
  { id: 'desk-tickets', label: 'Tickets', href: '#tickets', group: 'Service desk' },
  { id: 'desk-reports', label: 'Reports', href: '#reports', group: 'Service desk' },
];

function Live({ start, ...over }: Partial<ReportsScreenProps> & { start: ReportsTab }) {
  const [tab, setTab] = useState<ReportsTab>(start);
  const [period, setPeriod] = useState(reportsProps().period);
  return (
    <WorkspaceShell active="desk-reports" links={LINKS} company="Kaveri Foods" profileHref="#" name="Suresh Pillai" email="it-lead@kaveri.test" onSignOut={() => {}}>
      <div className="yx-auth__page">
        <ReportsScreen {...reportsProps({ ...over, tab, onTab: setTab, period, onPeriod: setPeriod })} />
      </div>
    </WorkspaceShell>
  );
}

export const Dashboard: S = { name: 'Dashboard', render: () => <Live start="dashboard" /> };
export const Kpis: S = { name: 'KPIs with targets and forecast', render: () => <Live start="kpis" /> };
export const Library: S = { name: 'Report library', render: () => <Live start="library" /> };
export const Funnel: S = { name: 'Self-service funnel', render: () => <Live start="funnel" /> };
export const MyReports: S = { name: 'My reports and schedules', render: () => <Live start="mine" /> };
export const Walls: S = { name: 'Wall screens', render: () => <Live start="walls" /> };
export const Customers: S = { name: 'Customer reports', render: () => <Live start="customers" /> };
export const Surveys: S = { name: 'NPS surveys', render: () => <Live start="surveys" /> };
export const SurveysOnly: S = { name: 'Surveys only (no report access)', render: () => <Live start="surveys" canView={false} /> };
export const TabLoading: S = { name: 'Tab loading', render: () => <Live start="dashboard" tabState="loading" /> };
export const NoAccess: S = { name: 'No access', render: () => <Live start="dashboard" state="no-access" /> };
export const Wall: S = { name: 'Wall screen (TV)', render: () => <WallScreen state="ready" wall={WALL} /> };
export const WallOff: S = { name: 'Wall screen · switched off', render: () => <WallScreen state="not-found" wall={null} /> };
