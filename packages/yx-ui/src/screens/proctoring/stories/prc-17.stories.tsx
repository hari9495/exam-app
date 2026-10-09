import type { Meta, StoryObj } from '@storybook/react-vite';
import { IncidentWorkspaceScreen } from '../integrity';
import { INCIDENTS } from '../proctoring-data';

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
