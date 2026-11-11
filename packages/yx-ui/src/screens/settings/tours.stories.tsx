import type { Meta, StoryObj } from '@storybook/react-vite';
import { PageHeader } from '../../components/shell';
import { DesktopFrame } from '../_kit/frames';
import { TOURS, TourCard, ToursPanel, type LiveTours } from './help';
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
export const ToursTab: S = { name: '6.2 Help · Tours tab (resume, replay, start)', render: () => panel(LIVE) };
export const ToursTabStopped: S = { name: '6.2 Help · Tours tab, tours stopped', render: () => panel({ ...LIVE, stopped: true }) };
export const ToursTabNone: S = { name: '6.2 Help · Tours tab, none yet', render: () => panel({ ...LIVE, tours: [] }) };
