import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { ResultAppealScreen, TestRunnerScreen } from './candidate';
import { LIVE_RESULT, LIVE_RUNNER } from './runner-live-samples';

// AS-4a (PRC-26, PRC-27): the designed runner and result page with a real attempt.
const ue = userEvent.setup({ pointerEventsCheck: 0 });

describe('PRC-26 live runner', () => {
  it('answers, marks and moves; the calculator and display settings open; a break starts', async () => {
    const onAnswer = vi.fn();
    const onMark = vi.fn();
    const onNavigate = vi.fn();
    const onStartBreak = vi.fn().mockResolvedValue(undefined);
    render(<TestRunnerScreen live={{ ...LIVE_RUNNER, onAnswer, onMark, onNavigate, onStartBreak }} />);
    await ue.click(screen.getByLabelText('filter() is terminal'));
    expect(onAnswer).toHaveBeenCalledWith(expect.objectContaining({ id: 'q1' }), ['a']);
    await ue.click(screen.getByRole('checkbox', { name: 'Mark for review' }));
    expect(onMark).toHaveBeenCalledWith(expect.objectContaining({ id: 'q1' }), true);
    await ue.click(screen.getByRole('button', { name: 'Java · 2' }));
    expect(onNavigate).toHaveBeenCalledWith(2);
    await ue.click(screen.getByRole('button', { name: 'Calculator' }));
    expect(screen.getByRole('region', { name: 'Calculator' })).toBeInTheDocument();
    await ue.click(screen.getByRole('button', { name: 'Display' }));
    expect(screen.getByText('Display settings')).toBeInTheDocument();
    await ue.click(screen.getByRole('button', { name: 'Take a break (1 left)' }));
    expect(onStartBreak).toHaveBeenCalled();
  });

  it('negative: no calculator when the test offers none, no break button when none are left', () => {
    render(<TestRunnerScreen live={{ ...LIVE_RUNNER, calculator: 'none', breaksLeft: 0 }} />);
    expect(screen.queryByRole('button', { name: 'Calculator' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Take a break/ })).not.toBeInTheDocument();
  });

  it('offline: keeps answering within the limit; past it, answering stops and the answers stay on the device', async () => {
    const onAnswer = vi.fn();
    const { rerender } = render(<TestRunnerScreen live={{ ...LIVE_RUNNER, onAnswer, connection: 'reconnecting', offlineSeconds: 60, queued: 2 }} />);
    expect(screen.getByText(/2 answers are kept on this device/)).toBeInTheDocument();
    await ue.click(screen.getByLabelText('filter() is terminal'));
    expect(onAnswer).toHaveBeenCalledTimes(1);
    rerender(<TestRunnerScreen live={{ ...LIVE_RUNNER, onAnswer, connection: 'offline', offlineSeconds: 360, queued: 2 }} />);
    expect(screen.getByText('Answering is paused until you are back online')).toBeInTheDocument();
    await ue.click(screen.getByLabelText('filter() is terminal'));
    expect(onAnswer).toHaveBeenCalledTimes(1);
  });

  it('a break shows its time left and ends on "End break and continue"', async () => {
    const onEndBreak = vi.fn().mockResolvedValue(undefined);
    render(<TestRunnerScreen live={{ ...LIVE_RUNNER, status: 'break', breakSecondsLeft: 236, onEndBreak }} />);
    expect(screen.getByText('03:56')).toBeInTheDocument();
    await ue.click(screen.getByRole('button', { name: 'End break and continue' }));
    expect(onEndBreak).toHaveBeenCalled();
  });

  it('submitted: the survey needs a rating before it sends; skipping hides it', async () => {
    const onSend = vi.fn().mockResolvedValue(undefined);
    const { unmount } = render(<TestRunnerScreen live={{ ...LIVE_RUNNER, status: 'submitted', survey: { done: false, onSend } }} />);
    await ue.click(screen.getByRole('button', { name: 'Start survey' }));
    await ue.click(screen.getByRole('button', { name: 'Send' }));
    expect(screen.getByText('Choose a rating')).toBeInTheDocument();
    expect(onSend).not.toHaveBeenCalled();
    await ue.click(screen.getByRole('radio', { name: '5 · Very good' }));
    await ue.type(screen.getByRole('textbox', { name: /Anything else/ }), 'Clear and fair');
    await ue.click(screen.getByRole('button', { name: 'Send' }));
    expect(onSend).toHaveBeenCalledWith({ rating: 5, comment: 'Clear and fair' });
    expect(await screen.findByText('Thank you for answering the survey.')).toBeInTheDocument();
    unmount();
    render(<TestRunnerScreen live={{ ...LIVE_RUNNER, status: 'submitted', survey: { done: false, onSend } }} />);
    await ue.click(screen.getByRole('button', { name: 'Skip' }));
    expect(screen.queryByText(/how was the test/)).not.toBeInTheDocument();
  });
});

describe('PRC-27 live result', () => {
  it('released shows only what the test lets the candidate see; held says it is under review, nothing more', () => {
    const { rerender } = render(<ResultAppealScreen live={LIVE_RESULT} />);
    expect(screen.getByText('Result: passed')).toBeInTheDocument();
    expect(screen.getByText('72 %')).toBeInTheDocument();
    rerender(<ResultAppealScreen live={{ ...LIVE_RESULT, passed: null, percentage: null, sections: null }} />);
    expect(screen.queryByText(/%/)).not.toBeInTheDocument();
    rerender(<ResultAppealScreen live={{ ...LIVE_RESULT, state: 'held' }} />);
    expect(screen.getByText('Result under review')).toBeInTheDocument();
    expect(screen.queryByText('72 %')).not.toBeInTheDocument();
  });
});
