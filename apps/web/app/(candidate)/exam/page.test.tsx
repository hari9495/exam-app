import { useEffect } from 'react';
import { render, screen, waitFor, act, fireEvent } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useRouter } from 'next/navigation';
import * as useAttemptModule from '../../../lib/hooks/useAttempt';
import { useAttemptQuery, useAnswerMutation, useSubmitAttempt, useRunCode, useWebcamResume, useCodeLanguages, useScreenShareState } from '../../../lib/hooks/useAttempt';
import { useCountdown } from '../../../lib/hooks/useCountdown';
import { useProctoringMonitor } from '../../../lib/hooks/useProctoringMonitor';
import { useWebcamMonitor } from '../../../lib/hooks/useWebcamMonitor';
import { useScreenCapture } from '../../../lib/hooks/useScreenCapture';
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
  useCodeLanguages: jest.fn(),
  useReportProctoringEvent: jest.fn(() => jest.fn()),
  useScreenShareState: jest.fn(),
}));
jest.mock('../../../lib/hooks/useScreenCapture', () => ({ useScreenCapture: jest.fn() }));

const mockUseAttemptQuery = useAttemptQuery as jest.Mock;

function renderExamPage() {
  return render(<CandidateExamPage />);
}

function attemptStateWithQuestion(question: any) {
  return {
    candidateName: 'Ada Lovelace',
    status: 'in_progress',
    remainingSeconds: 590,
    webcamViolationCount: 0,
    browserActivityViolationCount: 0,
    exam: { title: 'Test Exam', proctoring: { webcamEnabled: true, enforcement: 'block', strikeLimit: 3, disabledSignals: [] } },
    sections: [{ title: 'S1', targetDurationMinutes: null, questions: [question] }],
    answers: [],
    messages: [],
    feedback: null,
    organizationLogoUrl: null,
    organizationPrimaryColor: null,
  };
}
jest.mock('../../../lib/hooks/useCountdown', () => ({ useCountdown: jest.fn() }));
jest.mock('../../../lib/hooks/useProctoringMonitor', () => ({ useProctoringMonitor: jest.fn() }));
jest.mock('../../../lib/hooks/useWebcamMonitor', () => ({ useWebcamMonitor: jest.fn() }));
jest.mock('../../../lib/candidate-auth-context', () => ({ useCandidateAuth: jest.fn() }));
jest.mock('@monaco-editor/react', () => ({
  __esModule: true,
  default: ({ value, onChange }: { value?: string; onChange?: (value: string | undefined) => void }) => (
    <textarea aria-label="code-editor" value={value} onChange={(event) => onChange?.(event.target.value)} />
  ),
  // lib/monaco-setup (imported by the exam page) calls loader.config to self-host
  // Monaco; the mock must expose it or the module throws at import.
  loader: { config: jest.fn() },
}));

