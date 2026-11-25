import type { Meta, StoryObj } from '@storybook/react-vite';
import { BankDetailsStep, BgvConsentStep, DeclineOffer, EmergencyContactStep, IdentityStep, NomineeForm, OfferLettersPanel, PersonalDetailsStep, PreboardingDocuments, PreboardingPortalScreen, TaxRegimeStep } from './t9-workforce';
import { PortalSignInScreen } from './portals-kit';
import { BGV_NOTICE_ITEMS, EMERGENCY, JOINER, KAVERI_ACCENT, NOMINEES, PERSONAL, PRE_CLOSED_LETTERS, PRE_ITEMS, PRE_LETTERS, TENANT, TODAY } from './t9-data';

const meta: Meta = { title: 'Screens/Portals/T9-01 · Pre-boarding portal', parameters: { layout: 'fullscreen' } };
export default meta;
type S = StoryObj;
const phone = { viewport: { value: 'mobile2', isRotated: false } };
const base = { tenant: TENANT, accent: KAVERI_ACCENT, joiner: JOINER, items: PRE_ITEMS, today: TODAY };

export const SignIn: S = {
  name: 'Sign in (email OTP)',
  render: () => (
    <PortalSignInScreen
      tenant={TENANT}
      portal="Your joining checklist"
      accent={KAVERI_ACCENT}
      footer={{ privacy: 'Privacy notice for pre-joiners (G-09)' }}
      signIn={{ title: 'Sign in to your joining checklist', intro: 'Use the email address your offer was sent to. We send you a one-time code.', notice: 'privacy notice for pre-joiners (G-09)' }}
    />
  ),
};
export const SignInCode: S = {
  name: 'Sign in · code sent',
  render: () => (
    <PortalSignInScreen
      tenant={TENANT}
      portal="Your joining checklist"
      accent={KAVERI_ACCENT}
      footer={{ privacy: 'Privacy notice for pre-joiners (G-09)' }}
      signIn={{ title: 'Enter your code', intro: 'Check your inbox for a message from Kaveri Foods.', defaultStage: 'code', destination: JOINER.email, resendIn: 24, notice: 'privacy notice for pre-joiners (G-09)' }}
    />
  ),
};
export const SignInWrongCode: S = {
  name: 'Sign in · wrong code, 2 attempts left',
  render: () => (
    <PortalSignInScreen
      tenant={TENANT}
      portal="Your joining checklist"
      accent={KAVERI_ACCENT}
      footer={{ privacy: 'Privacy notice for pre-joiners (G-09)' }}
      signIn={{ title: 'Enter your code', intro: 'Check your inbox for a message from Kaveri Foods.', defaultStage: 'code', destination: JOINER.email, defaultAttempts: 3 }}
    />
  ),
};
export const SignInLocked: S = {
  name: 'Sign in · locked after 5 wrong codes',
  render: () => (
    <PortalSignInScreen
      tenant={TENANT}
      portal="Your joining checklist"
      accent={KAVERI_ACCENT}
      footer={{ privacy: 'Privacy notice for pre-joiners (G-09)' }}
      signIn={{ title: 'Enter your code', intro: 'Check your inbox.', defaultStage: 'code', destination: JOINER.email, defaultAttempts: 5, helpContact: 'Lakshmi Venkatesan in HR' }}
    />
  ),
};
// No InviteExpired story: joiners sign in with their email and an emailed code; there is no invitation link to expire
// (founder default, 2 Nov 2026). A wrong or expired code is SignInWrongCode.

