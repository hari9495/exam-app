import type { Meta, StoryObj } from '@storybook/react-vite';
import { InterviewScreen, MyInterviewsScreen, ScorecardTemplatesScreen, type InterviewScreenProps, type MyInterviewsScreenProps, type ScorecardTemplatesScreenProps } from './interviews';

// Recruitment, wired (batch AT5; M10-BUILD-DESIGN §9): interviews and scorecards until HIR-06 / HIR-07. The job workspace
// list moved into the HIR-04 sheets and the HIR-03 settings tab; the application into HIR-05 (founder answer 261). In the affordance guard set ('screens-hiring-live').
// The lower-case exports are sample props shared with the tests, not stories.
const meta: Meta = { title: 'Screens/Hiring/Live · Job workspace and interviews', parameters: { layout: 'fullscreen' }, excludeStories: /^[a-z]/ };
export default meta;
type S = StoryObj;

const ok = async () => ({});
const inHours = (h: number) => new Date(Date.parse('2026-10-14T10:00:00.000Z') + h * 3_600_000).toISOString();

export const interview: InterviewScreenProps = {
  state: 'ready',
  view: {
    interview: { id: 'iv1', status: 'confirmed', location: 'Video call', timeZone: 'Asia/Kolkata', meetingUrl: 'https://meet.example.com/abc', slots: [{ startsAt: inHours(-2), endsAt: inHours(-1), confirmed: true }], jobId: 'j1', jobTitle: 'Plant Engineer', candidateId: 'c1', candidateName: 'Priya Raman' },
    panel: [{ userId: 'u1', name: 'Anil', submitted: true }, { userId: 'u2', name: 'Kavya', submitted: false }],
    resume: { title: 'Process Engineer', summary: 'Six years on dairy lines.', skills: 'HACCP, Lean', hasFile: true },
    template: { id: 'tp1', name: 'Engineer round 1', scaleMax: 4, passBar: 2.5, items: [{ id: 'a', label: 'Plant safety', guidance: 'Names the hazards', weight: 2 }, { id: 'b', label: 'Communication', guidance: null, weight: 1 }] },
    viewer: { isPanelist: true, isOverseer: false },
    scorecards: [{ id: 'sc2', panelistUserId: 'u2', panelistName: 'Kavya', mine: true, status: 'draft', recommendation: null, summary: null, weightedScore: null, passes: null, submittedAt: null, ratings: [{ itemId: 'a', rating: 3, notes: null }] }],
    result: null,
    earlier: [],
  },
  onBack: () => undefined,
  onResume: ok,
  onSave: ok,
  onSubmit: ok,
};

export const mine: MyInterviewsScreenProps = {
  state: 'ready',
  rows: [
    { id: 'iv1', candidateName: 'Priya Raman', jobTitle: 'Plant Engineer', when: inHours(-2), status: 'confirmed', scorecard: 'draft' },
    { id: 'iv2', candidateName: 'Arun Kumar', jobTitle: 'Plant Engineer', when: inHours(26), status: 'proposed', scorecard: 'not_started' },
    { id: 'iv3', candidateName: 'Divya S', jobTitle: 'Cashier', when: inHours(-72), status: 'confirmed', scorecard: 'submitted' },
  ],
  onOpen: () => undefined,
};

export const templates: ScorecardTemplatesScreenProps = {
  state: 'ready',
  templates: [{ id: 'tp1', name: 'Engineer round 1', scaleMax: 4, passBar: 2.5, inUse: true, items: [{ id: 'a', label: 'Plant safety', guidance: null, weight: 2, competencyId: null }] }],
  competencies: [{ value: 'cp1', label: 'Problem solving' }],
  canManage: true,
  onSave: ok,
  onArchive: ok,
};

export const Interview: S = { render: () => <InterviewScreen {...interview} /> };
export const InterviewSubmitted: S = { render: () => <InterviewScreen {...interview} view={{ ...interview.view!, scorecards: [{ ...interview.view!.scorecards[0], status: 'submitted', recommendation: 'yes', weightedScore: 3, passes: true, ratings: [{ itemId: 'a', rating: 3, notes: null }, { itemId: 'b', rating: 3, notes: null }] }, { id: 'sc1', panelistUserId: 'u1', panelistName: 'Anil', mine: false, status: 'submitted', recommendation: 'strong_yes', summary: 'Best this month', weightedScore: 3.67, passes: true, submittedAt: inHours(-1), ratings: [] }], result: { complete: true, submitted: 2, expected: 2, score: 3.33, passes: true } }} /> };
export const MyInterviews: S = { render: () => <MyInterviewsScreen {...mine} /> };
export const Scorecards: S = { render: () => <ScorecardTemplatesScreen {...templates} /> };
