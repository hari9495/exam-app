import type { Meta, StoryObj } from '@storybook/react-vite';
import { CycleControlRoomScreen, CycleSetupScreen } from './perf-reviews';
import { FUNNEL, OVERDUE } from './perf-data-3';

const meta: Meta = { title: 'Screens/Performance/PRF-04 · Cycle set-up and control room', parameters: { layout: 'fullscreen' } };
export default meta;
type S = StoryObj;
const POP = { eligible: 212, excludedCutoff: 9, prorated: 14, protectedLeave: 3, leavers: 6 };

export const SetupBasics: S = { name: 'Set-up · basics', render: () => <CycleSetupScreen population={POP} /> };
export const SetupPopulation: S = { name: 'Set-up · population and eligibility', render: () => <CycleSetupScreen population={POP} defaultStep="population" /> };
export const SetupTemplate: S = { name: 'Set-up · template and scale', render: () => <CycleSetupScreen population={POP} defaultStep="template" /> };
export const SetupStages: S = { name: 'Set-up · stages and deadlines', render: () => <CycleSetupScreen population={POP} defaultStep="stages" /> };
export const ControlRoom: S = { name: 'Control room · clickable funnel', render: () => <CycleControlRoomScreen name="Half-yearly review H1 FY 2026-27" funnel={FUNNEL} overdue={OVERDUE} /> };
export const FunnelDrill: S = { name: 'Control room · names behind a stage', render: () => <CycleControlRoomScreen name="Half-yearly review H1 FY 2026-27" funnel={FUNNEL} overdue={OVERDUE} openStage="Manager review done" /> };
export const Loading: S = { render: () => <CycleControlRoomScreen name="Half-yearly review H1 FY 2026-27" funnel={FUNNEL} overdue={OVERDUE} state="loading" /> };
