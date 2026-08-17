import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { CandidateDrawer } from './CandidateDrawer';
import { QueryProvider } from '../../lib/query-provider';
import { ToastProvider } from '../ui';

jest.mock('../../lib/auth-context', () => ({
  useAuth: () => ({ accessToken: 'test-token', organizationSlug: 'demo-org', role: 'recruiter' }),
}));

const ROW = {
  entryId: 'entry-1',
  candidateId: 'cand-1',
  candidateName: 'Alice Applicant',
  candidateEmail: 'alice@x.com',
  stage: 'applied',
  enteredVia: 'manual',
  examResults: [{ examId: 'exam-1', examTitle: 'Backend', passFail: 'pass', score: 82 }],
  avgRating: 4.5,
  feedbackCount: 2,
};

const FEEDBACK = [
  { id: 'f2', authorUserId: 'u2', authorName: 'Newer Reviewer', note: 'Great follow-up.', rating: 5, createdAt: '2026-08-16T00:00:00.000Z' },
  { id: 'f1', authorUserId: 'u1', authorName: 'Older Reviewer', note: 'Solid first round.', rating: 3, createdAt: '2026-08-10T00:00:00.000Z' },
];

function renderDrawer(onClose = jest.fn()) {
  return render(
    <QueryProvider>
      <ToastProvider>
        <CandidateDrawer jobId="job-1" row={ROW as any} onClose={onClose} />
      </ToastProvider>
    </QueryProvider>,
  );
}

function mockFetch(overrides: (url: string, options?: RequestInit) => Response | null = () => null) {
  const fetchMock = jest.fn(async (url, options) => {
    const urlStr = String(url);
    const override = overrides(urlStr, options);
    if (override) return override;
    if (urlStr.endsWith('/entries/entry-1/feedback') && options?.method === undefined) {
      return new Response(JSON.stringify(FEEDBACK), { status: 200 });
    }
    return new Response(JSON.stringify({}), { status: 200 });
  });
  global.fetch = fetchMock as unknown as typeof fetch;
  return fetchMock;
}

describe('CandidateDrawer', () => {
  const originalFetch = global.fetch;
  afterEach(() => {
    global.fetch = originalFetch;
  });

  it('renders the feedback timeline newest-first', async () => {
    mockFetch();
    renderDrawer();

    await screen.findByText('Older Reviewer');
    const authors = screen.getAllByText(/Reviewer/);
    expect(authors[0]).toHaveTextContent('Newer Reviewer');
    expect(authors[1]).toHaveTextContent('Older Reviewer');
  });

  it('posts a note and rating from the compose box', async () => {
    const fetchMock = mockFetch((url, options) =>
      url.endsWith('/entries/entry-1/feedback') && options?.method === 'POST'
        ? new Response(JSON.stringify({ id: 'f3' }), { status: 201 })
        : null,
    );
    renderDrawer();
    await screen.findByText('Older Reviewer');

    await userEvent.type(screen.getByLabelText('Add feedback'), 'Looks strong.');
    await userEvent.click(screen.getByLabelText('Rate 4 stars'));
    await userEvent.click(screen.getByRole('button', { name: 'Post feedback' }));

    const postCall = fetchMock.mock.calls.find(
      (call) => String(call[0]).endsWith('/entries/entry-1/feedback') && call[1]?.method === 'POST',
    );
    expect(postCall).toBeDefined();
    expect(JSON.parse(String(postCall![1]?.body))).toEqual({ note: 'Looks strong.', rating: 4 });
  });
});
