import { useState } from 'react';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { ResultAppealScreen, TestRunnerScreen, type LiveRunner } from './candidate';
import { LIVE_RESULT, LIVE_RUNNER } from './runner-live-samples';
import { CandidateLegalContext } from './proctoring-shared';

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

// AS-6 (answers 2019, 2237): the voluntary self-description in the survey, and the legal links on candidate pages.
describe('AS-6 candidate pages', () => {
  it('the survey sends how the candidate describes themselves only when they choose one', async () => {
    const onSend = vi.fn().mockResolvedValue(undefined);
    render(<TestRunnerScreen live={{ ...LIVE_RUNNER, status: 'submitted', survey: { done: false, onSend } }} />);
    await ue.click(screen.getByRole('button', { name: 'Start survey' }));
    await ue.click(screen.getByRole('radio', { name: '4' }));
    await ue.click(screen.getByRole('radio', { name: 'Prefer not to say' }));
    await ue.click(screen.getByRole('button', { name: 'Send' }));
    expect(onSend).toHaveBeenCalledWith({ rating: 4, gender: 'not_say' });
  });

  it('the result page shows the company privacy notice and the YukthiX terms; negative: no notice, no notice button', async () => {
    const { unmount } = render(
      <CandidateLegalContext.Provider value={{ privacyNotice: 'We keep your test for 90 days.', company: 'Acme', termsHref: '/yx/legal/terms' }}>
        <ResultAppealScreen live={{ ...LIVE_RESULT, companyName: 'Acme' }} />
      </CandidateLegalContext.Provider>,
    );
    expect(screen.getByRole('link', { name: 'YukthiX terms of use' })).toHaveAttribute('href', '/yx/legal/terms');
    await ue.click(screen.getByRole('button', { name: 'Acme privacy notice' }));
    expect(within(screen.getByRole('dialog')).getByText('We keep your test for 90 days.')).toBeInTheDocument();
    unmount();
    render(
      <CandidateLegalContext.Provider value={{ privacyNotice: null, company: 'Acme', termsHref: '/yx/legal/terms' }}>
        <ResultAppealScreen live={{ ...LIVE_RESULT, companyName: 'Acme' }} />
      </CandidateLegalContext.Provider>,
    );
    expect(screen.queryByRole('button', { name: 'Acme privacy notice' })).toBeNull();
    expect(screen.getByRole('link', { name: 'YukthiX terms of use' })).toBeInTheDocument();
  });

  it('2269: the proctor\'s message shows until Got it; a reply is sent; negative: an empty reply is not', async () => {
    const onRead = vi.fn().mockResolvedValue(undefined);
    const onReply = vi.fn().mockResolvedValue(undefined);
    render(<TestRunnerScreen live={{ ...LIVE_RUNNER, messages: { items: [{ id: 'm1', body: 'Please keep your face in view.' }], onRead, onReply } }} />);
    expect(screen.getByText('Message from your proctor')).toBeInTheDocument();
    expect(screen.getByText('Please keep your face in view.')).toBeInTheDocument();
    await ue.click(screen.getByRole('button', { name: 'Reply' }));
    const d = screen.getByRole('dialog', { name: 'Reply to your proctor' });
    await ue.click(within(d).getByRole('button', { name: 'Send' }));
    expect(within(d).getByText('Write your message first.')).toBeInTheDocument();
    expect(onReply).not.toHaveBeenCalled();
    await ue.type(within(d).getByLabelText(/^Your message/), 'Sorry, fixed now.');
    await ue.click(within(d).getByRole('button', { name: 'Send' }));
    expect(onReply).toHaveBeenCalledWith('Sorry, fixed now.');
    await ue.click(screen.getByRole('button', { name: 'Got it' }));
    expect(onRead).toHaveBeenCalled();
  });

  it('negative: no messages, no message box', () => {
    render(<TestRunnerScreen live={{ ...LIVE_RUNNER, messages: { items: [], onRead: vi.fn(), onReply: vi.fn() } }} />);
    expect(screen.queryByText(/from your proctor/)).toBeNull();
  });
});

// Answer 2234: the Run output under the code editor, in the coding story's results panel.
import { CodeRunOutput } from './proctoring-kit';
describe('CodeRunOutput', () => {
  const RUN = { stdout: 'hello\n', stderr: '', exitCode: 0, compileError: null, timedOut: false, runsRemaining: 9 };
  it('before any run asks the candidate to press Run; a run shows its exit code, output and runs left', () => {
    const { rerender } = render(<CodeRunOutput result={null} error={null} />);
    expect(screen.getByText('Press Run to see your output here.')).toBeInTheDocument();
    rerender(<CodeRunOutput result={RUN} error={null} />);
    expect(screen.getByText('Exit code 0')).toBeInTheDocument();
    expect(screen.getByLabelText('Output')).toHaveTextContent('hello');
    expect(screen.getByText('9 runs left')).toBeInTheDocument();
  });
  it('negative: an error wins over a stale result; a failing run shows its errors, a compile error replaces the output', () => {
    const { rerender } = render(<CodeRunOutput result={RUN} error="You have used all 10 runs." />);
    expect(screen.getByText("Couldn't run")).toBeInTheDocument();
    expect(screen.getByText('You have used all 10 runs.')).toBeInTheDocument();
    expect(screen.queryByLabelText('Output')).toBeNull();
    rerender(<CodeRunOutput result={{ ...RUN, stdout: '', stderr: 'boom', exitCode: 1 }} error={null} />);
    expect(screen.getByText('Exit code 1').closest('p')).toHaveAttribute('data-status', 'fail');
    expect(screen.getByLabelText('Errors')).toHaveTextContent('boom');
    rerender(<CodeRunOutput result={{ ...RUN, compileError: 'cannot find symbol', exitCode: 1 }} error={null} />);
    expect(screen.getByText('Did not compile')).toBeInTheDocument();
    expect(screen.getByText('cannot find symbol')).toBeInTheDocument();
    expect(screen.queryByLabelText('Output')).toBeNull();
  });
  it('negative: a run stopped for time names the limit and the likely cause; one printing nothing says so', () => {
    const { rerender } = render(<CodeRunOutput result={{ ...RUN, stdout: '', exitCode: 137, timedOut: true, runsRemaining: 1 }} error={null} />);
    expect(screen.getByText(/more than 5 seconds/)).toBeInTheDocument();
    expect(screen.getByText('1 run left')).toBeInTheDocument();
    rerender(<CodeRunOutput result={{ ...RUN, stdout: '' }} error={null} />);
    expect(screen.getByText('Your program printed nothing.')).toBeInTheDocument();
  });
});
