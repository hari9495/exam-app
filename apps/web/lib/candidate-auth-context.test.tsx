import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { CandidateAuthProvider, useCandidateAuth } from './candidate-auth-context';

function Probe() {
  const { accessToken, isLoading, redeem } = useCandidateAuth();
  if (isLoading) return <p>Loading</p>;
  return (
    <div>
      <p>{accessToken ? `token:${accessToken}` : 'no-token'}</p>
      <button onClick={() => redeem('invite-token')}>Redeem</button>
    </div>
  );
}

describe('CandidateAuthProvider', () => {
  const originalFetch = global.fetch;

  afterEach(() => {
    global.fetch = originalFetch;
  });

  it('silently refreshes on mount via the httpOnly cookie', async () => {
    global.fetch = jest.fn(async (url) => {
      if (String(url).endsWith('/candidate-auth/refresh')) {
        return new Response(JSON.stringify({ accessToken: 'refreshed-token', refreshToken: 'rt' }), { status: 200 });
      }
      throw new Error(`Unexpected fetch to ${url}`);
    }) as unknown as typeof fetch;

    render(
      <CandidateAuthProvider>
        <Probe />
      </CandidateAuthProvider>,
    );

    await waitFor(() => expect(screen.getByText('token:refreshed-token')).toBeInTheDocument());
  });

  it('leaves accessToken null when no cookie/session exists yet', async () => {
    global.fetch = jest.fn(async () => new Response(JSON.stringify({ message: 'Refresh token required' }), { status: 401 })) as unknown as typeof fetch;

    render(
      <CandidateAuthProvider>
        <Probe />
      </CandidateAuthProvider>,
    );

    await waitFor(() => expect(screen.getByText('no-token')).toBeInTheDocument());
  });

  it('redeem() sets the access token from the redeem response', async () => {
    global.fetch = jest.fn(async (url) => {
      if (String(url).endsWith('/candidate-auth/refresh')) {
        return new Response(JSON.stringify({ message: 'none' }), { status: 401 });
      }
      if (String(url).endsWith('/candidate-auth/redeem')) {
        return new Response(JSON.stringify({ accessToken: 'redeemed-token', refreshToken: 'rt' }), { status: 200 });
      }
      throw new Error(`Unexpected fetch to ${url}`);
    }) as unknown as typeof fetch;

    render(
      <CandidateAuthProvider>
        <Probe />
      </CandidateAuthProvider>,
    );
    await waitFor(() => expect(screen.getByText('no-token')).toBeInTheDocument());

    await userEvent.click(screen.getByRole('button', { name: 'Redeem' }));
    await waitFor(() => expect(screen.getByText('token:redeemed-token')).toBeInTheDocument());
  });
});
