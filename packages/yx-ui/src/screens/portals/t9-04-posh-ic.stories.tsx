import type { Meta, StoryObj } from '@storybook/react-vite';
import { ExternalPartyCaseScreen, IcMemberPortalScreen } from './t9-workforce';
import { PortalSignInScreen } from './portals-kit';
import { IC_CASES, IC_MEMBER, KAVERI_ACCENT, TENANT, TODAY } from './t9-data';

const meta: Meta = { title: 'Screens/Portals/T9-04 · POSH IC external member portal', parameters: { layout: 'fullscreen' } };
export default meta;
type S = StoryObj;
const base = { tenant: TENANT, accent: KAVERI_ACCENT, member: IC_MEMBER, cases: IC_CASES, today: TODAY };

export const SignIn: S = {
  name: 'Sign in (OTP, then passkey)',
  render: () => (
    <PortalSignInScreen
      tenant={TENANT}
      portal="Internal Committee · restricted"
      accent={KAVERI_ACCENT}
      footer={{ privacy: 'Privacy notice for IC external members (G-09)' }}
      signIn={{
        title: 'Sign in to the Internal Committee area',
        intro: 'This area needs a code and then your passkey or authenticator app.',
        defaultStage: 'code',
        destination: 'shobha@nyaya-trust.in',
        secondFactor: true,
        notice: 'privacy notice for IC external members (G-09)',
      }}
    />
  ),
};
export const Undertaking: S = { name: 'First sign-in · confidentiality undertaking', render: () => <IcMemberPortalScreen {...base} showUndertaking /> };
export const Cases: S = { name: 'Appointed cases', render: () => <IcMemberPortalScreen {...base} /> };
export const CaseDetail: S = { name: 'Case detail', render: () => <IcMemberPortalScreen {...base} openRef="POSH-2026-007" /> };
export const PastDeadline: S = { name: 'Case past the 90-day limit', render: () => <IcMemberPortalScreen {...base} openRef="POSH-2026-004" /> };
export const NoCases: S = { name: 'No cases assigned', render: () => <IcMemberPortalScreen {...base} cases={[]} /> };
export const ExternalFile: S = { name: 'External party · file a complaint', render: () => <ExternalPartyCaseScreen tenant={TENANT} accent={KAVERI_ACCENT} today={TODAY} mode="file" /> };
export const ExternalFilePhone: S = {
  name: 'External party · file, phone',
  globals: { viewport: { value: 'mobile2', isRotated: false } },
  render: () => <ExternalPartyCaseScreen tenant={TENANT} accent={KAVERI_ACCENT} today={TODAY} mode="file" />,
};
export const ExternalStatus: S = { name: 'External party · case status', render: () => <ExternalPartyCaseScreen tenant={TENANT} accent={KAVERI_ACCENT} today={TODAY} mode="status" /> };
