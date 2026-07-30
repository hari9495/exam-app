import { render, screen, fireEvent } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { NewUserModal } from './NewUserModal';
import { ToastProvider } from './ui';

const mockCreateMutate = jest.fn();
const mockBulkMutate = jest.fn();

jest.mock('../lib/hooks/useUsers', () => ({
  useCreateUser: () => ({ mutate: mockCreateMutate, isPending: false }),
  useBulkCreateUsers: () => ({ mutate: mockBulkMutate, isPending: false, data: undefined }),
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

it('hides the password field and sends a single-email bulk request when "send link" is checked', async () => {
  renderModal();
  await userEvent.type(screen.getByLabelText('Email'), 'new@x.com');
  await userEvent.click(screen.getByRole('checkbox', { name: /send set-password link instead/i }));
  expect(screen.queryByLabelText('Password')).not.toBeInTheDocument();

  await userEvent.click(screen.getByRole('button', { name: 'Add user' }));

  expect(mockBulkMutate).toHaveBeenCalledWith({ emails: ['new@x.com'], role: 'recruiter' }, expect.anything());
  expect(mockCreateMutate).not.toHaveBeenCalled();
});

it('splits/trims/drops blank lines on the Multiple tab and shows the created/skipped summary', async () => {
  mockBulkMutate.mockImplementation((_input, { onSuccess }) => {
    onSuccess({ created: [{}, {}], skipped: [{}] });
  });
  renderModal();
  await userEvent.click(screen.getByRole('tab', { name: /multiple/i }));
  fireEvent.change(screen.getByLabelText(/emails/i), { target: { value: ' a@x.com \n\n b@x.com \n' } });
  await userEvent.click(screen.getByRole('button', { name: /create users/i }));

  expect(mockBulkMutate).toHaveBeenCalledWith({ emails: ['a@x.com', 'b@x.com'], role: 'recruiter' }, expect.anything());
  expect(screen.getByText(/created 2 \/ skipped 1/i)).toBeInTheDocument();
});
