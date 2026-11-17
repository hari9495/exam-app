import type { Meta, StoryObj } from '@storybook/react-vite';
import { TestBuilderScreen } from '../bank-tests';
import { BUILDER_WAITING, COMPANY_SKILLS, JD_PLAN, liveBuilder } from '../tests-live-samples';

const meta: Meta<typeof TestBuilderScreen> = { title: 'Screens/Proctoring/PRC-04 · Test builder', component: TestBuilderScreen, parameters: { layout: 'fullscreen' } };
export default meta;
type S = StoryObj<typeof TestBuilderScreen>;

export const Blueprint: S = { name: 'Blueprint grid' };
export const BelowPoolDepth: S = { name: 'Blueprint below pool depth', args: { shortCells: true } };
export const Template: S = { name: 'Template library', args: { step: 'template' } };
export const BuildFromJd: S = { name: 'Build from job description', args: { step: 'template', jd: true } };
export const Adaptive: S = { name: 'Adaptive config', args: { mode: 'Adaptive' } };
export const AdaptiveSimulated: S = { name: 'Adaptive simulation results', args: { mode: 'Adaptive', simulated: true } };
export const Timing: S = { name: 'Timing and navigation', args: { step: 'timing' } };
export const Proctoring: S = { name: 'Proctoring mode', args: { step: 'proctoring' } };
export const ReviewBlocked: S = { name: 'Pre-publish checklist, blocked', args: { step: 'review', shortCells: true } };
export const ReviewReady: S = { name: 'Pre-publish checklist, ready', args: { step: 'review' } };

// AS-2: the states the real test builder has (answers 2007, 2008; asmt.high_stakes).
export const LiveChecklistBlocked: S = { name: 'Company test: checklist blocked, approver needed', render: () => <TestBuilderScreen live={liveBuilder()} /> };
export const LiveApprovalWaiting: S = { name: 'Company test: approval asked, waiting for you', render: () => <TestBuilderScreen live={liveBuilder({ test: BUILDER_WAITING })} /> };
export const LiveCustomProctoring: S = { name: 'Company test: proctoring set switch by switch', render: () => <TestBuilderScreen live={liveBuilder({ test: { ...BUILDER_WAITING, proctoringMode: 'custom' } })} /> };
export const LiveEditSections: S = { name: 'Company test: edit sections and pools (answer 2153)', render: () => <TestBuilderScreen live={liveBuilder({ onAddSection: () => Promise.resolve(), onSaveSection: () => Promise.resolve(), onDeleteSection: () => Promise.resolve(), onSavePool: () => Promise.resolve() })} /> };
export const LiveFromJd: S = { name: 'Build from a job description (answer 2151)', render: () => <TestBuilderScreen live={liveBuilder({ test: null, skills: COMPANY_SKILLS, onProposeFromJd: () => Promise.resolve(JD_PLAN), onCreateFromJd: () => Promise.resolve() })} /> };
export const LiveStart: S = { name: 'Start from one of our tests', render: () => <TestBuilderScreen live={liveBuilder({ test: null })} /> };
