import { render, screen, waitFor, act } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useRouter } from 'next/navigation';
import * as useAttemptModule from '../../../lib/hooks/useAttempt';
import { useAttemptQuery, useAnswerMutation, useSubmitAttempt, useRunCode, useWebcamResume } from '../../../lib/hooks/useAttempt';
import { useCountdown } from '../../../lib/hooks/useCountdown';
import { useProctoringMonitor } from '../../../lib/hooks/useProctoringMonitor';
import { useWebcamMonitor } from '../../../lib/hooks/useWebcamMonitor';
import { useCandidateAuth } from '../../../lib/candidate-auth-context';
import CandidateExamPage from './page';

jest.mock('next/navigation', () => ({ useRouter: jest.fn() }));
jest.mock('../../../lib/hooks/useAttempt', () => ({
  useAttemptQuery: jest.fn(),
  useAnswerMutation: jest.fn(),
  useSubmitAttempt: jest.fn(),
  useRunCode: jest.fn(),
  useWebcamResume: jest.fn(),
  useLeaderboard: jest.fn(),
  useReportProctoringEvent: jest.fn(() => jest.fn()),
}));
jest.mock('../../../lib/hooks/useCountdown', () => ({ useCountdown: jest.fn() }));
jest.mock('../../../lib/hooks/useProctoringMonitor', () => ({ useProctoringMonitor: jest.fn() }));
jest.mock('../../../lib/hooks/useWebcamMonitor', () => ({ useWebcamMonitor: jest.fn() }));
jest.mock('../../../lib/candidate-auth-context', () => ({ useCandidateAuth: jest.fn() }));
jest.mock('@monaco-editor/react', () => ({
  __esModule: true,
  default: ({ value, onChange }: { value?: string; onChange?: (value: string | undefined) => void }) => (
    <textarea aria-label="code-editor" value={value} onChange={(event) => onChange?.(event.target.value)} />
  ),
}));

const attemptState = {
  status: 'in_progress',
  remainingSeconds: 590,
  exam: { title: 'Test Exam' },
  sections: [
    {
      title: 'Section One',
      targetDurationMinutes: null,
      questions: [
        { id: 'q1', text: 'What is 2 + 2?', type: 'single_mcq', marks: 5, options: [{ id: 'o1', text: '4' }, { id: 'o2', text: '5' }] },
      ],
    },
  ],
  answers: [],
  messages: [],
};

const codeAttemptState = {
  status: 'in_progress',
  remainingSeconds: 590,
  exam: { title: 'Test Exam' },
  sections: [
    {
      title: 'Section One',
      targetDurationMinutes: null,
      questions: [
        {
          id: 'q1',
          text: 'Write a function that adds two numbers.',
          type: 'code',
          marks: 5,
          codeLanguage: 'javascript',
          starterCode: 'function add(a, b) {}',
          options: [],
          allowStdin: false,
        },
      ],
    },
  ],
  answers: [],
  messages: [],
};

const codeAttemptStateWithStdin = {
  ...codeAttemptState,
  sections: [{ ...codeAttemptState.sections[0], questions: [{ ...codeAttemptState.sections[0].questions[0], allowStdin: true }] }],
};

const twoCodeQuestionsAttemptState = {
  status: 'in_progress',
  remainingSeconds: 590,
  exam: { title: 'Test Exam' },
  sections: [
    {
      title: 'Section One',
      targetDurationMinutes: null,
      questions: [
        {
          id: 'q1',
          text: 'Write a function that adds two numbers.',
          type: 'code',
          marks: 5,
          codeLanguage: 'javascript',
          starterCode: 'function add(a, b) {}',
          options: [],
          allowStdin: false,
        },
        {
          id: 'q2',
          text: 'Write a function that subtracts two numbers.',
          type: 'code',
          marks: 5,
          codeLanguage: 'javascript',
          starterCode: 'function subtract(a, b) {}',
          options: [],
          allowStdin: false,
        },
      ],
    },
  ],
  answers: [],
  messages: [],
};

