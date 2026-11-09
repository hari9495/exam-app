import type { Meta, StoryObj } from '@storybook/react-vite';
import { ScorecardPhone, ScorecardScreen, type LiveScorecard } from './hiring-pipeline';
import { ID_POINTS, ID_POINTS_CLEAR, SCORECARD_SKILLS } from './hiring-data';
import type { InterviewView } from './live/types';

// The lower-case exports are sample props shared with the tests (hir-06-07-live.test.tsx), not stories.
const meta: Meta = { title: 'Screens/Hiring/HIR-07 · Scorecard form', parameters: { layout: 'fullscreen' }, excludeStories: /^[a-z]/ };
export default meta;
type S = StoryObj;

const base = { candidate: 'Ananya Iyer', round: 'Panel 1 · 29 Sep 2026', skills: SCORECARD_SKILLS };
const PHONE = { viewport: { value: 'mobile2', isRotated: false } };
const ok = async () => ({});

/** One interview as GET hiring/interviews/:id returns it: a two-person panel, Anil has submitted. */
export const sampleInterview: InterviewView = {
  interview: { id: 'iv1', status: 'confirmed', location: 'Video call', timeZone: 'Asia/Kolkata', meetingUrl: 'https://meet.example.com/abc', slots: [{ startsAt: '2026-09-29T05:30:00.000Z', endsAt: '2026-09-29T06:30:00.000Z', confirmed: true }], jobId: 'j1', jobTitle: 'Senior QA Engineer', candidateId: 'c1', candidateName: 'Ananya Iyer' },
  panel: [{ userId: 'u1', name: 'Anil Kumar', submitted: true }, { userId: 'u2', name: 'Kavya Rao', submitted: false }],
  resume: { title: 'QA Engineer', summary: 'Five years testing payment apps.', skills: 'Selenium, Playwright, SQL', hasFile: true },
  template: { id: 'tp1', name: 'Engineer round 1', scaleMax: 5, passBar: 3, items: [{ id: 'a', label: 'Test design', guidance: 'Finds the edge cases', weight: 2 }, { id: 'b', label: 'Communication', guidance: null, weight: 1 }] },
  viewer: { isPanelist: false, isOverseer: true },
  scorecards: [{ id: 'sc1', panelistUserId: 'u1', panelistName: 'Anil Kumar', mine: false, status: 'submitted', recommendation: 'yes', summary: 'Solid on test design.', weightedScore: 3.67, passes: true, submittedAt: '2026-09-29T08:00:00.000Z', ratings: [{ itemId: 'a', rating: 4, notes: 'Named the boundary cases' }, { itemId: 'b', rating: 3, notes: null }] }],
  result: { complete: false, submitted: 1, expected: 2, score: null, passes: null },
  earlier: [],
};

export const sampleLive: LiveScorecard = {
  state: 'ready',
  onRetry: () => undefined,
  view: sampleInterview,
  canManage: true,
  onBack: () => undefined,
  onOpenCandidate: () => undefined,
  onResume: ok,
  onSave: ok,
  onSubmit: ok,
  onResendInterview: ok,
  onCancelInterview: ok,
};

export const Blank: S = { name: 'Interviewer · blank', render: () => <ScorecardScreen {...base} identity={ID_POINTS_CLEAR} /> };
export const MeetsBar: S = { name: 'Complete · meets the bar, next-step prompt', render: () => <ScorecardScreen {...base} defaultRatings={[4, 4, 3, 5]} /> };
export const BelowBar: S = { name: 'Complete · below the bar on 2 skills', render: () => <ScorecardScreen {...base} defaultRatings={[2, 3, 2, 4]} /> };
export const IdentityFlag: S = { name: 'Identity flag shown, not a reason', render: () => <ScorecardScreen {...base} candidate="Rahul Ghosh" identity={ID_POINTS} defaultRatings={[3, null, null, null]} /> };
export const Submitted: S = { name: 'Submitted · read only', render: () => <ScorecardScreen {...base} defaultRatings={[4, 4, 3, 5]} submitted /> };
// HIR-07 build (founder brief): the recruiter's and hiring manager's view of an interview, drawn in the same style.
export const Overseer: S = { name: 'Recruiter or hiring manager · submitted scorecards, resend and cancel', render: () => <ScorecardScreen live={sampleLive} /> };
export const Phone: S = { name: 'phone', globals: PHONE, render: () => <ScorecardPhone {...base} defaultRatings={[4, null, null, null]} /> };
