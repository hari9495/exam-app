import { render, screen, waitFor } from '@testing-library/react';
import DashboardPage from './page';
import { AuthProvider } from '../../../lib/auth-context';
import { QueryProvider } from '../../../lib/query-provider';

jest.mock('next/navigation', () => ({ useRouter: () => ({ push: jest.fn() }) }));

describe('DashboardPage', () => {
  const originalFetch = global.fetch;
  afterEach(() => {
    global.fetch = originalFetch;
  });

  it('shows exam counts by status once exams load', async () => {
    global.fetch = jest.fn(async (url) => {
      if (String(url).endsWith('/auth/refresh')) {
        return new Response(JSON.stringify({ accessToken: 'token-1' }), { status: 200 });
      }
      if (String(url).includes('/exams')) {
        return new Response(
          JSON.stringify([
            { id: '1', title: 'A', status: 'draft', sections: [] },
            { id: '2', title: 'B', status: 'published', sections: [] },
            { id: '3', title: 'C', status: 'published', sections: [] },
          ]),
          { status: 200 },
        );
      }
      return new Response(JSON.stringify({}), { status: 200 });
    }) as unknown as typeof fetch;

    render(
      <QueryProvider>
        <AuthProvider>
          <DashboardPage />
        </AuthProvider>
      </QueryProvider>,
    );

    await waitFor(() => expect(screen.getByText('1')).toBeInTheDocument()); // draft count
    expect(screen.getByText('2')).toBeInTheDocument(); // published count
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
        <AuthProvider>
          <DashboardPage />
        </AuthProvider>
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
        <AuthProvider>
          <DashboardPage />
        </AuthProvider>
      </QueryProvider>,
    );

    await waitFor(() => expect(screen.getByRole('alert')).toBeInTheDocument(), { timeout: 2000 });
    expect(screen.getByText('Failed to load exams.')).toBeInTheDocument();
  });
});
