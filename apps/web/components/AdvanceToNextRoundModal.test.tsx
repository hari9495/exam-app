import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { AdvanceToNextRoundModal } from './AdvanceToNextRoundModal';
import { AuthProvider } from '../lib/auth-context';
import { QueryProvider } from '../lib/query-provider';
import { ToastProvider } from './ui';

describe('AdvanceToNextRoundModal', () => {
  const originalFetch = global.fetch;
  afterEach(() => {
    global.fetch = originalFetch;
  });

  function renderModal(props: Partial<React.ComponentProps<typeof AdvanceToNextRoundModal>> = {}) {
    return render(
      <QueryProvider>
        <ToastProvider>
          <AuthProvider>
            <AdvanceToNextRoundModal
              examId="exam-1"
              candidateIds={['cand-1', 'cand-2']}
              open
              onClose={() => {}}
              onAdvanced={() => {}}
              {...props}
            />
          </AuthProvider>
        </ToastProvider>
      </QueryProvider>,
    );
  }

  it('lists published exams other than the current one as targets', async () => {
    const fetchMock = jest.fn(async (url) => {
      if (String(url).endsWith('/auth/refresh')) {
        return new Response(JSON.stringify({ accessToken: 'token-1' }), { status: 200 });
      }
      if (String(url).includes('/exams?') && String(url).includes('status=published')) {
        return new Response(
          JSON.stringify({
            data: [
              { id: 'exam-1', title: 'Screening Round (current)' },
              { id: 'exam-2', title: 'Technical Round' },
            ],
            total: 2,
            page: 1,
            pageSize: 100,
            totalPages: 1,
          }),
          { status: 200 },
        );
      }
      return new Response(JSON.stringify({}), { status: 200 });
    });
    global.fetch = fetchMock as unknown as typeof fetch;

    renderModal();

    await userEvent.click(await screen.findByRole('combobox', { name: 'Move To Exam' }));

    expect(screen.getByRole('option', { name: 'Technical Round' })).toBeInTheDocument();
    expect(screen.queryByRole('option', { name: 'Screening Round (current)' })).not.toBeInTheDocument();
  });

  it('shows a message instead of the picker when there are no other published exams', async () => {
    const fetchMock = jest.fn(async (url) => {
      if (String(url).endsWith('/auth/refresh')) {
        return new Response(JSON.stringify({ accessToken: 'token-1' }), { status: 200 });
      }
      if (String(url).includes('/exams?') && String(url).includes('status=published')) {
        return new Response(JSON.stringify({ data: [{ id: 'exam-1', title: 'Screening Round' }], total: 1, page: 1, pageSize: 100, totalPages: 1 }), { status: 200 });
      }
      return new Response(JSON.stringify({}), { status: 200 });
    });
    global.fetch = fetchMock as unknown as typeof fetch;

    renderModal();

    expect(await screen.findByText(/no other published exams/i)).toBeInTheDocument();
    expect(screen.queryByRole('combobox', { name: 'Move to exam' })).not.toBeInTheDocument();
  });

  // Regression: the placeholder option used value: '', which Radix's Select treats as its
  // internal "nothing selected" sentinel -- it silently rendered the trigger blank instead of
  // "Choose an exam…" (same bug fixed in StaffUsersTable's role/status filters).
  it('shows "Choose an exam…" as the default trigger text, not a blank trigger', async () => {
    const fetchMock = jest.fn(async (url) => {
      if (String(url).endsWith('/auth/refresh')) return new Response(JSON.stringify({ accessToken: 'token-1' }), { status: 200 });
      if (String(url).includes('/exams?') && String(url).includes('status=published')) {
        return new Response(JSON.stringify({ data: [{ id: 'exam-2', title: 'Technical Round' }], total: 1, page: 1, pageSize: 100, totalPages: 1 }), { status: 200 });
      }
      return new Response(JSON.stringify({}), { status: 200 });
    });
    global.fetch = fetchMock as unknown as typeof fetch;

    renderModal();

    expect(await screen.findByRole('combobox', { name: 'Move To Exam' })).toHaveTextContent('Choose an exam…');
  });

  it('disables Advance until a target exam is chosen', async () => {
    const fetchMock = jest.fn(async (url) => {
      if (String(url).endsWith('/auth/refresh')) {
        return new Response(JSON.stringify({ accessToken: 'token-1' }), { status: 200 });
      }
      if (String(url).includes('/exams?') && String(url).includes('status=published')) {
        return new Response(JSON.stringify({ data: [{ id: 'exam-2', title: 'Technical Round' }], total: 1, page: 1, pageSize: 100, totalPages: 1 }), { status: 200 });
      }
      return new Response(JSON.stringify({}), { status: 200 });
    });
    global.fetch = fetchMock as unknown as typeof fetch;

    renderModal();

    expect(screen.getByRole('button', { name: 'Advance' })).toBeDisabled();

    await userEvent.click(await screen.findByRole('combobox', { name: 'Move To Exam' }));
    await userEvent.click(await screen.findByRole('option', { name: 'Technical Round' }));

    expect(screen.getByRole('button', { name: 'Advance' })).toBeEnabled();
  });

  it('bulk-invites the selected candidates into the chosen exam and reports created/skipped counts', async () => {
    const onAdvanced = jest.fn();
    const onClose = jest.fn();
    const fetchMock = jest.fn(async (url, options) => {
      if (String(url).endsWith('/auth/refresh')) {
        return new Response(JSON.stringify({ accessToken: 'token-1' }), { status: 200 });
      }
      if (String(url).includes('/exams?') && String(url).includes('status=published')) {
        return new Response(JSON.stringify({ data: [{ id: 'exam-2', title: 'Technical Round' }], total: 1, page: 1, pageSize: 100, totalPages: 1 }), { status: 200 });
      }
      if (String(url).endsWith('/exams/exam-2/invitations') && options?.method === 'POST') {
        expect(JSON.parse(options.body as string)).toEqual({ candidateIds: ['cand-1', 'cand-2'] });
        return new Response(JSON.stringify({ created: [{ id: 'inv-1' }], skipped: [{ candidateId: 'cand-2', reason: 'already invited' }] }), { status: 201 });
      }
      return new Response(JSON.stringify({}), { status: 200 });
    });
    global.fetch = fetchMock as unknown as typeof fetch;

    renderModal({ onAdvanced, onClose });

    await userEvent.click(await screen.findByRole('combobox', { name: 'Move To Exam' }));
    await userEvent.click(await screen.findByRole('option', { name: 'Technical Round' }));
    await userEvent.click(screen.getByRole('button', { name: 'Advance' }));

    await waitFor(() => expect(onAdvanced).toHaveBeenCalled());
    expect(onClose).toHaveBeenCalled();
    expect(await screen.findByText(/Advanced 1 candidate\..*1 already invited/)).toBeInTheDocument();
  });
});
