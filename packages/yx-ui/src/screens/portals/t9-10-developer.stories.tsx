import type { Meta, StoryObj } from '@storybook/react-vite';
import { DeveloperPortalScreen } from './t9-public';
import { CHANGELOG, ENDPOINTS } from './t9-pub-data';
import { TODAY } from './t9-data';

const meta: Meta = { title: 'Screens/Portals/T9-10 · Developer portal', parameters: { layout: 'fullscreen' } };
export default meta;
type S = StoryObj;
const base = { endpoints: ENDPOINTS, changelog: CHANGELOG, today: TODAY };

export const Overview: S = { render: () => <DeveloperPortalScreen {...base} section="home" /> };
export const Reference: S = { name: 'API reference', render: () => <DeveloperPortalScreen {...base} section="reference" /> };
export const Webhooks: S = { name: 'Guide · webhook signatures', render: () => <DeveloperPortalScreen {...base} section="webhooks" /> };
export const Changelog: S = { name: 'Changelog with deprecation', render: () => <DeveloperPortalScreen {...base} section="changelog" /> };
export const Sandbox: S = { name: 'Sandbox sign-up', render: () => <DeveloperPortalScreen {...base} section="sandbox" /> };
export const SandboxReady: S = { name: 'Sandbox ready', render: () => <DeveloperPortalScreen {...base} section="sandbox-done" /> };
export const Phone: S = { name: 'Reference · phone', globals: { viewport: { value: 'mobile2', isRotated: false } }, render: () => <DeveloperPortalScreen {...base} section="reference" /> };
