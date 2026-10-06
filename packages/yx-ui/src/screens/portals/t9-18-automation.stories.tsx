import type { Meta, StoryObj } from '@storybook/react-vite';
import { AutomationNoticeScreen } from './t9-candidate';
import { AUTOMATION } from './t9-cand-data';
import { KAVERI_ACCENT, TENANT, TODAY } from './t9-data';

const meta: Meta = { title: 'Screens/Portals/T9-18 · Automation notice and consent', parameters: { layout: 'fullscreen' } };
export default meta;
type S = StoryObj;
const base = { tenant: TENANT, accent: KAVERI_ACCENT, info: AUTOMATION, today: TODAY };

export const Notice: S = { name: 'Notice and consent', render: () => <AutomationNoticeScreen {...base} /> };
export const Phone: S = { name: 'Notice · phone', globals: { viewport: { value: 'mobile2', isRotated: false } }, render: () => <AutomationNoticeScreen {...base} /> };
export const Consented: S = { name: 'Consent recorded', render: () => <AutomationNoticeScreen {...base} state="consented" /> };
export const Alternative: S = { name: 'Asked for a person-only review', render: () => <AutomationNoticeScreen {...base} state="declined" /> };
