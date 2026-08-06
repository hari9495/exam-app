import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ProfileForm } from './ProfileForm';
import { AuthProvider } from '../lib/auth-context';
import { QueryProvider } from '../lib/query-provider';
import { ToastProvider } from './ui';
import { fakeJwt } from '../lib/test-utils/fake-jwt';

let mockSsoStatus: { enabled: boolean } | undefined = { enabled: false };
jest.mock('../lib/hooks/useSso', () => ({
  useSsoStatus: () => ({ data: mockSsoStatus }),
}));

function renderProfileForm({ avatarUrl = null }: { avatarUrl?: string | null } = {}) {
  const token = fakeJwt({ sub: 'u1', organizationId: 'org1', role: 'recruiter' });
  // Stateful on purpose: uploading and removing both invalidate ['currentUser'], so the
  // component re-reads GET /users/me afterwards. A fixed response would replay the ORIGINAL
  // avatar and hide whether the mutation actually changed anything.
  let storedAvatarUrl = avatarUrl;
  const fetchMock = jest.fn(async (url, options?: RequestInit) => {
    if (String(url).endsWith('/auth/refresh')) {
      return new Response(JSON.stringify({ accessToken: token }), { status: 200 });
    }
    if (String(url).endsWith('/users/me/avatar')) {
      // Both POST (upload) and DELETE (remove) return the refreshed profile.
      storedAvatarUrl = options?.method === 'DELETE' ? null : 'https://blob.test/avatars/u1.png?sig=abc';
      return new Response(
        JSON.stringify({
          id: 'u1',
          email: 'jane@demo-org.test',
          name: 'Jane Recruiter',
          role: 'recruiter',
          avatarUrl: storedAvatarUrl,
        }),
        { status: 200 },
      );
    }
    if (String(url).endsWith('/users/me') && (!options || options.method === undefined)) {
      return new Response(
        JSON.stringify({
          id: 'u1',
          email: 'jane@demo-org.test',
          name: 'Jane Recruiter',
          role: 'recruiter',
          avatarUrl: storedAvatarUrl,
        }),
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
  });
  global.fetch = fetchMock as unknown as typeof fetch;

  return {
    fetchMock,
    ...render(
      <QueryProvider>
        <ToastProvider>
          <AuthProvider>
            <ProfileForm />
          </AuthProvider>
        </ToastProvider>
      </QueryProvider>,
    ),
  };
}

describe('ProfileForm', () => {
  const originalFetch = global.fetch;
  afterEach(() => {
    global.fetch = originalFetch;
  });
  beforeEach(() => {
    mockSsoStatus = { enabled: false };
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

  describe('when SSO is enabled', () => {
    beforeEach(() => {
      mockSsoStatus = { enabled: true };
    });

    it('hides the change-password form for every role and shows an explanatory note instead', async () => {
      renderProfileForm();
      await screen.findByDisplayValue('Jane Recruiter');
      expect(screen.queryByLabelText('Current Password')).not.toBeInTheDocument();
      expect(screen.queryByRole('button', { name: 'Change password' })).not.toBeInTheDocument();
      expect(screen.getByText(/single sign-on is enabled/i)).toBeInTheDocument();
    });
  });

  describe('profile picture', () => {
    it('falls back to initials when the user has no picture', async () => {
      renderProfileForm({ avatarUrl: null });
      await screen.findByDisplayValue('Jane Recruiter');
      expect(screen.getByText('JR')).toBeInTheDocument();
      expect(screen.queryByAltText('Your profile picture')).not.toBeInTheDocument();
      // Nothing to remove yet, so the destructive action stays hidden.
      expect(screen.queryByRole('button', { name: 'Remove' })).not.toBeInTheDocument();
      expect(screen.getByRole('button', { name: 'Upload photo' })).toBeInTheDocument();
    });

    it('renders the stored picture instead of initials once one is set', async () => {
      renderProfileForm({ avatarUrl: 'https://blob.test/avatars/u1.png?sig=abc' });
      const image = await screen.findByAltText('Your profile picture');
      expect(image).toHaveAttribute('src', 'https://blob.test/avatars/u1.png?sig=abc');
      expect(screen.queryByText('JR')).not.toBeInTheDocument();
      expect(screen.getByRole('button', { name: 'Change photo' })).toBeInTheDocument();
    });

    it('uploads as soon as a file is chosen, with no second button to press', async () => {
      const { fetchMock } = renderProfileForm({ avatarUrl: null });
      await screen.findByDisplayValue('Jane Recruiter');

      const file = new File(['x'], 'me.png', { type: 'image/png' });
      await userEvent.upload(screen.getByLabelText('Profile picture file'), file);

      await waitFor(() =>
        expect(
          fetchMock.mock.calls.some(
            (call) => String(call[0]).endsWith('/users/me/avatar') && call[1]?.method === 'POST',
          ),
        ).toBe(true),
      );
      // Sent as multipart, not JSON -- the API reads it with FileInterceptor('file').
      const uploadCall = fetchMock.mock.calls.find((call) => String(call[0]).endsWith('/users/me/avatar'));
      expect(uploadCall?.[1]?.body).toBeInstanceOf(FormData);
      expect((uploadCall?.[1]?.body as FormData).get('file')).toBe(file);
      // The new picture replaces the initials once the refetch lands.
      expect(await screen.findByAltText('Your profile picture')).toBeInTheDocument();
    });

    it('clears the picture back to initials when removed', async () => {
      const { fetchMock } = renderProfileForm({ avatarUrl: 'https://blob.test/avatars/u1.png?sig=abc' });
      await screen.findByAltText('Your profile picture');

      await userEvent.click(screen.getByRole('button', { name: 'Remove' }));

      await waitFor(() =>
        expect(
          fetchMock.mock.calls.some(
            (call) => String(call[0]).endsWith('/users/me/avatar') && call[1]?.method === 'DELETE',
          ),
        ).toBe(true),
      );
      expect(await screen.findByText('JR')).toBeInTheDocument();
    });
  });
});
