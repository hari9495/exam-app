import type { LiveIntegrityDecision } from './candidate';
import type { LiveAppealRow, LiveIncident, LiveIncidentRow } from './integrity-live';

// AS-5 part 1: integrity review and appeals as the web pages build them, for stories and tests.
export const ME = 'u-farah';
export const LIVE_INCIDENT_ROWS: LiveIncidentRow[] = [
  { id: 'i-1', candidate: 'Sneha Iyer', test: 'Java Backend Developer · L2', level: 'high_concern', flags: ['similarity_match', 'webcam_violations'], status: 'open', reviewer: null, verdict: null, appeal: null, openedAt: '2026-11-15T09:30:00.000Z' },
  { id: 'i-2', candidate: 'Manoj Kumar', test: 'Java Backend Developer · L2', level: 'review', flags: ['large_paste'], status: 'second_review', reviewer: 'Farah Siddiqui', verdict: 'attempt', appeal: null, openedAt: '2026-11-14T11:00:00.000Z' },
  { id: 'i-3', candidate: 'Nandini Reddy', test: 'SQL Analyst', level: 'review', flags: ['proctoring_events'], status: 'decided', reviewer: 'Gopal Menon', verdict: 'warning', appeal: 'open', openedAt: '2026-11-12T08:15:00.000Z' },
];
export const LIVE_INCIDENT: LiveIncident = {
  id: 'i-1',
  status: 'open',
  level: 'high_concern',
  candidate: { name: 'Sneha Iyer', email: 'sneha@example.in' },
  test: { title: 'Java Backend Developer · L2' },
  submittedAt: '2026-11-15T09:02:00.000Z',
  sections: ['Aptitude', 'Java'],
  analysis: {
    flags: [
      { type: 'similarity_match', severity: 'high', detail: 'Code for question 13 is 91 % similar to another candidate in the same test.' },
      { type: 'webcam_violations', severity: 'medium', detail: 'More than one face seen 3 times.' },
    ],
    narrative: 'Two signals point the same way; a person should look at the code and the camera moments.',
  },
  events: [
    { id: 'e-1', type: 'webcam_multiple_faces', severity: 'high', at: '2026-11-15T08:23:15.000Z' },
    { id: 'e-2', type: 'tab_switch', severity: 'low', at: '2026-11-15T08:41:10.000Z' },
  ],
  reviewer: { id: ME, name: 'Farah Siddiqui' },
  verdict: null,
  sectionTitle: null,
  reason: null,
  decidedBy: null,
  decidedAt: null,
  secondReviewer: null,
  confirmedBy: null,
  confirmedAt: null,
  appealClosesAt: null,
  appeal: null,
};
export const LIVE_REVIEWERS = [
  { id: 'u-gopal', name: 'Gopal Menon' },
  { id: 'u-arvind', name: 'Arvind Swamy' },
];
export const LIVE_APPEAL_ROWS: LiveAppealRow[] = [
  {
    id: 'a-1',
    candidate: 'Manoj Kumar',
    test: 'Java Backend Developer · L2',
    verdict: 'section',
    sectionTitle: 'Java',
    verdictReason: 'Code for questions 13 and 15 is 91 % similar to another candidate in the same drive.',
    verdictBy: ['Farah Siddiqui'],
    excluded: [ME],
    text: 'I wrote this solution in my college project last year; the same classmate was in my drive.',
    status: 'open',
    reason: null,
    decidedBy: null,
    decidedAt: null,
    createdAt: '2026-11-15T10:00:00.000Z',
  },
  {
    id: 'a-2',
    candidate: 'Sanjay Chatterjee',
    test: 'SQL Analyst',
    verdict: 'attempt',
    sectionTitle: null,
    verdictReason: 'The face at the start does not match the photo from the application.',
    verdictBy: ['Gopal Menon', 'Arvind Swamy'],
    excluded: ['u-gopal', 'u-arvind'],
    text: 'My photo on the application was five years old.',
    status: 'upheld',
    reason: 'The ID shown on camera does not match the name on the application either.',
    decidedBy: 'Lakshmi Venkatesan',
    decidedAt: '2026-11-13T12:00:00.000Z',
    createdAt: '2026-11-10T10:00:00.000Z',
  },
];
export const LIVE_DECISION: LiveIntegrityDecision = {
  verdict: 'section',
  sectionTitle: 'Java',
  reason: 'A reviewer found your Java answers 91 % similar to another candidate in the same test.',
  decidedOn: '15 Nov 2026',
  appealUntil: '22 Nov 2026',
  canAppeal: true,
  appeal: null,
};
