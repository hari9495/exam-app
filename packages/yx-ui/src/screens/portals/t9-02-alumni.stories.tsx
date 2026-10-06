import type { Meta, StoryObj } from '@storybook/react-vite';
import { AlumniPortalScreen, NomineePortalScreen } from './t9-workforce';
import { PortalSignInScreen } from './portals-kit';
import { ALUMNI_DOCS, ALUMNUS, DECEASED, FNF_LINES, KAVERI_ACCENT, NOMINEE_DOCS, NOMINEE_PERSON, TENANT, TODAY } from './t9-data';

const meta: Meta = { title: 'Screens/Portals/T9-02 · Alumni and nominee portal', parameters: { layout: 'fullscreen' } };
export default meta;
type S = StoryObj;
const phone = { viewport: { value: 'mobile2', isRotated: false } };

export const SignIn: S = {
  name: 'Sign in (personal email or mobile)',
  render: () => (
    <PortalSignInScreen
      tenant={TENANT}
      portal="Former employee documents"
      accent={KAVERI_ACCENT}
      footer={{ privacy: 'Privacy notice for former employees (G-09)' }}
      signIn={{ title: 'Sign in to your documents', intro: 'Use the personal email or mobile number you gave HR when you left.', channel: 'either', notice: 'privacy notice for former employees (G-09)' }}
    />
  ),
};
export const NoAccessForAddress: S = {
  name: 'Sign in · no access for this address',
  render: () => (
    <PortalSignInScreen
      tenant={TENANT}
      portal="Former employee documents"
      accent={KAVERI_ACCENT}
      footer={{ privacy: 'Privacy notice for former employees (G-09)' }}
      signIn={{ title: 'Sign in to your documents', intro: 'Use the personal email you gave HR.', defaultStage: 'no-access' }}
    />
  ),
};
export const AlumniPayslips: S = { name: 'Alumni · payslips', render: () => <AlumniPortalScreen tenant={TENANT} accent={KAVERI_ACCENT} person={ALUMNUS} docs={ALUMNI_DOCS} today={TODAY} /> };
export const AlumniForm16: S = { name: 'Alumni · Form 16', render: () => <AlumniPortalScreen tenant={TENANT} accent={KAVERI_ACCENT} person={ALUMNUS} docs={ALUMNI_DOCS} today={TODAY} tab="Form 16" /> };
export const AlumniPhone: S = { name: 'Alumni · phone', globals: phone, render: () => <AlumniPortalScreen tenant={TENANT} accent={KAVERI_ACCENT} person={ALUMNUS} docs={ALUMNI_DOCS} today={TODAY} tab="Letter" /> };
export const AlumniEmpty: S = {
  name: 'Alumni · no letters issued',
  render: () => <AlumniPortalScreen tenant={TENANT} accent={KAVERI_ACCENT} person={ALUMNUS} docs={ALUMNI_DOCS.filter((d) => d.kind !== 'Letter')} today={TODAY} tab="Letter" />,
};
export const AlumniEnding: S = {
  name: 'Alumni · access ends in 5 days',
  render: () => <AlumniPortalScreen tenant={TENANT} accent={KAVERI_ACCENT} person={{ ...ALUMNUS, exitDate: new Date(2019, 9, 4) }} docs={ALUMNI_DOCS} today={TODAY} />,
};
export const Nominee: S = {
  name: 'Nominee · claim documents',
  render: () => <NomineePortalScreen tenant={TENANT} accent={KAVERI_ACCENT} nominee={NOMINEE_PERSON} deceased={DECEASED} docs={NOMINEE_DOCS} fnf={FNF_LINES} today={TODAY} />,
};
export const NomineePhone: S = {
  name: 'Nominee · phone',
  globals: phone,
  render: () => <NomineePortalScreen tenant={TENANT} accent={KAVERI_ACCENT} nominee={NOMINEE_PERSON} deceased={DECEASED} docs={NOMINEE_DOCS} fnf={FNF_LINES} today={TODAY} />,
};
export const NomineeClosed: S = {
  name: 'Nominee · claims closed',
  render: () => <NomineePortalScreen tenant={TENANT} accent={KAVERI_ACCENT} nominee={NOMINEE_PERSON} deceased={DECEASED} docs={NOMINEE_DOCS} fnf={FNF_LINES} today={TODAY} claimsClosed />,
};
