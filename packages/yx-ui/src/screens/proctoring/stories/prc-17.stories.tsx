import type { Meta, StoryObj } from '@storybook/react-vite';
import { IncidentWorkspaceScreen } from '../integrity';
import { INCIDENTS } from '../proctoring-data';
import { LIVE_INCIDENT, LIVE_REVIEWERS, ME } from '../integrity-live-samples';
const fn = async () => undefined;

const meta: Meta<typeof IncidentWorkspaceScreen> = { title: 'Screens/Proctoring/PRC-17 · Incident workspace', component: IncidentWorkspaceScreen, parameters: { layout: 'fullscreen' } };
export default meta;
type S = StoryObj<typeof IncidentWorkspaceScreen>;

export const Review: S = { name: 'Flag review: playback, timeline, evidence' };
export const DisqualifyNeedsSecond: S = { name: 'Disqualify: second reviewer required', args: { defaultVerdict: 'attempt', defaultReason: 'Second person reading the screen at 23:15 and 33:30.' } };
export const Accept: S = { name: 'Accept (cleared) with reason', args: { defaultVerdict: 'cleared', defaultReason: 'Tab switches under 5 s; no other signals.' } };
export const SecondReview: S = { name: 'Second reviewer', args: { variant: 'second-review' } };
export const IdentityMismatch: S = { name: 'Identity mismatch', args: { variant: 'identity', incident: INCIDENTS[6] } };
export const Decided: S = { name: 'Verdict given', args: { variant: 'decided' } };
export const Escalated: S = { name: 'Escalated: legal hold and evidence export', args: { variant: 'escalated', incident: INCIDENTS[6] } };

// AS-5 part 1: a real incident, waiting for a verdict; waiting for the second reviewer (you); decided with an appeal open.
const LIVE = { state: 'ready' as const, onRetry: () => {}, incident: LIVE_INCIDENT, me: ME, reviewers: LIVE_REVIEWERS, onTake: fn, onVerdict: fn, onInvalidate: fn, onSecondReview: fn, onBack: () => {} };
export const LiveReview: S = { name: 'Live · waiting for a verdict', args: { live: LIVE } };
export const LiveSecondReview: S = { name: 'Live · you are the second reviewer', args: { live: { ...LIVE, incident: { ...LIVE_INCIDENT, status: 'second_review', verdict: 'attempt', reason: 'Frames at 23:15 and 33:30 show a second person reading the screen.', decidedBy: { id: 'u-gopal', name: 'Gopal Menon' }, decidedAt: '2026-11-15T10:00:00.000Z', secondReviewer: { id: ME, name: 'Farah Siddiqui' } } } } };
export const LiveDecided: S = { name: 'Live · verdict given, appeal open', args: { live: { ...LIVE, incident: { ...LIVE_INCIDENT, status: 'decided', verdict: 'warning', reason: 'A family member came in twice; the candidate asked them to leave.', decidedBy: { id: ME, name: 'Farah Siddiqui' }, decidedAt: '2026-11-15T10:00:00.000Z', appealClosesAt: '2026-11-22T10:00:00.000Z', appeal: { text: 'It was my mother bringing water.', status: 'open', reason: null, decidedBy: null, decidedAt: null, createdAt: '2026-11-16T09:00:00.000Z' } } } } };
