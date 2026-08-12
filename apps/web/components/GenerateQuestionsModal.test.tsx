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
    (useGenerateQuestions as jest.Mock).mockReturnValue({ mutateAsync: jest.fn().mockResolvedValue({ aiJobId: 'j1' }), isPending: false });
    (useAiJob as jest.Mock).mockReturnValue({ data: { id: 'j1', type: 'ai-question-generation', status: 'processing', outputJson: null, error: null } });

    // `running` (and thus the progress text) is driven by the job actually having been
    // started, not just by useAiJob happening to return a status -- so submit first.
    render(<GenerateQuestionsModal open onClose={jest.fn()} onCompleted={jest.fn()} />);
    await userEvent.type(screen.getByLabelText('Topic'), 'SQL joins');
    await userEvent.click(screen.getByRole('button', { name: 'Generate' }));
    expect(await screen.findByText(/safe to close/i)).toBeInTheDocument();
  });

  // Guards the "exactly once" contract from the brief: a caller that doesn't memoize its
  // onCompleted prop (a fresh arrow function each render) must not cause a second call once
  // the job is already completed -- that would yank the recruiter back to the drafts filter.
  it('calls onCompleted only once even if the caller passes a new callback reference on rerender', async () => {
    const onCompleted = jest.fn();
    (useGenerateQuestions as jest.Mock).mockReturnValue({ mutateAsync: jest.fn().mockResolvedValue({ aiJobId: 'j1' }), isPending: false });
    (useAiJob as jest.Mock).mockReturnValue({
      data: {
        id: 'j1', type: 'ai-question-generation', status: 'completed', error: null,
        outputJson: JSON.stringify({ requested: 5, created: 5, dropped: [], questionIds: [] }),
      },
    });

    const { rerender } = render(<GenerateQuestionsModal open onClose={jest.fn()} onCompleted={() => onCompleted()} />);
    await userEvent.type(screen.getByLabelText('Topic'), 'SQL joins');
    await userEvent.click(screen.getByRole('button', { name: 'Generate' }));
    await waitFor(() => expect(onCompleted).toHaveBeenCalledTimes(1));

    rerender(<GenerateQuestionsModal open onClose={jest.fn()} onCompleted={() => onCompleted()} />);
    expect(onCompleted).toHaveBeenCalledTimes(1);
  });

  // Critical #1: outputJson can be well-formed JSON of the wrong shape ('{}' parses fine,
  // `dropped` is undefined). Without a shape check, `output.dropped.length` throws during
  // render with no error boundary above this component, and the recruiter gets a blank page.
  it('renders without throwing when a completed job has outputJson of the wrong shape', async () => {
    (useGenerateQuestions as jest.Mock).mockReturnValue({ mutateAsync: jest.fn(), isPending: false });
    (useAiJob as jest.Mock).mockReturnValue({
      data: { id: 'j1', type: 'ai-question-generation', status: 'completed', error: null, outputJson: '{}' },
    });

    expect(() => render(<GenerateQuestionsModal open onClose={jest.fn()} onCompleted={jest.fn()} />)).not.toThrow();
  });

  // Critical #2: between mutateAsync resolving and the first poll resolving, job.data is still
  // undefined. A `running` derived only from job.data misses that window and lets a recruiter
  // double-click Generate, paying for a second job while the modal shows nothing at all.
  it('disables Generate and shows progress immediately after submit, before the first poll resolves', async () => {
    let resolveMutate: (value: { aiJobId: string }) => void = () => {};
    const mutateAsync = jest.fn(() => new Promise<{ aiJobId: string }>((resolve) => { resolveMutate = resolve; }));
    (useGenerateQuestions as jest.Mock).mockReturnValue({ mutateAsync, isPending: false });
    (useAiJob as jest.Mock).mockReturnValue({ data: undefined });

    render(<GenerateQuestionsModal open onClose={jest.fn()} onCompleted={jest.fn()} />);
    await userEvent.type(screen.getByLabelText('Topic'), 'SQL joins');
    await userEvent.click(screen.getByRole('button', { name: 'Generate' }));
    resolveMutate({ aiJobId: 'j1' });

    await waitFor(() => expect(screen.getByRole('button', { name: 'Generate' })).toBeDisabled());
    expect(screen.getByText(/safe to close/i)).toBeInTheDocument();
  });

  // Important #3: closing the modal must not cancel the poll -- the component stays mounted
  // (the caller just stops rendering the dialog open), so a job started before close still
  // notifies the caller when it lands.
  it('keeps polling and calls onCompleted after the modal is closed', async () => {
    const onCompleted = jest.fn();
    const onClose = jest.fn();
    const mutateAsync = jest.fn().mockResolvedValue({ aiJobId: 'j1' });
    (useGenerateQuestions as jest.Mock).mockReturnValue({ mutateAsync, isPending: false });
    (useAiJob as jest.Mock).mockReturnValue({ data: undefined });

    const { rerender } = render(<GenerateQuestionsModal open onClose={onClose} onCompleted={onCompleted} />);
    await userEvent.type(screen.getByLabelText('Topic'), 'SQL joins');
    await userEvent.click(screen.getByRole('button', { name: 'Generate' }));
    await waitFor(() => expect(mutateAsync).toHaveBeenCalled());

    // The footer button relabels to "Close" while a job is running -- "Cancel" would be a lie,
    // since clicking it does not cancel the paid job, only hides the dialog.
    await userEvent.click(screen.getByRole('button', { name: 'Close' }));
    expect(onClose).toHaveBeenCalled();

    // Parent hides the dialog (open=false) but keeps this component mounted, same as the
    // real page. The job then finishes.
    (useAiJob as jest.Mock).mockReturnValue({
      data: {
        id: 'j1', type: 'ai-question-generation', status: 'completed', error: null,
        outputJson: JSON.stringify({ requested: 5, created: 5, dropped: [], questionIds: [] }),
      },
    });
    rerender(<GenerateQuestionsModal open={false} onClose={onClose} onCompleted={onCompleted} />);

    await waitFor(() => expect(onCompleted).toHaveBeenCalledTimes(1));
  });

  // Important #4: dedup was untested -- the only prior "dropped" test carried a single reason,
  // so replacing the `new Set` with a plain `.map` would leave every test green while printing
  // the same bullet once per drop (14 times at batch size 20 for one failing rule).
  it('deduplicates repeated dropped reasons instead of printing one bullet per drop', async () => {
    (useGenerateQuestions as jest.Mock).mockReturnValue({ mutateAsync: jest.fn(), isPending: false });
    (useAiJob as jest.Mock).mockReturnValue({
      data: {
        id: 'j1', type: 'ai-question-generation', status: 'completed', error: null,
        outputJson: JSON.stringify({
          requested: 20,
          created: 6,
          dropped: [
            { reason: 'Question must have exactly one correct option' },
            { reason: 'Question must have exactly one correct option' },
          ],
          questionIds: [],
        }),
      },
    });

    render(<GenerateQuestionsModal open onClose={jest.fn()} onCompleted={jest.fn()} />);
    expect(await screen.findAllByText(/must have exactly one correct option/)).toHaveLength(1);
  });

  // N1: without this, a poll error (token expiry mid-job, an API restart, a 500) leaves
  // `running` stuck true forever -- job.data never resolves, so "Generating..." shows with
  // no error and the only way out is a page reload, since aiJobId is never cleared on close.
  it('shows an error and re-enables Generate when the poll itself errors', async () => {
    (useGenerateQuestions as jest.Mock).mockReturnValue({ mutateAsync: jest.fn().mockResolvedValue({ aiJobId: 'j1' }), isPending: false });
    (useAiJob as jest.Mock).mockReturnValue({ data: undefined, isError: true });

    render(<GenerateQuestionsModal open onClose={jest.fn()} onCompleted={jest.fn()} />);
    await userEvent.type(screen.getByLabelText('Topic'), 'SQL joins');
    await userEvent.click(screen.getByRole('button', { name: 'Generate' }));

    expect(await screen.findByRole('alert')).toHaveTextContent(/couldn't check on the generation job/i);
    await waitFor(() => expect(screen.getByRole('button', { name: 'Generate' })).not.toBeDisabled());
  });

  // N3: aiJobId and the parsed output persist by design (see the comment above aiJobId), so
  // reopening the modal after a completed run renders the previous summary. Without a "Last
  // run:" prefix that reads as the current run's result.
  it('labels a completed run\'s summary as history, not as the current result', async () => {
    (useGenerateQuestions as jest.Mock).mockReturnValue({ mutateAsync: jest.fn(), isPending: false });
    (useAiJob as jest.Mock).mockReturnValue({
      data: {
        id: 'j1', type: 'ai-question-generation', status: 'completed', error: null,
        outputJson: JSON.stringify({ requested: 10, created: 6, dropped: [], questionIds: [] }),
      },
    });

    render(<GenerateQuestionsModal open onClose={jest.fn()} onCompleted={jest.fn()} />);
    expect(await screen.findByText(/^Last run: 10 requested/)).toBeInTheDocument();
  });

  // N4: a second submit that rejects (e.g. the server rejects the payload) must not leave the
  // previous run's "10 requested..." summary sitting under the fresh form error -- that reads
  // as though those numbers belong to the failed attempt.
  it('hides the previous run\'s output once a new submit fails', async () => {
    const mutateAsync = jest.fn().mockRejectedValue(new Error('Server rejected the request.'));
    (useGenerateQuestions as jest.Mock).mockReturnValue({ mutateAsync, isPending: false });
    (useAiJob as jest.Mock).mockReturnValue({
      data: {
        id: 'j1', type: 'ai-question-generation', status: 'completed', error: null,
        outputJson: JSON.stringify({ requested: 10, created: 6, dropped: [], questionIds: [] }),
      },
    });

    render(<GenerateQuestionsModal open onClose={jest.fn()} onCompleted={jest.fn()} />);
    expect(await screen.findByText(/10 requested/)).toBeInTheDocument();

    await userEvent.type(screen.getByLabelText('Topic'), 'SQL joins');
    await userEvent.click(screen.getByRole('button', { name: 'Generate' }));

    expect(await screen.findByText('Server rejected the request.')).toBeInTheDocument();
    expect(screen.queryByText(/10 requested/)).not.toBeInTheDocument();
  });

  // Important #5: Count is a bare <div>, not a <form>, so `min`/`max` never ran and there was
  // no client-side stop before a guaranteed 400 from the server's @Max(20).
  it('does not submit when Count is outside the 1-20 range the server enforces', async () => {
    const mutateAsync = jest.fn().mockResolvedValue({ aiJobId: 'j1' });
    (useGenerateQuestions as jest.Mock).mockReturnValue({ mutateAsync, isPending: false });
    (useAiJob as jest.Mock).mockReturnValue({ data: undefined });

    render(<GenerateQuestionsModal open onClose={jest.fn()} onCompleted={jest.fn()} />);
    await userEvent.type(screen.getByLabelText('Topic'), 'SQL joins');
    const countInput = screen.getByLabelText('Count');
    await userEvent.clear(countInput);
    await userEvent.type(countInput, '999');
    await userEvent.click(screen.getByRole('button', { name: 'Generate' }));

    expect(mutateAsync).not.toHaveBeenCalled();
  });
});