const attemptState = {
  candidateName: 'Ada Lovelace',
  status: 'in_progress',
  remainingSeconds: 590,
  exam: { title: 'Test Exam', proctoring: { webcamEnabled: true, enforcement: 'block', strikeLimit: 3, disabledSignals: [] } },
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
  exam: { title: 'Test Exam', proctoring: { webcamEnabled: true, enforcement: 'block', strikeLimit: 3, disabledSignals: [] } },
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
          languageMode: 'fixed',
          allowedLanguages: ['javascript'],
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
  exam: { title: 'Test Exam', proctoring: { webcamEnabled: true, enforcement: 'block', strikeLimit: 3, disabledSignals: [] } },
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
          languageMode: 'fixed',
          allowedLanguages: ['javascript'],
          starterCode: 'function add(a, b) {}',
          options: [],
          allowStdin: false,
        },
        {
          id: 'q2',
          text: 'Write a function that subtracts two numbers.',
          type: 'code',
          marks: 5,
          languageMode: 'fixed',
          allowedLanguages: ['javascript'],
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
    (useCodeLanguages as jest.Mock).mockReturnValue({ data: [], isLoading: true });
    jest.spyOn(useAttemptModule, 'useLeaderboard').mockReturnValue({ data: { you: { rank: 3, correctCount: 2 }, top: [] }, isLoading: false } as any);
    (useScreenShareState as jest.Mock).mockReturnValue({ mutate: jest.fn(), isPending: false });
    (useScreenCapture as jest.Mock).mockReturnValue({ active: false, error: null, requestShare: jest.fn(), capture: jest.fn(() => null) });
  });

  afterEach(() => jest.useRealTimers());

  it('renders the current question and saves an answer on selection', async () => {
    render(<CandidateExamPage />);

    expect(screen.getByText('What is 2 + 2?')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: /4/ }));

    expect(saveAnswer).toHaveBeenCalledWith('q1', ['o1'], undefined);
  });

  it('shows the candidate name in the toolbar so shared devices are not confusing', () => {
    render(<CandidateExamPage />);

    expect(screen.getByText('Ada Lovelace')).toBeInTheDocument();
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

    expect(saveAnswer).toHaveBeenCalledWith('q1', [], undefined, expect.any(String), expect.any(Object), 'javascript');
  });

  it('does not wipe answerText when toggling mark-for-review on a code question', async () => {
    (useAttemptQuery as jest.Mock).mockReturnValue({
      data: { ...codeAttemptState, answers: [{ questionId: 'q1', selectedOptionIds: [], answerText: 'function add(a, b) { return a + b; }', isMarkedForReview: false }] },
      isError: false,
    });

    render(<CandidateExamPage />);
    await userEvent.click(screen.getByRole('button', { name: /Mark for review/ }));

    expect(saveAnswer).toHaveBeenCalledWith('q1', [], true, 'function add(a, b) { return a + b; }', expect.any(Object), 'javascript');
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
    expect(lastCall).toEqual(['q1', [], true, 'function add(a, b) { return a + b; }', expect.any(Object), 'javascript']);
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

  describe('browser-activity strikes', () => {
    it('shows the browser-activity strike count (not the webcam count) when paused by a browser-activity signal', () => {
      (useAttemptQuery as jest.Mock).mockReturnValue({
        data: { ...attemptState, status: 'paused', webcamViolationCount: 0, browserActivityViolationCount: 2 },
        isError: false,
      });
      // Fired from an effect (like the real hook fires from an event listener), not
      // synchronously during render, which would otherwise trip React's render-phase-update loop guard.
      (useProctoringMonitor as jest.Mock).mockImplementation((_enabled: boolean, onViolation?: (eventType: string) => void) => {
        useEffect(() => {
          onViolation?.('tab_switch');
        }, []);
      });
      (useWebcamResume as jest.Mock).mockReturnValue({ mutate: jest.fn(), isPending: false, isError: false });

      render(<CandidateExamPage />);

      expect(screen.getByText('Tab switch detected')).toBeInTheDocument();
      expect(screen.getByText('Warning 2/3')).toBeInTheDocument();
    });

    it('still shows the webcam strike count and message when the last violation was a webcam one', () => {
      (useAttemptQuery as jest.Mock).mockReturnValue({
        data: { ...attemptState, status: 'paused', webcamViolationCount: 1, browserActivityViolationCount: 2 },
        isError: false,
      });
      (useWebcamMonitor as jest.Mock).mockImplementation((_enabled: boolean, onViolationReason?: (reason: string) => void) => {
        useEffect(() => {
          onViolationReason?.('no_face');
        }, []);
      });
      (useWebcamResume as jest.Mock).mockReturnValue({ mutate: jest.fn(), isPending: false, isError: false });

      render(<CandidateExamPage />);

      expect(screen.getByText('Face not visible')).toBeInTheDocument();
      expect(screen.getByText('Warning 1/3')).toBeInTheDocument();
    });

    it('resumes via the same webcam-resume mutation for both webcam and browser_activity pauses', async () => {
      (useAttemptQuery as jest.Mock).mockReturnValue({
        data: { ...attemptState, status: 'paused', webcamViolationCount: 0, browserActivityViolationCount: 1, pausedReason: 'browser_activity' },
        isError: false,
      });
      (useProctoringMonitor as jest.Mock).mockImplementation((_enabled: boolean, onViolation?: (eventType: string) => void) => {
        useEffect(() => {
          onViolation?.('right_click');
        }, []);
      });
      const resumeMutate = jest.fn();
      (useWebcamResume as jest.Mock).mockReturnValue({ mutate: resumeMutate, isPending: false, isError: false });

      render(<CandidateExamPage />);
      await userEvent.click(screen.getByRole('button', { name: /continue/i }));

      expect(resumeMutate).toHaveBeenCalled();
    });

    it('infers the browser-activity source from the server-reported pausedReason when the page remounts with no live violation event', () => {
      // webcamViolationCount (3) deliberately exceeds browserActivityViolationCount (1) here --
      // the deleted counter heuristic (browserActivityViolationCount > webcamViolationCount)
      // would pick webcam and render the wrong heading/count. Only the server-reported
      // pausedReason can get this right.
      (useAttemptQuery as jest.Mock).mockReturnValue({
        data: { ...attemptState, status: 'paused', webcamViolationCount: 3, browserActivityViolationCount: 1, pausedReason: 'browser_activity' },
        isError: false,
      });
      // No onViolation/onViolationReason callback fires -- simulates a page reload while
      // already paused, where this mount never saw the live event that caused the pause.
      (useProctoringMonitor as jest.Mock).mockImplementation(() => undefined);
      (useWebcamMonitor as jest.Mock).mockImplementation(() => undefined);
      (useWebcamResume as jest.Mock).mockReturnValue({ mutate: jest.fn(), isPending: false, isError: false });

      render(<CandidateExamPage />);

      expect(screen.getByText('Policy violation detected')).toBeInTheDocument();
      expect(screen.getByText('Warning 1/3')).toBeInTheDocument();
    });

    it('infers the webcam source from the server-reported pausedReason when browserActivityViolationCount exceeds webcamViolationCount', () => {
      // Mirror of the above: browserActivityViolationCount (3) exceeds webcamViolationCount (1),
      // which is exactly the case the deleted counter heuristic got wrong (it would pick
      // browser_activity here). pausedReason: 'webcam' must still win.
      (useAttemptQuery as jest.Mock).mockReturnValue({
        data: { ...attemptState, status: 'paused', webcamViolationCount: 1, browserActivityViolationCount: 3, pausedReason: 'webcam' },
        isError: false,
      });
      (useProctoringMonitor as jest.Mock).mockImplementation(() => undefined);
      (useWebcamMonitor as jest.Mock).mockImplementation(() => undefined);
      (useWebcamResume as jest.Mock).mockReturnValue({ mutate: jest.fn(), isPending: false, isError: false });

      render(<CandidateExamPage />);

      expect(screen.getByText('Face not visible')).toBeInTheDocument();
      expect(screen.getByText('Warning 1/3')).toBeInTheDocument();
    });
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
        browserActivityViolationCount: 0,
        exam: { title: 'Sample Exam', proctoring: { webcamEnabled: true, enforcement: 'block', strikeLimit: 3, disabledSignals: [] } },
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

  it('auto-selects the language and shows the editor immediately for a fixed single-language question', () => {
    mockUseAttemptQuery.mockReturnValue({
      data: attemptStateWithQuestion({
        id: 'q1', type: 'code', text: 'Reverse a string', marks: 10,
        languageMode: 'fixed', allowedLanguages: ['python'],
        starterCode: 'def reverse(s):\n    pass', allowStdin: false,
        snippetCode: null, snippetLanguage: null, imageUrl: null, options: [],
      }),
      isError: false,
    });

    renderExamPage();

    expect(screen.getByText('python')).toBeInTheDocument();
    expect(screen.queryByLabelText('Choose a language before you start')).not.toBeInTheDocument();
  });

  it('requires a language pick before showing the editor for a fixed multi-language question', () => {
    mockUseAttemptQuery.mockReturnValue({
      data: attemptStateWithQuestion({
        id: 'q1', type: 'code', text: 'Reverse a string', marks: 10,
        languageMode: 'fixed', allowedLanguages: ['python', 'java'],
        starterCode: null, allowStdin: false,
        snippetCode: null, snippetLanguage: null, imageUrl: null, options: [],
      }),
      isError: false,
    });

    renderExamPage();

    expect(screen.getByLabelText('Choose a language before you start')).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText('Choose a language before you start'), { target: { value: 'java' } });
    expect(screen.getByText('java')).toBeInTheDocument();
  });

  describe('per-exam proctoring config', () => {
    it('passes the exam proctoring config through to both monitors', async () => {
      const proctoring = { webcamEnabled: false, enforcement: 'warn' as const, strikeLimit: 2, disabledSignals: ['right_click'] };
      (useAttemptQuery as jest.Mock).mockReturnValue({ data: { ...attemptState, exam: { title: 'Screen', proctoring } }, isError: false });

      renderExamPage();

      await waitFor(() => expect(useProctoringMonitor).toHaveBeenCalled());
      expect(useProctoringMonitor).toHaveBeenLastCalledWith(true, expect.any(Function), proctoring, expect.any(Function));
      expect(useWebcamMonitor).toHaveBeenLastCalledWith(true, expect.any(Function), proctoring, expect.any(Function));
    });
  });

  describe('screen sharing', () => {
    function attemptWithScreenCapture(overrides: Record<string, unknown> = {}) {
      return {
        ...attemptState,
        exam: {
          title: 'Test Exam',
          proctoring: { webcamEnabled: true, enforcement: 'block' as const, strikeLimit: 3, disabledSignals: [], screenCaptureEnabled: true },
        },
        screenShareRequired: true,
        ...overrides,
      };
    }

    it('blocks the questions with the screen-share overlay when capture is required and sharing is absent', () => {
      (useAttemptQuery as jest.Mock).mockReturnValue({ data: attemptWithScreenCapture(), isError: false });

      render(<CandidateExamPage />);

      expect(screen.getByText('Screen sharing required')).toBeInTheDocument();
      expect(screen.queryByText('What is 2 + 2?')).not.toBeInTheDocument();
    });

    it('renders the questions, not the overlay, for a bypassed attempt even though screenCaptureEnabled stays true', () => {
      // exam.proctoring.screenCaptureEnabled stays true under a bypass (a bypass narrows what
      // is punished, never what is watched) -- only the server-computed screenShareRequired
      // reflects the exemption. A bypassed candidate must not be blocked over a share the
      // server was never going to pause them for missing.
      (useAttemptQuery as jest.Mock).mockReturnValue({
        data: attemptWithScreenCapture({ screenShareRequired: false }),
        isError: false,
      });

      render(<CandidateExamPage />);

      expect(screen.queryByText('Screen sharing required')).not.toBeInTheDocument();
      expect(screen.getByText('What is 2 + 2?')).toBeInTheDocument();
    });

    it('renders the questions instead of the overlay once screen sharing is active', () => {
      (useAttemptQuery as jest.Mock).mockReturnValue({ data: attemptWithScreenCapture(), isError: false });
      (useScreenCapture as jest.Mock).mockReturnValue({ active: true, error: null, requestShare: jest.fn(), capture: jest.fn(() => null) });

      render(<CandidateExamPage />);

      expect(screen.queryByText('Screen sharing required')).not.toBeInTheDocument();
      expect(screen.getByText('What is 2 + 2?')).toBeInTheDocument();
    });

    it('shows the block overlay instead of the screen-share overlay when the attempt is blocked', () => {
      (useAttemptQuery as jest.Mock).mockReturnValue({
        data: attemptWithScreenCapture({ status: 'blocked', webcamViolationCount: 3 }),
        isError: false,
      });

      render(<CandidateExamPage />);

      expect(screen.getByText(/recruiter needs to unblock/i)).toBeInTheDocument();
      expect(screen.queryByText('Screen sharing required')).not.toBeInTheDocument();
    });

    it('never shows the screen-share overlay when the exam has capture off', () => {
      // Explicit screenShareRequired: false (not just omitted) -- the base fixture has no
      // exam.proctoring.screenCaptureEnabled either, so without this the test would pass on an
      // undefined screenShareRequired and no longer pin capture-off specifically.
      (useAttemptQuery as jest.Mock).mockReturnValue({ data: { ...attemptState, screenShareRequired: false }, isError: false });

      render(<CandidateExamPage />);

      expect(screen.queryByText('Screen sharing required')).not.toBeInTheDocument();
      expect(screen.getByText('What is 2 + 2?')).toBeInTheDocument();
    });

    it('keeps the overlay up with the entire-screen hint after a wrong-surface rejection', () => {
      (useAttemptQuery as jest.Mock).mockReturnValue({ data: attemptWithScreenCapture(), isError: false });
      (useScreenCapture as jest.Mock).mockReturnValue({ active: false, error: 'wrong-surface', requestShare: jest.fn(), capture: jest.fn(() => null) });

      render(<CandidateExamPage />);

      expect(screen.getByText('Screen sharing required')).toBeInTheDocument();
      expect(screen.getByText(/choose your entire screen, not a single tab or window/i)).toBeInTheDocument();
    });

    it("gives a 'denied' rejection both an exit and a retry, since a dismissed picker and a browser/org block share the same NotAllowedError", () => {
      // The client cannot tell a candidate-dismissed picker apart from a Permissions-Policy or
      // enterprise block by err.name -- both land in 'denied', so the copy must cover both
      // rather than assume dismissal and dead-end the blocked candidate.
      (useAttemptQuery as jest.Mock).mockReturnValue({ data: attemptWithScreenCapture(), isError: false });
      (useScreenCapture as jest.Mock).mockReturnValue({ active: false, error: 'denied', requestShare: jest.fn(), capture: jest.fn(() => null) });

      render(<CandidateExamPage />);

      expect(screen.getByText('Screen sharing required')).toBeInTheDocument();
      expect(screen.getByText(/you dismissed the prompt.*click again/i)).toBeInTheDocument();
      expect(screen.getByText(/browser or organization may be blocking it.*contact your recruiter/i)).toBeInTheDocument();
    });

    it('tells a blocked candidate to contact their recruiter instead of a dead-end retry, when sharing is unavailable', () => {
      (useAttemptQuery as jest.Mock).mockReturnValue({ data: attemptWithScreenCapture(), isError: false });
      (useScreenCapture as jest.Mock).mockReturnValue({ active: false, error: 'unavailable', requestShare: jest.fn(), capture: jest.fn(() => null) });

      render(<CandidateExamPage />);

      expect(screen.getByText('Screen sharing required')).toBeInTheDocument();
      expect(screen.getByText(/blocking screen sharing.*contact your recruiter/i)).toBeInTheDocument();
    });

    it('does not re-POST { active: false } on an unrelated re-render while still inactive', () => {
      const mutate = jest.fn();
      (useScreenShareState as jest.Mock).mockReturnValue({ mutate, isPending: false });
      (useScreenCapture as jest.Mock).mockReturnValue({ active: false, error: null, requestShare: jest.fn(), capture: jest.fn(() => null) });
      (useAttemptQuery as jest.Mock).mockReturnValue({ data: attemptWithScreenCapture(), isError: false });

      const { rerender } = render(<CandidateExamPage />);
      expect(mutate).toHaveBeenCalledTimes(1);

      // Re-renders caused by something unrelated (a countdown tick, a query refetch that
      // doesn't change captureEnabled/active) must not re-fire the POST -- the once-per-episode
      // guard must hold across renders, not just within the first one.
      rerender(<CandidateExamPage />);
      rerender(<CandidateExamPage />);

      expect(mutate).toHaveBeenCalledTimes(1);
    });

    it("POSTs reason: 'absent' on mount when no stream is live, so a refresh pauses without a strike", () => {
      const mutate = jest.fn();
      (useScreenShareState as jest.Mock).mockReturnValue({ mutate, isPending: false });
      (useScreenCapture as jest.Mock).mockReturnValue({ active: false, error: null, requestShare: jest.fn(), capture: jest.fn(() => null) });
      (useAttemptQuery as jest.Mock).mockReturnValue({ data: attemptWithScreenCapture(), isError: false });

      render(<CandidateExamPage />);

      expect(mutate).toHaveBeenCalledWith(
        { active: false, reason: 'absent' },
        expect.objectContaining({ onError: expect.any(Function) }),
      );
    });

    it("POSTs reason: 'ended' when the browser's own Stop-sharing control fires", () => {
      let onEndedCallback: (() => void) | undefined;
      (useScreenCapture as jest.Mock).mockImplementation((_enabled: boolean, onEnded: () => void) => {
        onEndedCallback = onEnded;
        return { active: true, error: null, requestShare: jest.fn(), capture: jest.fn(() => null) };
      });
      const mutate = jest.fn();
      (useScreenShareState as jest.Mock).mockReturnValue({ mutate, isPending: false });
      (useAttemptQuery as jest.Mock).mockReturnValue({ data: attemptWithScreenCapture(), isError: false });

      render(<CandidateExamPage />);
      act(() => {
        onEndedCallback?.();
      });

      expect(mutate).toHaveBeenCalledWith(
        { active: false, reason: 'ended' },
        expect.objectContaining({ onError: expect.any(Function) }),
      );
    });

    it('retries the { active: false } POST after a failed attempt once the effect runs again for the same stop event', () => {
      let onEndedCallback: (() => void) | undefined;
      let active = true;
      (useScreenCapture as jest.Mock).mockImplementation((_enabled: boolean, onEnded: () => void) => {
        onEndedCallback = onEnded;
        return { active, error: null, requestShare: jest.fn(), capture: jest.fn(() => null) };
      });
      const mutate = jest.fn((_payload: unknown, options?: { onError?: () => void }) => {
        // Fails the first attempt only, simulating a transient network error.
        if (mutate.mock.calls.length === 1) options?.onError?.();
      });
      (useScreenShareState as jest.Mock).mockReturnValue({ mutate, isPending: false });
      (useAttemptQuery as jest.Mock).mockReturnValue({ data: attemptWithScreenCapture(), isError: false });

      const { rerender } = render(<CandidateExamPage />);

      // Simulate the browser's own "Stop sharing" control firing -- this calls
      // postShareInactive() directly (onEnded), which POSTs and (per the mock above) fails.
      act(() => {
        onEndedCallback?.();
      });
      expect(mutate).toHaveBeenCalledTimes(1);

      // React then re-renders with active now false, as the real hook would report after
      // stopStream() -- the effect runs again for this same stop event and must retry rather
      // than find the guard still stuck from the failed first attempt.
      active = false;
      rerender(<CandidateExamPage />);

      expect(mutate).toHaveBeenCalledTimes(2);
    });

    it('POSTs { active: true, displaySurface, userAgent } when the candidate shares their screen', async () => {
      const mutate = jest.fn();
      (useScreenShareState as jest.Mock).mockReturnValue({ mutate, isPending: false });
      const requestShare = jest.fn().mockResolvedValue({ displaySurface: 'monitor', userAgent: 'test-agent' });
      (useScreenCapture as jest.Mock).mockReturnValue({ active: false, error: null, requestShare, capture: jest.fn(() => null) });
      (useAttemptQuery as jest.Mock).mockReturnValue({ data: attemptWithScreenCapture(), isError: false });

      render(<CandidateExamPage />);
      await userEvent.click(screen.getByRole('button', { name: 'Share my screen' }));

      expect(requestShare).toHaveBeenCalled();
      expect(mutate).toHaveBeenCalledWith({ active: true, displaySurface: 'monitor', userAgent: 'test-agent' });
    });
  });
});
