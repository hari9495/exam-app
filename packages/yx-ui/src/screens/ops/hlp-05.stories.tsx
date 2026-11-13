import { useState } from 'react';
import type { Meta, StoryObj } from '@storybook/react-vite';
import { play, press, pressFirst } from '../_kit/story-play';
import { SlaDashboardScreen } from './helpdesk';
import { TICKETS } from './helpdesk-data';
import type { LiveSla, SlaDays, SlaReportTab } from './helpdesk-sla-live';
import { liveSla } from './helpdesk-sla-live-samples';

const meta: Meta = { title: 'Screens/Helpdesk/HLP-05 · SLA dashboard', parameters: { layout: 'fullscreen' } };
export default meta;
type S = StoryObj;

export const QueueLead: S = { name: 'Queue lead', render: () => <SlaDashboardScreen tickets={TICKETS} /> };
export const Loading: S = { render: () => <SlaDashboardScreen tickets={TICKETS} loading /> };
export const Empty: S = { name: 'Empty (no tickets in period)', render: () => <SlaDashboardScreen tickets={[]} empty /> };

// States the real SLA dashboard and the old desk reports page have (Helpdesk design wiring; founder answer 1: the HLP
// design wins). Drawn in the same layout as the stories above, with the reports as tabs under the header.
function Live({ open = 'sla', ...over }: Partial<LiveSla> & { open?: SlaReportTab }) {
  const [tab, setTab] = useState<SlaReportTab>(open);
  const [days, setDays] = useState<SlaDays>('30');
  const [deskId, setDeskId] = useState<string | null>(open === 'kpis' ? 'd-it' : null);
  return <SlaDashboardScreen live={liveSla({ ...over, tab, onTab: setTab, days, onDays: setDays, deskId, onDesk: setDeskId })} />;
}

export const Reassign: S = { name: 'Reassign an at-risk ticket', render: () => <Live start={{ reassignId: 't2' }} /> };
export const NoReassign: S = { name: 'Desk admin · no Reassign, sensitive tickets counted but not listed', render: () => <Live canAssign={false} /> };
export const DeskNumbers: S = { name: 'Desk numbers (backlog, times, ratings, agents)', render: () => <Live open="numbers" /> };
export const Kpis: S = { name: 'KPIs with targets and forecast', render: () => <Live open="kpis" /> };
export const Library: S = { name: 'Report library', render: () => <Live open="library" /> };
export const Funnel: S = { name: 'Self-service funnel', render: () => <Live open="funnel" /> };
export const MyReports: S = { name: 'My reports and schedules', render: () => <Live open="mine" /> };
// Answer 1844: a report may hold the desks' own fields (team-lead-only ones only for leads).
export const MyReportsFields: S = { name: 'My reports · desk field columns', render: () => <Live open="mine" fieldColumns={[{ value: 'field:office', label: 'Office' }, { value: 'field:floor', label: 'Floor' }, { value: 'field:asset_cost', label: 'Asset cost (₹)' }]} customReports={[{ ...liveSla().customReports[0], columns: ['number', 'subject', 'field:office', 'field:asset_cost'] }, ...liveSla().customReports.slice(1)]} /> };
export const Walls: S = { name: 'Wall screens', render: () => <Live open="walls" /> };
export const Customers: S = { name: 'Customer reports', render: () => <Live open="customers" /> };
export const Surveys: S = { name: 'NPS surveys', render: () => <Live open="surveys" /> };
export const SurveysOnly: S = { name: 'Surveys only (no report access)', render: () => <Live open="surveys" canView={false} /> };
export const Error: S = { name: 'Error', render: () => <Live state="error" /> };
export const NoAccess: S = { name: 'No access', render: () => <Live state="no-access" /> };

// Founder rules (28 Oct 2026): buttons are never greyed out; pressed too early they say what is missing.
export const ReassignTooEarly: S = { name: 'Reassign pressed with nobody chosen', render: () => <Live />, play: play(pressFirst('Reassign'), press('Reassign')) };
export const WallTooEarly: S = { name: 'Wall screens · Make the link pressed with nothing filled', render: () => <Live open="walls" />, play: play(press('New wall screen'), press('Make the link')) };
export const CustomerTooEarly: S = { name: 'Customer reports · Show report pressed with no company', render: () => <Live open="customers" />, play: play(press('Show report')) };
export const SurveyTooEarly: S = { name: 'NPS surveys · Save survey pressed with nothing filled', render: () => <Live open="surveys" />, play: play(pressFirst(/New survey/), press('Save survey')) };
