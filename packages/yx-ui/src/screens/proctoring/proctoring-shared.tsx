// Frames and panel links for Proctoring (area 'assess') and Analytics (area 'analytics'), APX-D §1.2.
import type { ReactNode } from 'react';
import { DesktopFrame, PortalFrame, type PanelSection } from '../_kit/frames';
import { COMPANY } from '../_kit/data';
import './screens.css';

export type PrcPage =
  | 'Question bank' | 'Review queue' | 'Tests' | 'Item analysis'
  | 'Invitations & drives' | 'Slot calendar' | 'Capacity planner' | 'Accommodation queue' | 'Campus kit & institutions' | 'Test centres'
  | 'Live console' | 'Proctor planner' | 'Connectivity'
  | 'Integrity queue' | 'ID review queue' | 'Appeals' | 'Integrity reports' | 'Fairness'
  | 'Evaluation' | 'Results & reports' | 'Company audit view' | 'Proctoring settings';

const PRC_GROUPS: { label?: string; items: PrcPage[] }[] = [
  { items: ['Question bank', 'Review queue', 'Tests', 'Item analysis'] },
  { label: 'Drives & schedule', items: ['Invitations & drives', 'Slot calendar', 'Capacity planner', 'Accommodation queue', 'Campus kit & institutions', 'Test centres'] },
  { label: 'Live', items: ['Live console', 'Proctor planner', 'Connectivity'] },
  { label: 'Integrity', items: ['Integrity queue', 'ID review queue', 'Appeals', 'Integrity reports', 'Fairness'] },
  { items: ['Evaluation', 'Results & reports', 'Company audit view', 'Proctoring settings'] },
];
const COUNTS: Partial<Record<PrcPage, number>> = { 'Review queue': 2, 'Accommodation queue': 2, 'Integrity queue': 4, 'ID review queue': 3, Appeals: 1, Evaluation: 18 };

export function prcPanel(active: PrcPage): PanelSection[] {
  return PRC_GROUPS.map((g) => ({ label: g.label, items: g.items.map((l) => ({ label: l, active: l === active, count: COUNTS[l] })) }));
}

export function PrcFrame({ page, children }: { page: PrcPage; children: ReactNode }) {
  return (
    <DesktopFrame area="assess" panelTitle="Proctoring" panel={prcPanel(page)}>
      {children}
    </DesktopFrame>
  );
}

export type AnlPage = 'Dashboards' | 'Explorer' | 'Reports' | 'Schedules' | 'Ask (AI)' | 'Metric catalogue';
export function anlPanel(active: AnlPage): PanelSection[] {
  const items: AnlPage[] = ['Dashboards', 'Explorer', 'Reports', 'Schedules', 'Ask (AI)', 'Metric catalogue'];
  return [{ items: items.map((l) => ({ label: l, active: l === active })) }];
}
export function AnlFrame({ page, children }: { page: AnlPage; children: ReactNode }) {
  return (
    <DesktopFrame area="analytics" panelTitle="Analytics" panel={anlPanel(page)}>
      {children}
    </DesktopFrame>
  );
}

export type CandPage = 'My tests' | 'Practice' | 'Privacy centre';
/** T9 candidate test portal: tenant brand, one short tab row, access-expiry banner. */
export function CandidateFrame({ page, children, user = 'Arjun Nair' }: { page?: CandPage; children: ReactNode; user?: string }) {
  return (
    <PortalFrame tenant={COMPANY.name} portal="Candidate test portal" user={user} nav={(['My tests', 'Practice', 'Privacy centre'] as CandPage[]).map((l) => ({ label: l, active: l === page }))}>
      {children}
      <nav className="yx-prc-footlinks" aria-label="Legal">
        <a href="#privacy">Privacy notice</a>
        <a href="#terms">Terms of use</a>
        <a href="#accessibility">Accessibility statement</a>
        <a href="#grievance">Grievance officer</a>
      </nav>
    </PortalFrame>
  );
}

/** Screen state shared by list / board screens. */
export type ViewState = 'ready' | 'loading' | 'error' | 'empty';
