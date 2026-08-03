import { render, screen, fireEvent } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { NewUserModal } from './NewUserModal';
import { ToastProvider } from './ui';

const mockCreateMutate = jest.fn();
const mockBulkMutate = jest.fn();
let mockSsoSettings: { samlEnabled: boolean } | undefined = { samlEnabled: false };

jest.mock('../lib/hooks/useUsers', () => ({
  useCreateUser: () => ({ mutate: mockCreateMutate, isPending: false }),
  useBulkCreateUsers: () => ({ mutate: mockBulkMutate, isPending: false, data: undefined }),
}));
jest.mock('../lib/hooks/useSso', () => ({
  useSsoSettings: () => ({ data: mockSsoSettings }),
}));

function renderModal(props: Partial<React.ComponentProps<typeof NewUserModal>> = {}) {
  return render(
    <ToastProvider>
      <NewUserModal open onClose={jest.fn()} {...props} />
    </ToastProvider>,
  );
}

beforeEach(() => {
  mockCreateMutate.mockReset();
  mockBulkMutate.mockReset();
  mockSsoSettings = { samlEnabled: false };
});

it('shows Single and Multiple tabs when open', () => {
  renderModal();
  expect(screen.getByRole('tab', { name: /single/i })).toBeInTheDocument();
  expect(screen.getByRole('tab', { name: /multiple/i })).toBeInTheDocument();
});

it('submits single-tab email/password/role via useCreateUser', async () => {
  renderModal();
  await userEvent.type(screen.getByLabelText('Email'), 'new@x.com');
  await userEvent.type(screen.getByLabelText('Password'), 'Passw0rd!');
  await userEvent.click(screen.getByRole('button', { name: 'Add user' }));

  expect(mockCreateMutate).toHaveBeenCalledWith(
    { email: 'new@x.com', password: 'Passw0rd!', role: 'recruiter' },
    expect.anything(),
  );
  expect(mockBulkMutate).not.toHaveBeenCalled();
});

// Regression for ADO #6842: the single-user form had no Name field at all, so every
// user created that way ended up with no name.
it('lets the recruiter set a Name on the single-user tab and submits it', async () => {
  renderModal();
  await userEvent.type(screen.getByLabelText('Name'), 'Ada Lovelace');
  await userEvent.type(screen.getByLabelText('Email'), 'new@x.com');
  await userEvent.type(screen.getByLabelText('Password'), 'Passw0rd!');
  await userEvent.click(screen.getByRole('button', { name: 'Add user' }));

  expect(mockCreateMutate).toHaveBeenCalledWith(
    { email: 'new@x.com', name: 'Ada Lovelace', password: 'Passw0rd!', role: 'recruiter' },
    expect.anything(),
  );
});

it('hides the password field and sends a single-email bulk request when "send link" is checked', async () => {
  renderModal();
  await userEvent.type(screen.getByLabelText('Email'), 'new@x.com');
  await userEvent.click(screen.getByRole('checkbox', { name: /send set-password link instead/i }));
  expect(screen.queryByLabelText('Password')).not.toBeInTheDocument();

  await userEvent.click(screen.getByRole('button', { name: 'Add user' }));

  expect(mockBulkMutate).toHaveBeenCalledWith({ emails: ['new@x.com'], role: 'recruiter' }, expect.anything());
  expect(mockCreateMutate).not.toHaveBeenCalled();
});

it('splits/trims/drops blank lines on the Multiple tab and closes the modal on success', async () => {
  const onClose = jest.fn();
  mockBulkMutate.mockImplementation((_input, { onSuccess }) => {
    onSuccess({ created: [{}, {}], skipped: [{}] });
  });
  renderModal({ onClose });
  await userEvent.click(screen.getByRole('tab', { name: /multiple/i }));
  fireEvent.change(screen.getByLabelText(/emails/i), { target: { value: ' a@x.com \n\n b@x.com \n' } });
  await userEvent.click(screen.getByRole('button', { name: /add users/i }));

  expect(mockBulkMutate).toHaveBeenCalledWith({ emails: ['a@x.com', 'b@x.com'], role: 'recruiter' }, expect.anything());
  // Regression for ADO #6845: the modal used to stay open with no visible way forward after a
  // successful bulk create -- it must close now, same as the single-user flow.
  expect(onClose).toHaveBeenCalled();
});

it('does not submit the Multiple tab when the textarea is empty or whitespace-only', async () => {
  renderModal();
  await userEvent.click(screen.getByRole('tab', { name: /multiple/i }));
  fireEvent.change(screen.getByLabelText(/emails/i), { target: { value: '   \n  \n' } });
  await userEvent.click(screen.getByRole('button', { name: /add users/i }));

  expect(mockBulkMutate).not.toHaveBeenCalled();
  expect(screen.getByText(/enter at least one email/i)).toBeInTheDocument();
});

describe('when SSO is enabled', () => {
  beforeEach(() => {
    mockSsoSettings = { samlEnabled: true };
  });

  it('hides the password field and the send-link checkbox, showing an explanatory note instead', () => {
    renderModal();
    expect(screen.queryByLabelText('Password')).not.toBeInTheDocument();
    expect(screen.queryByRole('checkbox', { name: /send set-password link instead/i })).not.toBeInTheDocument();
    expect(screen.getByText(/single sign-on is enabled/i)).toBeInTheDocument();
  });

  it('submits single-tab email/role with no password via useCreateUser, ignoring send-link', async () => {
    renderModal();
    await userEvent.type(screen.getByLabelText('Email'), 'new@x.com');
    await userEvent.click(screen.getByRole('button', { name: 'Add user' }));

    expect(mockCreateMutate).toHaveBeenCalledWith({ email: 'new@x.com', role: 'recruiter' }, expect.anything());
    expect(mockBulkMutate).not.toHaveBeenCalled();
  });

  it('shows a no-email note on the Multiple tab', async () => {
    renderModal();
    await userEvent.click(screen.getByRole('tab', { name: /multiple/i }));
    expect(screen.getByText(/won't receive a set-password email/i)).toBeInTheDocument();
  });
});
