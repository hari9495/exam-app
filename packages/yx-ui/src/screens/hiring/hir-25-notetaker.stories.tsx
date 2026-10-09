import type { Meta, StoryObj } from '@storybook/react-vite';
import { DraftScorecardReview, NotetakerConsentPanel, type DraftRating, type Participant } from './hiring-pipeline';

const meta: Meta = { title: 'Screens/Hiring/HIR-25 · Interview notetaker consent', parameters: { layout: 'fullscreen' } };
export default meta;
type S = StoryObj;

const ALL: Participant[] = [
  { name: 'Ananya Iyer', role: 'Candidate', consent: 'given' },
  { name: 'Karthik Subramanian', role: 'Hiring manager', consent: 'given' },
  { name: 'Joseph Mathew', role: 'Interviewer', consent: 'given' },
];
const ONE_NO = ALL.map((p) => (p.name === 'Joseph Mathew' ? { ...p, consent: 'declined' as const } : p));
const WAITING = ALL.map((p) => (p.role === 'Candidate' ? { ...p, consent: 'waiting' as const } : p));
const DRAFTS: DraftRating[] = [
  { skill: 'Test design and strategy', aiRating: 4, aiNote: 'Explained risk-based prioritisation for a checkout flow with clear boundary cases.', quote: 'I would start with payment failures and partial refunds, because that is where the money leaks.' },
  { skill: 'Automation (Selenium / Playwright)', aiRating: 3, aiNote: 'Described page objects and flaky-test handling; less detail on CI setup.', quote: 'We retried flaky tests twice, then quarantined them with a ticket.' },
  { skill: 'API and data testing', aiRating: 4, aiNote: 'Walked through contract tests and SQL checks on order data.', quote: 'Every order API test also checks the ledger table row count.' },
  { skill: 'Communication (M06 competency)', aiRating: 4, aiNote: 'Structured answers, asked clarifying questions.', quote: 'Before I answer, is this for the mobile app or the web checkout?' },
];

export const AllConsented: S = { name: 'All consented · recording', render: () => <div style={{ maxWidth: 560 }}><NotetakerConsentPanel participants={ALL} /></div> };
export const OneDeclined: S = { name: 'One declined · no recording', render: () => <div style={{ maxWidth: 560 }}><NotetakerConsentPanel participants={ONE_NO} /></div> };
export const Waiting: S = { name: 'Waiting for the candidate', render: () => <div style={{ maxWidth: 560 }}><NotetakerConsentPanel participants={WAITING} /></div> };
export const DraftReview: S = { name: 'Draft scorecard · 1 of 4 confirmed', render: () => <DraftScorecardReview candidate="Ananya Iyer" drafts={DRAFTS} defaultConfirmed={[0]} /> };
export const DraftAllConfirmed: S = { name: 'Draft scorecard · all confirmed, ready to submit', render: () => <DraftScorecardReview candidate="Ananya Iyer" drafts={DRAFTS} defaultConfirmed={[0, 1, 2, 3]} /> };
