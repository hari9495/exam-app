import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import PlansPage from './page';
import { AuthProvider } from '../../../lib/auth-context';
import { QueryProvider } from '../../../lib/query-provider';
import { ToastProvider } from '../../../components/ui';
import { fakeJwt } from '../../../lib/test-utils/fake-jwt';

const STARTER = {
  id: 'plan-1',
  name: 'Starter',
  seatLimit: 5,
  candidateLimit: 50,
  aiCreditLimit: 100,
  proctoringMinutesLimit: 60,
  priceLabel: '$49/mo',
  isPublic: true,
};

function renderPage({ plans = [STARTER], createResponse }: { plans?: unknown[]; createResponse?: Response } = {}) {
  const token = fakeJwt({ sub: 'u1', organizationId: null, role: 'super_admin' });
  global.fetch = jest.fn(async (url: unknown, options?: RequestInit) => {
    if (String(url).endsWith('/auth/refresh')) {
      return new Response(JSON.stringify({ accessToken: token }), { status: 200 });
    }
    if (String(url).endsWith('/platform/plans') && options?.method === 'POST') {
      return (
        createResponse ??
        new Response(
          JSON.stringify({
            id: 'plan-2',
            name: 'Pro',
            seatLimit: 20,
            candidateLimit: 500,
            aiCreditLimit: 1000,
            proctoringMinutesLimit: 600,
            priceLabel: '$199/mo',
            isPublic: true,
          }),
          { status: 200 },
        )
      );
    }
    if (String(url).endsWith('/platform/plans')) {
      return new Response(JSON.stringify(plans), { status: 200 });
    }
    return new Response(JSON.stringify({}), { status: 200 });
  }) as unknown as typeof fetch;

  return render(
    <QueryProvider>
      <ToastProvider>
        <AuthProvider>
          <PlansPage />
        </AuthProvider>
      </ToastProvider>
    </QueryProvider>,
  );
}

async function fillAndSubmitCreate() {
  await userEvent.click(screen.getByRole('button', { name: 'New plan' }));
  await userEvent.type(screen.getByLabelText('Name'), 'Pro');
  await userEvent.type(screen.getByLabelText('Seat limit'), '20');
  await userEvent.type(screen.getByLabelText('Candidate limit'), '500');
  await userEvent.type(screen.getByLabelText('AI credit limit'), '1000');
  await userEvent.type(screen.getByLabelText('Proctoring minutes limit'), '600');
  await userEvent.type(screen.getByLabelText('Price label'), '$199/mo');
  await userEvent.click(screen.getByRole('button', { name: 'Create plan' }));
}

describe('PlansPage', () => {
  const originalFetch = global.fetch;
  afterEach(() => {
    global.fetch = originalFetch;
  });

  it('lists existing plans with their limits', async () => {
    renderPage();
    expect(await screen.findByText('Starter')).toBeInTheDocument();
    expect(screen.getByText('$49/mo')).toBeInTheDocument();
  });

  it('creates a plan with the four limits via useCreatePlan', async () => {
    renderPage();
    await screen.findByText('Starter');

    await fillAndSubmitCreate();

    await waitFor(() => {
      const post = (global.fetch as jest.Mock).mock.calls.find(
        ([url, options]) => String(url).endsWith('/platform/plans') && options?.method === 'POST',
      );
      expect(post).toBeDefined();
      expect(JSON.parse(post[1].body)).toEqual({
        name: 'Pro',
        seatLimit: 20,
        candidateLimit: 500,
        aiCreditLimit: 1000,
        proctoringMinutesLimit: 600,
        priceLabel: '$199/mo',
        isPublic: true,
      });
    });
    await waitFor(() => expect(screen.queryByLabelText('Name')).not.toBeInTheDocument());
  });

  it('shows the server error and keeps the form open on failure', async () => {
    renderPage({ createResponse: new Response(JSON.stringify({ message: 'Name already in use' }), { status: 409 }) });
    await screen.findByText('Starter');

    await fillAndSubmitCreate();

    await waitFor(() => expect(screen.getByRole('alert')).toHaveTextContent('Name already in use'));
    expect(screen.getByLabelText('Name')).toHaveValue('Pro');
  });
});