export const Checklist: S = { render: () => <PreboardingPortalScreen {...base} /> };
export const ChecklistPhone: S = { name: 'Checklist · phone', globals: phone, render: () => <PreboardingPortalScreen {...base} /> };
export const CampusBatch: S = {
  name: 'Checklist · campus joining batch',
  render: () => <PreboardingPortalScreen {...base} joiner={{ ...JOINER, batch: 'Campus batch Oct 2026 · 38 joiners' }} />,
};
export const Nominees: S = {
  name: 'Family and nominees · shares do not add up',
  render: () => (
    <PreboardingPortalScreen {...base}>
      <NomineeForm defaultNominees={NOMINEES} />
    </PreboardingPortalScreen>
  ),
};
export const BankStepUp: S = {
  name: 'Bank details · step-up code',
  render: () => (
    <PreboardingPortalScreen {...base}>
      <BankDetailsStep stage="step-up" holderName={JOINER.name} />
    </PreboardingPortalScreen>
  ),
};
export const BankForm: S = {
  name: 'Bank details · form',
  render: () => (
    <PreboardingPortalScreen {...base}>
      <BankDetailsStep stage="form" holderName={JOINER.name} />
    </PreboardingPortalScreen>
  ),
};
export const BankVerified: S = {
  name: 'Bank details · verified',
  render: () => (
    <PreboardingPortalScreen {...base}>
      <BankDetailsStep stage="verified" holderName={JOINER.name} />
    </PreboardingPortalScreen>
  ),
};
export const BankMismatch: S = {
  name: 'Bank details · name mismatch',
  render: () => (
    <PreboardingPortalScreen {...base}>
      <BankDetailsStep stage="mismatch" holderName={JOINER.name} />
    </PreboardingPortalScreen>
  ),
};
export const TaxRegime: S = {
  name: 'Tax regime and previous income',
  render: () => (
    <PreboardingPortalScreen {...base}>
      <TaxRegimeStep defaultRegime="new" />
    </PreboardingPortalScreen>
  ),
};
export const LetterOfIntent: S = {
  name: 'Offer · letter of intent',
  render: () => (
    <PreboardingPortalScreen {...base} tab="offer">
      <OfferLettersPanel state="loi" joiner={JOINER} ctc={6_80_000} />
    </PreboardingPortalScreen>
  ),
};
export const ESign: S = {
  name: 'Offer · e-sign appointment letter',
  render: () => (
    <PreboardingPortalScreen {...base} tab="offer">
      <OfferLettersPanel state="to-sign" joiner={JOINER} ctc={6_80_000} />
    </PreboardingPortalScreen>
  ),
};
export const Documents: S = {
  name: 'Documents · one sent back',
  render: () => (
    <PreboardingPortalScreen {...base} tab="documents">
      <PreboardingDocuments items={PRE_ITEMS} />
    </PreboardingPortalScreen>
  ),
};
export const BgvConsent: S = {
  name: 'Background verification consent',
  render: () => (
    <PreboardingPortalScreen {...base}>
      <BgvConsentStep />
    </PreboardingPortalScreen>
  ),
};
export const Postponed: S = { render: () => <PreboardingPortalScreen {...base} outcome="postponed" newJoiningDate={new Date(2026, 10, 2)} movedFrom={JOINER.joiningDate} /> };
export const Withdrawn: S = { name: 'Offer withdrawn · access ended', render: () => <PreboardingPortalScreen {...base} outcome="withdrawn" /> };
export const Joined: S = { name: 'Joined · page closed', render: () => <PreboardingPortalScreen {...base} outcome="joined" /> };

/* ------------------------------------------------------------------ States the first design lacked (drawn before wiring, 2 Nov 2026) */

