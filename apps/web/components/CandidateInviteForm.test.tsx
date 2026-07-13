import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { CandidateInviteForm } from './CandidateInviteForm';

describe('CandidateInviteForm', () => {
  it('submits a new candidate with name, email, and phone', async () => {
    const onSubmit = jest.fn();
    render(<CandidateInviteForm onSubmit={onSubmit} />);

    await userEvent.type(screen.getByLabelText('Name'), 'Priya Shah');
    await userEvent.type(screen.getByLabelText('Email'), 'priya@example.com');
    await userEvent.type(screen.getByLabelText('Phone'), '555-0101');
    await userEvent.click(screen.getByRole('button', { name: 'Add candidate' }));

    expect(onSubmit).toHaveBeenCalledWith({ name: 'Priya Shah', email: 'priya@example.com', phone: '555-0101' });
  });
});
