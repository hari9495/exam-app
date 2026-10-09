import type { Meta, StoryObj } from '@storybook/react-vite';
import { BankDetailsStep, BgvConsentStep, NomineeForm, OfferLettersPanel, PreboardingDocuments, PreboardingPortalScreen, TaxRegimeStep } from './t9-workforce';
import { PortalSignInScreen } from './portals-kit';
import { JOINER, KAVERI_ACCENT, NOMINEES, PRE_ITEMS, TENANT, TODAY } from './t9-data';

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
export const InviteExpired: S = {
  name: 'Invitation link expired',
  render: () => (
    <PortalSignInScreen
      tenant={TENANT}
      portal="Your joining checklist"
      accent={KAVERI_ACCENT}
      footer={{ privacy: 'Privacy notice for pre-joiners (G-09)' }}
      signIn={{ title: 'Welcome to Kaveri Foods', intro: 'Your invitation opens your joining checklist.', defaultStage: 'link-expired' }}
    />
  ),
};

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
export const Postponed: S = { render: () => <PreboardingPortalScreen {...base} outcome="postponed" newJoiningDate={new Date(2026, 10, 2)} /> };
export const Withdrawn: S = { name: 'Offer withdrawn · access ended', render: () => <PreboardingPortalScreen {...base} outcome="withdrawn" /> };
export const Joined: S = { name: 'Joined · page closed', render: () => <PreboardingPortalScreen {...base} outcome="joined" /> };