describe('CandidateExamPage', () => {
  const push = jest.fn();
  const saveAnswer = jest.fn();
  const flush = jest.fn().mockResolvedValue(undefined);
  const mutateAsync = jest.fn().mockResolvedValue({ status: 'submitted' });
  const runCodeMutate = jest.fn();

  beforeEach(() => {
    push.mockClear();
    saveAnswer.mockClear();
    flush.mockClear();
    mutateAsync.mockClear();
    runCodeMutate.mockClear();
    (useRouter as jest.Mock).mockReturnValue({ push });
    (useAttemptQuery as jest.Mock).mockReturnValue({ data: attemptState, isError: false });
    (useAnswerMutation as jest.Mock).mockReturnValue({ saveAnswer, flush });
    (useSubmitAttempt as jest.Mock).mockReturnValue({ mutateAsync, isPending: false, isError: false, mutate: jest.fn() });
    (useCountdown as jest.Mock).mockReturnValue(590);
    (useProctoringMonitor as jest.Mock).mockReturnValue(undefined);
    (useCandidateAuth as jest.Mock).mockReturnValue({ accessToken: 'token-1', isLoading: false });
    (useRunCode as jest.Mock).mockReturnValue({ mutate: runCodeMutate, isPending: false });
    (useWebcamMonitor as jest.Mock).mockReturnValue(undefined);
    (useWebcamResume as jest.Mock).mockReturnValue({ mutate: jest.fn(), isPending: false, isError: false });
    jest.spyOn(useAttemptModule, 'useLeaderboard').mockReturnValue({ data: { you: { rank: 3, correctCount: 2 }, top: [] }, isLoading: false } as any);
  });

  afterEach(() => jest.useRealTimers());

  it('renders the current question and saves an answer on selection', async () => {
    render(<CandidateExamPage />);

    expect(screen.getByText('What is 2 + 2?')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: /4/ }));

    expect(saveAnswer).toHaveBeenCalledWith('q1', ['o1'], undefined);
  });

  it('toggles mark-for-review', async () => {
    render(<CandidateExamPage />);
    await userEvent.click(screen.getByRole('button', { name: /Mark for review/ }));
    expect(saveAnswer).toHaveBeenCalledWith('q1', [], true);
  });

  it('flushes pending answers and submits on confirm', async () => {
    render(<CandidateExamPage />);

    // With only one question, both the question-card's "Review & Submit" (shown on the
    // last question) and the sidebar's standalone one render at once — either works.
    await userEvent.click(screen.getAllByRole('button', { name: 'Review & Submit' })[0]);
    await userEvent.click(screen.getByRole('button', { name: 'Submit' }));

    await waitFor(() => expect(flush).toHaveBeenCalled());
    await waitFor(() => expect(mutateAsync).toHaveBeenCalled());
    await waitFor(() => expect(push).toHaveBeenCalledWith('/submitted'));
  });

  it('redirects to /session-ended when the attempt query errors (dead session)', () => {
    (useAttemptQuery as jest.Mock).mockReturnValue({ data: undefined, isError: true });

    render(<CandidateExamPage />);

    expect(push).toHaveBeenCalledWith('/session-ended');
  });

  it('redirects to /submitted instead of rendering the exam when the attempt is already finished', () => {
    (useAttemptQuery as jest.Mock).mockReturnValue({ data: { ...attemptState, status: 'submitted' }, isError: false });

    render(<CandidateExamPage />);

    expect(push).toHaveBeenCalledWith('/submitted');
    expect(screen.queryByText('What is 2 + 2?')).not.toBeInTheDocument();
  });

  it('retrying a failed submission navigates to /submitted on success', async () => {
    (useSubmitAttempt as jest.Mock).mockReturnValue({ mutateAsync, isPending: false, isError: true, mutate: jest.fn() });

    render(<CandidateExamPage />);
    await userEvent.click(screen.getByRole('button', { name: 'Retry' }));

    await waitFor(() => expect(flush).toHaveBeenCalled());
    await waitFor(() => expect(mutateAsync).toHaveBeenCalled());
    await waitFor(() => expect(push).toHaveBeenCalledWith('/submitted'));
  });

  it('redirects to /session-ended when there is no access token', () => {
    (useCandidateAuth as jest.Mock).mockReturnValue({ accessToken: null, isLoading: false });
    (useAttemptQuery as jest.Mock).mockReturnValue({ data: undefined, isError: false });

    render(<CandidateExamPage />);

    expect(push).toHaveBeenCalledWith('/session-ended');
  });

  it('renders a Monaco editor pre-filled with starterCode for a code question', () => {
    (useAttemptQuery as jest.Mock).mockReturnValue({ data: codeAttemptState, isError: false });

    render(<CandidateExamPage />);

    expect(screen.getByText('Question 1 of 1 · Code · 5 marks')).toBeInTheDocument();
    expect(screen.getByLabelText('code-editor')).toHaveValue('function add(a, b) {}');
  });

  it('pre-fills the editor with the saved answerText instead of starterCode when resuming', () => {
    (useAttemptQuery as jest.Mock).mockReturnValue({
      data: { ...codeAttemptState, answers: [{ questionId: 'q1', selectedOptionIds: [], answerText: 'function add(a, b) { return a + b; }', isMarkedForReview: false }] },
      isError: false,
    });

    render(<CandidateExamPage />);

    expect(screen.getByLabelText('code-editor')).toHaveValue('function add(a, b) { return a + b; }');
  });

  it('saves code changes via saveAnswer with the editor value as answerText', async () => {
    (useAttemptQuery as jest.Mock).mockReturnValue({ data: codeAttemptState, isError: false });

    render(<CandidateExamPage />);
    await userEvent.type(screen.getByLabelText('code-editor'), 'x');

    expect(saveAnswer).toHaveBeenCalledWith('q1', [], undefined, expect.any(String), expect.any(Object));
  });

  it('does not wipe answerText when toggling mark-for-review on a code question', async () => {
    (useAttemptQuery as jest.Mock).mockReturnValue({
      data: { ...codeAttemptState, answers: [{ questionId: 'q1', selectedOptionIds: [], answerText: 'function add(a, b) { return a + b; }', isMarkedForReview: false }] },
      isError: false,
    });

    render(<CandidateExamPage />);
    await userEvent.click(screen.getByRole('button', { name: /Mark for review/ }));

    expect(saveAnswer).toHaveBeenCalledWith('q1', [], true, 'function add(a, b) { return a + b; }', expect.any(Object));
  });

  it('preserves just-typed code when mark-for-review is toggled before the debounced save fires', async () => {
    (useAttemptQuery as jest.Mock).mockReturnValue({
      data: { ...codeAttemptState, answers: [{ questionId: 'q1', selectedOptionIds: [], answerText: 'function add(a, b) {}', isMarkedForReview: false }] },
      isError: false,
    });

    render(<CandidateExamPage />);

    // Types new text (debounced save hasn't fired yet — saveAnswer is mocked so no timer
    // actually resolves the pending write). The React Query cache (existingAnswer) still
    // reflects the OLD pre-edit text at this point.
    const editor = screen.getByLabelText('code-editor');
    await userEvent.clear(editor);
    await userEvent.type(editor, 'function add(a, b) {{ return a + b; }');

    // Immediately toggle mark-for-review, racing ahead of the debounced autosave.
    await userEvent.click(screen.getByRole('button', { name: /Mark for review/ }));

    const lastCall = saveAnswer.mock.calls[saveAnswer.mock.calls.length - 1];
    expect(lastCall).toEqual(['q1', [], true, 'function add(a, b) { return a + b; }', expect.any(Object)]);
  });

  it('counts a code question as unanswered until it has non-empty answerText', async () => {
    (useAttemptQuery as jest.Mock).mockReturnValue({ data: codeAttemptState, isError: false });

    render(<CandidateExamPage />);
    await userEvent.click(screen.getAllByRole('button', { name: 'Review & Submit' })[0]);

    const unansweredStat = screen.getAllByText('1').find((el) => el.className.includes('text-lg'));
    expect(unansweredStat).toBeInTheDocument();
  });

  it('runs code and displays the output panel', async () => {
    (useAttemptQuery as jest.Mock).mockReturnValue({ data: codeAttemptState, isError: false });
    runCodeMutate.mockImplementation((_payload, { onSuccess }) =>
      onSuccess({ stdout: 'hi\n', stderr: '', exitCode: 0, compileError: null, timedOut: false, runsRemaining: 29 }),
    );
    render(<CandidateExamPage />);

    await userEvent.click(screen.getByRole('button', { name: 'Run' }));

    expect(await screen.findByText('hi')).toBeInTheDocument();
    expect(screen.getByText('Exit code: 0')).toBeInTheDocument();
  });

  it('shows the runs-remaining count next to the Run button after a run', async () => {
    (useAttemptQuery as jest.Mock).mockReturnValue({ data: codeAttemptState, isError: false });
    runCodeMutate.mockImplementation((_payload, { onSuccess }) =>
      onSuccess({ stdout: 'hi\n', stderr: '', exitCode: 0, compileError: null, timedOut: false, runsRemaining: 27 }),
    );
    render(<CandidateExamPage />);

    expect(screen.queryByText(/runs left/i)).not.toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Run' }));

    expect(await screen.findByText('27 runs left')).toBeInTheDocument();
  });

  it('shows the stdin box only when the question allows it', () => {
    (useAttemptQuery as jest.Mock).mockReturnValue({ data: codeAttemptState, isError: false });
    render(<CandidateExamPage />);
    expect(screen.queryByLabelText('Standard input (optional)')).not.toBeInTheDocument();
  });

  it('shows the stdin box when the question allows it', () => {
    (useAttemptQuery as jest.Mock).mockReturnValue({ data: codeAttemptStateWithStdin, isError: false });
    render(<CandidateExamPage />);
    expect(screen.getByLabelText('Standard input (optional)')).toBeInTheDocument();
  });

  it('shows the server-provided message when the sandbox is unavailable', async () => {
    // This exact string is what apps/exam-runtime's runCode() sends as the HttpException
    // message for a Piston failure (see Task 5, Step 5) — candidateApiFetch surfaces a failed
    // response's body.message as the thrown Error's .message, and the page displays it as-is
    // rather than a hardcoded string, so this test exercises the real end-to-end message path.
    (useAttemptQuery as jest.Mock).mockReturnValue({ data: codeAttemptState, isError: false });
    runCodeMutate.mockImplementation((_payload, { onError }) => onError(new Error("Couldn't run your code right now, try again.")));
    render(<CandidateExamPage />);

    await userEvent.click(screen.getByRole('button', { name: 'Run' }));

    expect(await screen.findByText("Couldn't run your code right now, try again.")).toBeInTheDocument();
  });

  it('shows the run-cap message when the cap is exceeded', async () => {
    (useAttemptQuery as jest.Mock).mockReturnValue({ data: codeAttemptState, isError: false });
    runCodeMutate.mockImplementation((_payload, { onError }) => onError(new Error('You have used all 30 runs for this question')));
    render(<CandidateExamPage />);

    await userEvent.click(screen.getByRole('button', { name: 'Run' }));

    expect(await screen.findByText('You have used all 30 runs for this question')).toBeInTheDocument();
  });

  it('keeps run output and stdin per-question, not shared across navigation', async () => {
    (useAttemptQuery as jest.Mock).mockReturnValue({ data: twoCodeQuestionsAttemptState, isError: false });
    runCodeMutate.mockImplementation((_payload, { onSuccess }) =>
      onSuccess({ stdout: 'question one output\n', stderr: '', exitCode: 0, compileError: null, timedOut: false, runsRemaining: 29 }),
    );
    render(<CandidateExamPage />);

    await userEvent.click(screen.getByRole('button', { name: 'Run' }));
    expect(await screen.findByText('question one output')).toBeInTheDocument();

    await userEvent.click(screen.getByRole('button', { name: 'Next' }));

    expect(screen.getByText('Write a function that subtracts two numbers.')).toBeInTheDocument();
    expect(screen.queryByText('question one output')).not.toBeInTheDocument();
    expect(screen.queryByText('Exit code: 0')).not.toBeInTheDocument();

    await userEvent.click(screen.getByRole('button', { name: 'Previous' }));

    expect(screen.getByText('question one output')).toBeInTheDocument();
  });

  it('shows a warning overlay with the strike count when paused, and a Continue button', async () => {
    (useAttemptQuery as jest.Mock).mockReturnValue({
      data: { ...attemptState, status: 'paused', webcamViolationCount: 1 },
      isError: false,
    });
    const resumeMutate = jest.fn();
    (useWebcamResume as jest.Mock).mockReturnValue({ mutate: resumeMutate, isPending: false, isError: false });

    render(<CandidateExamPage />);

    expect(screen.getByText(/warning 1\/3/i)).toBeInTheDocument();
    expect(push).not.toHaveBeenCalledWith('/submitted');
    await userEvent.click(screen.getByRole('button', { name: /continue/i }));
    expect(resumeMutate).toHaveBeenCalled();
    expect(push).not.toHaveBeenCalledWith('/submitted');
  });

  it('shows a block overlay with no self-resume option when blocked', () => {
    (useAttemptQuery as jest.Mock).mockReturnValue({
      data: { ...attemptState, status: 'blocked', webcamViolationCount: 3 },
      isError: false,
    });

    render(<CandidateExamPage />);

    expect(screen.getByText(/recruiter needs to unblock/i)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /continue/i })).not.toBeInTheDocument();
    expect(push).not.toHaveBeenCalledWith('/submitted');
  });

  it.each(['paused', 'blocked'] as const)(
    'does not let the frozen countdown reach zero and trigger a submit while %s, even with remainingSeconds=1',
    (status) => {
      // Uses the real useCountdown (not the module mock) so this exercises the actual
      // freeze wiring end-to-end: exam/page.tsx must pass isTicking=false while paused/blocked.
      const { useCountdown: actualUseCountdown } = jest.requireActual('../../../lib/hooks/useCountdown');
      (useCountdown as jest.Mock).mockImplementation(actualUseCountdown);
      (useAttemptQuery as jest.Mock).mockReturnValue({
        data: { ...attemptState, status, remainingSeconds: 1, webcamViolationCount: 3 },
        isError: false,
      });

      jest.useFakeTimers();
      render(<CandidateExamPage />);
      act(() => {
        jest.advanceTimersByTime(5000);
      });
      jest.useRealTimers();

      expect(mutateAsync).not.toHaveBeenCalled();
      expect(push).not.toHaveBeenCalledWith('/submitted');
    },
  );

  it('keeps the question card mounted underneath the warning overlay instead of replacing the page', () => {
    (useAttemptQuery as jest.Mock).mockReturnValue({
      data: { ...attemptState, status: 'paused', webcamViolationCount: 1 },
      isError: false,
    });

    render(<CandidateExamPage />);

    expect(screen.getByText(/warning 1\/3/i)).toBeInTheDocument();
    expect(screen.getByText('What is 2 + 2?')).toBeInTheDocument();
  });

  it.each(['paused', 'blocked'] as const)(
    'marks the dimmed content inert (unreachable by keyboard/screen reader) while %s',
    (status) => {
      (useAttemptQuery as jest.Mock).mockReturnValue({
        data: { ...attemptState, status, webcamViolationCount: 3 },
        isError: false,
      });

      render(<CandidateExamPage />);

      expect(screen.getByTestId('dimmable-content')).toHaveAttribute('inert');
    },
  );

  it('does not mark the content inert while in progress', () => {
    render(<CandidateExamPage />);

    expect(screen.getByTestId('dimmable-content')).not.toHaveAttribute('inert');
  });

  it('shows the leaderboard widget with the candidate\'s current rank', () => {
    render(<CandidateExamPage />);

    expect(screen.getByText(/#3/)).toBeInTheDocument();
  });

  it('renders the code snippet, question image, and option images when present', () => {
    (useAttemptQuery as jest.Mock).mockReturnValue({
      data: {
        status: 'in_progress',
        remainingSeconds: 600,
        webcamViolationCount: 0,
        exam: { title: 'Sample Exam' },
        sections: [
          {
            title: 'Section 1',
            targetDurationMinutes: null,
            questions: [
              {
                id: 'q1', text: 'What does this code print?', type: 'single_mcq', marks: 5,
                codeLanguage: null, starterCode: null, allowStdin: false,
                snippetCode: 'x = [1, 2, 3]\nprint(x[::-1])', snippetLanguage: 'python', imageUrl: 'http://localhost:3001/uploads/question-images/stem.png',
                options: [
                  { id: 'opt-a', text: '[3, 2, 1]', imageUrl: 'http://localhost:3001/uploads/question-images/opt-a.png' },
                  { id: 'opt-b', text: '[1, 2, 3]', imageUrl: null },
                ],
              },
            ],
          },
        ],
        answers: [],
        messages: [],
        feedback: null,
        organizationLogoUrl: null,
        organizationPrimaryColor: null,
      },
      isError: false,
    });

    render(<CandidateExamPage />);

    // exact: false — the <pre> node's full text also includes the second line, and RTL's
    // default text normalization collapses the snippet's newline to a space, so an exact
    // match against just the first line would never match the node's full normalized text.
    expect(screen.getByText('x = [1, 2, 3]', { exact: false })).toBeInTheDocument();
    expect(screen.getByText('python')).toBeInTheDocument();
    expect(screen.getByAltText('Question illustration')).toHaveAttribute('src', 'http://localhost:3001/uploads/question-images/stem.png');
    expect(screen.getByAltText('Option illustration')).toHaveAttribute('src', 'http://localhost:3001/uploads/question-images/opt-a.png');
  });

  it('stops leaderboard polling while paused', () => {
    const leaderboardSpy = jest.spyOn(useAttemptModule, 'useLeaderboard').mockReturnValue({
      data: { you: { rank: 3, correctCount: 2 }, top: [] },
      isLoading: false,
    } as any);
    (useAttemptQuery as jest.Mock).mockReturnValue({
      data: { ...attemptState, status: 'paused', webcamViolationCount: 1 },
      isError: false,
    });

    render(<CandidateExamPage />);

    expect(leaderboardSpy).toHaveBeenCalledWith(false);
  });
});
