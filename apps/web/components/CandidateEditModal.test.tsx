import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { CandidateEditModal } from './CandidateEditModal';
import { AuthProvider } from '../lib/auth-context';
import { QueryProvider } from '../lib/query-provider';
import { ToastProvider } from './ui';
import { Candidate } from '../lib/types';

function makeCandidate(overrides: Partial<Candidate> = {}): Candidate {
  return {
    id: 'cand-1',
    name: 'Nanji Sharma',
    email: 'nanji.s@prudentconsulting.com',
    phone: null,
    status: 'active',
    createdAt: '2026-07-24T00:00:00.000Z',
    erasedAt: null,
    invitationCount: 0,
    ...overrides,
  };
}

function renderModal(candidate = makeCandidate()) {
  render(
    <QueryProvider>
      <ToastProvider>
        <AuthProvider>
          <CandidateEditModal candidate={candidate} onClose={() => {}} />
        </AuthProvider>
      </ToastProvider>
    </QueryProvider>,
  );
}

describe('CandidateEditModal', () => {
  const originalFetch = global.fetch;
  afterEach(() => {
    global.fetch = originalFetch;
  });

  function mockFetch(patchResponse: { body: unknown; status: number }) {
    const fetchMock = jest.fn(async (url, options) => {
      if (String(url).endsWith('/auth/refresh')) {
        return new Response(JSON.stringify({ accessToken: 'token-1' }), { status: 200 });
      }
      if (String(url).endsWith('/candidates/cand-1') && options?.method === 'PATCH') {
        return new Response(JSON.stringify(patchResponse.body), { status: patchResponse.status });
      }
      return new Response(JSON.stringify({}), { status: 200 });
    });
    global.fetch = fetchMock as unknown as typeof fetch;
    return fetchMock;
  }

  it('prefills First Name / Last Name by splitting the stored name on the first space', () => {
    mockFetch({ body: {}, status: 200 });
    renderModal(makeCandidate({ phone: '+91 99999 11111' }));

    expect(screen.getByLabelText('First Name')).toHaveValue('Nanji');
    expect(screen.getByLabelText('Last Name')).toHaveValue('Sharma');
    expect(screen.getByLabelText('Email')).toHaveValue('nanji.s@prudentconsulting.com');
    expect(screen.getByLabelText('Phone')).toHaveValue('+91 99999 11111');
  });

  it('prefills Last Name empty for a legacy single-word name instead of losing data', () => {
    mockFetch({ body: {}, status: 200 });
    renderModal(makeCandidate({ name: 'Nanji' }));

    expect(screen.getByLabelText('First Name')).toHaveValue('Nanji');
    expect(screen.getByLabelText('Last Name')).toHaveValue('');
  });

  it('sends the edited first/last name and email as a PATCH, recombined into one name', async () => {
    const fetchMock = mockFetch({ body: { id: 'cand-1' }, status: 200 });
    renderModal();

    const lastNameInput = screen.getByLabelText('Last Name');
    await userEvent.clear(lastNameInput);
    await userEvent.type(lastNameInput, 'Shah');
    await userEvent.click(screen.getByRole('button', { name: 'Save changes' }));

    await waitFor(() => {
      const patchCall = fetchMock.mock.calls.find((call) => call[1]?.method === 'PATCH');
      expect(patchCall).toBeDefined();
      expect(JSON.parse(String(patchCall![1]?.body))).toEqual({
        name: 'Nanji Shah',
        email: 'nanji.s@prudentconsulting.com',
        phone: '',
      });
    });
    expect(await screen.findByText('Candidate updated.')).toBeInTheDocument();
  });

  it('blocks saving and shows inline errors when First Name, Last Name, or Email is cleared', async () => {
    const fetchMock = mockFetch({ body: {}, status: 200 });
    renderModal();

    await userEvent.clear(screen.getByLabelText('Last Name'));
    await userEvent.click(screen.getByRole('button', { name: 'Save changes' }));

    expect(fetchMock.mock.calls.some((call) => call[1]?.method === 'PATCH')).toBe(false);
    expect(screen.getByText('Complete this field.')).toBeInTheDocument();
    expect(screen.getByLabelText('Last Name')).toBeInvalid();
  });

  it('blocks saving and shows an inline error for a malformed email', async () => {
    const fetchMock = mockFetch({ body: {}, status: 200 });
    renderModal();

    const emailInput = screen.getByLabelText('Email');
    await userEvent.clear(emailInput);
    await userEvent.type(emailInput, 'not-an-email');
    await userEvent.click(screen.getByRole('button', { name: 'Save changes' }));

    expect(fetchMock.mock.calls.some((call) => call[1]?.method === 'PATCH')).toBe(false);
    expect(screen.getByText('Enter a valid email address.')).toBeInTheDocument();
  });

  it('blocks saving and shows an inline error for a phone number that is not 10 digits', async () => {
    const fetchMock = mockFetch({ body: {}, status: 200 });
    renderModal();

    const phoneInput = screen.getByLabelText('Phone');
    await userEvent.type(phoneInput, '12345');
    await userEvent.click(screen.getByRole('button', { name: 'Save changes' }));

    expect(fetchMock.mock.calls.some((call) => call[1]?.method === 'PATCH')).toBe(false);
    expect(screen.getByText('Enter a valid 10-digit phone number.')).toBeInTheDocument();
  });

  it('surfaces a duplicate-email conflict from the server', async () => {
    mockFetch({ body: { message: 'A candidate with email taken@test.com already exists' }, status: 409 });
    renderModal();

    await userEvent.click(screen.getByRole('button', { name: 'Save changes' }));

    expect(await screen.findByText('A candidate with email taken@test.com already exists')).toBeInTheDocument();
  });

  it('warns about stale invitations only when an already-invited candidate has their email changed', async () => {
    mockFetch({ body: {}, status: 200 });
    renderModal(makeCandidate({ invitationCount: 2 }));

    expect(screen.queryByText(/won't resend or update invitations/i)).not.toBeInTheDocument();

    const emailInput = screen.getByLabelText('Email');
    await userEvent.clear(emailInput);
    await userEvent.type(emailInput, 'new@example.com');

    expect(screen.getByText(/won't resend or update invitations/i)).toBeInTheDocument();
  });

  it('does not warn when the candidate has never been invited', async () => {
    mockFetch({ body: {}, status: 200 });
    renderModal(makeCandidate({ invitationCount: 0 }));

    const emailInput = screen.getByLabelText('Email');
    await userEvent.clear(emailInput);
    await userEvent.type(emailInput, 'new@example.com');

    expect(screen.queryByText(/won't resend or update invitations/i)).not.toBeInTheDocument();
  });
});
