import type { Meta, StoryObj } from '@storybook/react-vite';
import { ScorecardPhone, ScorecardScreen } from './hiring-pipeline';
import { ID_POINTS, ID_POINTS_CLEAR, SCORECARD_SKILLS } from './hiring-data';

const meta: Meta = { title: 'Screens/Hiring/HIR-07 · Scorecard form', parameters: { layout: 'fullscreen' } };
export default meta;
type S = StoryObj;

const base = { candidate: 'Ananya Iyer', round: 'Panel 1 · 29 Sep 2026', skills: SCORECARD_SKILLS };
const PHONE = { viewport: { value: 'mobile2', isRotated: false } };

export const Blank: S = { name: 'Interviewer · blank', render: () => <ScorecardScreen {...base} identity={ID_POINTS_CLEAR} /> };
export const MeetsBar: S = { name: 'Complete · meets the bar, next-step prompt', render: () => <ScorecardScreen {...base} defaultRatings={[4, 4, 3, 5]} /> };
export const BelowBar: S = { name: 'Complete · below the bar on 2 skills', render: () => <ScorecardScreen {...base} defaultRatings={[2, 3, 2, 4]} /> };
export const IdentityFlag: S = { name: 'Identity flag shown, not a reason', render: () => <ScorecardScreen {...base} candidate="Rahul Ghosh" identity={ID_POINTS} defaultRatings={[3, null, null, null]} /> };
export const Submitted: S = { name: 'Submitted · read only', render: () => <ScorecardScreen {...base} defaultRatings={[4, 4, 3, 5]} submitted /> };
export const Phone: S = { name: 'phone', globals: PHONE, render: () => <ScorecardPhone {...base} defaultRatings={[4, null, null, null]} /> };
