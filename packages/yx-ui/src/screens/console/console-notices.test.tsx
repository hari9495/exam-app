import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { ConsoleShell } from './console-shell';
import { STAFF_NOTICES } from './console.stories';

// Answer 2093: the staff member's own notices in the console header: the server's unread count on the bell, opening
// one marks it read, and Mark all read.
const ue = userEvent.setup({ pointerEventsCheck: 0 });

describe('Console notices (2093)', () => {
  it('the bell shows the unread count; opening a notice and Mark all read reach the page', async () => {
    const onOpenItem = vi.fn();
    const onMarkAllRead = vi.fn();
    render(
      <ConsoleShell active="companies" name="Anand Iyer" securityHref="#" onSignOut={() => {}} notices={{ items: STAFF_NOTICES, unread: 3, onMarkAllRead, onOpenItem }}>
        <p>page</p>
      </ConsoleShell>,
    );
    await ue.click(screen.getByRole('button', { name: 'Notifications, 3 unread' }));
    await ue.click(await screen.findByText(/Tell the Data Protection Board now/));
    expect(onOpenItem).toHaveBeenCalledWith(expect.objectContaining({ id: 'n1' }));
    await ue.click(screen.getByRole('button', { name: 'Notifications, 3 unread' }));
    await ue.click(await screen.findByRole('button', { name: /Mark all/ }));
    expect(onMarkAllRead).toHaveBeenCalled();
    // No settings link in the console: there are no notice settings for staff.
    expect(screen.queryByRole('link', { name: 'Notification settings' })).not.toBeInTheDocument();
  });

  it('negative: without notices there is no bell', () => {
    render(
      <ConsoleShell active="companies" name="Anand Iyer" securityHref="#" onSignOut={() => {}}>
        <p>page</p>
      </ConsoleShell>,
    );
    expect(screen.queryByRole('button', { name: /^Notifications/ })).not.toBeInTheDocument();
  });
});
