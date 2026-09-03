import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { NotificationBell } from './NotificationBell';

const push = jest.fn();
jest.mock('next/navigation', () => ({ useRouter: () => ({ push }) }));

const markReadMutate = jest.fn();
const markAllMutate = jest.fn();
const notifications = [
  {
    id: 'n1',
    type: 'mention',
    actorUserId: 'u2',
    actorName: 'Bola',
    entityType: 'pipeline_entry',
    entityId: 'e1',
    contextText: 'Asha Rao',
    linkPath: '/candidates/c1',
    readAt: null,
    createdAt: '2026-08-20T10:00:00.000Z',
  },
];
jest.mock('../lib/hooks/useNotifications', () => ({
  useNotifications: () => ({ data: notifications }),
  useUnreadCount: () => ({ data: { count: 1 } }),
  useMarkNotificationRead: () => ({ mutate: markReadMutate }),
  useMarkAllNotificationsRead: () => ({ mutate: markAllMutate }),
}));

describe('NotificationBell', () => {
  beforeEach(() => {
    push.mockClear();
    markReadMutate.mockClear();
    markAllMutate.mockClear();
  });

  it('shows the unread count and, on opening, a readable mention label', async () => {
    render(<NotificationBell />);
    expect(screen.getByLabelText('Notifications (1 unread)')).toBeInTheDocument();

    await userEvent.click(screen.getByRole('button', { name: /Notifications/ }));

    expect(screen.getByText('Bola mentioned you on Asha Rao')).toBeInTheDocument();
  });

  it('marks a notification read and navigates to its entity on click', async () => {
    render(<NotificationBell />);
    await userEvent.click(screen.getByRole('button', { name: /Notifications/ }));
    await userEvent.click(screen.getByText('Bola mentioned you on Asha Rao'));

    expect(markReadMutate).toHaveBeenCalledWith('n1');
    expect(push).toHaveBeenCalledWith('/candidates/c1');
  });

  it('marks all read', async () => {
    render(<NotificationBell />);
    await userEvent.click(screen.getByRole('button', { name: /Notifications/ }));
    await userEvent.click(screen.getByText('Mark all read'));

    expect(markAllMutate).toHaveBeenCalled();
  });
});
