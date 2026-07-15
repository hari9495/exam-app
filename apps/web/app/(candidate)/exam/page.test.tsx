import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useRouter } from 'next/navigation';
import { useAttemptQuery, useAnswerMutation, useSubmitAttempt } from '../../../lib/hooks/useAttempt';
import { useCountdown } from '../../../lib/hooks/useCountdown';
import { useProctoringMonitor } from '../../../lib/hooks/useProctoringMonitor';
import { useCandidateAuth } from '../../../lib/candidate-auth-context';
import CandidateExamPage from './page';

jest.mock('next/navigation', () => ({ useRouter: jest.fn() }));
jest.mock('../../../lib/hooks/useAttempt', () => ({
  useAttemptQuery: jest.fn(),
  useAnswerMutation: jest.fn(),
  useSubmitAttempt: jest.fn(),
}));
jest.mock('../../../lib/hooks/useCountdown', () => ({ useCountdown: jest.fn() }));
jest.mock('../../../lib/hooks/useProctoringMonitor', () => ({ useProctoringMonitor: jest.fn() }));
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

  beforeEach(() => {
    push.mockClear();
    saveAnswer.mockClear();
    flush.mockClear();
    mutateAsync.mockClear();
    (useRouter as jest.Mock).mockReturnValue({ push });
    (useAttemptQuery as jest.Mock).mockReturnValue({ data: attemptState, isError: false });
    (useAnswerMutation as jest.Mock).mockReturnValue({ saveAnswer, flush });
    (useSubmitAttempt as jest.Mock).mockReturnValue({ mutateAsync, isPending: false, isError: false, mutate: jest.fn() });
    (useCountdown as jest.Mock).mockReturnValue(590);
    (useProctoringMonitor as jest.Mock).mockReturnValue(undefined);
    (useCandidateAuth as jest.Mock).mockReturnValue({ accessToken: 'token-1', isLoading: false });
  });

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

    expect(screen.getByText('CODE · 5 MARKS')).toBeInTheDocument();
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

    expect(saveAnswer).toHaveBeenCalledWith('q1', [], undefined, expect.any(String));
  });

  it('does not wipe answerText when toggling mark-for-review on a code question', async () => {
    (useAttemptQuery as jest.Mock).mockReturnValue({
      data: { ...codeAttemptState, answers: [{ questionId: 'q1', selectedOptionIds: [], answerText: 'function add(a, b) { return a + b; }', isMarkedForReview: false }] },
      isError: false,
    });

    render(<CandidateExamPage />);
    await userEvent.click(screen.getByRole('button', { name: /Mark for review/ }));

    expect(saveAnswer).toHaveBeenCalledWith('q1', [], true, 'function add(a, b) { return a + b; }');
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
    expect(lastCall).toEqual(['q1', [], true, 'function add(a, b) { return a + b; }']);
  });

  it('counts a code question as unanswered until it has non-empty answerText', async () => {
    (useAttemptQuery as jest.Mock).mockReturnValue({ data: codeAttemptState, isError: false });

    render(<CandidateExamPage />);
    await userEvent.click(screen.getAllByRole('button', { name: 'Review & Submit' })[0]);

    expect(screen.getByText(/You have 1 unanswered question/)).toBeInTheDocument();
  });
});
