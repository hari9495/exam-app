import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import ExamsPage from './page';
import { AuthProvider } from '../../../lib/auth-context';
import { QueryProvider } from '../../../lib/query-provider';
import { ToastProvider } from '../../../components/ui';

const mockPush = jest.fn();
jest.mock('next/navigation', () => ({ useRouter: () => ({ push: mockPush }) }));

describe('ExamsPage', () => {
  const originalFetch = global.fetch;
  afterEach(() => {
    global.fetch = originalFetch;
    mockPush.mockClear();
  });

  it('lists exams with their status badge', async () => {
    global.fetch = jest.fn(async (url) => {
      if (String(url).endsWith('/auth/refresh')) {
        return new Response(JSON.stringify({ accessToken: 'token-1' }), { status: 200 });
      }
      if (String(url).includes('/exams')) {
        return new Response(
          JSON.stringify([{ id: 'exam-1', title: 'Backend Round', status: 'draft', sections: [] }]),
          { status: 200 },
        );
      }
      return new Response(JSON.stringify({}), { status: 200 });
    }) as unknown as typeof fetch;

    render(
      <QueryProvider>
        <ToastProvider>
          <AuthProvider>
            <ExamsPage />
          </AuthProvider>
        </ToastProvider>
      </QueryProvider>,
    );

    await waitFor(() => expect(screen.getByText('Backend Round')).toBeInTheDocument());
  });

  it('shows loading state while exams are fetching', async () => {
    let resolveExams: (value: any) => void;
    const examsPromise = new Promise((resolve) => {
      resolveExams = resolve;
    });

    global.fetch = jest.fn(async (url) => {
      if (String(url).endsWith('/auth/refresh')) {
        return new Response(JSON.stringify({ accessToken: 'token-1' }), { status: 200 });
      }
      if (String(url).includes('/exams')) {
        await examsPromise;
        return new Response(JSON.stringify([]), { status: 200 });
      }
      return new Response(JSON.stringify({}), { status: 200 });
    }) as unknown as typeof fetch;

    render(
      <QueryProvider>
        <ToastProvider>
          <AuthProvider>
            <ExamsPage />
          </AuthProvider>
        </ToastProvider>
      </QueryProvider>,
    );

    await waitFor(() => expect(screen.getByText('Loading…')).toBeInTheDocument(), { timeout: 2000 });
    resolveExams!(null);

    await waitFor(() => expect(screen.queryByText('Loading…')).not.toBeInTheDocument());
  });

  it('shows error state when exam fetch fails', async () => {
    global.fetch = jest.fn(async (url) => {
      if (String(url).endsWith('/auth/refresh')) {
        return new Response(JSON.stringify({ accessToken: 'token-1' }), { status: 200 });
      }
      if (String(url).includes('/exams')) {
        return new Response(JSON.stringify({ message: 'Server error' }), { status: 500 });
      }
      return new Response(JSON.stringify({}), { status: 200 });
    }) as unknown as typeof fetch;

    render(
      <QueryProvider>
        <ToastProvider>
          <AuthProvider>
            <ExamsPage />
          </AuthProvider>
        </ToastProvider>
      </QueryProvider>,
    );

    await waitFor(() => expect(screen.getByRole('alert')).toBeInTheDocument(), { timeout: 2000 });
    expect(screen.getByText('Failed to load exams.')).toBeInTheDocument();
  });

  it("duplicates an exam and navigates to the new exam's edit page", async () => {
    global.fetch = jest.fn(async (url, options) => {
      if (String(url).endsWith('/auth/refresh')) {
        return new Response(JSON.stringify({ accessToken: 'token-1' }), { status: 200 });
      }
      if (String(url).endsWith('/exams/exam-1/duplicate') && options?.method === 'POST') {
        return new Response(JSON.stringify({ id: 'exam-2', title: 'Backend Round (Copy)' }), { status: 201 });
      }
      if (String(url).includes('/exams')) {
        return new Response(
          JSON.stringify([{ id: 'exam-1', title: 'Backend Round', status: 'draft', sections: [] }]),
          { status: 200 },
        );
      }
      return new Response(JSON.stringify({}), { status: 200 });
    }) as unknown as typeof fetch;

    render(
      <QueryProvider>
        <ToastProvider>
          <AuthProvider>
            <ExamsPage />
          </AuthProvider>
        </ToastProvider>
      </QueryProvider>,
    );

    await waitFor(() => expect(screen.getByText('Backend Round')).toBeInTheDocument());
    fireEvent.click(screen.getByRole('button', { name: 'More actions' }));

    await waitFor(() => expect(mockPush).toHaveBeenCalledWith('/exams/exam-2/edit'));
  });

  it('shows an error toast when duplicating an exam fails', async () => {
    global.fetch = jest.fn(async (url, options) => {
      if (String(url).endsWith('/auth/refresh')) {
        return new Response(JSON.stringify({ accessToken: 'token-1' }), { status: 200 });
      }
      if (String(url).endsWith('/exams/exam-1/duplicate') && options?.method === 'POST') {
        return new Response(JSON.stringify({ message: 'Exam not found' }), { status: 404 });
      }
      if (String(url).includes('/exams')) {
        return new Response(
          JSON.stringify([{ id: 'exam-1', title: 'Backend Round', status: 'draft', sections: [] }]),
          { status: 200 },
        );
      }
      return new Response(JSON.stringify({}), { status: 200 });
    }) as unknown as typeof fetch;

    render(
      <QueryProvider>
        <ToastProvider>
          <AuthProvider>
            <ExamsPage />
          </AuthProvider>
        </ToastProvider>
      </QueryProvider>,
    );

    await waitFor(() => expect(screen.getByText('Backend Round')).toBeInTheDocument());
    fireEvent.click(screen.getByRole('button', { name: 'More actions' }));

    await waitFor(() => expect(screen.getByText('Exam not found')).toBeInTheDocument());
    expect(mockPush).not.toHaveBeenCalled();
  });

  it('shows a status badge and a settled/total progress readout for each exam', async () => {
    global.fetch = jest.fn(async (url) => {
      if (String(url).endsWith('/auth/refresh')) {
        return new Response(JSON.stringify({ accessToken: 'token-1' }), { status: 200 });
      }
      if (String(url).includes('/exams')) {
        return new Response(
          JSON.stringify([
            {
              id: 'exam-1',
              title: 'Backend Round',
              status: 'published',
              sections: [],
              invitationCount: 20,
              attemptSettledCount: 14,
              attemptTotalCount: 17,
            },
          ]),
          { status: 200 },
        );
      }
      return new Response(JSON.stringify({}), { status: 200 });
    }) as unknown as typeof fetch;

    render(
      <QueryProvider>
        <ToastProvider>
          <AuthProvider>
            <ExamsPage />
          </AuthProvider>
        </ToastProvider>
      </QueryProvider>,
    );

    await waitFor(() => expect(screen.getByText('Backend Round')).toBeInTheDocument());
    expect(screen.getByText('Published')).toBeInTheDocument();
    expect(screen.getByText('14/17')).toBeInTheDocument();
    expect(screen.getByText('20')).toBeInTheDocument();
  });
});
