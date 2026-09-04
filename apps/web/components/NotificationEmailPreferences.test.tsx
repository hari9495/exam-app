import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { NotificationEmailPreferences } from './NotificationEmailPreferences';

const updateMutate = jest.fn();
let preferences: {
  type: string;
  group: 'mentions' | 'assignments' | 'approvals';
  label: string;
  emailEnabled: boolean;
}[] = [];
let isLoading = false;

jest.mock('../lib/hooks/useNotificationPreferences', () => ({
  useNotificationPreferences: () => ({ data: preferences, isLoading }),
  useUpdateNotificationPreference: () => ({ mutate: updateMutate }),
}));

describe('NotificationEmailPreferences', () => {
  beforeEach(() => {
    updateMutate.mockClear();
    isLoading = false;
    preferences = [
      { type: 'mention', group: 'mentions', label: 'Someone mentions you', emailEnabled: true },
      { type: 'assignment', group: 'assignments', label: 'A candidate is assigned to you', emailEnabled: false },
      { type: 'approval_requested', group: 'approvals', label: 'Your approval is requested', emailEnabled: true },
    ];
  });

  it('renders a toggle per preference grouped under Mentions / Assignments / Approvals', () => {
    render(<NotificationEmailPreferences />);

    expect(screen.getByText('Notification emails')).toBeInTheDocument();

    const headings = ['Mentions', 'Assignments', 'Approvals'].map((h) => screen.getByText(h));
    expect(headings).toHaveLength(3);

    expect(screen.getByLabelText('Someone mentions you')).toBeChecked();
    expect(screen.getByLabelText('A candidate is assigned to you')).not.toBeChecked();
    expect(screen.getByLabelText('Your approval is requested')).toBeChecked();
  });

  it('toggling a row calls the mutation with the flipped emailEnabled', async () => {
    render(<NotificationEmailPreferences />);

    await userEvent.click(screen.getByLabelText('A candidate is assigned to you'));

    expect(updateMutate).toHaveBeenCalledWith({ type: 'assignment', emailEnabled: true });

    await userEvent.click(screen.getByLabelText('Someone mentions you'));

    expect(updateMutate).toHaveBeenCalledWith({ type: 'mention', emailEnabled: false });
  });

  it('shows a loading state while preferences load', () => {
    isLoading = true;
    preferences = [];
    render(<NotificationEmailPreferences />);
    expect(screen.getByText(/loading/i)).toBeInTheDocument();
  });

  it('shows an empty state when there are no preferences', () => {
    preferences = [];
    render(<NotificationEmailPreferences />);
    expect(screen.getByText(/no notification/i)).toBeInTheDocument();
  });
});
