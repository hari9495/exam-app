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
    type: 'approval.requested',
    actorUserId: 'u2',
    actorName: 'Bola',
    entityType: 'requisition',
    entityId: 'r1',
    contextText: 'Senior Engineer req',
    linkPath: '/v2/approvals/r1',
    readAt: null,
    createdAt: '2026-09-03T10:00:00.000Z',
  },
];
jest.mock('../../lib/hooks/useNotifications', () => ({
  useNotifications: () => ({ data: notifications }),
  useUnreadCount: () => ({ data: { count: 1 } }),
  useMarkNotificationRead: () => ({ mutate: markReadMutate }),
  useMarkAllNotificationsRead: () => ({ mutate: markAllMutate }),
}));

describe('NotificationBell (ui-v2)', () => {
  beforeEach(() => {
    push.mockClear();
    markReadMutate.mockClear();
  });

  it('labels an approval.requested notification and deep-links via its linkPath', async () => {
    render(<NotificationBell />);
    await userEvent.click(screen.getByRole('button', { name: /Notifications/ }));

    const row = screen.getByText('Bola needs your approval on Senior Engineer req');
    expect(row).toBeInTheDocument();

    await userEvent.click(row);
    expect(markReadMutate).toHaveBeenCalledWith('n1');
    expect(push).toHaveBeenCalledWith('/v2/approvals/r1');
  });
});
