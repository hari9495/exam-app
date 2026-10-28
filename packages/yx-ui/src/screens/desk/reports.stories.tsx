import { useState } from 'react';
import type { Meta, StoryObj } from '@storybook/react-vite';
import { LinksFrame, type StoryLink } from '../_kit/story-frame';
import { play, press, pressFirst } from '../_kit/story-play';
import { ReportsScreen, WallScreen, type ReportsScreenProps, type ReportsTab } from './reports';
import { WALL, reportsProps } from './report-data';

const meta: Meta = { title: 'Screens/Service desk/Reports (HLP-05)', parameters: { layout: 'fullscreen' } };
export default meta;
type S = StoryObj;

const LINKS: StoryLink[] = [
  { id: 'desk-tickets', label: 'Tickets', href: '#tickets', group: 'Service desk' },
  { id: 'desk-reports', label: 'Reports', href: '#reports', group: 'Service desk' },
];

function Live({ start, ...over }: Partial<ReportsScreenProps> & { start: ReportsTab }) {
  const [tab, setTab] = useState<ReportsTab>(start);
  const [period, setPeriod] = useState(reportsProps().period);
  return (
    <LinksFrame active="desk-reports" links={LINKS}>
      <div className="yx-auth__page">
        <ReportsScreen {...reportsProps({ ...over, tab, onTab: setTab, period, onPeriod: setPeriod })} />
      </div>
    </LinksFrame>
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

// Founder rules (28 Oct 2026): buttons are never greyed out; pressed too early they say what is missing.
export const WallTooEarly: S = { name: 'Wall screens · Make the link pressed with nothing filled', render: () => <Live start="walls" />, play: play(press('New wall screen'), press('Make the link')) };
export const CustomerTooEarly: S = { name: 'Customer reports · Show report pressed with no company', render: () => <Live start="customers" />, play: play(press('Show report')) };
export const SurveyTooEarly: S = { name: 'NPS surveys · Save survey pressed with nothing filled', render: () => <Live start="surveys" />, play: play(pressFirst(/New survey/), press('Save survey')) };
