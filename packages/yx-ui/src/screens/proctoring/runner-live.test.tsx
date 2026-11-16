import { useState } from 'react';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { ResultAppealScreen, TestRunnerScreen, type LiveRunner } from './candidate';
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

// Answer 2161: review mode, "answer any N" sections, the phone question list, pictures and code. Answer 2162.
function Runner(props: Partial<LiveRunner>) {
  const [current, setCurrent] = useState(props.current ?? 0);
  return <TestRunnerScreen live={{ ...LIVE_RUNNER, ...props, current, onNavigate: setCurrent }} />;
}
const meta = () => screen.getByRole('button', { name: /^Question \d+ of \d+$/ }).textContent;

describe('PRC-26 live runner: answer 2161 and 2162', () => {
  it('from Finish, goes through only the unanswered questions, then shows all again', async () => {
    render(<Runner />);
    await ue.click(screen.getAllByRole('button', { name: 'Finish test' })[0]!);
    await ue.click(screen.getByRole('button', { name: 'Go through the 2 unanswered questions' }));
    const banner = screen.getByRole('region', { name: 'Going through questions' });
    expect(within(banner).getByText('Unanswered: 1 of 2')).toBeInTheDocument();
    expect(meta()).toMatch(/^Question 2 of 4/);
    await ue.click(within(banner).getByRole('button', { name: 'Next unanswered' }));
    expect(meta()).toMatch(/^Question 4 of 4/);
    expect(within(banner).getByRole('button', { name: 'Next unanswered' })).toBeDisabled();
    await ue.click(within(banner).getByRole('button', { name: 'Show all questions' }));
    expect(screen.queryByRole('region', { name: 'Going through questions' })).not.toBeInTheDocument();
  });

  it('negative: nothing to go through when every question is answered and none is marked', async () => {
    render(<Runner questions={LIVE_RUNNER.questions.map((q) => ({ ...q, answered: true, markedForReview: false }))} />);
    await ue.click(screen.getAllByRole('button', { name: 'Finish test' })[0]!);
    expect(screen.queryByRole('button', { name: /Go through the/ })).not.toBeInTheDocument();
  });

  it('a section that asks for any N of its questions says so, and Finish counts it against N', async () => {
    const sections = [{ name: 'Aptitude', count: 2 }, { name: 'Java', count: 2, required: 1 }];
    render(<Runner sections={sections} current={2} />);
    expect(screen.getByRole('button', { name: 'Java · any 1 of 2' })).toHaveAttribute('aria-current', 'step');
    expect(screen.getByText('Section 2 of 2: Java · answer any 1 of 2')).toBeInTheDocument();
    await ue.click(screen.getAllByRole('button', { name: 'Finish test' })[0]!);
    expect(screen.getByText('Every section has enough answers')).toBeInTheDocument();
    expect(screen.getByText('Java: 1 of 1 answered')).toBeInTheDocument();
  });

  it('negative: a section short of its answers is called out in Finish', async () => {
    const questions = LIVE_RUNNER.questions.map((q) => ({ ...q, answered: false }));
    render(<Runner sections={[{ name: 'Aptitude', count: 2 }, { name: 'Java', count: 2, required: 2 }]} questions={questions} />);
    await ue.click(screen.getAllByRole('button', { name: 'Finish test' })[0]!);
    expect(screen.getByText('Some sections need more answers')).toBeInTheDocument();
    expect(screen.getByText('Java: 0 of 2 answered')).toBeInTheDocument();
  });

  it('shows the question picture with its alt text, the code snippet and option pictures', () => {
    const q = { ...LIVE_RUNNER.questions[0]!, image: { src: 'q.png', alt: 'Monthly sales chart' }, snippet: { language: 'Java', code: 'int x = 1;' }, options: [{ id: 'a', label: 'August', image: { src: 'a.png', alt: null } }, { id: 'b', label: 'March' }] };
    render(<Runner questions={[q]} sections={[{ name: 'All', count: 1 }]} />);
    expect(screen.getByRole('img', { name: 'Monthly sales chart' })).toHaveAttribute('src', 'q.png');
    expect(screen.getByText('int x = 1;')).toBeInTheDocument();
    expect(screen.getByLabelText('Code, Java')).toBeInTheDocument();
    expect(screen.getByRole('img', { name: 'Picture: August' })).toBeInTheDocument();
  });

  it('negative: a question picture without alt text still has a name; no snippet box when there is none', () => {
    const q = { ...LIVE_RUNNER.questions[0]!, image: { src: 'q.png' } };
    render(<Runner questions={[q]} sections={[{ name: 'All', count: 1 }]} />);
    expect(screen.getByRole('img', { name: 'Picture for this question' })).toBeInTheDocument();
    expect(screen.queryByLabelText(/^Code,/)).not.toBeInTheDocument();
  });

  it('on a phone, the question list opens from the header and closes on a choice', async () => {
    render(<Runner />);
    await ue.click(screen.getByRole('button', { name: 'Question 1 of 4' }));
    const list = screen.getByRole('dialog', { name: 'Questions' });
    await ue.click(within(list).getByRole('button', { name: /^Question 3,/ }));
    expect(screen.queryByRole('dialog', { name: 'Questions' })).not.toBeInTheDocument();
    expect(meta()).toMatch(/^Question 3 of 4/);
  });

  it('a test set to scientific opens the scientific calculator; basic stays basic', async () => {
    const { unmount } = render(<Runner calculator="scientific" />);
    await ue.click(screen.getByRole('button', { name: 'Calculator' }));
    expect(screen.getByRole('region', { name: 'Scientific calculator' })).toBeInTheDocument();
    unmount();
    render(<Runner calculator="basic" />);
    await ue.click(screen.getByRole('button', { name: 'Calculator' }));
    expect(screen.queryByRole('button', { name: 'sine' })).not.toBeInTheDocument();
  });
});
