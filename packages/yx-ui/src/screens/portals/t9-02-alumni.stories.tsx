import type { Meta, StoryObj } from '@storybook/react-vite';
import { AlumniPortalScreen, NomineePortalScreen, type LiveAlumniPortal, type LivePortalDoc } from './t9-workforce';
import { PortalSignInScreen, type LiveOtpSignIn } from './portals-kit';
import { fails, ok, play, pressFirst } from '../_kit/story-play';
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

// ------------------------------------------------------------------ Live: the alumni login (/yx/alumni/[org]) and the pay
// documents portal (/yx/pay-portal/[org]) render these screens and this sign-in.
const LIVE_DOCS: LivePortalDoc[] = [
  { id: 'ps10', kind: 'Payslip', title: 'Payslip September 2026', issuedOn: '2026-10-01', period: 'FY 2026-27' },
  { id: 'ps09', kind: 'Payslip', title: 'Payslip August 2026', issuedOn: '2026-09-01', period: 'FY 2026-27' },
  { id: 'f16', kind: 'Form 16', title: 'Form 16 FY 2025-26', issuedOn: '2026-06-12' },
  { id: 'rel', kind: 'Letter', title: 'Relieving letter', issuedOn: '2026-10-03' },
  { id: 'exp', kind: 'Letter', title: 'Experience letter', issuedOn: '2026-10-03' },
];
const ALUMNUS_LIVE: LiveAlumniPortal = { company: 'Kaveri Foods Pvt Ltd', name: 'Rohan Deshpande', email: 'rohan.deshpande@example.in', lastDay: '2026-09-30', accessUntil: '2033-09-30', today: '2026-11-03', docs: LIVE_DOCS, onDownload: ok, onSignOut: () => undefined };
const live = (over: Partial<LiveAlumniPortal> = {}, tab?: 'Payslip' | 'Form 16' | 'Letter') => <AlumniPortalScreen accent={KAVERI_ACCENT} tab={tab} live={{ ...ALUMNUS_LIVE, ...over }} />;
export const LivePayslips: S = { name: 'Live · payslips', render: () => live() };
export const LiveForm16: S = { name: 'Live · Form 16', render: () => live({}, 'Form 16') };
export const LiveLetters: S = { name: 'Live · letters', render: () => live({}, 'Letter') };
export const LiveLoading: S = { name: 'Live · loading', render: () => live({ docs: null }) };
export const LiveNoLetters: S = { name: 'Live · no letters yet', render: () => live({ docs: LIVE_DOCS.filter((x) => x.kind !== 'Letter') }, 'Letter') };
export const LivePayNotLoaded: S = { name: 'Live · payslips could not load', render: () => live({ docs: LIVE_DOCS.filter((x) => x.kind === 'Letter'), loadError: 'Payslips and Form 16 could not load. Sign out and in again, or try later.' }, 'Letter') };
export const LiveEnding: S = { name: 'Live · access ends in 5 days', render: () => live({ accessUntil: '2026-11-08' }) };
export const LiveDownloadFailed: S = { name: 'Live · download refused', render: () => live({ onDownload: fails('This file was deleted after the keeping period. Ask HR for a copy.') }), play: play(pressFirst('Download')) };
export const LivePhone: S = { name: 'Live · phone', globals: phone, render: () => live() };

const NOMINEE_LIVE: LiveAlumniPortal = { ...ALUMNUS_LIVE, name: 'Ramesh Krishnan', email: 'lalitha.k@example.in', lastDay: '2026-08-03', accessUntil: '2027-08-03', docs: [{ id: 'fnf', kind: 'Letter', title: 'Full and final settlement statement', issuedOn: '2026-09-18' }, { id: 'ps07', kind: 'Payslip', title: 'Payslip July 2026', issuedOn: '2026-08-01' }] };
export const LiveNominee: S = { name: 'Live · nominee', render: () => <NomineePortalScreen accent={KAVERI_ACCENT} live={NOMINEE_LIVE} /> };
export const LiveNomineeNone: S = { name: 'Live · nominee, nothing released yet', render: () => <NomineePortalScreen accent={KAVERI_ACCENT} live={{ ...NOMINEE_LIVE, docs: [] }} /> };

const signIn = (over: Partial<LiveOtpSignIn> = {}, defaultStage?: 'code') => (
  <PortalSignInScreen
    tenant="kaveri-foods"
    portal="Former employee documents"
    footer={{ privacy: 'Privacy notice for former employees (G-09)' }}
    signIn={{ title: 'Sign in to your documents', intro: 'For people who have left, for 7 years, and for nominees HR has added. Read only.', defaultStage, destination: defaultStage ? 'rohan.deshpande@example.in' : '', live: { validMinutes: 5, onSendCode: ok, onVerify: ok, ...over } }}
  />
);
export const LiveSignIn: S = { name: 'Live sign-in · open', render: () => signIn() };
export const LiveSignInNoEmail: S = { name: 'Live sign-in · Send code pressed with no email', render: () => signIn(), play: play(pressFirst('Send code')) };
export const LiveSignInWait: S = { name: 'Live sign-in · too many tries, with the wait', render: () => signIn({ onSendCode: fails('Too many tries. Try again in 42 seconds.') }, 'code'), play: play(pressFirst('Resend code')) };
export const LiveSignInCode: S = { name: 'Live sign-in · code sent', render: () => signIn({}, 'code') };
export const LiveSignInNoCode: S = { name: 'Live sign-in · Verify pressed with no code', render: () => signIn({}, 'code'), play: play(pressFirst('Verify and continue')) };
