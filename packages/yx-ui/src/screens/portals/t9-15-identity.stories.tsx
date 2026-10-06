import type { Meta, StoryObj } from '@storybook/react-vite';
import { IdentityVerificationScreen } from './t9-candidate';
import { KAVERI_ACCENT, TENANT, TODAY } from './t9-data';

const meta: Meta = { title: 'Screens/Portals/T9-15 · Candidate identity verification', parameters: { layout: 'fullscreen' } };
export default meta;
type S = StoryObj;
const phone = { viewport: { value: 'mobile2', isRotated: false } };
const base = { tenant: TENANT, accent: KAVERI_ACCENT, today: TODAY };

export const Consent: S = { name: 'Consent (biometric)', globals: phone, render: () => <IdentityVerificationScreen {...base} stage="consent" /> };
export const Id: S = { name: 'ID document', globals: phone, render: () => <IdentityVerificationScreen {...base} stage="id" /> };
export const Selfie: S = { name: 'Selfie · camera live', globals: phone, render: () => <IdentityVerificationScreen {...base} stage="selfie" /> };
export const SelfieBlocked: S = { name: 'Selfie · camera blocked', globals: phone, render: () => <IdentityVerificationScreen {...base} stage="selfie" camera="blocked" /> };
export const Verified: S = { globals: phone, render: () => <IdentityVerificationScreen {...base} stage="verified" /> };
export const Mismatch: S = { name: 'No match · human review, never auto-reject', globals: phone, render: () => <IdentityVerificationScreen {...base} stage="mismatch" /> };
export const ReVerify: S = { name: 'Re-verification after a failed match', render: () => <IdentityVerificationScreen {...base} stage="re-verify" /> };
export const Fallback: S = { name: 'Consent declined · ID check with a person', globals: phone, render: () => <IdentityVerificationScreen {...base} stage="fallback" /> };
export const UnderEighteen: S = { name: 'Under 18 · ID check only', globals: phone, render: () => <IdentityVerificationScreen {...base} stage="under-18" /> };
