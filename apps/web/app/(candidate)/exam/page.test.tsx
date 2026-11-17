import { useEffect } from 'react';
import { render, screen, waitFor, act, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useRouter } from 'next/navigation';
import * as useAttemptModule from '../../../lib/hooks/useAttempt';
import { useAttemptQuery, useAnswerMutation, useSubmitAttempt, useRunCode, useWebcamResume, useAckFaceWarning, useCodeLanguages, useScreenShareState, useRunnerActions, useCandidateHelp } from '../../../lib/hooks/useAttempt';
import { useCountdown } from '../../../lib/hooks/useCountdown';
import { useProctoringMonitor } from '../../../lib/hooks/useProctoringMonitor';
import { useWebcamMonitor } from '../../../lib/hooks/useWebcamMonitor';
import { useScreenCapture } from '../../../lib/hooks/useScreenCapture';
import { useCandidateAuth } from '../../../lib/candidate-auth-context';
import CandidateExamPage from './page';
import { reportClientError } from '../../../lib/client-error-reporter';

jest.mock('next/navigation', () => ({ useRouter: jest.fn() }));
jest.mock('../../../lib/hooks/useAttempt', () => ({
  useAttemptQuery: jest.fn(),
  useAnswerMutation: jest.fn(),
  useAnswerFileMutation: jest.fn(() => ({
    upload: { mutateAsync: jest.fn(), isPending: false },
    remove: { mutateAsync: jest.fn(), isPending: false },
  })),
  useSubmitAttempt: jest.fn(),
  useRunCode: jest.fn(),
  useWebcamResume: jest.fn(),
  useAckFaceWarning: jest.fn(),
  useLeaderboard: jest.fn(),
  useCodeLanguages: jest.fn(),
  useReportProctoringEvent: jest.fn(() => jest.fn()),
  useScreenShareState: jest.fn(),
  useScreenAnalysis: jest.fn(() => ({ mutate: jest.fn() })),
  useRunnerActions: jest.fn(),
  useCandidateHelp: jest.fn(),
  useFaceRecheck: jest.fn(() => ({ mutateAsync: jest.fn(), isPending: false })),
  useProctorMessages: jest.fn(() => ({ read: { mutateAsync: jest.fn() }, reply: { mutateAsync: jest.fn() } })),
  useAssistant: jest.fn(() => ({ view: { data: undefined }, ask: { mutateAsync: jest.fn() } })),
}));
jest.mock('../../../lib/hooks/useScreenCapture', () => ({ useScreenCapture: jest.fn() }));
jest.mock('../../../lib/client-error-reporter', () => ({ reportClientError: jest.fn() }));

const mockUseAttemptQuery = useAttemptQuery as jest.Mock;

function renderExamPage() {
  return render(<CandidateExamPage />);
}

// Minimal single-choice question factory for the answer-any-N tests below -- only the fields
// isQuestionAnswered/the renderer actually reads are worth spelling out per fixture.
function q(id: string) {
  return { id, text: `Question ${id}`, type: 'single_mcq', marks: 1, options: [{ id: 'opt-a', text: 'A' }] };
}

