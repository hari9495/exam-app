import type { Meta, StoryObj } from '@storybook/react-vite';
import { OfferBuilderScreen, OfferRecordScreen } from './hiring-offers';
import { D, OFFER_ACTIVITY, OFFER_CONDITIONS } from './hiring-data';
import { TODAY } from '../_kit/data';

const meta: Meta = { title: 'Screens/Hiring/HIR-09 · Offer builder', parameters: { layout: 'fullscreen' } };
export default meta;
type S = StoryObj;

const BAND = { min: 12_00_000, max: 18_00_000 };
const base = { candidate: 'Joseph George', job: 'Senior QA Engineer', grade: 'G6', band: BAND, now: TODAY };
const rec = { candidate: 'Joseph George', job: 'Senior QA Engineer', ctc: 20_50_000, conditions: OFFER_CONDITIONS, lapseDate: D(2026, 10, 6), today: TODAY, activity: OFFER_ACTIVITY };

export const WithinRange: S = { name: 'Recruiter · within range, CTC breakup preview', render: () => <OfferBuilderScreen {...base} defaultCtc={16_00_000} defaultVariable={1_50_000} persona="recruiter" /> };
export const HrEmployerCost: S = { name: 'HR · employer costs, joining bonus with clawback', render: () => <OfferBuilderScreen {...base} defaultCtc={16_00_000} defaultJoining={1_00_000} persona="hr" /> };
export const AboveRange: S = { name: 'Above range · extra approval', render: () => <OfferBuilderScreen {...base} defaultCtc={20_50_000} persona="recruiter" defaultStep="approval" /> };
export const Revision: S = { name: 'Revision v2 · re-approval because CTC changed', render: () => <OfferBuilderScreen {...base} defaultCtc={20_50_000} persona="recruiter" previous={{ version: 1, ctc: 18_00_000, grade: 'G6' }} /> };
export const Letter: S = { name: 'Letter step', render: () => <OfferBuilderScreen {...base} defaultCtc={16_00_000} persona="recruiter" defaultStep="letter" /> };
export const AcceptedManual: S = { name: 'Accepted · manual hand-off, HR creates employee', render: () => <OfferRecordScreen {...rec} status="Accepted" persona="hr" handoff={{ mode: 'manual', personType: 'New person' }} /> };
export const AcceptedRehire: S = { name: 'Accepted · alumni rehire', render: () => <OfferRecordScreen {...rec} candidate="Fatima Shaikh" status="Accepted" persona="hr" handoff={{ mode: 'manual', personType: 'Alumni rehire' }} /> };
export const PartialMatch: S = { name: 'Accepted · partial match stops the hand-off', render: () => <OfferRecordScreen {...rec} status="Accepted" persona="hr" handoff={{ mode: 'automatic', personType: 'Partial match' }} /> };
export const Reneged: S = { name: 'Reneged · pre-boarding unwound', render: () => <OfferRecordScreen {...rec} status="Reneged" declineReason="Counter-offer from current employer" /> };
export const Versions: S = { name: 'Versions tab', render: () => <OfferRecordScreen {...rec} status="Sent" defaultTab="versions" /> };
