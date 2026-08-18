import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { PipelineBoard } from './PipelineBoard';
import { QueryProvider } from '../../lib/query-provider';
import { ToastProvider } from '../ui';

let mockRole = 'recruiter';
jest.mock('../../lib/auth-context', () => ({
  useAuth: () => ({ accessToken: 'test-token', organizationSlug: 'demo-org', role: mockRole }),
}));

const BOARD = {
  stages: {
    applied: [
      {
        entryId: 'e1',
        candidateId: 'c1',
        candidateName: 'Alice Applicant',
        candidateEmail: 'alice@x.com',
        stage: 'applied',
        enteredVia: 'manual',
        rejectedReason: null,
        examResults: [{ examId: 'exam-1', examTitle: 'Backend', passFail: 'pass', score: 82 }],
        avgRating: 4.2,
        feedbackCount: 3,
      },
    ],
    screened: [],
    interview: [],
    offer: [],
    hired: [],
  },
  rejected: [
    {
      entryId: 'e2',
      candidateId: 'c2',
      candidateName: 'Bob Rejected',
      candidateEmail: 'bob@x.com',
      stage: 'applied',
      enteredVia: 'manual',
      rejectedReason: 'failed screen',
      examResults: [],
      avgRating: null,
      feedbackCount: 0,
    },
  ],
};

function renderBoard() {
  return render(
    <QueryProvider>
      <ToastProvider>
        <PipelineBoard jobId="job-1" />
      </ToastProvider>
    </QueryProvider>,
  );
}

function mockFetch(overrides: (url: string, options?: RequestInit) => Response | null = () => null) {
  const fetchMock = jest.fn(async (url, options) => {
    const urlStr = String(url);
    const override = overrides(urlStr, options);
    if (override) return override;
    if (urlStr.endsWith('/jobs/job-1/pipeline')) {
      return new Response(JSON.stringify(BOARD), { status: 200 });
    }
    return new Response(JSON.stringify({}), { status: 200 });
  });
  global.fetch = fetchMock as unknown as typeof fetch;
  return fetchMock;
}

describe('PipelineBoard', () => {
  const originalFetch = global.fetch;
  afterEach(() => {
    global.fetch = originalFetch;
    mockRole = 'recruiter';
  });

  it('renders five stage columns', async () => {
    mockFetch();
    renderBoard();

    await screen.findByText('Alice Applicant');
    expect(screen.getByText('Applied (1)')).toBeInTheDocument();
    expect(screen.getByText('Screened (0)')).toBeInTheDocument();
    expect(screen.getByText('Interview (0)')).toBeInTheDocument();
    expect(screen.getByText('Offer (0)')).toBeInTheDocument();
    expect(screen.getByText('Hired (0)')).toBeInTheDocument();
  });

  it('shows an exam result chip and the average rating on a card', async () => {
    mockFetch();
    renderBoard();

    await screen.findByText('Alice Applicant');
    expect(screen.getByText('Backend · Passed 82%')).toBeInTheDocument();
    expect(screen.getByText('4.2')).toBeInTheDocument();
    expect(screen.getByText('3 notes')).toBeInTheDocument();
  });

  it('changing a card stage select fires the patch mutation', async () => {
    const fetchMock = mockFetch((url, options) =>
      url.includes('/entries/e1') && options?.method === 'PATCH' ? new Response(JSON.stringify({}), { status: 200 }) : null,
    );
    renderBoard();
    await screen.findByText('Alice Applicant');

    await userEvent.selectOptions(screen.getByLabelText('Stage for Alice Applicant'), 'interview');

    const patchCall = fetchMock.mock.calls.find((call) => String(call[0]).includes('/entries/e1') && call[1]?.method === 'PATCH');
    expect(patchCall).toBeDefined();
    expect(JSON.parse(String(patchCall![1]?.body))).toEqual({ stage: 'interview' });
  });

  it('shows rejected entries only under the Rejected tab', async () => {
    mockFetch();
    renderBoard();
    await screen.findByText('Alice Applicant');

    expect(screen.queryByText('Bob Rejected')).not.toBeInTheDocument();

    await userEvent.click(screen.getByRole('tab', { name: /rejected/i }));
    expect(await screen.findByText('Bob Rejected')).toBeInTheDocument();
    expect(screen.getByText('Reason: failed screen')).toBeInTheDocument();
    expect(screen.queryByText('Alice Applicant')).not.toBeInTheDocument();
  });

  it('moving a rejected entry back fires an un-reject patch', async () => {
    const fetchMock = mockFetch((url, options) =>
      url.includes('/entries/e2') && options?.method === 'PATCH' ? new Response(JSON.stringify({}), { status: 200 }) : null,
    );
    renderBoard();
    await screen.findByText('Alice Applicant');
    await userEvent.click(screen.getByRole('tab', { name: /rejected/i }));
    await screen.findByText('Bob Rejected');

    await userEvent.click(screen.getByRole('button', { name: 'Move back' }));

    const patchCall = fetchMock.mock.calls.find((call) => String(call[0]).includes('/entries/e2') && call[1]?.method === 'PATCH');
    expect(patchCall).toBeDefined();
    expect(JSON.parse(String(patchCall![1]?.body))).toEqual({ stage: 'applied' });
  });

  it('hides manage-only controls for a panel role', async () => {
    mockRole = 'panel';
    mockFetch();
    renderBoard();
    await screen.findByText('Alice Applicant');

    expect(screen.queryByLabelText('Stage for Alice Applicant')).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Reject' })).not.toBeInTheDocument();
  });

  it('opens the compose modal pre-filled when a stage move returns a pendingMessage', async () => {
    mockFetch((url, options) => {
      if (url.includes('/entries/e1') && options?.method === 'PATCH') {
        return new Response(
          JSON.stringify({
            entry: { id: 'e1' },
            pendingMessage: { templateId: 'tmpl-1', subject: 'Moving to interview', body: 'Hi Alice, next steps...' },
          }),
          { status: 200 },
        );
      }
      if (url.endsWith('/candidate-email-templates')) {
        return new Response(JSON.stringify([]), { status: 200 });
      }
      return null;
    });
    renderBoard();
    await screen.findByText('Alice Applicant');

    await userEvent.selectOptions(screen.getByLabelText('Stage for Alice Applicant'), 'interview');

    expect(await screen.findByRole('heading', { name: 'Send message' })).toBeInTheDocument();
    expect(screen.getByLabelText('Subject')).toHaveValue('Moving to interview');
  });

  it('does not open the compose modal when a stage move has no pendingMessage', async () => {
    mockFetch((url, options) =>
      url.includes('/entries/e1') && options?.method === 'PATCH' ? new Response(JSON.stringify({ entry: { id: 'e1' } }), { status: 200 }) : null,
    );
    renderBoard();
    await screen.findByText('Alice Applicant');

    await userEvent.selectOptions(screen.getByLabelText('Stage for Alice Applicant'), 'interview');

    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(screen.queryByRole('heading', { name: 'Send message' })).not.toBeInTheDocument();
  });
});