// Builds a full attempt-state payload from just the bits a given test cares about (sections,
// answers), reusing the same shape as the other fixtures in this file, then renders the page.
function renderExam({ sections, answers = [] }: { sections: any[]; answers?: any[] }) {
  mockUseAttemptQuery.mockReturnValue({
    data: {
      candidateName: 'Ada Lovelace',
      status: 'in_progress',
      remainingSeconds: 590,
      webcamViolationCount: 0,
      browserActivityViolationCount: 0,
      exam: { title: 'Test Exam', proctoring: { webcamEnabled: true, enforcement: 'block', strikeLimit: 3, disabledSignals: [] } },
      sections,
      answers,
      messages: [],
      feedback: null,
      organizationLogoUrl: null,
      organizationPrimaryColor: null,
    },
    isError: false,
  });
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

// AS-4a part 2 (answer 2161): /exam renders the designed runner. The Finish confirmation opens from the header.
async function openFinish() {
  await userEvent.click(screen.getByRole('button', { name: 'Finish test' }));
  return screen.getByRole('dialog', { name: 'Finish the test?' });
}

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
    (useAnswerMutation as jest.Mock).mockReturnValue({ saveAnswer, flush, queued: 0, connection: 'online', offlineSince: null });
    (useRunnerActions as jest.Mock).mockReturnValue({ startBreak: jest.fn().mockResolvedValue({}), endBreak: jest.fn().mockResolvedValue({}), sendSurvey: jest.fn() });
    (useCandidateHelp as jest.Mock).mockReturnValue({ data: { approved: [] } });
    (useSubmitAttempt as jest.Mock).mockReturnValue({ mutateAsync, isPending: false, isError: false, mutate: jest.fn() });
    (useCountdown as jest.Mock).mockReturnValue(590);
    (useProctoringMonitor as jest.Mock).mockReturnValue(undefined);
    (useCandidateAuth as jest.Mock).mockReturnValue({ accessToken: 'token-1', isLoading: false });
    (useRunCode as jest.Mock).mockReturnValue({ mutate: runCodeMutate, isPending: false });
    (useWebcamMonitor as jest.Mock).mockReturnValue(undefined);
    (useWebcamResume as jest.Mock).mockReturnValue({ mutate: jest.fn(), isPending: false, isError: false });
    (useAckFaceWarning as jest.Mock).mockReturnValue({ mutate: jest.fn(), isPending: false });
    (useCodeLanguages as jest.Mock).mockReturnValue({ data: [], isLoading: true });
    jest.spyOn(useAttemptModule, 'useLeaderboard').mockReturnValue({ data: { you: { rank: 3, correctCount: 2 }, top: [] }, isLoading: false } as any);
    (useScreenShareState as jest.Mock).mockReturnValue({ mutate: jest.fn(), isPending: false });
    (useScreenCapture as jest.Mock).mockReturnValue({ active: false, error: null, requestShare: jest.fn(), capture: jest.fn(() => null) });
  });

  afterEach(() => jest.useRealTimers());

  it('shows the saved choice as chosen, and the other option as not', () => {
    (useAttemptQuery as jest.Mock).mockReturnValue({
      data: { ...attemptState, answers: [{ questionId: 'q1', selectedOptionIds: ['o1'], isMarkedForReview: false, answerText: null, codeLanguage: null }] },
      isError: false,
    });
    render(<CandidateExamPage />);

    expect(screen.getByRole('radio', { name: '4' })).toBeChecked();
    expect(screen.getByRole('radio', { name: '5' })).not.toBeChecked();
  });

  it('renders the current question and saves an answer on selection', async () => {
    render(<CandidateExamPage />);

    expect(screen.getByText('What is 2 + 2?')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('radio', { name: '4' }));

    // markedForReview resolves to the current (false) review state, not undefined -- the
    // answer DTO expects a boolean, and preserving it is what stops answering from clearing
    // a review flag.
    expect(saveAnswer).toHaveBeenCalledWith('q1', ['o1'], false);
  });

  it('shows the candidate name in the toolbar so shared devices are not confusing', () => {
    render(<CandidateExamPage />);

    expect(screen.getByText('Ada Lovelace')).toBeInTheDocument();
  });

  // The designed runner counts answers in the question list beside the question (and in Finish).
  const answeredCount = () => screen.getByRole('list', { name: 'Summary' }).querySelector('li')!.textContent;
  it('shows how many questions are answered in the question list', () => {
    render(<CandidateExamPage />);

    expect(answeredCount()).toBe('Answered 0');
  });

  it('counts a question as answered once it has an answer', () => {
    (useAttemptQuery as jest.Mock).mockReturnValue({
      data: { ...attemptState, answers: [{ questionId: 'q1', selectedOptionIds: ['o1'], isMarkedForReview: false, answerText: null, codeLanguage: null }] },
      isError: false,
    });
    render(<CandidateExamPage />);

    expect(answeredCount()).toBe('Answered 1');
  });

  it("tells the candidate how many of the section's questions they must answer", async () => {
    renderExam({
      sections: [
        { title: 'Coding', targetDurationMinutes: null, requiredCount: 3, questions: [q('q1'), q('q2'), q('q3'), q('q4'), q('q5')] },
      ],
    });

    expect(await screen.findByText(/answer any 3 of 5/i)).toBeInTheDocument();
  });

  it('counts a section against what it asks for in Finish, not its question count', async () => {
    renderExam({
      sections: [
        { title: 'Coding', targetDurationMinutes: null, requiredCount: 3, questions: [q('q1'), q('q2'), q('q3'), q('q4'), q('q5')] },
      ],
      answers: [{ questionId: 'q1', selectedOptionIds: ['opt-a'], answerText: null }],
    });

    const finish = await openFinish();
    expect(within(finish).getByText('Some sections need more answers')).toBeInTheDocument();
    expect(within(finish).getByText('Coding: 1 of 3 answered')).toBeInTheDocument();
  });

  it('caps a section at what it asks for in Finish even when more are answered', async () => {
    // Best-N means extra answers are allowed, but Finish must never read "4 of 3".
    renderExam({
      sections: [
        { title: 'Coding', targetDurationMinutes: null, requiredCount: 3, questions: [q('q1'), q('q2'), q('q3'), q('q4'), q('q5')] },
      ],
      answers: [
        { questionId: 'q1', selectedOptionIds: ['opt-a'], answerText: null },
        { questionId: 'q2', selectedOptionIds: ['opt-a'], answerText: null },
        { questionId: 'q3', selectedOptionIds: ['opt-a'], answerText: null },
        { questionId: 'q4', selectedOptionIds: ['opt-a'], answerText: null },
      ],
    });

    const finish = await openFinish();
    expect(within(finish).getByText('Coding: 3 of 3 answered (your best 3 count)')).toBeInTheDocument();
    expect(within(finish).queryByText(/4 of 3/)).not.toBeInTheDocument();
  });

  it('negative: no section note in Finish when no section asks for some of its questions', async () => {
    renderExam({
      sections: [{ title: 'Coding', targetDurationMinutes: null, requiredCount: null, questions: [q('q1'), q('q2')] }],
    });

    const finish = await openFinish();
    expect(within(finish).queryByText(/sections? (need|has)/)).not.toBeInTheDocument();
    expect(within(finish).getByText('2 unanswered questions')).toBeInTheDocument();
  });

  it('toggles mark-for-review', async () => {
    render(<CandidateExamPage />);
    await userEvent.click(screen.getByRole('checkbox', { name: 'Mark for review' }));
    expect(saveAnswer).toHaveBeenCalledWith('q1', [], true);
  });

  // Regression: the button appearance used to read only off the server answer, so it stayed
  // "Mark for review" until the debounced save round-tripped (~3s of dead-feeling clicks).
  // It must flip immediately, before saveAnswer resolves and without any refetch.
  it('flips the mark-for-review label immediately on click, before the server responds', async () => {
    render(<CandidateExamPage />);

    const box = screen.getByRole('checkbox', { name: 'Mark for review' });
    expect(box).not.toBeChecked();

    await userEvent.click(box);

    // useAttemptQuery is a static mock here -- it never returns the marked answer -- so the
    // only way this is checked is the optimistic local state.
    expect(screen.getByRole('checkbox', { name: 'Mark for review' })).toBeChecked();
  });

  it('flushes pending answers and submits on confirm', async () => {
    render(<CandidateExamPage />);

    const finish = await openFinish();
    await userEvent.click(within(finish).getByRole('button', { name: 'Finish test' }));

    await waitFor(() => expect(flush).toHaveBeenCalled());
    await waitFor(() => expect(mutateAsync).toHaveBeenCalled());
    await waitFor(() => expect(push).toHaveBeenCalledWith('/submitted'));
  });

  // The submit dialog's tallies are the last thing a candidate sees before committing, so
  // they double as navigation: press one and land on the first question in that state.
  it('enters a filtered review of only the unanswered questions from the submit dialog', async () => {
    (useAttemptQuery as jest.Mock).mockReturnValue({
      data: {
        ...attemptState,
        sections: [
          {
            title: 'Section One',
            targetDurationMinutes: null,
            questions: [
              { id: 'q1', text: 'Answered one', type: 'single_mcq', marks: 1, options: [{ id: 'o1', text: 'a' }] },
              { id: 'q2', text: 'Blank two', type: 'single_mcq', marks: 1, options: [{ id: 'o2', text: 'b' }] },
              { id: 'q3', text: 'Answered three', type: 'single_mcq', marks: 1, options: [{ id: 'o3', text: 'c' }] },
              { id: 'q4', text: 'Blank four', type: 'single_mcq', marks: 1, options: [{ id: 'o4', text: 'd' }] },
            ],
          },
        ],
        answers: [
          { questionId: 'q1', selectedOptionIds: ['o1'], isMarkedForReview: false, answerText: null, codeLanguage: null },
          { questionId: 'q3', selectedOptionIds: ['o3'], isMarkedForReview: false, answerText: null, codeLanguage: null },
        ],
      },
      isError: false,
    });
    render(<CandidateExamPage />);

    const finish = await openFinish();
    await userEvent.click(within(finish).getByRole('button', { name: 'Go through the 2 unanswered questions' }));

    // Dialog closes; the first unanswered question (q2) is shown, with the review banner.
    expect(screen.queryByRole('dialog', { name: 'Finish the test?' })).not.toBeInTheDocument();
    expect(screen.getByText('Blank two')).toBeInTheDocument();
    const banner = screen.getByRole('region', { name: 'Going through questions' });
    expect(within(banner).getByText('Unanswered: 1 of 2')).toBeInTheDocument();

    // "Next" within the banner skips the answered q3 and lands on the next unanswered (q4).
    await userEvent.click(within(banner).getByRole('button', { name: 'Next unanswered' }));
    expect(screen.getByText('Blank four')).toBeInTheDocument();
    expect(within(banner).getByText('Unanswered: 2 of 2')).toBeInTheDocument();

    // Leaving review mode hides the banner.
    await userEvent.click(within(banner).getByRole('button', { name: 'Show all questions' }));
    expect(screen.queryByRole('region', { name: 'Going through questions' })).not.toBeInTheDocument();
  });

  it('does not offer a dead control when nothing is unanswered or marked', async () => {
    (useAttemptQuery as jest.Mock).mockReturnValue({
      data: {
        ...attemptState,
        answers: [{ questionId: 'q1', selectedOptionIds: ['o1'], isMarkedForReview: false, answerText: null, codeLanguage: null }],
      },
      isError: false,
    });
    render(<CandidateExamPage />);

    const finish = await openFinish();

    expect(within(finish).queryByRole('button', { name: /Go through the/ })).not.toBeInTheDocument();
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

  it('negative: a failed submission says so, keeps the test open, and Try again goes through', async () => {
    mutateAsync.mockRejectedValueOnce(new Error('The connection dropped.'));

    render(<CandidateExamPage />);
    const finish = await openFinish();
    await userEvent.click(within(finish).getByRole('button', { name: 'Finish test' }));

    expect(await screen.findByText('Your test was not submitted')).toBeInTheDocument();
    expect(screen.getByText('The connection dropped. Your answers are saved.')).toBeInTheDocument();
    expect(push).not.toHaveBeenCalledWith('/submitted');
    await userEvent.click(screen.getByRole('button', { name: 'Try again' }));

    await waitFor(() => expect(mutateAsync).toHaveBeenCalledTimes(2));
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

    expect(screen.getByText('Question 1 of 1 · 5 marks')).toBeInTheDocument();
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

    expect(saveAnswer).toHaveBeenCalledWith('q1', [], false, expect.any(String), expect.any(Object), 'javascript');
  });

  describe('essay question', () => {
    const essayAttemptState = {
      ...codeAttemptState,
      sections: [{ ...codeAttemptState.sections[0], questions: [{ id: 'q1', text: 'Discuss the CAP theorem.', type: 'essay', marks: 8, options: [] }] }],
    };

    it('renders a free-text textarea (not a Monaco editor) for an essay question', () => {
      (useAttemptQuery as jest.Mock).mockReturnValue({ data: essayAttemptState, isError: false });

      render(<CandidateExamPage />);

      expect(screen.getByText('Question 1 of 1 · Descriptive · 8 marks')).toBeInTheDocument();
      expect(screen.getByLabelText('Your answer')).toBeInTheDocument();
      expect(screen.queryByLabelText('code-editor')).not.toBeInTheDocument();
    });

    it('pre-fills the textarea with the saved answerText when resuming', () => {
      (useAttemptQuery as jest.Mock).mockReturnValue({
        data: { ...essayAttemptState, answers: [{ questionId: 'q1', selectedOptionIds: [], answerText: 'My saved essay.', isMarkedForReview: false }] },
        isError: false,
      });

      render(<CandidateExamPage />);

      expect(screen.getByLabelText('Your answer')).toHaveValue('My saved essay.');
    });

    it('saves essay text via saveAnswer as answerText with no language or telemetry', async () => {
      (useAttemptQuery as jest.Mock).mockReturnValue({ data: essayAttemptState, isError: false });

      render(<CandidateExamPage />);
      await userEvent.type(screen.getByLabelText('Your answer'), 'x');

      // Exactly four args — no telemetry object, no codeLanguage (unlike the code path above).
      expect(saveAnswer).toHaveBeenCalledWith('q1', [], false, expect.any(String));
    });
  });

  it('does not wipe answerText when toggling mark-for-review on a code question', async () => {
    (useAttemptQuery as jest.Mock).mockReturnValue({
      data: { ...codeAttemptState, answers: [{ questionId: 'q1', selectedOptionIds: [], answerText: 'function add(a, b) { return a + b; }', isMarkedForReview: false }] },
      isError: false,
    });

    render(<CandidateExamPage />);
    await userEvent.click(screen.getByRole('checkbox', { name: 'Mark for review' }));

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
    await userEvent.click(screen.getByRole('checkbox', { name: 'Mark for review' }));

    const lastCall = saveAnswer.mock.calls[saveAnswer.mock.calls.length - 1];
    expect(lastCall).toEqual(['q1', [], true, 'function add(a, b) { return a + b; }', expect.any(Object), 'javascript']);
  });

  it('counts a code question as unanswered until it has non-empty answerText', async () => {
    (useAttemptQuery as jest.Mock).mockReturnValue({ data: codeAttemptState, isError: false });

    render(<CandidateExamPage />);
    const finish = await openFinish();

    expect(within(finish).getByText('Not answered').closest('li')).toHaveTextContent('Not answered 1');
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

  // Run failures were the one candidate-facing failure with no server-side trace, so when
  // candidates reported "error 0" there was nothing to look at. The HTTP status is the whole
  // diagnostic: 0 means no HTTP exchange completed (points at :3002 being filtered), whereas a
  // real status means something else entirely.
  it('reports a failed run to the server, carrying the HTTP status that identifies the cause', async () => {
    (useAttemptQuery as jest.Mock).mockReturnValue({ data: codeAttemptState, isError: false });
    const failure = Object.assign(new Error('Something unexpected went wrong (error 0). Please try again.'), { status: 0 });
    runCodeMutate.mockImplementation((_payload, { onError }) => onError(failure));
    render(<CandidateExamPage />);

    await userEvent.click(screen.getByRole('button', { name: 'Run' }));

    expect(reportClientError).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        kind: 'code_run_failed',
        message: 'Something unexpected went wrong (error 0). Please try again.',
        detail: expect.stringContaining('status=0'),
      }),
    );
    // The candidate still sees the message; reporting is additive, never a replacement.
    expect(await screen.findByText(/error 0/)).toBeInTheDocument();
  });

  it('records status=none when the failure carried no HTTP status at all', async () => {
    (useAttemptQuery as jest.Mock).mockReturnValue({ data: codeAttemptState, isError: false });
    runCodeMutate.mockImplementation((_payload, { onError }) => onError(new Error("Can't reach the server.")));
    render(<CandidateExamPage />);

    await userEvent.click(screen.getByRole('button', { name: 'Run' }));

    expect(reportClientError).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ detail: expect.stringContaining('status=none') }),
    );
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

  describe('stage-3 face-mismatch enforcement', () => {
    it('shows the identity-check pause overlay (no strike count) and self-resumes on Continue for a face_mismatch pause', async () => {
      (useAttemptQuery as jest.Mock).mockReturnValue({
        data: { ...attemptState, status: 'paused', pausedReason: 'face_mismatch' },
        isError: false,
      });
      const resumeMutate = jest.fn();
      (useWebcamResume as jest.Mock).mockReturnValue({ mutate: resumeMutate, isPending: false, isError: false });

      render(<CandidateExamPage />);

      expect(screen.getByText('Identity check failed')).toBeInTheDocument();
      // Direct action, not a strike -- the "Warning X/Y" line must not appear.
      expect(screen.queryByText(/warning \d+\/\d+/i)).not.toBeInTheDocument();
      await userEvent.click(screen.getByRole('button', { name: /continue/i }));
      expect(resumeMutate).toHaveBeenCalled();
    });

    it('shows the generic block overlay for a face_mismatch block', () => {
      (useAttemptQuery as jest.Mock).mockReturnValue({
        data: { ...attemptState, status: 'blocked', pausedReason: 'face_mismatch' },
        isError: false,
      });

      render(<CandidateExamPage />);

      expect(screen.getByText(/recruiter needs to unblock/i)).toBeInTheDocument();
      expect(screen.queryByRole('button', { name: /continue/i })).not.toBeInTheDocument();
    });

    it('shows a non-freezing warn notice while the exam is still in_progress, and acks it on dismiss', async () => {
      (useAttemptQuery as jest.Mock).mockReturnValue({
        data: { ...attemptState, status: 'in_progress', faceWarningAt: '2026-09-14T00:00:00.000Z' },
        isError: false,
      });
      const ackMutate = jest.fn();
      (useAckFaceWarning as jest.Mock).mockReturnValue({ mutate: ackMutate, isPending: false });

      render(<CandidateExamPage />);

      expect(screen.getByText('Identity check warning')).toBeInTheDocument();
      await userEvent.click(screen.getByRole('button', { name: /i understand/i }));
      expect(ackMutate).toHaveBeenCalled();
    });

    it('does not show the warn notice once the attempt is paused (pause overlay takes precedence)', () => {
      (useAttemptQuery as jest.Mock).mockReturnValue({
        data: { ...attemptState, status: 'paused', pausedReason: 'face_mismatch', faceWarningAt: '2026-09-14T00:00:00.000Z' },
        isError: false,
      });
      (useWebcamResume as jest.Mock).mockReturnValue({ mutate: jest.fn(), isPending: false, isError: false });

      render(<CandidateExamPage />);

      expect(screen.queryByText('Identity check warning')).not.toBeInTheDocument();
      expect(screen.getByText('Identity check failed')).toBeInTheDocument();
    });
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

  // Answer 2231: a pause shows in the designed runner's paused view, in place of the questions (nothing behind it to reach).
  it.each(['paused', 'blocked'] as const)('shows the pause instead of the questions while %s', (status) => {
    (useAttemptQuery as jest.Mock).mockReturnValue({
      data: { ...attemptState, status, webcamViolationCount: 1 },
      isError: false,
    });

    render(<CandidateExamPage />);

    expect(screen.queryByText('What is 2 + 2?')).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Finish test' })).not.toBeInTheDocument();
  });

  it('shows the questions while in progress', () => {
    render(<CandidateExamPage />);

    expect(screen.getByText('What is 2 + 2?')).toBeInTheDocument();
  });

  // A bare section title ("test", "S1") tells a first-time candidate nothing, so the label carries the position. A
  // test with one section and no choice needs no label at all (nothing to move between).
  it('negative: a test with one section and no choice shows no section line', () => {
    render(<CandidateExamPage />);

    expect(screen.queryByText(/^Section /)).not.toBeInTheDocument();
  });

  it('adds the section position only when there is more than one section to move between', () => {
    (useAttemptQuery as jest.Mock).mockReturnValue({
      data: {
        ...attemptState,
        sections: [
          ...attemptState.sections,
          {
            title: 'Coding Round',
            targetDurationMinutes: null,
            questions: [{ id: 'q9', text: 'Second section question', type: 'single_mcq', marks: 1, options: [{ id: 'o9', text: 'yes' }] }],
          },
        ],
      },
      isError: false,
    });

    render(<CandidateExamPage />);

    expect(screen.getByText(/^Section 1 of 2: Section One$/)).toBeInTheDocument();
  });

  // The candidate-facing leaderboard was removed at the client's request, so there is no
  // longer a rank widget on the exam page. The recruiter's own Leaderboard tab is separate
  // and unaffected.
  it('does not show a leaderboard rank to the candidate', () => {
    render(<CandidateExamPage />);

    expect(screen.queryByText(/Leaderboard/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/#3/)).not.toBeInTheDocument();
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
    expect(screen.getByLabelText('Code, python')).toBeInTheDocument();
    // No alt text from the writer: a plain description stands in.
    expect(screen.getByAltText('Picture for this question')).toHaveAttribute('src', 'http://localhost:3001/uploads/question-images/stem.png');
    expect(screen.getByAltText('Picture: [3, 2, 1]')).toHaveAttribute('src', 'http://localhost:3001/uploads/question-images/opt-a.png');
  });

  it("uses the writer's alt text for the question and option pictures (answer 2126)", () => {
    mockUseAttemptQuery.mockReturnValue({
      data: attemptStateWithQuestion({
        id: 'q1', type: 'single_mcq', text: 'Which month sold most?', marks: 1, imageUrl: 'q.png', imageAlt: 'Monthly sales, rising from March',
        options: [{ id: 'o1', text: 'August', imageUrl: 'a.png', imageAlt: 'Bar chart, August highest' }],
      }),
      isError: false,
    });
    renderExamPage();

    expect(screen.getByRole('img', { name: 'Monthly sales, rising from March' })).toBeInTheDocument();
    expect(screen.getByRole('img', { name: 'Bar chart, August highest' })).toBeInTheDocument();
  });

  // Was 'stops leaderboard polling while paused' -- obsolete now that the candidate-facing
  // leaderboard is gone: nothing polls it from this page at all.
  it('never polls the leaderboard from the candidate exam page', () => {
    const leaderboardSpy = jest.spyOn(useAttemptModule, 'useLeaderboard');
    render(<CandidateExamPage />);

    expect(leaderboardSpy).not.toHaveBeenCalled();
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
    expect(screen.queryByRole('combobox', { name: 'Choose a language before you start' })).not.toBeInTheDocument();
  });

  it('requires a language pick before showing the editor for a fixed multi-language question', async () => {
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

    expect(screen.queryByLabelText('code-editor')).not.toBeInTheDocument();
    await userEvent.click(screen.getByRole('combobox', { name: 'Choose a language before you start' }));
    await userEvent.click(await screen.findByRole('option', { name: 'java' }));
    expect(screen.getByText('java')).toBeInTheDocument();
    expect(screen.getByLabelText('code-editor')).toBeInTheDocument();
  });

  describe('designed runner: breaks, connection, calculator, approved help, files (AS-4a part 2)', () => {
    const runnerInfo = { calculator: 'scientific', breaksAllowed: 2, breaksUsed: 1, breakMinutes: 5, breakEndsAt: null, offlineMinutes: 5, timeCreditCapMinutes: 10, offlineCreditSeconds: 0, surveyDone: false };

    it('offers the breaks left and starts one after saving what is pending', async () => {
      const startBreak = jest.fn().mockResolvedValue({});
      (useRunnerActions as jest.Mock).mockReturnValue({ startBreak, endBreak: jest.fn(), sendSurvey: jest.fn() });
      (useAttemptQuery as jest.Mock).mockReturnValue({ data: { ...attemptState, runner: runnerInfo }, isError: false });
      render(<CandidateExamPage />);

      await userEvent.click(screen.getByRole('button', { name: 'Take a break (1 left)' }));
      await waitFor(() => expect(startBreak).toHaveBeenCalled());
      expect(flush).toHaveBeenCalled();
    });

    it('on a break: shows the break, not the proctoring pause, and the timer does not run', async () => {
      const endBreak = jest.fn().mockResolvedValue({});
      (useRunnerActions as jest.Mock).mockReturnValue({ startBreak: jest.fn(), endBreak, sendSurvey: jest.fn() });
      const endsAt = new Date(Date.now() + 4 * 60_000).toISOString();
      (useAttemptQuery as jest.Mock).mockReturnValue({ data: { ...attemptState, status: 'paused', pausedReason: 'break', runner: { ...runnerInfo, breakEndsAt: endsAt } }, isError: false });
      render(<CandidateExamPage />);

      expect(screen.getByRole('heading', { name: 'Break' })).toBeInTheDocument();
      expect(screen.queryByText(/warning \d+\/\d+/i)).not.toBeInTheDocument();
      expect(useCountdown).toHaveBeenLastCalledWith(590, expect.any(Function), false);
      await userEvent.click(screen.getByRole('button', { name: 'End break and continue' }));
      expect(endBreak).toHaveBeenCalled();
    });

    it('negative: no break button when the test allows none or they are used up', () => {
      (useAttemptQuery as jest.Mock).mockReturnValue({ data: { ...attemptState, runner: { ...runnerInfo, breaksUsed: 2 } }, isError: false });
      render(<CandidateExamPage />);
      expect(screen.queryByRole('button', { name: /Take a break/ })).not.toBeInTheDocument();
    });

    it('offline: says the answers are kept on this device', () => {
      (useAnswerMutation as jest.Mock).mockReturnValue({ saveAnswer, flush, queued: 2, connection: 'reconnecting', offlineSince: Date.now() - 30_000 });
      (useAttemptQuery as jest.Mock).mockReturnValue({ data: { ...attemptState, runner: runnerInfo }, isError: false });
      render(<CandidateExamPage />);
      expect(screen.getByText(/2 answers are kept on this device/)).toBeInTheDocument();
    });

    it('a test set to scientific opens the scientific calculator; a test with none shows no calculator', async () => {
      (useAttemptQuery as jest.Mock).mockReturnValue({ data: { ...attemptState, runner: runnerInfo }, isError: false });
      const { unmount } = render(<CandidateExamPage />);
      await userEvent.click(screen.getByRole('button', { name: 'Calculator' }));
      expect(screen.getByRole('region', { name: 'Scientific calculator' })).toBeInTheDocument();
      unmount();
      (useAttemptQuery as jest.Mock).mockReturnValue({ data: { ...attemptState, runner: { ...runnerInfo, calculator: 'none' } }, isError: false });
      render(<CandidateExamPage />);
      expect(screen.queryByRole('button', { name: 'Calculator' })).not.toBeInTheDocument();
    });

    it('screen-reader mode shows in Display only when it was approved for the candidate (answer 2164)', async () => {
      (useCandidateHelp as jest.Mock).mockReturnValue({ data: { approved: ['reader'] } });
      const { unmount } = render(<CandidateExamPage />);
      await userEvent.click(screen.getByRole('button', { name: 'Display' }));
      expect(screen.getByRole('switch', { name: /Screen-reader mode/ })).toBeInTheDocument();
      unmount();
      (useCandidateHelp as jest.Mock).mockReturnValue({ data: { approved: [] } });
      render(<CandidateExamPage />);
      await userEvent.click(screen.getByRole('button', { name: 'Display' }));
      expect(screen.queryByRole('switch', { name: /Screen-reader mode/ })).not.toBeInTheDocument();
    });

    it('a file question lists the saved files with Remove, and takes new ones through the kit upload', async () => {
      const remove = jest.fn().mockResolvedValue({ files: [] });
      (useAttemptModule.useAnswerFileMutation as jest.Mock).mockReturnValue({ upload: { mutateAsync: jest.fn(), isPending: false }, remove: { mutateAsync: remove, isPending: false } });
      mockUseAttemptQuery.mockReturnValue({
        data: {
          ...attemptStateWithQuestion({ id: 'q1', type: 'file_upload', text: 'Upload your plan', marks: 5, options: [] }),
          answers: [{ questionId: 'q1', selectedOptionIds: [], answerText: null, codeLanguage: null, isMarkedForReview: false, answerFiles: [{ id: 'f1', fileName: 'plan.pdf', size: 2048 }] }],
        },
        isError: false,
      });
      renderExamPage();

      expect(screen.getByText('plan.pdf')).toBeInTheDocument();
      expect(screen.getByText('2 KB')).toBeInTheDocument();
      await userEvent.click(screen.getByRole('button', { name: 'Remove plan.pdf' }));
      expect(remove).toHaveBeenCalledWith({ questionId: 'q1', fileId: 'f1' });
      expect(screen.getByText('Upload files (up to 10, 10 MB each)')).toBeInTheDocument();
    });
  });

  describe('pauses in the designed runner (answers 2231, 2205)', () => {
    it("a proctor's pause shows their message; the candidate cannot resume it", () => {
      (useAttemptQuery as jest.Mock).mockReturnValue({ data: { ...attemptState, status: 'paused', pausedReason: 'proctor', pauseMessage: 'Please clear your desk.' }, isError: false });
      render(<CandidateExamPage />);
      expect(screen.getByText('Message from your proctor: "Please clear your desk."')).toBeInTheDocument();
      expect(screen.queryByRole('button', { name: 'Continue' })).not.toBeInTheDocument();
    });

    it('after approved extra time, checking the face sends one camera frame', async () => {
      const mutateAsync = jest.fn().mockResolvedValue({ status: 'in_progress', matched: true });
      (useAttemptModule.useFaceRecheck as jest.Mock).mockReturnValue({ mutateAsync, isPending: false });
      const stop = jest.fn();
      Object.defineProperty(navigator, 'mediaDevices', { configurable: true, value: { getUserMedia: jest.fn().mockResolvedValue({ getTracks: () => [{ stop }] }) } });
      jest.spyOn(HTMLMediaElement.prototype, 'play').mockResolvedValue(undefined);
      jest.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(null);
      jest.spyOn(HTMLCanvasElement.prototype, 'toDataURL').mockReturnValue('data:image/jpeg;base64,AAAA');
      (useAttemptQuery as jest.Mock).mockReturnValue({ data: { ...attemptState, status: 'paused', pausedReason: 'face_recheck' }, isError: false });
      render(<CandidateExamPage />);
      await userEvent.click(screen.getByRole('button', { name: 'Check and continue' }));
      await waitFor(() => expect(mutateAsync).toHaveBeenCalledWith('data:image/jpeg;base64,AAAA'));
      expect(stop).toHaveBeenCalled();
    });

    it('negative: a face that does not match keeps the test paused and says so', async () => {
      (useAttemptModule.useFaceRecheck as jest.Mock).mockReturnValue({ mutateAsync: jest.fn().mockResolvedValue({ status: 'paused', matched: false }), isPending: false });
      Object.defineProperty(navigator, 'mediaDevices', { configurable: true, value: { getUserMedia: jest.fn().mockResolvedValue({ getTracks: () => [{ stop: jest.fn() }] }) } });
      jest.spyOn(HTMLMediaElement.prototype, 'play').mockResolvedValue(undefined);
      jest.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(null);
      jest.spyOn(HTMLCanvasElement.prototype, 'toDataURL').mockReturnValue('data:image/jpeg;base64,AAAA');
      (useAttemptQuery as jest.Mock).mockReturnValue({ data: { ...attemptState, status: 'paused', pausedReason: 'face_recheck' }, isError: false });
      render(<CandidateExamPage />);
      await userEvent.click(screen.getByRole('button', { name: 'Check and continue' }));
      expect(await screen.findByText(/That did not match your photo/)).toBeInTheDocument();
    });

    it('answer 2270: after 3 tries a proctor checks; no more camera checks are offered', () => {
      (useAttemptQuery as jest.Mock).mockReturnValue({ data: { ...attemptState, status: 'paused', pausedReason: 'face_recheck', faceRecheckTriesLeft: 0 }, isError: false });
      render(<CandidateExamPage />);
      expect(screen.getByText('A proctor will check your face')).toBeInTheDocument();
      expect(screen.queryByRole('button', { name: 'Check and continue' })).not.toBeInTheDocument();
    });

    it("answer 2269: the proctor's message shows over the question; Got it marks it read; a reply is sent", async () => {
      const read = jest.fn().mockResolvedValue({ read: 1 });
      const reply = jest.fn().mockResolvedValue({ id: 'r1' });
      (useAttemptModule.useProctorMessages as jest.Mock).mockReturnValue({ read: { mutateAsync: read }, reply: { mutateAsync: reply } });
      (useAttemptQuery as jest.Mock).mockReturnValue({ data: { ...attemptState, messages: [{ id: 'm1', body: 'Please keep your face in view.', sentAt: '2026-11-17T05:00:00.000Z' }] }, isError: false });
      render(<CandidateExamPage />);
      expect(screen.getByText('Please keep your face in view.')).toBeInTheDocument();
      await userEvent.click(screen.getByRole('button', { name: 'Reply' }));
      await userEvent.type(screen.getByLabelText(/^Your message/), 'Fixed now.');
      await userEvent.click(screen.getByRole('button', { name: 'Send' }));
      await waitFor(() => expect(reply).toHaveBeenCalledWith('Fixed now.'));
      await userEvent.click(screen.getByRole('button', { name: 'Got it' }));
      expect(read).toHaveBeenCalled();
    });

    it('AS-6 part 2 (2272): an AI-allowed test shows the assistant and asks from the current question', async () => {
      const ask = jest.fn().mockResolvedValue({ limit: 20, turnsLeft: 18, log: [] });
      (useAttemptModule.useAssistant as jest.Mock).mockReturnValue({ view: { data: { limit: 20, turnsLeft: 19, log: [{ id: 'a1', role: 'assistant', body: 'Use a map.', questionId: null, at: '2026-11-17T05:00:00.000Z' }] } }, ask: { mutateAsync: ask } });
      (useAttemptQuery as jest.Mock).mockReturnValue({ data: { ...attemptState, runner: { ...attemptState.runner, aiAllowed: true } }, isError: false });
      render(<CandidateExamPage />);
      expect(screen.getByText('Use a map.')).toBeInTheDocument();
      await userEvent.type(screen.getByLabelText(/^Ask the assistant/), 'And ties?');
      await userEvent.click(screen.getByRole('button', { name: 'Ask' }));
      await waitFor(() => expect(ask).toHaveBeenCalledWith({ message: 'And ties?', questionId: attemptState.sections[0].questions[0].id }));
    });

    it('negative 2272: a test that is not AI-allowed shows no assistant', () => {
      (useAttemptQuery as jest.Mock).mockReturnValue({ data: attemptState, isError: false });
      render(<CandidateExamPage />);
      expect(screen.queryByText(/Allowed AI assistant/)).not.toBeInTheDocument();
    });

    it('negative: no camera says so instead of hanging', async () => {
      Object.defineProperty(navigator, 'mediaDevices', { configurable: true, value: { getUserMedia: jest.fn().mockRejectedValue(new Error('Camera blocked.')) } });
      (useAttemptQuery as jest.Mock).mockReturnValue({ data: { ...attemptState, status: 'paused', pausedReason: 'face_recheck' }, isError: false });
      render(<CandidateExamPage />);
      await userEvent.click(screen.getByRole('button', { name: 'Check and continue' }));
      expect(await screen.findByText('Camera blocked.')).toBeInTheDocument();
    });
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
      expect(screen.getByText(/browser or organisation may be blocking it.*contact your recruiter/i)).toBeInTheDocument();
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
