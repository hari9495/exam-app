import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ProfileForm } from './ProfileForm';
import { AuthProvider } from '../lib/auth-context';
import { QueryProvider } from '../lib/query-provider';
import { ToastProvider } from './ui';
import { fakeJwt } from '../lib/test-utils/fake-jwt';

function renderProfileForm() {
  const token = fakeJwt({ sub: 'u1', organizationId: 'org1', role: 'recruiter' });
  global.fetch = jest.fn(async (url, options) => {
    if (String(url).endsWith('/auth/refresh')) {
      return new Response(JSON.stringify({ accessToken: token }), { status: 200 });
    }
    if (String(url).endsWith('/users/me') && (!options || options.method === undefined)) {
      return new Response(
        JSON.stringify({ id: 'u1', email: 'jane@demo-org.test', name: 'Jane Recruiter', role: 'recruiter' }),
        { status: 200 },
      );
    }
    if (String(url).endsWith('/users/me') && options?.method === 'PATCH') {
      return new Response(
        JSON.stringify({ id: 'u1', email: 'jane@demo-org.test', name: 'New Name', role: 'recruiter' }),
        { status: 200 },
      );
    }
    if (String(url).endsWith('/users/me/change-password')) {
      return new Response(JSON.stringify({ success: true }), { status: 200 });
    }
    return new Response(JSON.stringify({}), { status: 200 });
  }) as unknown as typeof fetch;

  return render(
    <QueryProvider>
      <ToastProvider>
        <AuthProvider>
          <ProfileForm />
        </AuthProvider>
      </ToastProvider>
    </QueryProvider>,
  );
}

describe('ProfileForm', () => {
  const originalFetch = global.fetch;
  afterEach(() => {
    global.fetch = originalFetch;
  });

  it('shows the read-only email and role, and the current display name', async () => {
    renderProfileForm();
    expect(await screen.findByDisplayValue('Jane Recruiter')).toBeInTheDocument();
    expect(screen.getByDisplayValue('jane@demo-org.test')).toBeInTheDocument();
    expect(screen.getByDisplayValue('recruiter')).toBeInTheDocument();
  });

  it('disables Save name until the current user has loaded', async () => {
    renderProfileForm();
    const saveButton = screen.getByRole('button', { name: 'Save name' });
    expect(saveButton).toBeDisabled();
    await waitFor(() => expect(saveButton).not.toBeDisabled());
  });

  it('submits the new name via PATCH /users/me', async () => {
    renderProfileForm();
    const nameInput = await screen.findByDisplayValue('Jane Recruiter');
    await userEvent.clear(nameInput);
    await userEvent.type(nameInput, 'New Name');
    await userEvent.click(screen.getByRole('button', { name: 'Save name' }));

    await waitFor(() => {
      const patchCall = (global.fetch as jest.Mock).mock.calls.find(
        ([url, options]) => String(url).endsWith('/users/me') && options?.method === 'PATCH',
      );
      expect(patchCall).toBeDefined();
      expect(JSON.parse(patchCall[1].body)).toEqual({ name: 'New Name' });
    });
  });

  it('submits current and new password via POST /users/me/change-password', async () => {
    renderProfileForm();
    await screen.findByDisplayValue('Jane Recruiter');
    await userEvent.type(screen.getByLabelText('Current Password'), 'OldPassw0rd!');
    await userEvent.type(screen.getByLabelText('New Password'), 'NewPassw0rd!');
    await userEvent.type(screen.getByLabelText('Confirm New Password'), 'NewPassw0rd!');
    await userEvent.click(screen.getByRole('button', { name: 'Change password' }));

    await waitFor(() => {
      const changeCall = (global.fetch as jest.Mock).mock.calls.find(([url]) =>
        String(url).endsWith('/users/me/change-password'),
      );
      expect(changeCall).toBeDefined();
      expect(JSON.parse(changeCall[1].body)).toEqual({
        currentPassword: 'OldPassw0rd!',
        newPassword: 'NewPassw0rd!',
      });
    });
  });

  it('disables Change password until the two new-password fields match', async () => {
    renderProfileForm();
    await screen.findByDisplayValue('Jane Recruiter');
    await userEvent.type(screen.getByLabelText('Current Password'), 'OldPassw0rd!');
    await userEvent.type(screen.getByLabelText('New Password'), 'NewPassw0rd!');
    expect(screen.getByRole('button', { name: 'Change password' })).toBeDisabled();
    await userEvent.type(screen.getByLabelText('Confirm New Password'), 'Mismatch!');
    expect(screen.getByRole('button', { name: 'Change password' })).toBeDisabled();
  });
});
