import type { Meta, StoryObj } from '@storybook/react-vite';
import { EvaluatorConsoleScreen } from '../integrity';

const meta: Meta<typeof EvaluatorConsoleScreen> = { title: 'Screens/Proctoring/PRC-19 · Evaluator console', component: EvaluatorConsoleScreen, parameters: { layout: 'fullscreen' } };
export default meta;
type S = StoryObj<typeof EvaluatorConsoleScreen>;

export const Blind: S = { name: 'Blind marking, not scored yet' };
export const ScoredWithAi: S = { name: 'Scored: AI suggestion revealed', args: { defaultScores: { c1: 3, c2: 2, c3: 2 } } };
export const Moderation: S = { name: 'Disagreement: moderation', args: { defaultScores: { c1: 3, c2: 3, c3: 2 }, otherScore: 2 } };
export const Code: S = { name: 'Code response', args: { kind: 'code' } };
export const AiAllowed: S = { name: 'AI-allowed test: assistant log', args: { kind: 'ai-allowed' } };
export const Minor: S = { name: 'Under-18: human only', args: { minor: true, defaultScores: { c1: 2, c2: 2, c3: 1 } } };
export const NotBlind: S = { name: 'Blind mode off', args: { blind: false } };
