import type { Meta, StoryObj } from '@storybook/react-vite';
import { AlumniPortalScreen, NomineePortalScreen, type LiveAlumniPortal } from './t9-workforce';
import { PortalSignInScreen } from './portals-kit';
import { fails, ok, play, pressFirst } from '../_kit/story-play';
import type { AlumniMe, Letter } from '../people/live/types';
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

// ------------------------------------------------------------------ Live: the alumni login (/yx/alumni/[org]) renders this screen
const letter = (id: string, title: string, issuedAt: string): Letter => ({ id, title, letterType: id, personId: 'p-rohan', referenceNo: `KF/${id.toUpperCase()}/2026/000${id.length}`, verifyCode: null, status: 'issued', renderError: null, issuedAt, personSigns: false, acceptedAt: null, signature: null, supersededById: null });
const ME: AlumniMe = {
  company: 'Kaveri Foods Pvt Ltd',
  name: 'Rohan Deshpande',
  lastDay: '2026-09-30',
  accessUntil: '2027-09-30',
  letters: [letter('rel', 'Relieving letter: Rohan Deshpande', '2026-10-03T06:30:00Z'), letter('exp', 'Experience letter: Rohan Deshpande', '2026-10-03T06:32:00Z')],
};
const live = (over: Partial<LiveAlumniPortal> = {}) => (
  <AlumniPortalScreen accent={KAVERI_ACCENT} live={{ data: ME, email: 'rohan.deshpande@example.in', today: '2026-11-03', onDownload: ok, onSignOut: () => undefined, ...over }} />
);
export const LiveLetters: S = { name: 'Live · letters', render: () => live() };
export const LiveNoLetters: S = { name: 'Live · no letters yet', render: () => live({ data: { ...ME, letters: [] } }) };
export const LiveEnding: S = { name: 'Live · access ends in 5 days', render: () => live({ data: { ...ME, accessUntil: '2026-11-08' } }) };
export const LiveDownloadFailed: S = { name: 'Live · download refused', render: () => live({ onDownload: fails('This letter was withdrawn by HR. Ask them for the corrected one.') }), play: play(pressFirst('Download')) };
export const LivePhone: S = { name: 'Live · phone', globals: phone, render: () => live() };
