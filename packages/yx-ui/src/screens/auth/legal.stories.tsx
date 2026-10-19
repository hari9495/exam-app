import type { Meta, StoryObj } from '@storybook/react-vite';
import { LegalNoticeScreen } from './legal';

// SEC-02 · Legal notices: the public pages behind the sign-in footer (APX-G G-05, G-16, G-17, G-23, G-21).
const meta: Meta = { title: 'Screens/Security/SEC-02 · Legal notices', parameters: { layout: 'fullscreen' } };
export default meta;
type S = StoryObj;

const EMAIL = 'privacy@yukthix.example';
const OSS = [
  { name: 'react', version: '19.2.0', licence: 'MIT', url: 'https://react.dev/' },
  { name: '@nestjs/core', version: '11.1.28', licence: 'MIT', url: 'https://nestjs.com' },
  { name: '@prisma/client', version: '5.22.0', licence: 'Apache-2.0', url: 'https://www.prisma.io' },
  { name: 'lucide-react', version: '0.468.0', licence: 'ISC', url: 'https://lucide.dev' },
  { name: '@fontsource/ibm-plex-sans', version: '5.3.0', licence: 'OFL-1.1', url: 'https://fontsource.org/fonts/ibm-plex-sans' },
];

export const Privacy: S = { name: 'Privacy notice', render: () => <LegalNoticeScreen doc="privacy" contactEmail={EMAIL} /> };
export const PrivacyNoContact: S = { name: 'Privacy notice · contact not published yet', render: () => <LegalNoticeScreen doc="privacy" /> };
export const Terms: S = { name: 'Terms of use', render: () => <LegalNoticeScreen doc="terms" /> };
export const Accessibility: S = { name: 'Accessibility statement', render: () => <LegalNoticeScreen doc="accessibility" contactEmail={EMAIL} /> };
export const Grievance: S = { name: 'Grievance officer', render: () => <LegalNoticeScreen doc="grievance" contactEmail={EMAIL} /> };
export const OpenSource: S = { name: 'Open-source notices', render: () => <LegalNoticeScreen doc="openSource" components={OSS} /> };
export const Phone: S = { name: 'Grievance officer · phone', globals: { viewport: { value: 'phone' } }, render: () => <LegalNoticeScreen doc="grievance" contactEmail={EMAIL} /> };
