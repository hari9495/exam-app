import type { Meta, StoryObj } from '@storybook/react-vite';
import { CampusRegistrationScreen, CollegeCoordinatorScreen } from './t9-candidate';
import { PortalSignInScreen } from './portals-kit';
import { COLLEGE, COLLEGE_REGISTRANTS, COLLEGE_RESULTS, DRIVE } from './t9-cand-data';
import { KAVERI_ACCENT, TENANT, TODAY } from './t9-data';

const meta: Meta = { title: 'Screens/Portals/T9-11 · Campus registration portal', parameters: { layout: 'fullscreen' } };
export default meta;
type S = StoryObj;
const phone = { viewport: { value: 'mobile2', isRotated: false } };
const base = { tenant: TENANT, accent: KAVERI_ACCENT, drive: DRIVE, today: TODAY };
const coord = { tenant: TENANT, accent: KAVERI_ACCENT, college: COLLEGE, registrants: COLLEGE_REGISTRANTS, results: COLLEGE_RESULTS, today: TODAY };

export const Form: S = { name: 'Registration form', globals: phone, render: () => <CampusRegistrationScreen {...base} stage="form" /> };
export const FormDesktop: S = { name: 'Registration form · desktop', render: () => <CampusRegistrationScreen {...base} stage="form" /> };
export const Otp: S = { name: 'Verify mobile (OTP)', globals: phone, render: () => <CampusRegistrationScreen {...base} stage="otp" /> };
export const Registered: S = { name: 'Registered and eligible', globals: phone, render: () => <CampusRegistrationScreen {...base} stage="registered" /> };
export const Ineligible: S = { name: 'Registered, not eligible', globals: phone, render: () => <CampusRegistrationScreen {...base} stage="ineligible" /> };
export const Matched: S = { name: 'Matched to an existing candidate', globals: phone, render: () => <CampusRegistrationScreen {...base} stage="matched" /> };
export const Full: S = { name: 'Cap reached', globals: phone, render: () => <CampusRegistrationScreen {...base} stage="cap-reached" /> };
export const Closed: S = { name: 'Registration closed', globals: phone, render: () => <CampusRegistrationScreen {...base} stage="closed" /> };
export const AdmitCard: S = { name: 'Admit card with QR', globals: phone, render: () => <CampusRegistrationScreen {...base} stage="admit-card" /> };
export const CoordinatorSignIn: S = {
  name: 'Coordinator · sign in',
  render: () => (
    <PortalSignInScreen
      tenant={TENANT}
      portal="Campus drive · college coordinator"
      accent={KAVERI_ACCENT}
      footer={{ privacy: 'Privacy notice for college coordinators (G-07)' }}
      signIn={{ title: 'Sign in as placement coordinator', intro: 'Use your college placement email.' }}
    />
  ),
};
export const CoordinatorPerCandidate: S = { name: 'Coordinator · per-candidate results', render: () => <CollegeCoordinatorScreen {...coord} visibility="per-candidate" /> };
export const CoordinatorAggregate: S = { name: 'Coordinator · aggregate only', render: () => <CollegeCoordinatorScreen {...coord} visibility="aggregate" /> };
export const CoordinatorNone: S = { name: 'Coordinator · results not shared', render: () => <CollegeCoordinatorScreen {...coord} visibility="none" /> };
