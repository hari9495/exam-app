import type { Meta, StoryObj } from '@storybook/react-vite';
import { AcademyScreen } from './t9-public';
import { PortalSignInScreen } from './portals-kit';
import { CERTIFICATE, COURSES } from './t9-pub-data';
import { TODAY } from './t9-data';

const meta: Meta = { title: 'Screens/Portals/T9-25 · Academy', parameters: { layout: 'fullscreen' } };
export default meta;
type S = StoryObj;
const base = { courses: COURSES, certificate: CERTIFICATE, today: TODAY };

export const SignIn: S = {
  name: 'Sign in',
  render: () => (
    <PortalSignInScreen tenant="YukthiX" portal="Academy" footer={{ privacy: 'YukthiX privacy notice (G-05)', cookies: true }} signIn={{ title: 'Sign in to the Academy', intro: 'Use your YukthiX work email or partner email.' }} />
  ),
};
export const Catalogue: S = { name: 'Course catalogue', render: () => <AcademyScreen {...base} view="catalogue" /> };
export const Certificate: S = { name: 'My certificate', render: () => <AcademyScreen {...base} view="certificate" /> };
export const Verify: S = { name: 'Public verify · valid', render: () => <AcademyScreen {...base} view="verify" /> };
export const VerifyExpired: S = { name: 'Public verify · expired', render: () => <AcademyScreen {...base} view="verify-expired" /> };
export const VerifyNotFound: S = { name: 'Public verify · not found', render: () => <AcademyScreen {...base} view="verify-not-found" /> };
export const Phone: S = { name: 'Catalogue · phone', globals: { viewport: { value: 'mobile2', isRotated: false } }, render: () => <AcademyScreen {...base} view="catalogue" /> };
