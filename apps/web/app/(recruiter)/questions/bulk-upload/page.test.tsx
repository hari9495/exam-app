import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import BulkUploadQuestionsPage from './page';
import { AuthProvider } from '../../../../lib/auth-context';
import { QueryProvider } from '../../../../lib/query-provider';
import { ToastProvider } from '../../../../components/ui';

jest.mock('next/navigation', () => ({ useRouter: () => ({ push: jest.fn() }) }));

function renderPage() {
  return render(
    <QueryProvider>
      <ToastProvider>
        <AuthProvider>
          <BulkUploadQuestionsPage />
        </AuthProvider>
      </ToastProvider>
    </QueryProvider>,
  );
}

describe('BulkUploadQuestionsPage', () => {
  const originalFetch = global.fetch;
  afterEach(() => {
    global.fetch = originalFetch;
  });

  it('uploads a file and shows the created count plus row errors', async () => {
    global.fetch = jest.fn(async (url, options) => {
      if (String(url).endsWith('/auth/refresh')) {
        return new Response(JSON.stringify({ accessToken: 'token-1' }), { status: 200 });
      }
      if (String(url).endsWith('/questions/bulk-upload') && options?.method === 'POST') {
        return new Response(
          JSON.stringify({
            created: [{ id: 'q-1' }],
            errors: [{ row: 3, message: 'single_mcq questions must have exactly 1 correct option' }],
          }),
          { status: 201 },
        );
      }
      return new Response(JSON.stringify({}), { status: 200 });
    }) as unknown as typeof fetch;

    renderPage();

    const file = new File(['Type,Text\nsingle_mcq,What is 2+2?'], 'questions.csv', { type: 'text/csv' });
    const input = screen.getByLabelText(/Question file/) as HTMLInputElement;
    fireEvent.change(input, { target: { files: [file] } });
    fireEvent.click(screen.getByRole('button', { name: 'Upload' }));

    await waitFor(() => {
      const elements = screen.getAllByText('1 question(s) created.');
      expect(elements.length).toBeGreaterThan(0);
    });
    expect(screen.getByText('single_mcq questions must have exactly 1 correct option')).toBeInTheDocument();
  });

  it('shows an error toast when the upload request fails', async () => {
    global.fetch = jest.fn(async (url, options) => {
      if (String(url).endsWith('/auth/refresh')) {
        return new Response(JSON.stringify({ accessToken: 'token-1' }), { status: 200 });
      }
      if (String(url).endsWith('/questions/bulk-upload') && options?.method === 'POST') {
        return new Response(JSON.stringify({ message: 'File must be 5MB or smaller' }), { status: 400 });
      }
      return new Response(JSON.stringify({}), { status: 200 });
    }) as unknown as typeof fetch;

    renderPage();

    const file = new File(['Type,Text'], 'questions.csv', { type: 'text/csv' });
    const input = screen.getByLabelText(/Question file/) as HTMLInputElement;
    fireEvent.change(input, { target: { files: [file] } });
    fireEvent.click(screen.getByRole('button', { name: 'Upload' }));

    await waitFor(() => expect(screen.getByText('File must be 5MB or smaller')).toBeInTheDocument());
  });
});
