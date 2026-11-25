import type { Meta, StoryObj } from '@storybook/react-vite';
import { liveEvaluator } from '../marking-live-samples';
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

// AS-6: the company's real answers to mark (live). No rubric in the engine yet: marks out of the question's marks (question 2271).
export const LiveBlind: S = { name: 'Live · blind, not marked yet', render: () => <EvaluatorConsoleScreen live={liveEvaluator()} /> };
export const LiveMarkedSuggestion: S = { name: 'Live · marked, AI suggestion shown', render: () => <EvaluatorConsoleScreen live={liveEvaluator({}, { mine: { marks: 6, feedback: null, round: 1 }, state: 'final', suggestion: { marks: 7, reason: 'Names a method (5 Whys) and a cause from the line; owner is clear.' } })} /> };
export const LiveModerator: S = { name: 'Live · moderator', render: () => <EvaluatorConsoleScreen live={liveEvaluator({}, { state: 'needs_moderation', toModerate: { a: 2, b: 8 } })} /> };
export const LiveMinor: S = { name: 'Live · under-18, human only', render: () => <EvaluatorConsoleScreen live={liveEvaluator({}, { minor: true, mine: { marks: 5, feedback: null, round: 1 }, state: 'final' })} /> };
export const LiveCode: S = { name: 'Live · code answer', render: () => <EvaluatorConsoleScreen live={liveEvaluator({}, { question: { text: 'Return the k most frequent words.', type: 'code', marks: 10 }, answer: { text: 'public List<String> topK(List<String> w, int k) { return List.of(); }', language: 'Java 17', files: [] } })} /> };
export const LiveNothing: S = { name: 'Live · nothing to mark', render: () => <EvaluatorConsoleScreen live={liveEvaluator({ item: null, position: null })} /> };
