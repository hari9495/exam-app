import { render, screen, waitFor } from '@testing-library/react';
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

const MESSAGES = [
  { id: 'm2', toEmail: 'alice@x.com', subject: 'Moving to interview', renderedBody: 'Hi Alice…', status: 'sent', source: 'manual', sentByUserId: 'u1', createdAt: '2026-08-16T00:00:00.000Z' },
  { id: 'm1', toEmail: 'alice@x.com', subject: 'Application received', renderedBody: 'Hi Alice…', status: 'failed', source: 'manual', sentByUserId: 'u1', createdAt: '2026-08-10T00:00:00.000Z' },
];

function mockFetch(
  overrides: (url: string, options?: RequestInit) => Response | null = () => null,
  profile: unknown = null,
  messages: unknown = MESSAGES,
) {
  const fetchMock = jest.fn(async (url, options) => {
    const urlStr = String(url);
    const override = overrides(urlStr, options);
    if (override) return override;
    if (urlStr.endsWith('/entries/entry-1/feedback') && options?.method === undefined) {
      return new Response(JSON.stringify(FEEDBACK), { status: 200 });
    }
    if (urlStr.endsWith('/candidates/cand-1/profile')) {
      return new Response(JSON.stringify(profile), { status: 200 });
    }
    if (urlStr.endsWith('/candidates/cand-1/messages')) {
      return new Response(JSON.stringify(messages), { status: 200 });
    }
    if (urlStr.endsWith('/candidate-email-templates')) {
      return new Response(JSON.stringify([]), { status: 200 });
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

  it('renders the done profile: summary, skills, title, years, and a download button', async () => {
    mockFetch(() => null, {
      resumePath: 'resumes/cand-1.pdf',
      parseStatus: 'done',
      parsedSummary: 'Backend engineer with a focus on distributed systems.',
      parsedSkills: JSON.stringify(['TypeScript', 'Postgres']),
      parsedTitle: 'Senior Backend Engineer',
      parsedYearsExperience: 7,
    });
    renderDrawer();

    expect(await screen.findByText('Senior Backend Engineer')).toBeInTheDocument();
    expect(screen.getByText('7 yrs experience')).toBeInTheDocument();
    expect(screen.getByText('Backend engineer with a focus on distributed systems.')).toBeInTheDocument();
    expect(screen.getByText('TypeScript')).toBeInTheDocument();
    expect(screen.getByText('Postgres')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Download résumé' })).toBeInTheDocument();
  });

  it('opens the résumé URL in a new tab when Download résumé is clicked', async () => {
    mockFetch(
      (url) =>
        url.endsWith('/candidates/cand-1/resume') ? new Response(JSON.stringify({ url: 'https://blob.example/r.pdf' }), { status: 200 }) : null,
      { resumePath: 'resumes/cand-1.pdf', parseStatus: 'done', parsedSummary: null, parsedSkills: null, parsedTitle: null, parsedYearsExperience: null },
    );
    renderDrawer();

    const openSpy = jest.spyOn(window, 'open').mockImplementation(() => null);
    await userEvent.click(await screen.findByRole('button', { name: 'Download résumé' }));

    await waitFor(() => expect(openSpy).toHaveBeenCalledWith('https://blob.example/r.pdf', '_blank', 'noopener,noreferrer'));
    openSpy.mockRestore();
  });

  it('shows a parsing hint while parseStatus is pending/parsing', async () => {
    mockFetch(() => null, { resumePath: 'r.pdf', parseStatus: 'parsing', parsedSummary: null, parsedSkills: null, parsedTitle: null, parsedYearsExperience: null });
    renderDrawer();

    expect(await screen.findByText('Parsing…')).toBeInTheDocument();
  });

  it('shows a failure hint when parseStatus is failed', async () => {
    mockFetch(() => null, { resumePath: 'r.pdf', parseStatus: 'failed', parsedSummary: null, parsedSkills: null, parsedTitle: null, parsedYearsExperience: null });
    renderDrawer();

    expect(await screen.findByText('Résumé parse failed')).toBeInTheDocument();
  });

  it('shows "No résumé on file" when there is no profile at all', async () => {
    mockFetch();
    renderDrawer();

    expect(await screen.findByText('No résumé on file')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Download résumé' })).not.toBeInTheDocument();
  });

  it('renders the messages timeline with a status badge on each row', async () => {
    mockFetch();
    renderDrawer();

    expect(await screen.findByText('Moving to interview')).toBeInTheDocument();
    expect(screen.getByText('Application received')).toBeInTheDocument();
    expect(screen.getByText('sent')).toBeInTheDocument();
    expect(screen.getByText('failed')).toBeInTheDocument();
  });

  it('shows "No messages sent yet." when there are none', async () => {
    mockFetch(() => null, null, []);
    renderDrawer();

    expect(await screen.findByText('No messages sent yet.')).toBeInTheDocument();
  });

  it('shows a Resend button only on the failed row and it calls the resend endpoint', async () => {
    const fetchMock = mockFetch((url, options) =>
      url.endsWith('/candidate-emails/m1/resend') && options?.method === 'POST'
        ? new Response(JSON.stringify({ ...MESSAGES[1], status: 'sent' }), { status: 200 })
        : null,
    );
    renderDrawer();
    await screen.findByText('Application received');

    expect(screen.getAllByRole('button', { name: 'Resend' })).toHaveLength(1);
    await userEvent.click(screen.getByRole('button', { name: 'Resend' }));

    await waitFor(() =>
      expect(fetchMock.mock.calls.some((call) => String(call[0]).endsWith('/candidate-emails/m1/resend') && call[1]?.method === 'POST')).toBe(
        true,
      ),
    );
  });

  it('opens the compose modal from Send message', async () => {
    mockFetch();
    renderDrawer();
    await screen.findByText('Moving to interview');

    await userEvent.click(screen.getByRole('button', { name: 'Send message' }));

    expect(await screen.findByRole('heading', { name: 'Send message' })).toBeInTheDocument();
  });

  it('does not crash and renders no chips when parsedSkills is malformed JSON', async () => {
    mockFetch(() => null, {
      resumePath: 'r.pdf',
      parseStatus: 'done',
      parsedSummary: 'Some summary',
      parsedSkills: 'not-json{{',
      parsedTitle: null,
      parsedYearsExperience: null,
    });
    const { container } = renderDrawer();

    expect(await screen.findByText('Some summary')).toBeInTheDocument();
    // No skill chips rendered (malformed JSON parses to an empty list, not a crash).
    expect(container.querySelectorAll('.rounded-full')).toHaveLength(0);
  });
});
