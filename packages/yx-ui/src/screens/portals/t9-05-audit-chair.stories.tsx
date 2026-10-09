import type { Meta, StoryObj } from '@storybook/react-vite';
import { AuditChairPortalScreen } from './t9-workforce';
import { PortalSignInScreen } from './portals-kit';
import { ACC_CHAIR, KAVERI_ACCENT, TENANT, TODAY, WB_CASES } from './t9-data';

const meta: Meta = { title: 'Screens/Portals/T9-05 · Audit-committee chair portal', parameters: { layout: 'fullscreen' } };
export default meta;
type S = StoryObj;
const base = { tenant: TENANT, accent: KAVERI_ACCENT, chair: ACC_CHAIR, cases: WB_CASES, today: TODAY };

export const SignIn: S = {
  name: 'Sign in (OTP, then passkey)',
  render: () => (
    <PortalSignInScreen
      tenant={TENANT}
      portal="Audit committee · whistleblower cases"
      accent={KAVERI_ACCENT}
      footer={{ privacy: 'Privacy notice for the audit-committee chair (G-09)' }}
      signIn={{ title: 'Sign in', intro: 'A code, then your passkey or authenticator app.', secondFactor: true, notice: 'privacy notice for the audit-committee chair (G-09)' }}
    />
  ),
};
export const Queue: S = { name: 'Cases routed to the chair', render: () => <AuditChairPortalScreen {...base} /> };
export const Outcome: S = { name: 'Outcome ready · retaliation flagged', render: () => <AuditChairPortalScreen {...base} openRef="WB-2026-011" /> };
export const Phone: S = { name: 'Cases · phone', globals: { viewport: { value: 'mobile2', isRotated: false } }, render: () => <AuditChairPortalScreen {...base} /> };
export const Empty: S = { name: 'No open cases', render: () => <AuditChairPortalScreen {...base} cases={WB_CASES.filter((c) => c.status === 'Closed')} /> };
