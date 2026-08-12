import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { GenerateQuestionsModal } from './GenerateQuestionsModal';

jest.mock('../lib/hooks/useQuestions', () => ({
  useGenerateQuestions: jest.fn(),
  useAiJob: jest.fn(),
  useTags: () => ({ data: [] }),
}));
// eslint-disable-next-line @typescript-eslint/no-var-requires
const { useGenerateQuestions, useAiJob } = require('../lib/hooks/useQuestions');

describe('GenerateQuestionsModal', () => {
  it('submits the form values, including marks and negative marks', async () => {
    const mutateAsync = jest.fn().mockResolvedValue({ aiJobId: 'j1' });
    (useGenerateQuestions as jest.Mock).mockReturnValue({ mutateAsync, isPending: false });
    (useAiJob as jest.Mock).mockReturnValue({ data: undefined });

    render(<GenerateQuestionsModal open onClose={jest.fn()} onCompleted={jest.fn()} />);
    await userEvent.type(screen.getByLabelText('Topic'), 'SQL joins');
    await userEvent.click(screen.getByRole('button', { name: 'Generate' }));

    await waitFor(() => expect(mutateAsync).toHaveBeenCalled());
    expect(mutateAsync.mock.calls[0][0]).toMatchObject({ topic: 'SQL joins', marks: 1, negativeMarks: 0 });
  });

  // The whole point of surfacing dropped reasons: "6 created" alone looks like the model being
  // stingy, when in fact the prompt is producing questions that fail validation every time.
  it('reports how many were dropped and why, not just how many were created', async () => {
    (useGenerateQuestions as jest.Mock).mockReturnValue({ mutateAsync: jest.fn().mockResolvedValue({ aiJobId: 'j1' }), isPending: false });
    (useAiJob as jest.Mock).mockReturnValue({
      data: {
        id: 'j1', type: 'ai-question-generation', status: 'completed', error: null,
        outputJson: JSON.stringify({ requested: 10, created: 6, dropped: [{ reason: 'Question must have exactly one correct option' }], questionIds: [] }),
      },
    });

    render(<GenerateQuestionsModal open onClose={jest.fn()} onCompleted={jest.fn()} />);
    expect(await screen.findByText(/10 requested/)).toBeInTheDocument();
    expect(screen.getByText(/6 created/)).toBeInTheDocument();
    expect(screen.getByText(/must have exactly one correct option/)).toBeInTheDocument();
  });

  it('shows the failure message when the job fails, rather than an empty result', async () => {
    (useGenerateQuestions as jest.Mock).mockReturnValue({ mutateAsync: jest.fn(), isPending: false });
    (useAiJob as jest.Mock).mockReturnValue({
      data: { id: 'j1', type: 'ai-question-generation', status: 'failed', outputJson: null, error: 'No AI provider configured' },
    });

    render(<GenerateQuestionsModal open onClose={jest.fn()} onCompleted={jest.fn()} />);
    expect(await screen.findByText(/No AI provider configured/)).toBeInTheDocument();
  });

  it('tells the recruiter the drafts land even if they close the modal', async () => {
    (useGenerateQuestions as jest.Mock).mockReturnValue({ mutateAsync: jest.fn(), isPending: false });
    (useAiJob as jest.Mock).mockReturnValue({ data: { id: 'j1', type: 'ai-question-generation', status: 'processing', outputJson: null, error: null } });

    render(<GenerateQuestionsModal open onClose={jest.fn()} onCompleted={jest.fn()} />);
    expect(await screen.findByText(/safe to close/i)).toBeInTheDocument();
  });

  // Guards the "exactly once" contract from the brief: a caller that doesn't memoize its
  // onCompleted prop (a fresh arrow function each render) must not cause a second call once
  // the job is already completed -- that would yank the recruiter back to the drafts filter.
  it('calls onCompleted only once even if the caller passes a new callback reference on rerender', async () => {
    const onCompleted = jest.fn();
    (useGenerateQuestions as jest.Mock).mockReturnValue({ mutateAsync: jest.fn(), isPending: false });
    (useAiJob as jest.Mock).mockReturnValue({
      data: {
        id: 'j1', type: 'ai-question-generation', status: 'completed', error: null,
        outputJson: JSON.stringify({ requested: 5, created: 5, dropped: [], questionIds: [] }),
      },
    });

    const { rerender } = render(<GenerateQuestionsModal open onClose={jest.fn()} onCompleted={() => onCompleted()} />);
    await waitFor(() => expect(onCompleted).toHaveBeenCalledTimes(1));

    rerender(<GenerateQuestionsModal open onClose={jest.fn()} onCompleted={() => onCompleted()} />);
    expect(onCompleted).toHaveBeenCalledTimes(1);
  });
});
