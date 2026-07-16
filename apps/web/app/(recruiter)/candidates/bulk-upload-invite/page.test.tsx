import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import BulkUploadInviteCandidatesPage from './page';
import { AuthProvider } from '../../../../lib/auth-context';
import { QueryProvider } from '../../../../lib/query-provider';
import { ToastProvider } from '../../../../components/ui';

jest.mock('next/navigation', () => ({ useRouter: () => ({ push: jest.fn() }) }));

function renderPage() {
  return render(
    <QueryProvider>
      <ToastProvider>
        <AuthProvider>
          <BulkUploadInviteCandidatesPage />
        </AuthProvider>
      </ToastProvider>
    </QueryProvider>,
  );
}

describe('BulkUploadInviteCandidatesPage', () => {
  const originalFetch = global.fetch;
  afterEach(() => {
    global.fetch = originalFetch;
  });

  it('uploads a file for the selected exam and shows created/skipped/error results', async () => {
    global.fetch = jest.fn(async (url, options) => {
      if (String(url).endsWith('/auth/refresh')) {
        return new Response(JSON.stringify({ accessToken: 'token-1' }), { status: 200 });
      }
      if (String(url).endsWith('/exams?status=published')) {
        return new Response(JSON.stringify([{ id: 'exam-1', title: 'Backend Round', status: 'published' }]), { status: 200 });
      }
      if (String(url).endsWith('/candidates/bulk-upload-invite') && options?.method === 'POST') {
        return new Response(
          JSON.stringify({
            created: [{ id: 'inv-1', candidateId: 'cand-1' }],
            skipped: [{ email: 'existing@test.com', reason: 'Candidate already has a live invitation for this exam' }],
            errors: [{ row: 3, message: 'Invalid or missing email: "not-an-email"' }],
          }),
          { status: 201 },
        );
      }
      return new Response(JSON.stringify({}), { status: 200 });
    }) as unknown as typeof fetch;

    renderPage();

    await waitFor(() => expect(screen.getByRole('combobox', { name: 'Exam to invite to' })).toBeInTheDocument());
    await userEvent.click(screen.getByRole('combobox', { name: 'Exam to invite to' }));
    await userEvent.click(screen.getByRole('option', { name: 'Backend Round' }));

    const file = new File(['Email,Name\nfrank@test.com,Frank'], 'candidates.csv', { type: 'text/csv' });
    const input = screen.getByLabelText(/Candidate file/) as HTMLInputElement;
    fireEvent.change(input, { target: { files: [file] } });
    fireEvent.click(screen.getByRole('button', { name: 'Upload & invite' }));

    await waitFor(() => expect(screen.getByText('1 candidate(s) invited.')).toBeInTheDocument());
    expect(screen.getByText('existing@test.com — Candidate already has a live invitation for this exam')).toBeInTheDocument();
    expect(screen.getByText('Invalid or missing email: "not-an-email"')).toBeInTheDocument();
  });

  it('shows an error toast when the upload request fails', async () => {
    global.fetch = jest.fn(async (url, options) => {
      if (String(url).endsWith('/auth/refresh')) {
        return new Response(JSON.stringify({ accessToken: 'token-1' }), { status: 200 });
      }
      if (String(url).endsWith('/exams?status=published')) {
        return new Response(JSON.stringify([{ id: 'exam-1', title: 'Backend Round', status: 'published' }]), { status: 200 });
      }
      if (String(url).endsWith('/candidates/bulk-upload-invite') && options?.method === 'POST') {
        return new Response(JSON.stringify({ message: 'File must be 5MB or smaller' }), { status: 400 });
      }
      return new Response(JSON.stringify({}), { status: 200 });
    }) as unknown as typeof fetch;

    renderPage();

    await waitFor(() => expect(screen.getByRole('combobox', { name: 'Exam to invite to' })).toBeInTheDocument());
    await userEvent.click(screen.getByRole('combobox', { name: 'Exam to invite to' }));
    await userEvent.click(screen.getByRole('option', { name: 'Backend Round' }));

    const file = new File(['Email,Name'], 'candidates.csv', { type: 'text/csv' });
    const input = screen.getByLabelText(/Candidate file/) as HTMLInputElement;
    fireEvent.change(input, { target: { files: [file] } });
    fireEvent.click(screen.getByRole('button', { name: 'Upload & invite' }));

    await waitFor(() => expect(screen.getByText('File must be 5MB or smaller')).toBeInTheDocument());
  });
});
