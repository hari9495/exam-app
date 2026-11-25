import type { Meta, StoryObj } from '@storybook/react-vite';
import { PageHeader } from '../../components/shell';
import { DesktopFrame } from '../_kit/frames';
import { TOURS, TourCard, ToursPanel, type LiveTours } from './help';
import { SetupHubScreen, type ModuleCard } from '../platform-a/setup-admin';
import './settings.css';

// Help H-5, founder answer 944: the four tours live. The tour floats on its page (never modal: Tab leaves it, Esc closes
// it, no motion when reduced motion is asked for); Help › Tours resumes or replays each one (H-1 puts the panel in the tab).
const meta: Meta = { title: 'Screens/Help and onboarding/Tours (H-5)', parameters: { layout: 'fullscreen' } };
export default meta;
type S = StoryObj;

const tour = (id: string) => TOURS.find((t) => t.id === id)!;
const LIVE: LiveTours = {
  state: 'ready',
  onRetry: () => {},
  stopped: false,
  onStart: () => {},
  onStopped: () => new Promise((r) => setTimeout(r, 500)),
  tours: [
    { id: 'employee', status: 'completed', step: 2 },
    { id: 'manager', status: 'in_progress', step: 1 },
    { id: 'admin', status: null, step: 0 },
  ],
};
const panel = (live: LiveTours) => (
  <div style={{ maxWidth: 440, padding: 'var(--yx-space-4)' }}>
    <ToursPanel live={live} />
  </div>
);

export const FloatingHome: S = {
  name: '6.1 Tour · on its page (employee, Home)',
  render: () => (
    <DesktopFrame area="home" panelTitle="Home" panel={[{ items: [{ label: 'Home', active: true }, { label: 'Approvals' }] }]}>
      <PageHeader title="Good morning, Divya" description="Wednesday 12 November" />
      <TourCard tour={tour('employee')} floating />
    </DesktopFrame>
  ),
};
export const FloatingApprovals: S = {
  name: '6.1 Tour · on its page (first approval, step 2)',
  render: () => (
    <DesktopFrame area="home" panelTitle="Approvals" panel={[{ items: [{ label: 'Approvals', active: true }] }]}>
      <PageHeader title="Approvals" description="1 waiting for you" />
      <TourCard tour={tour('manager')} defaultStep={1} floating />
    </DesktopFrame>
  ),
};
// The live hub's five areas (H-6), as a company part-way through set-up sees them.
const HUB: ModuleCard[] = [
  { id: 'org', name: 'Organisation', owner: 'HR', checks: [{ id: 'o1', label: 'Legal entities', done: true, blocking: true }, { id: 'o2', label: 'Locations', done: true, blocking: true }, { id: 'o3', label: 'Departments, designations and employment types', done: true, blocking: true }, { id: 'o4', label: 'Company rules reviewed', done: false, blocking: false, starter: true }] },
  { id: 'people', name: 'People', owner: 'HR', checks: [{ id: 'p1', label: 'Employees added', done: true, blocking: true }, { id: 'p2', label: 'A manager for everyone but the top person', done: true, blocking: false }, { id: 'p3', label: 'Letter templates', done: true, blocking: false, starter: true }, { id: 'p4', label: 'Employee record rules reviewed', done: false, blocking: false, starter: true }] },
  { id: 'access', name: 'Roles & access', owner: 'System Admin', checks: [{ id: 'a1', label: 'A second System Admin', done: true, blocking: false }, { id: 'a2', label: 'Roles', done: true, blocking: false }, { id: 'a3', label: 'Access and privacy rules reviewed', done: true, blocking: false, starter: true }] },
  { id: 'time', name: 'Time & Leave', owner: 'HR', checks: [{ id: 't1', label: 'Leave types', done: true, blocking: true }, { id: 't2', label: 'Leave policies', done: false, blocking: true }, { id: 't3', label: 'Holiday calendars', done: true, blocking: true }, { id: 't4', label: 'Shifts', done: false, blocking: false }] },
  { id: 'payroll', name: 'Payroll', owner: 'Payroll admin', checks: [{ id: 'y1', label: 'Pay groups', done: true, blocking: true }, { id: 'y2', label: 'Salary components', done: true, blocking: true }, { id: 'y3', label: 'Salary templates', done: true, blocking: true }, { id: 'y4', label: 'Payroll rules reviewed', done: false, blocking: false, starter: true }] },
];
const LIVE_HUB = { state: 'ready' as const, onRetry: () => {}, onStart: () => {} };
// Answer 1001: the admin tour, version 2, on the set-up hub (H-6's data-tour anchors).
export const FloatingSetupHub: S = {
  name: '6.1 Tour · on its page (set up your company, set-up hub, step 2)',
  render: () => (
    <>
      <SetupHubScreen modules={HUB} live={LIVE_HUB} />
      <TourCard tour={tour('admin')} defaultStep={1} floating />
    </>
  ),
};
export const ToursTab: S = { name: '6.2 Help · Tours tab (resume, replay, start)', render: () => panel(LIVE) };
export const ToursTabStopped: S = { name: '6.2 Help · Tours tab, tours stopped', render: () => panel({ ...LIVE, stopped: true }) };
export const ToursTabNone: S = { name: '6.2 Help · Tours tab, none yet', render: () => panel({ ...LIVE, tours: [] }) };