const signOut = () => undefined;
export const Loading: S = { name: 'Loading', render: () => <PreboardingPortalScreen {...base} state="loading" onSignOut={signOut} /> };
export const LoadError: S = { name: 'Could not load · try again', render: () => <PreboardingPortalScreen {...base} state="error" onSignOut={signOut} /> };
export const AfterYouJoin: S = {
  name: 'Checklist · your tasks after joining',
  render: () => (
    <PreboardingPortalScreen
      {...base}
      onSignOut={signOut}
      items={[
        ...PRE_ITEMS.filter((i) => i.section !== 'Statutory (HR completes)'),
        { id: 'task:welcome', section: 'After you join', title: 'How things work here', hint: 'In the employee app after you join', status: 'todo', due: new Date(2026, 9, 13), later: true },
      ]}
    />
  ),
};
export const PersonalForm: S = {
  name: 'Personal details · pressed too early',
  render: () => (
    <PreboardingPortalScreen {...base}>
      <PersonalDetailsStep defaultValue={{ ...PERSONAL, dateOfBirth: '', postalCode: '6351' }} tried />
    </PreboardingPortalScreen>
  ),
};
export const PersonalFilled: S = {
  name: 'Personal details · form',
  render: () => (
    <PreboardingPortalScreen {...base}>
      <PersonalDetailsStep defaultValue={PERSONAL} />
    </PreboardingPortalScreen>
  ),
};
export const IdentityStepUp: S = {
  name: 'PAN and ID · step-up code',
  render: () => (
    <PreboardingPortalScreen {...base}>
      <IdentityStep stage="step-up" defaultName={JOINER.name} />
    </PreboardingPortalScreen>
  ),
};
export const IdentityForm: S = {
  name: 'PAN and ID · form',
  render: () => (
    <PreboardingPortalScreen {...base}>
      <IdentityStep stage="form" defaultName={JOINER.name} onFile={{ pan: '••••••234F', aadhaar: null }} />
    </PreboardingPortalScreen>
  ),
};
export const EmergencyForm: S = {
  name: 'Emergency contact · form',
  render: () => (
    <PreboardingPortalScreen {...base}>
      <EmergencyContactStep defaultValue={EMERGENCY} />
    </PreboardingPortalScreen>
  ),
};
export const NomineesAdd: S = {
  name: 'Family and nominees · add a nominee',
  render: () => (
    <PreboardingPortalScreen {...base}>
      <NomineeForm defaultNominees={NOMINEES} defaultAdding />
    </PreboardingPortalScreen>
  ),
};
export const TaxRegimeEarly: S = {
  name: 'Tax regime · pressed too early',
  render: () => (
    <PreboardingPortalScreen {...base}>
      <TaxRegimeStep defaultPrevious={{ grossSalary: 18_600, tds: 42_000 }} tried />
    </PreboardingPortalScreen>
  ),
};
export const BgvNotice: S = {
  name: 'Background check consent · the notice',
  render: () => (
    <PreboardingPortalScreen {...base}>
      <BgvConsentStep items={BGV_NOTICE_ITEMS} notice="BGV v1" company={TENANT} />
    </PreboardingPortalScreen>
  ),
};
export const BgvWithdraw: S = {
  name: 'Background check consent · withdraw',
  render: () => (
    <PreboardingPortalScreen {...base}>
      <BgvConsentStep items={BGV_NOTICE_ITEMS} notice="BGV v1" company={TENANT} consentedOn={new Date(2026, 8, 26)} defaultWithdrawOpen />
    </PreboardingPortalScreen>
  ),
};
export const OfferLetters: S = {
  name: 'Offer · letters to download and accept',
  render: () => (
    <PreboardingPortalScreen {...base} tab="offer">
      <OfferLettersPanel state="to-sign" joiner={JOINER} ctc={0} letters={PRE_LETTERS} />
    </PreboardingPortalScreen>
  ),
};
export const AcceptCode: S = {
  name: 'Offer · accept with an emailed code',
  render: () => (
    <PreboardingPortalScreen {...base} tab="offer">
      <OfferLettersPanel state="to-sign" joiner={JOINER} ctc={0} letters={PRE_LETTERS} defaultAccepting="l-apt" />
    </PreboardingPortalScreen>
  ),
};
export const DeclineReason: S = {
  name: 'Decline offer · reason',
  render: () => (
    <PreboardingPortalScreen {...base}>
      <DeclineOffer company={TENANT} defaultOpen />
    </PreboardingPortalScreen>
  ),
};
export const Declined: S = { name: 'Declined · page closed', render: () => <PreboardingPortalScreen {...base} outcome="reneged" onSignOut={signOut} /> };
export const Cancelled: S = { name: 'Cancelled · access ended', render: () => <PreboardingPortalScreen {...base} outcome="cancelled" onSignOut={signOut} /> };

/* ------------------------------------------------------------------ Founder answers 2 Nov 2026 (drawn before wiring) */

/** (2) A closed joining keeps its letters: download only, nothing to accept; every change is refused. */
export const WithdrawnLetters: S = {
  name: 'Offer withdrawn · letters to download (read-only)',
  render: () => (
    <PreboardingPortalScreen {...base} outcome="withdrawn" onSignOut={signOut}>
      <OfferLettersPanel state="signed" joiner={JOINER} ctc={0} letters={PRE_CLOSED_LETTERS} readOnly />
    </PreboardingPortalScreen>
  ),
};
export const JoinedLetters: S = {
  name: 'Joined · letters to download (read-only)',
  render: () => (
    <PreboardingPortalScreen {...base} outcome="joined" onSignOut={signOut}>
      <OfferLettersPanel state="signed" joiner={JOINER} ctc={0} letters={PRE_LETTERS.map((l) => ({ ...l, signature: { status: 'signed' as const, signedAt: '2026-09-25T10:00:00Z' } }))} readOnly />
    </PreboardingPortalScreen>
  ),
};