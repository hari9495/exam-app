import type { Meta, StoryObj } from '@storybook/react-vite';
import { TrainerPortalScreen } from './t9-workforce';
import { PortalSignInScreen } from './portals-kit';
import { KAVERI_ACCENT, TENANT, TODAY, TRAINER, TRAINER_SESSIONS } from './t9-data';

const meta: Meta = { title: 'Screens/Portals/T9-03 · External trainer portal', parameters: { layout: 'fullscreen' } };
export default meta;
type S = StoryObj;
const ends = new Date(2026, 9, 28);
const base = { tenant: TENANT, accent: KAVERI_ACCENT, trainer: TRAINER, sessions: TRAINER_SESSIONS, today: TODAY, accessEnds: ends };

export const SignIn: S = {
  name: 'Sign in (email OTP)',
  render: () => (
    <PortalSignInScreen
      tenant={TENANT}
      portal="Trainer sessions"
      accent={KAVERI_ACCENT}
      footer={{ privacy: 'Privacy notice for external trainers (G-09)' }}
      signIn={{ title: 'Sign in to your sessions', intro: 'Use the email the learning team booked you with.', notice: 'privacy notice for external trainers (G-09)' }}
    />
  ),
};
export const MarkAttendance: S = { name: 'Today · mark attendance', render: () => <TrainerPortalScreen {...base} selectedId="s1" /> };
export const Results: S = { name: 'Completed · enter results', render: () => <TrainerPortalScreen {...base} selectedId="s2" tab="results" /> };
export const Feedback: S = { name: 'Completed · feedback summary', render: () => <TrainerPortalScreen {...base} selectedId="s2" tab="feedback" /> };
export const Upcoming: S = { name: 'Upcoming · attendance not open', render: () => <TrainerPortalScreen {...base} selectedId="s3" /> };
export const Phone: S = { name: 'Today · phone', globals: { viewport: { value: 'mobile2', isRotated: false } }, render: () => <TrainerPortalScreen {...base} selectedId="s1" /> };
export const Ended: S = { name: 'Access ended', render: () => <TrainerPortalScreen {...base} selectedId="s2" accessEnds={new Date(2026, 8, 20)} /> };
