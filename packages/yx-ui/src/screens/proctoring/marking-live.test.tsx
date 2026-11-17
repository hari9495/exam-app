import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { ToastProvider } from '../../components/notify';
import { EvaluatorConsoleScreen, FairnessScreen } from './integrity';
import { liveEvaluator, liveFairness } from './marking-live-samples';

// AS-6 (PRC-19, answers 2019, 2165): marking and fairness, live.
const ue = userEvent.setup({ pointerEventsCheck: 0 });
const wrap = (ui: React.ReactElement) => render(<ToastProvider>{ui}</ToastProvider>);

describe('PRC-19 evaluator console (live)', () => {
  it('blind: no name; the AI suggestion waits for my own mark; saving sends the marks and feedback', async () => {
    const onMark = vi.fn().mockResolvedValue(undefined);
    wrap(<EvaluatorConsoleScreen live={liveEvaluator({ onMark })} />);
    expect(screen.getByText(/Candidate hidden \(blind marking\)/)).toBeInTheDocument();
    expect(screen.getByText('The AI suggestion shows after you enter your own mark.')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Show the AI suggestion' })).toBeNull();
    await ue.click(screen.getByRole('button', { name: 'Save mark' }));
    expect(onMark).not.toHaveBeenCalled();
    expect((await screen.findAllByText('Enter your marks first.')).length).toBeGreaterThan(0);
    await ue.type(screen.getByRole('textbox', { name: /Your marks/ }), '6');
    await ue.type(screen.getByRole('textbox', { name: /Feedback/ }), 'Clear method');
    await ue.click(screen.getByRole('button', { name: 'Save mark' }));
    expect(onMark).toHaveBeenCalledWith(6, 'Clear method');
  });

  it('after my mark the suggestion can be asked for; negative: never for an under-18, never above the marks', async () => {
    const onSuggest = vi.fn().mockResolvedValue(undefined);
    const { unmount } = wrap(<EvaluatorConsoleScreen live={liveEvaluator({ onSuggest }, { mine: { marks: 6, feedback: null, round: 1 }, state: 'final' })} />);
    await ue.click(screen.getByRole('button', { name: 'Show the AI suggestion' }));
    expect(onSuggest).toHaveBeenCalled();
    unmount();
    const r2 = wrap(<EvaluatorConsoleScreen live={liveEvaluator({}, { minor: true, mine: { marks: 6, feedback: null, round: 1 }, state: 'final' })} />);
    expect(screen.getByText('Under-18 test-taker: human marking only, no AI suggestion.')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Show the AI suggestion' })).toBeNull();
    r2.unmount();
    const onMark = vi.fn();
    wrap(<EvaluatorConsoleScreen live={liveEvaluator({ onMark })} />);
    await ue.type(screen.getByRole('textbox', { name: /Your marks/ }), '12');
    await ue.click(screen.getByRole('button', { name: 'Save mark' }));
    expect(onMark).not.toHaveBeenCalled();
  });

  it('the moderator sees the two marks; a finished attempt can be closed; nothing waiting says so', async () => {
    const onFinish = vi.fn().mockResolvedValue(undefined);
    const { unmount } = wrap(<EvaluatorConsoleScreen live={liveEvaluator({ onFinish }, { state: 'needs_moderation', toModerate: { a: 2, b: 8 }, attemptReady: true })} />);
    expect(screen.getByText(/The two blind marks were 2 and 8/)).toBeInTheDocument();
    await ue.click(screen.getByRole('button', { name: 'Finish marking this attempt' }));
    expect(onFinish).toHaveBeenCalled();
    unmount();
    wrap(<EvaluatorConsoleScreen live={liveEvaluator({ item: null, position: null })} />);
    expect(screen.getByText('Nothing to mark.')).toBeInTheDocument();
  });
});

describe('Fairness (live, answers 2019, 2165)', () => {
  it('shows each group with its pass rate; a hidden group says so; a finding opens a review', async () => {
    const onOpenReview = vi.fn().mockResolvedValue(undefined);
    wrap(<FairnessScreen live={liveFairness({ onOpenReview })} />);
    expect(screen.getByText('0.66')).toBeInTheDocument();
    expect(screen.getByText('Under 30')).toBeInTheDocument();
    expect(screen.getByText(/412 answers · average 4.1 of 5 · 88 %/)).toBeInTheDocument();
    await ue.click(screen.getByRole('button', { name: 'Open review task' }));
    expect(onOpenReview).toHaveBeenCalled();
  });

  it('an open review is decided with a reason; negative: no reason, no decision; a small survey is hidden', async () => {
    const onDecide = vi.fn().mockResolvedValue(undefined);
    wrap(<FairnessScreen live={liveFairness({ onDecide }, { survey: null, review: { id: 'r1', finding: 'Pass rate for women is 66 %', openedAt: '2026-11-17T05:00:00.000Z', decision: null, reason: null, decidedAt: null } })} />);
    expect(screen.getByText('Not enough answers yet.')).toBeInTheDocument();
    await ue.click(screen.getByRole('button', { name: 'Decide' }));
    const dialog = screen.getByRole('dialog');
    await ue.click(within(dialog).getByRole('button', { name: 'Save decision' }));
    expect(onDecide).not.toHaveBeenCalled();
    await ue.click(within(dialog).getByRole('radio', { name: 'Revise the test' }));
    await ue.type(within(dialog).getByRole('textbox', { name: /Reason/ }), 'Two items favour one group');
    await ue.click(within(dialog).getByRole('button', { name: 'Save decision' }));
    expect(onDecide).toHaveBeenCalledWith('r1', 'revise', 'Two items favour one group');
  });
});

describe('PRC-19 AI-allowed test: assistant log (answer 2272)', () => {
  it('the marker reads the log for this question and how much was asked elsewhere', () => {
    wrap(<EvaluatorConsoleScreen live={liveEvaluator({}, { assistant: { turns: [{ role: 'candidate', body: 'List causes of seal failures.', at: '2026-11-17T05:00:00.000Z' }, { role: 'assistant', body: 'Low jaw temperature…', at: '2026-11-17T05:00:05.000Z' }], otherTurns: 2 } })} />);
    expect(screen.getByText(/Using the approved assistant is not an integrity issue here/)).toBeInTheDocument();
    expect(screen.getByText('Assistant log for this question · 1 turn')).toBeInTheDocument();
    expect(within(screen.getByRole('list', { name: 'Assistant log' })).getByText('Low jaw temperature…')).toBeInTheDocument();
    expect(screen.getByText('2 more questions to the assistant on other questions of this test.')).toBeInTheDocument();
  });

  it('negative: not used on this question says so; a test that is not AI-allowed shows no log', () => {
    const { unmount } = wrap(<EvaluatorConsoleScreen live={liveEvaluator({}, { assistant: { turns: [], otherTurns: 0 } })} />);
    expect(screen.getByText('The candidate did not use the assistant on this question.')).toBeInTheDocument();
    unmount();
    wrap(<EvaluatorConsoleScreen live={liveEvaluator({}, { assistant: null })} />);
    expect(screen.queryByText(/Assistant log/)).toBeNull();
  });
});
