import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { apiFetch } from '../../lib/api-client';
import { useAuth } from '../../lib/auth-context';
import { StepUpProvider } from './StepUpProvider';

jest.mock('../../lib/auth-context', () => ({ useAuth: jest.fn() }));
jest.mock('@simplewebauthn/browser', () => ({ startAuthentication: jest.fn() }));

// The real apiFetch and its step-up hook, against a scripted fetch.
describe('StepUpProvider', () => {
  const originalFetch = global.fetch;
  let stepped = false;
  let calls: string[];

  beforeEach(() => {
    stepped = false;
    calls = [];
    (useAuth as jest.Mock).mockReturnValue({ accessToken: 'tok' });
    global.fetch = jest.fn(async (url: string, init?: RequestInit) => {
      const path = url.replace(/^.*\/api\/v1/, '');
      calls.push(`${init?.method ?? 'GET'} ${path}`);
      if (path === '/auth/mfa') return new Response(JSON.stringify({ factors: [{ type: 'totp' }] }), { status: 200 });
      if (path === '/auth/mfa/step-up') {
        const ok = JSON.parse(String(init?.body)).code === '123456';
        stepped = ok;
        return new Response(JSON.stringify(ok ? { stepUpValidUntil: 'later' } : { message: 'That verification did not work. Try again.' }), { status: ok ? 200 : 401 });
      }
      return stepped
        ? new Response(JSON.stringify({ saved: true }), { status: 200 })
        : new Response(JSON.stringify({ code: 'STEP_UP_REQUIRED', message: 'Confirm it is you.' }), { status: 403 });
    }) as unknown as typeof fetch;
  });

  afterEach(() => {
    global.fetch = originalFetch;
  });

  it('asks for the second factor, then sends the refused action again', async () => {
    render(<StepUpProvider />);
    const action = apiFetch('/security/policy', { method: 'PATCH', body: '{}' }, 'tok');

    await userEvent.type(await screen.findByLabelText('Code from your authenticator app'), '000000');
    await userEvent.click(screen.getByRole('button', { name: 'Verify' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('That verification did not work');

    await userEvent.clear(screen.getByLabelText('Code from your authenticator app'));
    await userEvent.type(screen.getByLabelText('Code from your authenticator app'), '123456');
    await userEvent.click(screen.getByRole('button', { name: 'Verify' }));

    await expect(action).resolves.toEqual({ saved: true });
    expect(calls.filter((c) => c === 'PATCH /security/policy')).toHaveLength(2);
    await waitFor(() => expect(screen.queryByText("Confirm it's you")).not.toBeInTheDocument());
  });

  it('dismissing the prompt fails the action with the server message, without a retry', async () => {
    render(<StepUpProvider />);
    const outcome = apiFetch('/organizations/integrations/api-key', { method: 'POST' }, 'tok').catch((error: unknown) => error);
    await screen.findByLabelText('Code from your authenticator app');
    await userEvent.click(screen.getByRole('button', { name: 'Close' }));
    expect(await outcome).toMatchObject({ status: 403, code: 'STEP_UP_REQUIRED' });
    expect(calls.filter((c) => c === 'POST /organizations/integrations/api-key')).toHaveLength(1);
  });
});
