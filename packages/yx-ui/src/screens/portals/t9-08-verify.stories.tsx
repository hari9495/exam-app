import type { Meta, StoryObj } from '@storybook/react-vite';
import { VerifyPageScreen } from './t9-workforce';
import { KAVERI_ACCENT, TENANT, VERIFY_DOCS } from './t9-data';

const meta: Meta = { title: 'Screens/Portals/T9-08 · Public verify page', parameters: { layout: 'fullscreen' } };
export default meta;
type S = StoryObj;
const base = { tenant: TENANT, accent: KAVERI_ACCENT, docs: VERIFY_DOCS };

export const Current: S = { name: 'Current document', render: () => <VerifyPageScreen {...base} code="KF-VRF-8Q2M-41TZ" /> };
export const Superseded: S = { render: () => <VerifyPageScreen {...base} code="KF-VRF-3N7P-90KD" /> };
export const NotFound: S = { name: 'Not found (or withdrawn)', render: () => <VerifyPageScreen {...base} code="KF-VRF-7H1C-22WX" /> };
export const EnterCode: S = { name: 'Enter a code', render: () => <VerifyPageScreen {...base} code="" /> };
export const Phone: S = { name: 'Current · phone', globals: { viewport: { value: 'mobile2', isRotated: false } }, render: () => <VerifyPageScreen {...base} code="KF-VRF-8Q2M-41TZ" /> };
