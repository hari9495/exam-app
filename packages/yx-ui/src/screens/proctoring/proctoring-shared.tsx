// Frames and panel links for Proctoring (area 'assess') and Analytics (area 'analytics'), APX-D §1.2.
import { createContext, useContext, useState, type ReactNode } from 'react';
import { Button, Link } from '../../components/button';
import { Dialog } from '../../components/overlay';
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
/** A live candidate page's own company and person (AS-3): never the sample company or name. */
export interface CandidateBrand {
  company: string;
  candidate: string;
  logoUrl?: string | null;
  /** Where "My tests" goes; only the tabs that are live are shown. */
  myTestsHref?: string;
}

/**
 * AS-6 (answer 2237): the legal links on a live candidate page: the company's privacy notice for applicants (its text,
 * when it has one) and YukthiX's terms of use. The live app provides them once around the candidate pages.
 */
export interface CandidateLegal {
  privacyNotice: string | null;
  company: string;
  termsHref: string;
  /** AS-5 part 3 (PRC-28): the candidate's privacy centre. */
  privacyCentreHref?: string;
}
export const CandidateLegalContext = createContext<CandidateLegal | null>(null);

function CandidateLegalLinks() {
  const legal = useContext(CandidateLegalContext);
  const [open, setOpen] = useState(false);
  if (!legal) return null;
  return (
    <nav className="yx-prc-footlinks" aria-label="Legal">
      {legal.privacyNotice && (
        <Button size="sm" onClick={() => setOpen(true)}>
          {`${legal.company} privacy notice`}
        </Button>
      )}
      <Link href={legal.termsHref} target="_blank" rel="noopener">
        YukthiX terms of use
      </Link>
      {legal.privacyCentreHref && <Link href={legal.privacyCentreHref}>Your privacy centre</Link>}
      {legal.privacyNotice && (
        <Dialog open={open} onOpenChange={setOpen} title={`${legal.company} privacy notice`} size="md" footer={<Button onClick={() => setOpen(false)}>Close</Button>}>
          <p className="yx-prc-p yx-prc-notice-text">
            {legal.privacyNotice}
          </p>
        </Dialog>
      )}
    </nav>
  );
}

/** T9 candidate test portal: tenant brand, one short tab row, access-expiry banner. */
/**
 * Live pages name the real company: `brand` (AS-3: company, candidate and the My tests tab) or `company` (AS-4a: the
 * company only, no portal tabs or legal links). A sample name or a link that goes nowhere never reaches a real candidate.
 */
export function CandidateFrame({ page, children, user = 'Arjun Nair', brand, company }: { page?: CandPage; children: ReactNode; user?: string; brand?: CandidateBrand; company?: string }) {
  if (brand)
    return (
      <PortalFrame tenant={brand.company} tenantLogoUrl={brand.logoUrl} portal="Candidate test portal" user={brand.candidate} nav={brand.myTestsHref ? [{ label: 'My tests', href: brand.myTestsHref, active: page === 'My tests' }] : []}>
        {children}
        <CandidateLegalLinks />
      </PortalFrame>
    );
  if (company !== undefined)
    return (
      <PortalFrame tenant={company} portal="Candidate test portal" user={user}>
        {children}
        <CandidateLegalLinks />
      </PortalFrame>
    );
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
