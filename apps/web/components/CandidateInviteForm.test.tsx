import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { CandidateInviteForm } from './CandidateInviteForm';

async function openModal() {
  await userEvent.click(screen.getByRole('button', { name: 'Add candidate' }));
  return within(screen.getByRole('dialog'));
}

describe('CandidateInviteForm', () => {
  it('opens a popup with First Name, Last Name, Email, and Phone when the trigger button is clicked', async () => {
    render(<CandidateInviteForm onSubmit={jest.fn()} />);

    expect(screen.queryByLabelText('First Name')).not.toBeInTheDocument();

    const dialog = await openModal();

    expect(dialog.getByLabelText('First Name')).toBeInTheDocument();
    expect(dialog.getByLabelText('Last Name')).toBeInTheDocument();
    expect(dialog.getByLabelText('Email')).toBeInTheDocument();
    expect(dialog.getByLabelText('Phone')).toBeInTheDocument();
  });

  it('submits a new candidate combining first and last name, with email and phone', async () => {
    const onSubmit = jest.fn();
    render(<CandidateInviteForm onSubmit={onSubmit} />);
    const dialog = await openModal();

    await userEvent.type(dialog.getByLabelText('First Name'), 'Priya');
    await userEvent.type(dialog.getByLabelText('Last Name'), 'Shah');
    await userEvent.type(dialog.getByLabelText('Email'), 'priya@example.com');
    await userEvent.type(dialog.getByLabelText('Phone'), '555-0101');
    await userEvent.click(dialog.getByRole('button', { name: 'Add candidate' }));

    expect(onSubmit).toHaveBeenCalledWith({ name: 'Priya Shah', email: 'priya@example.com', phone: '555-0101' });
  });

  it('closes the popup and resets its fields after a successful submit', async () => {
    const onSubmit = jest.fn();
    render(<CandidateInviteForm onSubmit={onSubmit} />);
    const dialog = await openModal();

    await userEvent.type(dialog.getByLabelText('First Name'), 'Priya');
    await userEvent.type(dialog.getByLabelText('Last Name'), 'Shah');
    await userEvent.type(dialog.getByLabelText('Email'), 'priya@example.com');
    await userEvent.click(dialog.getByRole('button', { name: 'Add candidate' }));

    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();

    const reopened = await openModal();
    expect(reopened.getByLabelText('First Name')).toHaveValue('');
    expect(reopened.getByLabelText('Email')).toHaveValue('');
  });

  it('blocks submission and shows inline errors when First Name, Last Name, or Email is left empty', async () => {
    const onSubmit = jest.fn();
    render(<CandidateInviteForm onSubmit={onSubmit} />);
    const dialog = await openModal();

    await userEvent.click(dialog.getByRole('button', { name: 'Add candidate' }));

    expect(onSubmit).not.toHaveBeenCalled();
    expect(dialog.getAllByText('Complete this field.')).toHaveLength(3);
    expect(dialog.getByLabelText('First Name')).toBeInvalid();
    expect(dialog.getByLabelText('Last Name')).toBeInvalid();
    expect(dialog.getByLabelText('Email')).toBeInvalid();
  });

  it('blocks submission and shows an inline error for a malformed email', async () => {
    const onSubmit = jest.fn();
    render(<CandidateInviteForm onSubmit={onSubmit} />);
    const dialog = await openModal();

    await userEvent.type(dialog.getByLabelText('First Name'), 'Priya');
    await userEvent.type(dialog.getByLabelText('Last Name'), 'Shah');
    await userEvent.type(dialog.getByLabelText('Email'), 'not-an-email');
    await userEvent.click(dialog.getByRole('button', { name: 'Add candidate' }));

    expect(onSubmit).not.toHaveBeenCalled();
    expect(dialog.getByText('Enter a valid email address.')).toBeInTheDocument();
  });

  it('clears a field error as soon as the recruiter starts fixing it', async () => {
    const onSubmit = jest.fn();
    render(<CandidateInviteForm onSubmit={onSubmit} />);
    const dialog = await openModal();

    await userEvent.click(dialog.getByRole('button', { name: 'Add candidate' }));
    expect(dialog.getAllByText('Complete this field.')).toHaveLength(3);

    await userEvent.type(dialog.getByLabelText('First Name'), 'P');

    expect(dialog.getAllByText('Complete this field.')).toHaveLength(2);
  });

  it('discards in-progress input when the popup is cancelled', async () => {
    render(<CandidateInviteForm onSubmit={jest.fn()} />);
    const dialog = await openModal();

    await userEvent.type(dialog.getByLabelText('First Name'), 'Priya');
    await userEvent.click(dialog.getByRole('button', { name: 'Cancel' }));

    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();

    const reopened = await openModal();
    expect(reopened.getByLabelText('First Name')).toHaveValue('');
  });
});
